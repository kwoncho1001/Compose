import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Note, GCM, NoteStatus, GCMEntity } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const systemInstruction = `
당신은 Vibe-Architect 프로젝트의 핵심 AI 설계자입니다.
아래의 공통 규칙을 모든 작업에 엄격히 적용하십시오:

1. 언어 설정: 모든 텍스트(제목, 내용, 요약, 설명 등)는 반드시 한국어로 작성하십시오. 영어 사용을 최소화하십시오.
2. 가독성: Markdown 작성 시 단락 구분을 위해 줄바꿈(\\n\\n)을 적절히 사용하십시오.
3. 그래프 아키텍처: 계층적 폴더보다는 노드 간의 연결(relatedNoteIds)을 최우선으로 고려하십시오.
4. 메타데이터 표준: yamlMetadata는 항상 다음 형식을 포함해야 합니다:
   - noteId: [노트의 고유 ID]
   - version: 1.0.0
   - lastUpdated: 2026-03-15
   - tags: [키워드 목록]
   - componentType: Core|UI|Shared|Feature
   - dependencies: [라이브러리 목록]
   - relatedNoteIds: [연관된 노트 ID 목록] (마인드맵 연결용)
5. [중요] 메타데이터 분리: 모든 메타데이터(ID, 버전, 태그, 연결 정보 등)는 반드시 'yamlMetadata' 필드에만 넣으십시오. 'content' 본문에는 마크다운 형식의 설계 내용만 들어가야 하며, 'content' 내부에 'noteId', 'tags', 'relatedNoteIds' 등의 메타데이터 정보를 중복해서 넣는 것을 엄격히 금지합니다.
6. [중요] 노트 본문(content) 구조: 모든 노트의 'content'는 반드시 다음 4개 섹션을 포함해야 하며, 충분히 상세하게 작성하십시오. 섹션 제목은 반드시 아래 형식을 따르십시오:
   **1. 모듈의 핵심 역할 (Core Role):** (가장 쉽게 설명)
   **2. 무엇을 하는가? (What it Does):** (비유나 쉬운 용어 사용)
   **3. 어떻게 작동하는가? (How it Works - High-Level Flow):** (큰 그림에서 흐름 설명)
   **4. 구체적인 알고리즘 및 기술 명세 (Detailed Algorithm & Technical Specification):**
      - 4.1. 데이터 인터페이스 정의 (Data Contract) (Input, Output, State)
      - 4.2. 단계별 알고리즘 (Step-by-Step Logic) (의사코드 또는 상세 논리 단계)
      - 4.3. 예외 처리 및 제약 조건 (Edge Cases & Constraints)
      - 4.4. 상호 연동성 및 의존성 (Dependencies)
7. [중요] 요약(summary) 규칙: 'summary'는 "Imported from..."과 같은 출처 정보가 아니라, 해당 모듈이 시스템에서 수행하는 실제 기능을 1-2문장의 한국어로 설명해야 합니다.
8. GCM 업데이트: 전역 컨텍스트 맵(GCM)을 업데이트할 때는 기존 엔티티와의 일관성을 유지하고, 불필요한 중복을 피하십시오.
`;

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
      description: "표준화된 YAML: noteId: [id], version: 1.0.0, lastUpdated: YYYY-MM-DD, tags: [tag1], componentType: Core|UI|Shared|Feature, dependencies: [lib1], relatedNoteIds: [id1, id2]" 
    },
  },
  required: ["title", "folder", "content", "summary", "yamlMetadata"],
};

const parseMetadata = (yaml: string): Record<string, string> => {
  const result: Record<string, string> = {};
  if (!yaml) return result;
  yaml.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length > 0) {
      result[key.trim()] = valueParts.join(':').trim();
    }
  });
  return result;
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
목표: 신규 기능을 설계하되, 기존에 정의된 노트들과의 중복을 피하고 유사 기능은 기존 노트를 업데이트합니다.

기존 노트 목록 (요약):
${JSON.stringify(existingNotes.map(n => ({ id: n.id, title: n.title, folder: n.folder, summary: n.summary })))}

User Request: "${featureRequest}"

