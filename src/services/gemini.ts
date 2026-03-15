import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Note, GCM, NoteStatus } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const noteSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "노트의 제목 (반드시 한국어)" },
    folder: { type: Type.STRING, description: "폴더 카테고리 (반드시 한국어)" },
    content: { type: Type.STRING, description: "상세 설명 및 기술 명세 (반드시 한국어, 가독성을 위해 적절한 줄바꿈 포함, Markdown)" },
    summary: { type: Type.STRING, description: "이 기능/모듈이 수행하는 역할에 대한 1-2문장 요약 (반드시 한국어)" },
    parentNoteId: { type: Type.STRING, description: "주요 부모 기능의 ID" },
    relatedNoteIds: { type: Type.ARRAY, items: { type: Type.STRING }, description: "논리적으로 연관된 다른 노트들의 ID 목록. AI가 분석하여 자동으로 최대한 많이 연결하십시오." },
    yamlMetadata: { 
      type: Type.STRING, 
      description: "표준화된 YAML: version: 1.0.0, lastUpdated: YYYY-MM-DD, tags: [tag1], componentType: Core|UI|Shared|Feature, dependencies: [lib1], importance: 1-5" 
    },
  },
  required: ["title", "folder", "content", "summary", "yamlMetadata"],
};

const safeJsonParse = (text: string) => {
  try {
    // Remove potential markdown code blocks
    const cleaned = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse JSON response from AI:", text);
    throw new Error(`AI returned invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
};

export const decomposeFeature = async (
  featureRequest: string,
  currentGcm: GCM,
  existingNotes: Note[]
): Promise<{ 
  newNotes: Omit<Note, 'id' | 'status'>[]; 
  updatedNotes: Note[];
  updatedGcm: GCM 
}> => {
  
  // Step 1: Main Feature Design & Reuse Analysis
  const step1Prompt = `
용도: 메인 기능 설계 및 그래프 기반 아키텍처 연동
목표: 신규 기능을 설계하되, 기존에 정의된 노트들과의 중복을 피하고 유사 기능은 기존 노트를 업데이트합니다.
구조 원칙: 계층적 폴더보다는 노드 간의 연결(relatedNoteIds)을 중요시합니다. 공통 로직은 'Shared Core'로 취급합니다.
언어 설정: 모든 텍스트(제목, 내용, 요약 등)는 반드시 한국어로 작성하십시오. 영어 사용을 최소화하십시오.
가독성: Markdown 작성 시 단락 구분을 위해 줄바꿈(\n\n)을 적절히 사용하십시오.

기존 노트 목록 (요약):
${JSON.stringify(existingNotes.map(n => ({ id: n.id, title: n.title, folder: n.folder, summary: n.summary })))}

User Request: "${featureRequest}"

Task:
1. 기존 노트 중 이번 요청과 유사하거나 재사용 가능한 '공통 부품'이 있는지 판단합니다.
2. 유사한 노드가 있다면 해당 노드의 ID를 사용하여 업데이트 명세를 작성하고, relatedNoteIds에 포함시킵니다.
3. 완전히 새로운 구성 요소만 신규 노트로 생성합니다.
4. 모든 노트는 태그(tags)를 통해 성격(UI, Logic, Common 등)을 분류합니다.
5. relatedNoteIds를 통해 마인드맵 상에서 논리적으로 연결될 모든 노드를 자동으로 찾아 연결하십시오.
6. Metadata(yamlMetadata)는 다음 항목을 포함해야 합니다:
   - version: 1.0.0
   - lastUpdated: 2026-03-15
   - tags: [키워드]
   - componentType: Core(핵심), UI(화면), Shared(공용), Feature(기능) 중 선택
   - dependencies: [필요 라이브러리/모듈]
   - importance: 1~5 (중요도)

Return JSON:
{
  "title": "한국어 제목",
  "folder": "한국어_폴더_이름",
  "content": "# 한국어 제목\n\n## 핵심 목표\n내용...\n\n## 기술 명세\n내용...",
  "summary": "한국어 요약",
  "yamlMetadata": "version: 1.0.0\\nlastUpdated: 2026-03-15\\ntags: [tag1]\\ncomponentType: Feature\\ndependencies: []\\nimportance: 3",
  "reusedNoteIds": ["id1", "id2"],
  "newComponents": ["New Component 1"]
}
`;

  const step1Response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: step1Prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          folder: { type: Type.STRING },
          content: { type: Type.STRING },
          summary: { type: Type.STRING },
          yamlMetadata: { type: Type.STRING },
          reusedNoteIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          newComponents: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["title", "folder", "content", "summary", "yamlMetadata", "reusedNoteIds", "newComponents"],
      },
    },
  });

  const mainFeature = safeJsonParse(step1Response.text || "{}");

  // Step 2: Module Detailed Specs (New & Reused)
  // To avoid huge payloads, we only send the content of notes that are actually being reused
  const reusedNotesContent = existingNotes.filter(n => mainFeature.reusedNoteIds.includes(n.id));

  const step2Prompt = `
용도: 메인 기능의 특정 모듈에 대해 기능 설명과 기술 명세를 통합하여 작성합니다.
목표: [[메인 기능 노트]]의 하위 모듈에 대한 '핵심 기능', '역할', '구현 로직', '데이터 규약'을 하나의 통합 문서(content)에 상세히 정의합니다.
그래프 원칙: 폴더 종속성보다 "이 기능 구현을 위해 필요한 모든 논리 노드를 생성하고 관계를 선(relatedNoteIds)으로 연결"하는 데 집중하십시오.
언어 설정: 모든 텍스트는 반드시 한국어로 작성하십시오. 가독성을 위해 줄바꿈을 충분히 사용하십시오.

Main Feature: ${mainFeature.title}
Main Feature Summary: ${mainFeature.summary}
New Components to detail: ${mainFeature.newComponents.join(', ')}
Existing Notes to update: ${JSON.stringify(reusedNotesContent.map(n => ({ id: n.id, title: n.title, content: n.content })))}
Current GCM: ${JSON.stringify(currentGcm)}

지시사항:
1. 신규 컴포넌트에 대해서는 새로운 상세 노트를 작성합니다. parentNoteId와 relatedNoteIds를 적절히 설정하여 마인드맵 관계를 형성하십시오.
2. 기존 노트(Reused)에 대해서는 기존 내용을 보강하여 업데이트된 노트를 작성합니다.
3. GCM을 업데이트합니다.
4. relatedNoteIds를 통해 다른 하위 모듈이나 공통 부품과의 연결을 AI가 스스로 판단하여 자동으로 설정하십시오.
5. Metadata(yamlMetadata)는 다음 항목을 포함해야 합니다: version, lastUpdated(2026-03-15), tags, componentType, dependencies, importance.

Return JSON:
{
  "newDetailNotes": [ array of notes matching the schema ],
  "updatedDetailNotes": [ array of notes matching the schema but including the 'id' field ],
  "updatedGcm": { "entities": {...}, "variables": {...} }
}
`;

  const step2Response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: step2Prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          newDetailNotes: { type: Type.ARRAY, items: noteSchema },
          updatedDetailNotes: { 
            type: Type.ARRAY, 
            items: {
              ...noteSchema,
              properties: {
                ...noteSchema.properties,
                id: { type: Type.STRING }
              },
              required: [...(noteSchema.required || []), "id"]
            } 
          },
          updatedGcm: {
            type: Type.OBJECT,
            properties: {
              entities: { type: Type.OBJECT },
              variables: { type: Type.OBJECT },
            },
            required: ["entities", "variables"],
          },
        },
        required: ["newDetailNotes", "updatedDetailNotes", "updatedGcm"],
      },
    },
  });

  const step2Result = safeJsonParse(step2Response.text || "{}");
  
  const mainNote: Omit<Note, 'id' | 'status'> = {
    title: mainFeature.title,
    folder: mainFeature.folder,
    content: mainFeature.content,
    summary: mainFeature.summary,
    yamlMetadata: mainFeature.yamlMetadata,
  };

  return {
    newNotes: [mainNote, ...(step2Result.newDetailNotes || [])],
    updatedNotes: step2Result.updatedDetailNotes || [],
    updatedGcm: step2Result.updatedGcm || currentGcm,
  };
};

export const consolidateNotes = async (notes: Note[], gcm: GCM): Promise<{
  mergedNotes: Note[];
  removedNoteIds: string[];
  updatedGcm: GCM;
}> => {
  // Limit notes content to avoid huge prompt
  const simplifiedNotes = notes.map(n => ({
    id: n.id,
    title: n.title,
    folder: n.folder,
    content: n.content.slice(0, 2000), // Truncate very long content for analysis
  }));

  const prompt = `
당신은 시스템 최적화 전문가입니다. 현재 프로젝트의 모든 노트를 분석하여 기능이 겹치거나, 지나치게 파편화된 모듈을 논리적으로 통폐합하십시오.
특히 여러 기능에서 공통으로 발견되는 패턴(예: 즐겨찾기, 필터링 등)을 감지하면 이를 별도의 'Shared Core' 노드로 격상시키고 관련 노트들을 연결(relatedNoteIds)하십시오.

Notes Summary: ${JSON.stringify(simplifiedNotes)}
GCM: ${JSON.stringify(gcm)}

결과물:
1. 병합되어 내용이 보강된 노트 목록 (mergedNotes)
2. 삭제될 중복 노트 ID 목록 (removedNoteIds)
3. 변경된 GCM (updatedGcm)

Return JSON:
{
  "mergedNotes": [ array of notes ],
  "removedNoteIds": ["id1", "id2"],
  "updatedGcm": { ... }
}
`;
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          mergedNotes: { type: Type.ARRAY, items: { type: Type.OBJECT } },
          removedNoteIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          updatedGcm: { type: Type.OBJECT },
        },
        required: ["mergedNotes", "removedNoteIds", "updatedGcm"],
      },
    },
  });
  return safeJsonParse(response.text || "{}");
};

export const refactorFolders = async (notes: Note[]): Promise<Record<string, string>> => {
  const prompt = `
다음 노트를 분석하고 매우 효율적이고 논리적인 폴더 트리 구조로 재구성하십시오.
프로젝트의 아키텍처를 가장 잘 나타내는 동적인 폴더 이름을 한국어로 만드십시오.
마인드맵 구조를 고려하여, 공통 부품은 '공통' 또는 'Shared' 폴더로 모으는 것을 권장합니다.

노트 목록:
${JSON.stringify(notes.map(n => ({ id: n.id, title: n.title, currentFolder: n.folder, parentNoteId: n.parentNoteId })), null, 2)}

각 노트 ID를 새로운 한국어 폴더 이름으로 매핑하는 JSON 객체를 반환하십시오.
`;
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        description: "Dictionary mapping note IDs to their new folder name",
      },
    },
  });
  return safeJsonParse(response.text || "{}");
};

export const updateSingleNote = async (
  note: Note,
  command: string,
  gcm: GCM,
  allNotes: Note[]
): Promise<{ updatedNote: Note; updatedGcm: GCM; affectedNoteIds: string[] }> => {
  const prompt = `
You are a Targeted Command Executor. Update the specific note based on the user's command.
Also determine if this change affects the Global Context Map (GCM) and identify any other notes that might conflict or need updates due to this change.
마인드맵 구조를 고려하여, 다른 노트와의 연관 관계(relatedNoteIds)가 추가되거나 변경되어야 하는지도 판단하십시오.

Target Note:
${JSON.stringify(note, null, 2)}

Command: "${command}"

Current GCM:
${JSON.stringify(gcm, null, 2)}

All Other Notes (for impact analysis and linking):
${JSON.stringify(allNotes.filter(n => n.id !== note.id).map(n => ({ id: n.id, title: n.title, folder: n.folder })), null, 2)}

Return JSON:
{
  "updatedNote": { ...note with updated content, summary, yamlMetadata, parentNoteId, relatedNoteIds },
  "updatedGcm": { ...updated GCM if affected, else current GCM },
  "affectedNoteIds": ["id1", "id2"] // IDs of other notes potentially affected
}
`;
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          updatedNote: noteSchema,
          updatedGcm: {
            type: Type.OBJECT,
            properties: {
              entities: { type: Type.OBJECT },
              variables: { type: Type.OBJECT },
            },
          },
          affectedNoteIds: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["updatedNote", "updatedGcm", "affectedNoteIds"],
      },
    },
  });
  
  const result = safeJsonParse(response.text || "{}");
  return {
    updatedNote: { ...note, ...result.updatedNote },
    updatedGcm: result.updatedGcm || gcm,
    affectedNoteIds: result.affectedNoteIds || [],
  };
};

export const checkConsistency = async (
  notes: Note[],
  gcm: GCM
): Promise<Record<string, { description: string; suggestion: string }>> => {
  const prompt = `
당신은 온디맨드 일관성 검사기입니다. 모든 노트와 GCM을 스캔하여 모순, 변수 유형 불일치 또는 논리적 공백을 찾으십시오.
모든 설명과 제안은 반드시 한국어로 작성하십시오.

GCM:
${JSON.stringify(gcm, null, 2)}

노트 요약:
${JSON.stringify(notes.map(n => ({ id: n.id, title: n.title, content: n.content.slice(0, 1000) })), null, 2)}

충돌을 식별하십시오. 충돌하는 노트 ID를 충돌 세부 정보로 매핑하는 JSON 객체를 반환하십시오.
충돌이 없으면 빈 객체 {}를 반환하십시오.

반환 JSON 형식:
{
  "noteId1": {
    "description": "한국어 충돌 설명",
    "suggestion": "해결 방법 제안"
  }
}
`;
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        description: "Dictionary mapping note IDs to conflict details",
      },
    },
  });
  return safeJsonParse(response.text || "{}");
};

export const suggestNextSteps = async (
  notes: Note[],
  githubFiles: string[]
): Promise<{ suggestion: string; updatedStatuses: Record<string, NoteStatus> }> => {
  const prompt = `
당신은 Vibe-Architect입니다. 현재 프로젝트 상태를 분석하고 사용자에게 다음 단계를 제안하십시오.
마인드맵(그래프) 구조를 분석하여, 연결이 부족한 노드나 '공통 부품'으로 분리 가능한 패턴을 찾아 제안하십시오.
모든 제안과 설명은 반드시 한국어로 작성해야 합니다.

현재 노트 목록:
${JSON.stringify(notes.map(n => ({ id: n.id, title: n.title, status: n.status, summary: n.summary, relatedNoteIds: n.relatedNoteIds })), null, 2)}

GitHub 파일 목록:
${JSON.stringify(githubFiles.slice(0, 100))}

작업:
1. 프로젝트의 전반적인 진행 상황을 요약합니다.
2. 다음에 구현하거나 구체화해야 할 핵심 기능/모듈을 추천합니다.
3. 마인드맵 관점에서 노드 간의 연결을 강화하거나, 공통 로직을 분리할 것을 제안합니다.
4. 각 노트의 상태(status)가 실제 구현 상황과 맞지 않는 것 같으면 업데이트를 제안합니다.

Return JSON:
{
  "suggestion": "한국어로 된 상세한 다음 단계 제안 (Markdown)",
  "updatedStatuses": { "noteId1": "Done", "noteId2": "In-Progress" }
}
`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          suggestion: { type: Type.STRING },
          updatedStatuses: { type: Type.OBJECT },
        },
        required: ["suggestion", "updatedStatuses"],
      },
    },
  });

  const result = safeJsonParse(response.text || "{}");
  return {
    suggestion: result.suggestion || "제안할 내용이 없습니다.",
    updatedStatuses: result.updatedStatuses || {},
  };
};

export const checkConflict = async (content: string, fileContent: string): Promise<{ isMatch: boolean; reason: string }> => {
  const prompt = `
당신은 충돌 관리자입니다. 설계 내용(사양)과 실제 GitHub 소스 코드를 비교하십시오.
소스 코드가 설계를 논리적으로 구현하고 있는지 판단하십시오.
모든 설명과 이유는 반드시 한국어로 작성하십시오.

설계 내용:
${content}

GitHub 소스 코드:
${fileContent.slice(0, 15000)}

작업:
1. 코드가 설계와 논리적으로 일치하는지 확인합니다.
2. 일치하면 isMatch를 true로 설정합니다.
3. 일치하지 않으면(예: 기능 누락, 다른 로직) isMatch를 false로 설정하고 간략한 한국어 이유를 제공합니다.

반환 JSON: { "isMatch": boolean, "reason": "한국어 문자열" }
`;
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          isMatch: { type: Type.BOOLEAN },
          reason: { type: Type.STRING },
        },
        required: ["isMatch", "reason"],
      },
    },
  });
  return safeJsonParse(response.text || '{"isMatch": false, "reason": "Failed to parse"}');
};

export const updateSpecFromCode = async (content: string, fileContent: string): Promise<string> => {
  const prompt = `
다음 설계 내용을 제공된 소스 코드와 일치하도록 업데이트하십시오.
동일한 형식을 유지하되, 코드의 내용을 반영하여 로직과 세부 사항을 조정하십시오.
모든 텍스트는 한국어로 작성하십시오.

현재 설계 내용:
${content}

소스 코드:
${fileContent.slice(0, 15000)}
`;
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });
  return response.text || content;
};

export const generateFixGuide = async (content: string, fileContent: string): Promise<string> => {
  const prompt = `
소스 코드가 설계 내용과 일치하지 않습니다.
소스 코드를 설계 내용에 맞게 수정하는 방법에 대한 간결한 가이드를 한국어로 제공하십시오.

설계 내용:
${content}

소스 코드:
${fileContent.slice(0, 15000)}
`;
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });
  return response.text || "가이드가 없습니다.";
};

export const generateNoteFromCode = async (
  fileName: string,
  fileContent: string,
  existingNotes: Note[]
): Promise<Omit<Note, 'id' | 'status'>> => {
  const prompt = `
당신은 시스템 역공학 전문가입니다. 제공된 소스 코드를 분석하여 해당 코드의 역할을 설명하는 설계도(노트)를 작성하십시오.
마인드맵 구조를 고려하여, 기존 노트들과의 연관 관계(relatedNoteIds)를 찾아 연결하십시오.
언어 설정: 모든 텍스트는 반드시 한국어로 작성하십시오. 가독성을 위해 줄바꿈을 충분히 사용하십시오.

파일 이름: ${fileName}
소스 코드:
${fileContent.slice(0, 15000)}

기존 노트 목록 (연결용):
${JSON.stringify(existingNotes.map(n => ({ id: n.id, title: n.title, summary: n.summary })))}

작업:
1. 코드의 핵심 로직과 역할을 분석하여 제목(title)과 요약(summary)을 작성합니다.
2. 상세 기술 명세(content)를 Markdown 형식으로 작성합니다. (한국어 필수, 줄바꿈 필수)
3. 적절한 폴더(folder)를 지정합니다.
4. 기존 노트 중 이 코드와 논리적으로 연결된 것이 있다면 relatedNoteIds에 포함시킵니다. AI가 스스로 판단하여 자동으로 연결하십시오.
5. Metadata(yamlMetadata)를 작성합니다:
   - version: 1.0.0
   - lastUpdated: 2026-03-15
   - tags: [discovered-from-github, ...]
   - componentType: Core|UI|Shared|Feature
   - dependencies: [코드에서 발견된 주요 라이브러리]
   - importance: 1~5

Return JSON matching the Note schema (title, folder, content, summary, yamlMetadata, relatedNoteIds).
`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: noteSchema,
    },
  });

  return safeJsonParse(response.text || "{}");
};

export const generateSubModules = async (
  mainNote: Note,
  currentGcm: GCM,
  existingNotes: Note[]
): Promise<{ 
  newNotes: Omit<Note, 'id' | 'status'>[]; 
  updatedGcm: GCM 
}> => {
  const prompt = `
용도: 메인 기능의 하위 모듈 상세 설계 (마인드맵 기반)
목표: 주어진 메인 기능 노트를 분석하여 필요한 하위 구성 요소(Sub-modules)를 상세 설계합니다.
그래프 원칙: "이 기능 구현을 위해 필요한 모든 논리 노드를 생성하고 관계를 선(relatedNoteIds)으로 연결하라"는 지침을 따르십시오.
언어 설정: 모든 노트 제목(title)은 반드시 한국어로 작성하십시오.

메인 기능:
제목: ${mainNote.title}
내용: ${mainNote.content}
요약: ${mainNote.summary}

기존 노트 목록 (중복 방지 및 연결용):
${JSON.stringify(existingNotes.map(n => ({ id: n.id, title: n.title, folder: n.folder })))}

Task:
1. 메인 기능을 구현하기 위해 필요한 하위 모듈(UI 컴포넌트, API, 데이터 모델 등)을 식별합니다.
2. 기존 노트 중 재사용 가능한 공통 부품이 있다면 relatedNoteIds에 포함시키고, 새로운 논리 노드만 생성합니다.
3. parentNoteId를 "${mainNote.id}"로 설정하고, 상호 연관된 노드끼리 relatedNoteIds를 설정하십시오.
4. Metadata는 다음 형식을 따릅니다: version, lastUpdated(2026-03-15), tags.

Return JSON:
{
  "newNotes": [
    {
      "title": "한국어 하위 모듈 제목",
      "folder": "적절한 폴더",
      "content": "Markdown description and technical specification",
      "summary": "Brief summary",
      "yamlMetadata": "version: 1.0.0\\nlastUpdated: 2026-03-15\\ntags: [tag1]",
      "parentNoteId": "${mainNote.id}",
      "relatedNoteIds": ["id1", "id2"]
    }
  ],
  "updatedGcm": { ... }
}
`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { responseMimeType: "application/json" }
  });

  const result = safeJsonParse(response.text);
  return {
    newNotes: result.newNotes || [],
    updatedGcm: result.updatedGcm || currentGcm
  };
};
