import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Note, GCM, NoteStatus, GCMEntity } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL_NAME = "gemini-3-flash-preview";

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
8. [중요] 폴더 및 명칭 규칙:
   - 'Imported' 폴더는 절대 사용하지 마십시오.
   - 'Core', 'Feature', 'Shared', 'UI', 'Logic'과 같은 기술 계층 명칭 대신, '학생 실력 추적', '문제 풀이 공간', '문제 난이도 측정', '문제 스캔'과 같이 실제 기능을 나타내는 도메인(Domain) 단위로 폴더를 구성하십시오.
   - 모든 노드는 해당 기능이 속한 비즈니스 영역 폴더로 즉시 분류되어야 합니다.
   - 제목에서 'Main_', 'ㄴ.', '1.' 등의 불필요한 접두어를 제거하고, 기능의 본질을 나타내는 명확한 한국어 명칭을 사용하십시오.
   - [중요] 노트 제목에 'ㄱ, ㄴ, ㄷ' 또는 '1, 2, 3' 등의 숫자를 붙여 순서를 매기지 마십시오.
   - 시스템의 위계질서를 폴더 이름이 아닌 'componentType'과 'relatedNoteIds'로 표현하십시오.
9. [중요] 연결성(Mindmap) 유지:
   - 'relatedNoteIds'에는 반드시 노트의 고유 'id'를 사용하십시오. 제목을 넣지 마십시오.
   - 최적화 과정에서 기존의 연결 관계가 끊어지지 않도록 주의하고, 새로운 논리적 연결을 적극적으로 찾아 추가하십시오.