Task:
1. 기존 노트 중 재사용 가능한 '공통 부품'이 있는지 판단합니다.
2. 유사한 노드가 있다면 해당 노드의 ID를 사용하여 업데이트 명세를 작성하고, relatedNoteIds에 포함시킵니다.
3. 완전히 새로운 구성 요소만 신규 노트로 생성합니다.
4. 모든 노트는 태그(tags)를 통해 성격(UI, Logic, Common 등)을 분류합니다.
5. relatedNoteIds를 통해 마인드맵 상에서 논리적으로 연결될 모든 노드를 자동으로 찾아 연결하십시오.
6. [중요] 'summary'는 반드시 해당 기능의 역할을 설명하는 1-2문장의 한국어 요약이어야 합니다. 파일 이름이나 경로 정보를 넣지 마십시오.
7. [중요] 'content'는 반드시 시스템 지침에 정의된 4개 섹션 구조를 따라야 합니다.

Return JSON:
{
  "title": "한국어 제목",
  "folder": "한국어_폴더_이름",
  "content": "시스템 지침의 4개 섹션 구조를 따른 상세 내용",
  "summary": "한국어 요약 (역할 중심)",
  "yamlMetadata": "noteId: [id]\\nversion: 1.0.0\\nlastUpdated: 2026-03-15\\ntags: [tag1]\\ncomponentType: Feature\\ndependencies: []\\nrelatedNoteIds: []",
  "reusedNoteIds": ["id1", "id2"],
  "newComponents": ["New Component 1"]
}
`;

  const step1Response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: step1Prompt,
    config: {
      systemInstruction,
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
목표: [[메인 기능 노트]]의 하위 모듈에 대한 '핵심 기능', '역할', '구현 로직', '데이터 규약'을 하나의 통합 문서(content)에 상세히 정의합니다.

Main Feature: ${mainFeature.title}
Main Feature Summary: ${mainFeature.summary}
New Components to detail: ${mainFeature.newComponents.join(', ')}
Existing Notes to update: ${JSON.stringify(reusedNotesContent.map(n => ({ id: n.id, title: n.title, content: n.content.slice(0, 1000) })))}
Current GCM: ${JSON.stringify(currentGcm)}

지시사항:
1. 신규 컴포넌트에 대해서는 새로운 상세 노트를 작성합니다. parentNoteId와 relatedNoteIds를 적절히 설정하여 마인드맵 관계를 형성하십시오.
2. 기존 노트(Reused)에 대해서는 기존 내용을 보강하여 업데이트된 노트를 작성합니다.
3. GCM을 업데이트합니다.

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
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          newDetailNotes: { type: Type.ARRAY, items: noteSchema },
          updatedDetailNotes: { 
            type: Type.ARRAY, 
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                folder: { type: Type.STRING },
                content: { type: Type.STRING },
                summary: { type: Type.STRING },
                parentNoteId: { type: Type.STRING },
                relatedNoteIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                yamlMetadata: { type: Type.STRING },
              },
              required: ["id", "title", "folder", "content", "summary", "yamlMetadata"],
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

export const optimizeBlueprint = async (
  notes: Note[],
  gcm: GCM
): Promise<{ 
  updatedNotes: Note[], 
  deletedNoteIds: string[],
  updatedGcm: GCM, 
  report: string 
}> => {
  const simplifiedNotes = notes.map(n => ({
    id: n.id,
    title: n.title,
    folder: n.folder,
    content: n.content.slice(0, 1500), // Slightly more aggressive slicing
    relatedNoteIds: n.relatedNoteIds,
    parentNoteId: n.parentNoteId
  }));

  const prompt = `
당신은 시스템 아키텍처 최적화 전문가입니다. 현재의 설계도(노트 목록 및 GCM)를 분석하여 다음 작업을 수행하십시오:

1. **일관성 검사**: 노트 간의 용어 불일치나 논리적 모순을 찾아 수정합니다.
2. **연결점 자동 형성**: 내용상 연관이 깊지만 연결되지 않은 노드들(relatedNoteIds)을 분석하여 마인드맵 상에서 자동으로 연결하십시오.
3. **구조 재구축**: 폴더 구조를 논리적으로 재배치합니다.
4. **중복 제거 및 통합**: 완전히 동일한 기능을 설명하는 노드만 통합하되, **부모-자식 관계가 명확한 모듈화된 노드들은 절대로 하나로 합치지 마십시오.** 모듈성을 유지하는 것이 최우선입니다.
5. **유령 파일 제거**: 제목이 없거나 내용이 비어있는 쓸데없는 노드들은 삭제 리스트(deletedNoteIds)에 포함하십시오.
6. [중요] **메타데이터 분리**: 모든 메타데이터(ID, 태그, 연결 정보 등)는 반드시 'yamlMetadata' 필드에만 넣으십시오. 'content' 본문에는 마크다운 형식의 설계 내용만 들어가야 하며, 메타데이터가 중복 포함되어서는 안 됩니다. 또한, 'yamlMetadata'에는 반드시 'noteId: [해당 노트의 ID]'가 포함되어야 합니다.
7. [중요] **본문 구조**: 모든 'content'는 시스템 지침의 4개 섹션 구조를 유지해야 합니다.
8. [중요] **요약**: 'summary'는 "Imported from..."과 같은 파일 경로나 소스 정보가 아닌, 기능의 역할을 설명하는 한국어 요약으로 반드시 업데이트하십시오.
9. **연결성**: 'relatedNoteIds'를 분석하여 논리적으로 연관된 모든 노드들을 연결하십시오.

현재 GCM:
${JSON.stringify(gcm, null, 2)}

노트 목록:
${JSON.stringify(simplifiedNotes, null, 2)}

작업 규칙:
- [중요] **변경된 노트만 반환**: 응답 크기 제한을 피하기 위해, 내용이나 메타데이터가 실제로 수정된 노트들만 'updatedNotes' 배열에 포함하십시오. 수정되지 않은 노트는 포함하지 마십시오.
- 결과물에서 각 노트의 ID는 유지되어야 합니다.
- 삭제해야 할 노트가 있다면 'deletedNoteIds' 배열에 해당 ID들을 넣으십시오.
- 모든 텍스트는 한국어로 작성하십시오.

Return JSON:
{
  "updatedNotes": [ ... 수정된 노트들만 ... ],
  "deletedNoteIds": [ "id1", "id2" ],
  "updatedGcm": { ... },
  "report": "어떤 최적화가 이루어졌는지에 대한 한국어 요약"
}
`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          updatedNotes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                folder: { type: Type.STRING },
                content: { type: Type.STRING },
                summary: { type: Type.STRING },
                parentNoteId: { type: Type.STRING },
                relatedNoteIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                yamlMetadata: { type: Type.STRING },
              },
              required: ["id", "title", "folder", "content", "summary", "yamlMetadata"],
            },
          },
          deletedNoteIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          updatedGcm: {
            type: Type.OBJECT,
            properties: {
              entities: { type: Type.OBJECT },
              variables: { type: Type.OBJECT },
            },
            required: ["entities", "variables"],
          },
          report: { type: Type.STRING },
        },
        required: ["updatedNotes", "deletedNoteIds", "updatedGcm", "report"],
      },
    },
  });

  const result = safeJsonParse(response.text);
  
  // Merge updates back into the original notes list
  const updatedNotesMap = new Map((result.updatedNotes || []).map((n: any) => [n.id, n]));
  const deletedIds = new Set(result.deletedNoteIds || []);
  
  const finalNotes = notes
    .filter(n => !deletedIds.has(n.id))
    .map(n => {
      const update = updatedNotesMap.get(n.id);
      if (update) {
        return { ...n, ...(update as any) };
      }
      return n;
    });

  return {
    updatedNotes: finalNotes,
    deletedNoteIds: result.deletedNoteIds || [],
    updatedGcm: result.updatedGcm || gcm,
    report: result.report || "최적화가 완료되었습니다."
  };
};

export const updateSingleNote = async (
  note: Note,
  command: string,
  gcm: GCM,
  allNotes: Note[]
): Promise<{ updatedNote: Note; updatedGcm: GCM; affectedNoteIds: string[] }> => {
  // Cost Optimization: Filter only relevant notes (same folder or importance >= 4)
  const relevantNotes = allNotes.filter(n => 
    n.id !== note.id && (n.folder === note.folder || parseInt(parseMetadata(n.yamlMetadata).importance || '0') >= 4)
  );

  const prompt = `
Update the specific note based on the user's command.
Also determine if this change affects the Global Context Map (GCM) and identify any other notes that might conflict or need updates due to this change.