10. GCM 업데이트: 전역 컨텍스트 맵(GCM)을 업데이트할 때는 기존 엔티티와의 일관성을 유지하고, 불필요한 중복을 피하십시오.
`;

const noteSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "노트의 제목 (반드시 한국어)" },
    folder: { type: Type.STRING, description: "폴더 카테고리 (반드시 한국어)" },
    content: { type: Type.STRING, description: "상세 설명 및 기술 명세 (반드시 한국어, 가독성을 위해 적절한 줄바꿈 포함, Markdown)" },
    summary: { type: Type.STRING, description: "이 기능/모듈이 수행하는 역할에 대한 1-2문장 요약 (반드시 한국어)" },
    parentNoteId: { type: Type.STRING, description: "주요 부모 기능의 ID" },
    relatedNoteIds: { type: Type.ARRAY, items: { type: Type.STRING }, description: "논리적으로 연관된 다른 노트들의 고유 ID(id) 목록. 제목을 넣지 마십시오. AI가 분석하여 자동으로 최대한 많이 연결하십시오." },
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
5. relatedNoteIds를 통해 마인드맵 상에서 논리적으로 연결될 모든 노드를 자동으로 찾아 연결하십시오. (반드시 ID 사용)
6. [중요] 'summary'는 반드시 해당 기능의 역할을 설명하는 1-2문장의 한국어 요약이어야 합니다. 파일 이름이나 경로 정보를 넣지 마십시오.
7. [중요] 'content'는 반드시 시스템 지침에 정의된 4개 섹션 구조를 따라야 합니다.
8. [중요] 폴더명에서 'Imported'를 사용하지 마십시오. 'Core', 'UI', 'Logic' 등 기술 계층 명칭 대신 '학생 실력 추적', '문제 풀이 공간' 등 실제 기능/도메인 단위의 폴더명을 사용하십시오. 제목에서 불필요한 접두어(Main_, ㄴ. 등)를 제거하십시오.

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
    model: MODEL_NAME,
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
1. 신규 컴포넌트에 대해서는 새로운 상세 노트를 작성합니다. parentNoteId와 relatedNoteIds를 적절히 설정하여 마인드맵 관계를 형성하십시오. (반드시 ID 사용)
2. 기존 노트(Reused)에 대해서는 기존 내용을 보강하여 업데이트된 노트를 작성합니다. (ID 절대 보존)
3. GCM을 업데이트합니다.
4. [중요] 'Imported' 폴더 및 기술 계층(Core, UI 등) 폴더 사용을 금지하고, 도메인/기능 중심의 폴더명을 사용하십시오. 제목에서 불필요한 접두어를 제거하십시오.

Return JSON:
{
  "newDetailNotes": [ array of notes matching the schema ],
  "updatedDetailNotes": [ array of notes matching the schema but including the 'id' field ],
  "updatedGcm": { "entities": {...}, "variables": {...} }
}
`;

  const step2Response = await ai.models.generateContent({
    model: MODEL_NAME,
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

  // Sanitize relatedNoteIds for both new and updated notes
  const sanitizedNewNotes = sanitizeNotes([mainNote, ...(step2Result.newDetailNotes || [])], existingNotes);
  const sanitizedUpdatedNotes = sanitizeNotes(step2Result.updatedDetailNotes || [], existingNotes);

  return {
    newNotes: sanitizedNewNotes,
    updatedNotes: sanitizedUpdatedNotes,
    updatedGcm: step2Result.updatedGcm || currentGcm,
  };
};

// Utility to sanitize relatedNoteIds (convert titles to IDs if needed)
const sanitizeNotes = (updatedNotes: any[], allNotes: Note[]) => {
  const allNotesMap = new Map(allNotes.map(n => [n.id, n]));
  const titleToIdMap = new Map(allNotes.map(n => [n.title, n.id]));
  
  return updatedNotes.map(note => {
    if (!note.relatedNoteIds) return note;
    
    const sanitizedIds = note.relatedNoteIds.map((idOrTitle: string) => {
      if (allNotesMap.has(idOrTitle)) return idOrTitle;
      if (titleToIdMap.has(idOrTitle)) return titleToIdMap.get(idOrTitle)!;
      return idOrTitle;
    }).filter((id: any) => id && typeof id === 'string');
    
    return { ...note, relatedNoteIds: Array.from(new Set(sanitizedIds)) };
  });
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
    summary: n.summary,
    content: n.content.slice(0, 5000), // Increased slice size to preserve metadata and context
    relatedNoteIds: n.relatedNoteIds,
    parentNoteId: n.parentNoteId
  }));

  // Step 1: Global Analysis - Identify what needs to be changed
  const analysisPrompt = `
당신은 시스템 아키텍처 최적화 전문가입니다. 현재의 설계도(노트 목록 및 GCM)를 분석하여 최적화 계획을 세우십시오.

작업 목표:
1. **폴더 기능 단위 재배치**: 'Imported' 폴더 및 'Core', 'UI', 'Logic' 등 기술 중심 폴더를 완전히 제거하십시오. 모든 노트를 '학생 실력 추적', '문제 풀이 공간', '문제 난이도 측정', '문제 스캔'과 같이 실제 사용자 기능 단위로 재분류하십시오.
2. **명칭 표준화**: 'Main_', 'ㄴ.', 'ㄱ.', '1.' 등 불필요한 접두어와 숫자를 제목에서 완전히 제거하십시오.
3. **업데이트 대상 식별**: 내용 수정, 용어 통일, 메타데이터 보강, 또는 마인드맵 연결(relatedNoteIds) 강화가 필요한 노트를 식별합니다.
4. **삭제 대상 식별**: 중복되거나, 더 이상 필요 없거나, 다른 노트에 통합되어야 할 '유령' 노트를 식별합니다.
5. **GCM 최적화**: 노트들의 변화에 맞춰 전역 컨텍스트 맵(GCM)의 엔티티와 변수를 업데이트하거나 정제합니다.
6. **연결성 복구**: 끊어진 'relatedNoteIds' 관계를 분석하여 다시 연결하고, 새로운 논리적 연결을 찾아 계획에 반영합니다. (반드시 ID 기반 연결)

[주의] 노트의 'id'는 절대 변경하지 마십시오. ID가 변경되면 모든 참조가 깨집니다.

현재 GCM:
${JSON.stringify(gcm, null, 2)}

노트 목록 (요약):
${JSON.stringify(simplifiedNotes, null, 2)}

응답 형식 (JSON):
{
  "notesToUpdate": [ "id1", "id2", ... ], // 최적화가 필요한 노트 ID 목록 (이후 단계에서 상세 처리됨)
  "deletedNoteIds": [ "id3", "id4" ], // 삭제해야 할 노트 ID 목록
  "updatedGcm": { ... }, // 최적화된 GCM (엔티티 및 변수 포함)
  "analysisReport": "수행할 최적화 작업에 대한 상세 분석 및 요약 (한국어)"
}
`;

  const analysisResponse = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: analysisPrompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          notesToUpdate: { type: Type.ARRAY, items: { type: Type.STRING } },
          deletedNoteIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          updatedGcm: {
            type: Type.OBJECT,
            properties: {
              entities: { type: Type.OBJECT },
              variables: { type: Type.OBJECT },
            },
            required: ["entities", "variables"],
          },
          analysisReport: { type: Type.STRING },
        },
        required: ["notesToUpdate", "deletedNoteIds", "updatedGcm", "analysisReport"],
      },
    },
  });

  const analysisResult = safeJsonParse(analysisResponse.text);
  const idsToUpdate = analysisResult.notesToUpdate || [];
  const deletedNoteIds = analysisResult.deletedNoteIds || [];
  const updatedGcm = analysisResult.updatedGcm || gcm;

  // Step 2: Batch Optimization - Process notes in small chunks to avoid truncation
  const BATCH_SIZE = 4; // Small batch size for safety
  let allUpdatedNotes: Note[] = [];
  
  for (let i = 0; i < idsToUpdate.length; i += BATCH_SIZE) {
    const chunkIds = idsToUpdate.slice(i, i + BATCH_SIZE);
    const chunkNotes = notes.filter(n => chunkIds.includes(n.id));
    
    const optimizationPrompt = `
당신은 시스템 아키텍처 최적화 전문가입니다. 다음 특정 노트들을 최적화하여 반환하십시오.

[컨텍스트]
전체 GCM: ${JSON.stringify(updatedGcm)}
전체 노트 구조 (참고용): ${JSON.stringify(simplifiedNotes.map(n => ({ id: n.id, title: n.title, folder: n.folder })))}

[최적화 대상 노트]
${JSON.stringify(chunkNotes)}

작업 규칙:
1. **ID 보존**: 제공된 'id'를 절대 변경하지 말고 그대로 반환하십시오.
2. **폴더 도메인 재배치**: 'Imported' 또는 기술 계층(Core, UI 등) 폴더에 있다면 반드시 '학생 실력 추적', '문제 풀이 공간' 등 실제 기능 단위의 도메인 폴더로 변경하십시오.
3. **명칭 정제**: 'Main_', 'ㄴ.', 'ㄱ.', '1.' 등 불필요한 접두어와 숫자를 완전히 제거하고 명확한 한국어 제목으로 수정하십시오.
4. **메타데이터 분리**: 모든 메타데이터는 'yamlMetadata' 필드에만 넣으십시오.
5. **본문 구조**: 모든 'content'는 시스템 지침의 4개 섹션 구조를 유지해야 합니다.
6. **요약**: 'summary'는 기능의 역할을 설명하는 한국어 요약으로 업데이트하십시오.
7. **연결성(Mindmap)**: 'relatedNoteIds'에 다른 노트의 고유 'id'를 사용하여 논리적으로 연관된 노드들을 연결하십시오. (제목 사용 금지)
8. 모든 텍스트는 한국어로 작성하십시오.

응답 형식 (JSON):
{
  "updatedNotes": [ ... 최적화된 노트 객체들 ... ]
}
`;

    const optimizationResponse = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: optimizationPrompt,
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
          },
          required: ["updatedNotes"],
        },
      },
    });

    const optimizationResult = safeJsonParse(optimizationResponse.text);
    if (optimizationResult.updatedNotes) {
      allUpdatedNotes = [...allUpdatedNotes, ...optimizationResult.updatedNotes];
    }
  }

  // Post-process: Sanitize relatedNoteIds
  const sanitizedUpdatedNotes = sanitizeNotes(allUpdatedNotes, notes);

  return {
    updatedNotes: sanitizedUpdatedNotes,
    deletedNoteIds: deletedNoteIds,
    updatedGcm: updatedGcm,
    report: analysisResult.analysisReport || "최적화가 완료되었습니다."
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
    model: MODEL_NAME,
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
    model: MODEL_NAME,
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
    model: MODEL_NAME,
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
    model: MODEL_NAME,
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
    model: MODEL_NAME,
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
    model: MODEL_NAME,
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
1. 코드의 핵심 로직과 역할을 분석하여 제목(title)과 요약(summary)을 작성합니다. (불필요한 접두어 제거)
2. 상세 기술 명세(content)를 Markdown 형식으로 작성합니다. (한국어 필수, 줄바꿈 필수)
3. 적절한 폴더(folder)를 지정합니다. ('Imported' 또는 기술 계층 명칭 사용 금지. '학생 실력 추적', '문제 풀이 공간' 등 도메인 중심 폴더 사용)
4. 기존 노트 중 이 코드와 논리적으로 연결된 것이 있다면 relatedNoteIds에 포함시킵니다. AI가 스스로 판단하여 자동으로 연결하십시오. (반드시 ID 사용)
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
    model: MODEL_NAME,
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: noteSchema,
    },
  });

  const result = safeJsonParse(response.text || "{}");
  const sanitized = sanitizeNotes([result], existingNotes);
  return sanitized[0];
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
2. 기존 노트 중 재사용 가능한 공통 부품이 있다면 relatedNoteIds에 포함시키고, 새로운 논리 노드만 생성합니다. (반드시 ID 사용)
3. parentNoteId를 "${mainNote.id}"로 설정하고, 상호 연관된 노드끼리 relatedNoteIds를 설정하십시오. (반드시 ID 사용)
4. Metadata는 다음 형식을 따릅니다: version, lastUpdated(2026-03-15), tags.
5. [중요] 'Imported' 또는 기술 계층 폴더 사용을 금지하고, 도메인/기능 중심의 적절한 카테고리를 사용하십시오. 제목에서 불필요한 접두어를 제거하십시오.

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
    model: MODEL_NAME,
    contents: prompt,
    config: { 
      systemInstruction,
      responseMimeType: "application/json" 
    }
  });

  const result = safeJsonParse(response.text);
  const sanitizedNewNotes = sanitizeNotes(result.newNotes || [], existingNotes);

  return {
    newNotes: sanitizedNewNotes,
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
    model: MODEL_NAME,
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
    model: MODEL_NAME,
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
    model: MODEL_NAME,
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
    model: MODEL_NAME,
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

export const summarizeRepoFeatures = async (
  repoName: string,
  fileTree: string[],
  readmeContent: string,
  userGoal: string
): Promise<{ features: { id: number; title: string; description: string; relatedFiles: string[] }[] }> => {
  const prompt = `
당신은 오픈소스 분석 전문가입니다. 외부 GitHub 레포지토리의 구조와 README를 분석하여, 사용자가 원하는 목표에 부합하는 핵심 기능 리스트(메뉴)를 추출하십시오.

레포지토리: ${repoName}
사용자 목표: "${userGoal}"
README 일부:
${readmeContent.slice(0, 5000)}

파일 트리 (일부):
${JSON.stringify(fileTree.slice(0, 200))}

작업:
1. 사용자의 목표와 관련된 핵심 기능 3~5개를 식별합니다.
2. 각 기능에 대해 명확한 제목, 설명, 그리고 해당 기능을 구현하는 핵심 파일 경로 목록을 포함하십시오.
3. 모든 설명은 한국어로 작성하십시오.

Return JSON:
{
  "features": [
    { "id": 1, "title": "기능 제목", "description": "기능 설명", "relatedFiles": ["path/to/file1.ts", "path/to/file2.ts"] }
  ]
}
`;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          features: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.NUMBER },
                title: { type: Type.STRING },
                description: { type: Type.STRING },
                relatedFiles: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ["id", "title", "description", "relatedFiles"],
            },
          },
        },
        required: ["features"],
      },
    },
  });

  return safeJsonParse(response.text || '{"features": []}');
};