[중요] 지시사항:
1. 'content'는 반드시 시스템 지침의 4개 섹션 구조를 따라야 합니다.
2. 모든 메타데이터는 'yamlMetadata'에만 포함시키고 'content'에는 넣지 마십시오.
3. 'summary'는 기능의 역할을 설명하는 1-2문장의 한국어 요약이어야 합니다.
4. 'yamlMetadata'에 'noteId'를 포함시키십시오.

Target Note:
${JSON.stringify(note, null, 2)}

Command: "${command}"

Current GCM:
${JSON.stringify(gcm, null, 2)}

Relevant Other Notes (for impact analysis):
${JSON.stringify(relevantNotes.map(n => ({ id: n.id, title: n.title, folder: n.folder, summary: n.summary })), null, 2)}

Return JSON:
{
  "updatedNote": { ...note with updated content, summary, yamlMetadata, parentNoteId, relatedNoteIds },
  "updatedGcm": { ...updated GCM if affected, else current GCM },
  "affectedNoteIds": ["id1", "id2"]
}
`;
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      systemInstruction,
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
  // Client-side pre-check: Duplicate variable names in GCM
  const variableNames = Object.keys(gcm.variables);
  const duplicates = variableNames.filter((item, index) => variableNames.indexOf(item) !== index);
  
  const prompt = `
당신은 온디맨드 일관성 검사기입니다. 모든 노트와 GCM을 스캔하여 모순, 변수 유형 불일치 또는 논리적 공백을 찾으십시오.

GCM:
${JSON.stringify(gcm, null, 2)}

노트 요약:
${JSON.stringify(notes.map(n => ({ id: n.id, title: n.title, summary: n.summary })), null, 2)}

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
      systemInstruction,
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
      systemInstruction,
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
      systemInstruction,
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
    config: { systemInstruction }
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
    config: { systemInstruction }
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

[중요] 지시사항:
1. 'content'는 반드시 시스템 지침의 4개 섹션 구조를 따라야 합니다.
2. 모든 메타데이터는 'yamlMetadata'에만 포함시키고 'content'에는 넣지 마십시오.
3. 'summary'는 파일 경로가 아닌, 기능의 역할을 설명하는 1-2문장의 한국어 요약이어야 합니다.
4. 'yamlMetadata'에 'noteId'를 포함시키십시오.

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
      systemInstruction,
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

[중요] 지시사항:
1. 'content'는 반드시 시스템 지침의 4개 섹션 구조를 따라야 합니다.
2. 모든 메타데이터는 'yamlMetadata'에만 포함시키고 'content'에는 넣지 마십시오.
3. 'summary'는 기능의 역할을 설명하는 1-2문장의 한국어 요약이어야 합니다.
4. 'yamlMetadata'에 'noteId'를 포함시키십시오.

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
    config: { 
      systemInstruction,
      responseMimeType: "application/json" 
    }
  });

  const result = safeJsonParse(response.text);
  return {
    newNotes: result.newNotes || [],
    updatedGcm: result.updatedGcm || currentGcm
  };
};

export const suggestGcmUpdates = async (
  notes: Note[],
  currentGcm: GCM
): Promise<{ suggestedEntities: GCMEntity[]; suggestedVariables: Record<string, string> }> => {
  const prompt = `
당신은 시스템 아키텍트입니다. 현재 작성된 모든 노트들을 분석하여 공통적으로 사용되는 엔티티(Entity)나 전역 변수를 추출하여 GCM(Global Context Map)에 등록할 것을 제안하십시오.

현재 GCM:
${JSON.stringify(currentGcm, null, 2)}

노트 요약 및 내용 일부:
${JSON.stringify(notes.map(n => ({ id: n.id, title: n.title, summary: n.summary, content: n.content.slice(0, 500) })), null, 2)}

작업:
1. 여러 노트에서 공통으로 언급되는 데이터 구조나 객체를 찾아 엔티티로 정의합니다.
2. 시스템 전반에서 공유되어야 할 설정값이나 상태를 찾아 전역 변수로 정의합니다.
3. 기존 GCM과 중복되지 않는 새로운 제안만 포함하십시오.

Return JSON:
{
  "suggestedEntities": [ { "name": "...", "type": "...", "description": "...", "properties": { "prop1": "type" } } ],
  "suggestedVariables": { "VAR_NAME": "description/value" }
}
`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
    },
  });

  return safeJsonParse(response.text || '{"suggestedEntities": [], "suggestedVariables": {}}');
};

export const detectMissingLinks = async (
  notes: Note[]
): Promise<{ suggestedLinks: { fromId: string; toId: string; reason: string }[] }> => {
  const prompt = `
당신은 그래프 분석 전문가입니다. 마인드맵 상에서 논리적 연결(relatedNoteIds)이 부족하거나 고립된 노드(Orphan Node)를 찾아 관계 형성을 추천하십시오.

노트 목록:
${JSON.stringify(notes.map(n => ({ id: n.id, title: n.title, summary: n.summary, relatedNoteIds: n.relatedNoteIds || [] })), null, 2)}

작업:
1. 기능적으로 연관이 있어 보이지만 연결되지 않은 노드 쌍을 찾습니다.
2. 고립된 노드가 있다면 적절한 부모나 관련 노드를 찾아 연결을 제안합니다.

Return JSON:
{
  "suggestedLinks": [ { "fromId": "...", "toId": "...", "reason": "한국어 이유" } ]
}
`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
    },
  });

  return safeJsonParse(response.text || '{"suggestedLinks": []}');
};

/**
 * 프로젝트 내에서 빈번하게 참조되는 노트를 분석하여 'Shared Core'로 격상할 것을 제안합니다.
 */
export const analyzeSharedCore = async (notes: Note[]): Promise<{ suggestedPromotions: { noteId: string; reason: string }[] }> => {
  const prompt = `
당신은 아키텍처 분석가입니다. 다음 노트들의 연결 관계(relatedNoteIds)를 분석하여, 여러 다른 노트들로부터 빈번하게 참조되는(In-degree가 높은) 노트를 찾아 'Shared Core' 모듈로 격상할 것을 제안하세요.
공통 유틸리티, 인증 로직, 전역 상태 관리, 공통 UI 컴포넌트 등이 대상입니다.

노트 목록:
${notes.map(n => `- ID: ${n.id}, 제목: ${n.title}, 폴더: ${n.folder}, 참조하는노트들: ${n.relatedNoteIds?.join(', ') || '없음'}`).join('\n')}

출력 형식 (JSON):
{
  "suggestedPromotions": [
    { "noteId": "노트ID", "reason": "격상 제안 이유 (예: 5개의 서로 다른 기능에서 참조됨)" }
  ]
}
`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
    },
  });

  return safeJsonParse(response.text || '{"suggestedPromotions": []}');
};

/**
 * 디자인 명세와 코드를 지능적으로 병합합니다.
 */
export const partialMerge = async (spec: string, code: string): Promise<string> => {
  const prompt = `
디자인 명세와 실제 구현 코드 사이의 충돌이 발생했습니다. 두 내용을 지능적으로 병합하여 최적의 명세를 만드세요.
디자인 명세:
${spec}

구현 코드:
${code}

작업:
1. 코드에서 구현된 실제 로직과 변수명을 명세에 반영하세요.
2. 명세에만 있는 중요한 비즈니스 로직이나 주석은 유지하세요.
3. GCM 변수와 일치하지 않는 부분이 있다면 코드의 구현을 우선하되 명세에 기록하세요.
`;

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
    config: { systemInstruction }
  });

  return response.text || spec;
};

/**
 * YAML 메타데이터의 유효성을 검사합니다.
 */
export const validateYamlMetadata = (content: string): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
  
  if (!yamlMatch) {
    return { isValid: true, errors: [] }; // 메타데이터가 없는 것은 허용
  }

  const yamlStr = yamlMatch[1];
  const lines = yamlStr.split('\n');
  
  // 간단한 키-값 쌍 검사
  lines.forEach((line, index) => {
    if (line.trim() && !line.includes(':')) {
      errors.push(`Line ${index + 1}: 올바른 YAML 형식이 아닙니다 (키: 값 형식이 필요함)`);
    }
  });

  // 필수 필드 체크 (예시: relatedNoteIds, noteId)
  if (!yamlStr.includes('relatedNoteIds:')) {
    errors.push("마인드맵 연결을 위한 'relatedNoteIds' 필드가 메타데이터에 필요합니다.");
  }
  if (!yamlStr.includes('noteId:')) {
    errors.push("노트 식별을 위한 'noteId' 필드가 메타데이터에 필요합니다.");
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};