export const transpileExternalLogic = async (
  featureTitle: string,
  externalCodes: { path: string; content: string }[],
  currentGcm: GCM,
  existingNotes: Note[]
): Promise<{ 
  newNotes: Omit<Note, 'id' | 'status'>[]; 
  updatedGcm: GCM 
}> => {
  const prompt = `
당신은 '대화형 선별 이식(Interactive Selective Transfer)' 전문가입니다. 
외부 프로젝트의 핵심 로직을 분석하여, 우리 프로젝트의 도메인 언어와 변수 체계(GCM)에 맞게 재구성한 설계도를 생성하십시오.

대상 기능: ${featureTitle}
외부 소스 코드:
${externalCodes.map(c => `File: ${c.path}\nContent:\n${c.content.slice(0, 5000)}`).join('\n---\n')}

우리 프로젝트 GCM:
${JSON.stringify(currentGcm)}

기존 노트 목록 (참고용):
${JSON.stringify(existingNotes.map(n => ({ id: n.id, title: n.title, folder: n.folder })))}

작업 지침:
1. **변수 정문화 이식**: 외부 코드의 알고리즘 뼈대는 유지하되, 모든 변수명, 클래스명, 함수명은 우리 프로젝트의 GCM 및 도메인 구조에 맞춰 치환하십시오.
   - 예: 외부 'input_array' -> 우리 'problemList'
   - 예: 외부 'GradeManager' -> 우리 '학생 실력 추적' 도메인 내 로직
2. **도메인 중심 분류**: 우리 프로젝트의 도메인 폴더 구조에 맞게 노트를 생성하십시오. ('Imported' 사용 금지)
3. **상세 설계**: 'content'는 시스템 지침의 4개 섹션 구조를 따라야 하며, 알고리즘을 우리 프로젝트의 문맥으로 상세히 설명하십시오.
4. **연결성**: 기존 노트들과 논리적으로 연결될 수 있도록 relatedNoteIds를 설정하십시오. (반드시 ID 사용)

Return JSON:
{
  "newNotes": [ array of notes matching the schema ],
  "updatedGcm": { "entities": {...}, "variables": {...} }
}
`;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          newNotes: { type: Type.ARRAY, items: noteSchema },
          updatedGcm: {
            type: Type.OBJECT,
            properties: {
              entities: { type: Type.OBJECT },
              variables: { type: Type.OBJECT },
            },
            required: ["entities", "variables"],
          },
        },
        required: ["newNotes", "updatedGcm"],
      },
    },
  });

  const result = safeJsonParse(response.text || "{}");
  const sanitized = sanitizeNotes(result.newNotes || [], existingNotes);

  return {
    newNotes: sanitized,
    updatedGcm: result.updatedGcm || currentGcm,
  };
};
