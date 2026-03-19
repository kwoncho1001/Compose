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
   - **[중요] 폴더명(folder)은 반드시 "상위범주/하위범주" 형태의 경로 기반 분류를 사용하십시오.** (예: "1. 시스템 인프라/데이터 보안", "2. 콘텐츠 뱅크/문제 스캔").
   - **[중요] 유사한 도메인 폴더 통합**: '디지털 캔버스', '디지털 학습캔버스', '디지털 문제 풀이 캔버스'와 같이 유사한 목적을 가진 폴더들은 반드시 하나의 대표 도메인 폴더(예: "3. 학습 공간/디지털 캔버스")로 통합하십시오. 파편화된 폴더 생성을 엄격히 금지합니다.
   - 모든 노드는 해당 기능이 속한 비즈니스 영역 폴더로 즉시 분류되어야 합니다.
   - 제목에서 'Main_', 'ㄴ.', '1.' 등의 불필요한 접두어를 제거하고, 기능의 본질을 나타내는 명확한 한국어 명칭을 사용하십시오.
   - [중요] 노트 제목에 'ㄱ, ㄴ, ㄷ' 또는 '1, 2, 3' 등의 숫자를 붙여 순서를 매기지 마십시오.
       - 시스템의 위계질서를 폴더 이름이 아닌 'parentNoteId', 'componentType'과 'relatedNoteIds'로 표현하십시오.
    - **[중요] 노트 제목 접두어 강제 규칙**: 모든 노트의 제목(title)은 그 성격에 따라 반드시 다음 접두어를 붙여야 합니다.
       - 개별 함수나 유틸리티 성격의 노트: **[함수]** (예: [함수] checkAuthStatus)
       - 파일 전체를 대변하거나 여러 함수를 포함하는 상위 노트: **[파일]** (예: [파일] 사용자 인증 관리)
       - 비즈니스 흐름이나 복합 로직을 설명하는 노트: **[로직]** (예: [로직] 결제 승인 프로세스)
9. [중요] 수직적 계층 구조(Hierarchy) 강화:
   - 노트를 수평적으로 나열하지 마십시오. '문제 스캔 및 등록', '문제 스캔 및 디지털화'와 같은 세부 기능들은 '문제 스캔'이라는 상위 노트의 하위(parentNoteId 설정)로 배치하여 수직적 깊이를 확보하십시오.
   - 기능의 크기에 따라 상위(Parent) - 하위(Child) 관계를 명확히 설정하여 균일하고 체계적인 분류를 유지하십시오.
10. [중요] 연결성(Mindmap) 유지:
   - 'relatedNoteIds'에는 반드시 노트의 고유 'id'를 사용하십시오. 제목을 넣지 마십시오.
   - 최적화 과정에서 기존의 연결 관계가 끊어지지 않도록 주의하고, 새로운 논리적 연결을 적극적으로 찾아 추가하십시오.
11. GCM 업데이트: 전역 컨텍스트 맵(GCM)을 업데이트할 때는 기존 엔티티와의 일관성을 유지하고, 불필요한 중복을 피하십시오.
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

export const parseMetadata = (yaml: string): Record<string, string> => {
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
    const cleaned = text.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("Failed to parse JSON response from AI:", text);
    throw new Error(`AI returned invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
};

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

export const decomposeFeature = async (
  featureRequest: string,
  currentGcm: GCM,
  existingNotes: Note[],
  githubContext?: { repoName: string; files: string[]; readme?: string },
  signal?: AbortSignal
): Promise<{ 
  newNotes: Omit<Note, 'id' | 'status'>[]; 
  updatedNotes: Note[];
  updatedGcm: GCM 
}> => {
  const step1Prompt = `
목표: 신규 기능을 설계하되, 기존에 정의된 노트들과의 중복을 피하고 유사 기능은 기존 노트를 업데이트합니다.
또한, 연결된 Github 저장소의 코드 구조를 참조하여 실제 구현 가능성을 고려합니다.

기존 노트 목록 (요약):
${JSON.stringify(existingNotes.map(n => ({ id: n.id, title: n.title, folder: n.folder, summary: n.summary })))}

${githubContext ? `연결된 Github 저장소 (${githubContext.repoName}) 파일 목록:
${JSON.stringify(githubContext.files.slice(0, 100))}

${githubContext.readme ? `README.md 내용:
${githubContext.readme.slice(0, 2000)}` : ''}` : '연결된 Github 저장소가 없습니다.'}

User Request: "${featureRequest}"

Task:
1. 기존 노트 중 재사용 가능한 '공통 부품'이 있는지 판단합니다.
2. Github 파일 목록을 참고하여, 해당 기능이 어떤 파일이나 모듈과 연관될지 추론하고 설계에 반영하십시오.
3. 유사한 노드가 있다면 해당 노드의 ID를 사용하여 업데이트 명세를 작성하고, relatedNoteIds에 포함시킵니다.
4. 완전히 새로운 구성 요소만 신규 노트로 생성합니다.
5. relatedNoteIds를 통해 마인드맵 상에서 논리적으로 연결될 모든 노드를 자동으로 찾아 연결하십시오. (반드시 ID 사용)
6. [중요] 'summary'는 반드시 해당 기능의 역할을 설명하는 1-2문장의 한국어 요약이어야 합니다. 파일 이름이나 경로 정보를 넣지 마십시오.
7. [중요] 'content'는 반드시 시스템 지침에 정의된 4개 섹션 구조를 따라야 합니다.
8. [중요] 폴더명(folder)은 반드시 "상위범주/하위범주" 형태의 경로 기반 분류를 사용하십시오. (예: "1. 시스템 인프라/데이터 보안", "2. 콘텐츠 뱅크/문제 스캔"). 'Imported'나 기술 계층 명칭은 금지합니다.
9. [중요] 독립적인 기능보다는 상위 개념에 종속된 트리 구조로 설계하십시오. 제목에서 불필요한 접두어(Main_, ㄴ. 등)를 제거하십시오.

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

  if (signal?.aborted) throw new Error("Operation cancelled");

  const mainFeature = safeJsonParse(step1Response.text);

  const step2Prompt = `
메인 기능: "${mainFeature.title}"
상세 내용: ${mainFeature.content}
신규 구성 요소: ${JSON.stringify(mainFeature.newComponents)}
재사용 노트 ID: ${JSON.stringify(mainFeature.reusedNoteIds)}

작업:
1. 신규 구성 요소들을 각각 독립적인 노트로 분해하십시오. (4개 섹션 구조 준수)
2. 재사용되는 기존 노트들에 대해, 이번 신규 기능과의 연동을 위한 업데이트 내용을 작성하십시오.
3. GCM(엔티티, 변수)을 최적화하여 업데이트하십시오.
4. 모든 노트는 "상위범주/하위범주" 폴더 형식을 유지하십시오.
5. 모든 텍스트는 한국어로 작성하십시오.

Current GCM:
${JSON.stringify(currentGcm, null, 2)}

Return JSON:
{
  "newDetailNotes": [ { title, folder, content, summary, yamlMetadata, parentNoteId, relatedNoteIds } ],
  "updatedDetailNotes": [ { id, title, folder, content, summary, yamlMetadata, parentNoteId, relatedNoteIds } ],
  "updatedGcm": { ... }
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
          updatedDetailNotes: { type: Type.ARRAY, items: { ...noteSchema, properties: { ...noteSchema.properties, id: { type: Type.STRING } }, required: ["id", ...noteSchema.required] } },
          updatedGcm: { type: Type.OBJECT, properties: { entities: { type: Type.OBJECT }, variables: { type: Type.OBJECT } } },
        },
        required: ["newDetailNotes", "updatedDetailNotes", "updatedGcm"],
      },
    },
  });

  if (signal?.aborted) throw new Error("Operation cancelled");

  const step2Result = safeJsonParse(step2Response.text);
  
  const mainNote: Omit<Note, 'id' | 'status'> = {
    title: mainFeature.title,
    folder: mainFeature.folder,
    content: mainFeature.content,
    summary: mainFeature.summary,
    yamlMetadata: mainFeature.yamlMetadata,
    relatedNoteIds: mainFeature.reusedNoteIds || [],
  };

  const sanitizedNewNotes = sanitizeNotes([mainNote, ...(step2Result.newDetailNotes || [])], existingNotes);
  const sanitizedUpdatedNotes = sanitizeNotes(step2Result.updatedDetailNotes || [], existingNotes);

  return {
    newNotes: sanitizedNewNotes,
    updatedNotes: sanitizedUpdatedNotes,
    updatedGcm: step2Result.updatedGcm || currentGcm,
  };
};

export const optimizeBlueprint = async (
  notes: Note[],
  gcm: GCM,
  signal?: AbortSignal
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
    content: n.content.slice(0, 2000),
    relatedNoteIds: n.relatedNoteIds,
    parentNoteId: n.parentNoteId
  }));

  const analysisPrompt = `
당신은 시스템 아키텍처 최적화 전문가입니다. 현재의 설계도(노트 목록 및 GCM)를 분석하여 최적화 계획을 세우십시오.

작업 목표:
1. **폴더 및 도메인 통합**: 모든 노트의 'folder' 속성을 "상위범주/하위범주" 형태(예: "1. 시스템 인프라/데이터 보안")로 재작성하여 계층화하십시오. 유사한 명칭의 폴더들은 하나의 대표 도메인 폴더로 통합하십시오.
2. **수직적 계층 구조(Hierarchy) 재구축**: 상위 개념의 노트를 찾아 그 아래로 하위 기능들을 'parentNoteId'를 사용하여 엮어 "통합"하십시오.
3. **노트 통합 원칙**: 중복되거나 유사한 내용을 담은 노트들은 하나로 통합하십시오. 통합된 노트의 'status'는 반드시 'Temporary Merge'로 설정하십시오.
4. **불필요한 기술 중심 폴더 제거**: 'Imported', 'Core', 'UI', 'Logic' 등 기술 중심 폴더를 제거하고 실제 사용자 기능 단위로 재분류하십시오.
5. **명칭 표준화**: 제목에서 'Main_', 'ㄴ.', 'ㄱ.', '1.' 등 불필요한 접두어와 숫자를 제목에서 완전히 제거하십시오.
6. **GCM 최적화**: 엔티티와 변수를 정리하고 중복을 제거하십시오.

Return JSON:
{
  "updatedNotes": [ { "id": "string", "title": "string", "folder": "string", "content": "string", "summary": "string", "yamlMetadata": "string", "parentNoteId": "string", "relatedNoteIds": ["string"], "status": "string" } ],
  "deletedNoteIds": ["string"],
  "updatedGcm": { "entities": {}, "variables": {} },
  "report": "최적화 작업 내용 요약 (Markdown)"
}
`;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: [
      { text: analysisPrompt },
      { text: `Current Notes: ${JSON.stringify(simplifiedNotes)}` },
      { text: `Current GCM: ${JSON.stringify(gcm)}` }
    ],
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
                yamlMetadata: { type: Type.STRING },
                parentNoteId: { type: Type.STRING },
                relatedNoteIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                status: { type: Type.STRING }
              },
              required: ["id", "title", "folder", "content", "summary", "yamlMetadata"]
            }
          },
          deletedNoteIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          updatedGcm: {
            type: Type.OBJECT,
            properties: {
              entities: { type: Type.OBJECT },
              variables: { type: Type.OBJECT }
            }
          },
          report: { type: Type.STRING }
        },
        required: ["updatedNotes", "deletedNoteIds", "updatedGcm", "report"]
      }
    }
  });

  if (signal?.aborted) throw new Error("Operation cancelled");

  const result = safeJsonParse(response.text || "{}");
  return {
    updatedNotes: result.updatedNotes || [],
    deletedNoteIds: result.deletedNoteIds || [],
    updatedGcm: result.updatedGcm || gcm,
    report: result.report || "최적화가 완료되었습니다."
  };
};

export const updateSingleNote = async (
  note: Note,
  command: string,
  gcm: GCM,
  allNotes: Note[],
  signal?: AbortSignal
): Promise<{ updatedNote: Note; updatedGcm: GCM; affectedNoteIds: string[] }> => {
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
  try {
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
    
    if (signal?.aborted) throw new Error("Operation cancelled");

    const result = safeJsonParse(response.text || "{}");
    return {
      updatedNote: { ...note, ...result.updatedNote },
      updatedGcm: result.updatedGcm || gcm,
      affectedNoteIds: result.affectedNoteIds || [],
    };
  } catch (err) {
    if (err?.message === "Operation cancelled" || err === "Operation cancelled") throw err;
    console.error('Update single note failed:', err);
    return {
      updatedNote: note,
      updatedGcm: gcm,
      affectedNoteIds: [],
    };
  }
};

export const updateCodeSnapshot = async (
  fileName: string,
  fileContent: string,
  existingSnapshotNotes: Note[],
  fileSha: string,
  signal?: AbortSignal
): Promise<{
  parent: {
    title: string;
    folder: string;
    content: string;
    summary: string;
    yamlMetadata: string;
    matchedNoteId?: string;
    isNew: boolean;
  };
  children: {
    title: string;
    folder: string;
    content: string;
    summary: string;
    yamlMetadata: string;
    matchedNoteId?: string;
    isNew: boolean;
  }[];
}> => {
  const prompt = `
당신은 소스 코드 분석 및 문서화 전문가입니다. 제공된 소스 코드를 분석하여 '코드 스냅샷(Code Snapshot)' 노트를 생성하거나 업데이트하십시오.
코드 스냅샷은 "실제 코드는 현재 이렇게 짜여 있어"라는 현실(Reality)을 담는 전용 보관소입니다.

[분석 대상 코드]
파일 경로: ${fileName}
파일 SHA: ${fileSha}
소스 코드:
${fileContent.slice(0, 15000)}

[기존 코드 스냅샷 노트 목록 (요약)]
${JSON.stringify(existingSnapshotNotes.map(n => ({ id: n.id, title: n.title, summary: n.summary, folder: n.folder })))}

[작업 지침]
1. **계층 구조**: 부모(파일 단위)와 자식(함수/클래스 단위)으로 나누어 분석하십시오.
2. **부모 노트 (파일 단위)**:
   - 제목: **[파일]** 한국어 제목 (예: [파일] 사용자 인증 관리)
   - 역할: 해당 파일이 담당하는 큰 임무와 책임을 설명하십시오.
   - 폴더: "Code Snapshot/해당_도메인"
   - 메타데이터: sourceFiles: [${fileName}], sourceVersion: ${fileSha}, tags: [discovered-from-github]
3. **자식 노트 (함수/로직 단위)**:
   - 제목: 실제 함수명 또는 클래스명 (예: checkPassword, getNodeName)
   - 역할: 파일 내의 구체적인 로직 하나하나를 상세히 설명하십시오.
   - 폴더: [매우 중요] 부모 노트와 **완벽하게 동일한 폴더 경로**를 사용하십시오. 절대 하위 폴더('상세' 등)를 임의로 만들지 마십시오.
   - 메타데이터: sourceFiles: [${fileName}], sourceVersion: ${fileSha}, tags: [discovered-from-github]
4. **유사도 매칭**: 각 단위에 대해 기존 '코드 스냅샷' 노트 중 내용이나 목적이 같은 노트가 있다면 기존 노트에 매칭시키십시오 ('isNew': false, 'matchedNoteId' 지정).
5. **주의**: 'relatedNoteIds'는 사용하지 마십시오. 오직 'sourceFiles'와 'sourceVersion'으로 출처를 증명합니다.

Return JSON:
{
  "parent": {
    "title": "[파일] 제목",
    "folder": "Code Snapshot/...",
    "content": "파일의 전체적인 역할 및 책임 설명",
    "summary": "파일 역할 요약",
    "yamlMetadata": "sourceFiles: [${fileName}]\\nsourceVersion: ${fileSha}\\ntags: [discovered-from-github]",
    "matchedNoteId": "기존_노트_ID",
    "isNew": boolean
  },
  "children": [
    {
      "title": "함수명",
      "folder": "Code Snapshot/...", // 부모와 똑같이!
      "content": "구체적인 로직 설명",
      "summary": "함수 역할 요약",
      "yamlMetadata": "sourceFiles: [${fileName}]\\nsourceVersion: ${fileSha}\\ntags: [discovered-from-github]",
      "matchedNoteId": "기존_노트_ID",
      "isNew": boolean
    }
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
          parent: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              folder: { type: Type.STRING },
              content: { type: Type.STRING },
              summary: { type: Type.STRING },
              yamlMetadata: { type: Type.STRING },
              matchedNoteId: { type: Type.STRING },
              isNew: { type: Type.BOOLEAN },
            },
            required: ["title", "folder", "content", "summary", "yamlMetadata", "isNew"],
          },
          children: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                folder: { type: Type.STRING },
                content: { type: Type.STRING },
                summary: { type: Type.STRING },
                yamlMetadata: { type: Type.STRING },
                matchedNoteId: { type: Type.STRING },
                isNew: { type: Type.BOOLEAN },
              },
              required: ["title", "folder", "content", "summary", "yamlMetadata", "isNew"],
            },
          },
        },
        required: ["parent", "children"],
      },
    },
  });

  if (signal?.aborted) throw new Error("Operation cancelled");

  return safeJsonParse(response.text || '{"parent": {}, "children": []}');
};

export const checkConsistency = async (
  notes: Note[],
  gcm: GCM,
  signal?: AbortSignal
): Promise<{ report: string; inconsistentNoteIds: string[] }> => {
  const prompt = `
당신은 시스템 아키텍트입니다. 현재 설계도(노트)와 실제 코드 기반의 '코드 스냅샷' 간의 일관성을 검사하십시오.
설계 의도(Design)와 실제 구현(Reality) 사이의 차이점을 찾아내어 보고서를 작성하십시오.

[설계 노트 목록]
${JSON.stringify(notes.filter(n => !n.folder.startsWith('Code Snapshot')).map(n => ({ id: n.id, title: n.title, summary: n.summary, content: n.content })))}

[코드 스냅샷 목록]
${JSON.stringify(notes.filter(n => n.folder.startsWith('Code Snapshot')).map(n => ({ id: n.id, title: n.title, summary: n.summary, content: n.content })))}

[작업 지침]
1. **차이점 분석**: 설계도에는 정의되어 있으나 코드에는 구현되지 않은 기능, 또는 코드에는 구현되어 있으나 설계도에 누락된 기능을 찾으십시오.
2. **불일치 식별**: 설계도와 구현 내용이 서로 상충되는 부분을 찾으십시오.
3. **보고서 작성**: 발견된 문제점들을 한국어로 상세히 기술하십시오.
4. **ID 추출**: 일관성이 깨진 것으로 판단되는 '설계 노트'의 ID 목록을 추출하십시오.

Return JSON:
{
  "report": "상세 분석 보고서 (Markdown)",
  "inconsistentNoteIds": ["note_id_1", "note_id_2"]
}
`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            report: { type: Type.STRING },
            inconsistentNoteIds: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            }
          },
          required: ["report", "inconsistentNoteIds"]
        }
      },
    });

    if (signal?.aborted) throw new Error("Operation cancelled");

    const result = safeJsonParse(response.text || '{"report": "분석 실패", "inconsistentNoteIds": []}');
    return {
      report: result.report || "분석 결과가 없습니다.",
      inconsistentNoteIds: result.inconsistentNoteIds || [],
    };
  } catch (err) {
    if (err?.message === "Operation cancelled" || err === "Operation cancelled") throw err;
    console.error('Check consistency failed:', err);
    return {
      report: "일관성 검사 중 오류가 발생했습니다.",
      inconsistentNoteIds: [],
    };
  }
};

export const suggestNextSteps = async (
  notes: Note[],
  gcm: GCM,
  signal?: AbortSignal
): Promise<{ suggestion: string; updatedStatuses: Record<string, Note['status']> }> => {
  const prompt = `
당신은 프로젝트 매니저입니다. 현재의 설계도와 코드 스냅샷 상태를 분석하여, 다음에 수행해야 할 가장 중요한 작업들을 제안하십시오.
또한 각 노트의 상태(status)를 현재 진행 상황에 맞게 업데이트할 것을 권장하십시오.

[노트 목록]
${JSON.stringify(notes.map(n => ({ id: n.id, title: n.title, status: n.status, folder: n.folder })))}

[작업 지침]
1. **우선순위 제안**: 미구현된 핵심 기능, 리팩토링이 필요한 부분, 또는 설계 보완이 필요한 부분을 우선순위에 따라 제안하십시오.
2. **상태 업데이트**: 작업 완료 여부에 따라 'todo', 'in-progress', 'done' 상태를 추천하십시오.
3. **한국어 작성**: 모든 제안은 한국어로 친절하게 작성하십시오.

Return JSON:
{
  "suggestion": "다음에 할 일 목록 및 조언 (Markdown)",
  "updatedStatuses": {
    "note_id_1": "done",
    "note_id_2": "in-progress"
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
        properties: {
          suggestion: { type: Type.STRING },
          updatedStatuses: { type: Type.OBJECT },
        },
        required: ["suggestion", "updatedStatuses"],
      },
    },
  });

  if (signal?.aborted) throw new Error("Operation cancelled");

  const result = safeJsonParse(response.text || '{"suggestion": "", "updatedStatuses": {}}');
  return {
    suggestion: result.suggestion || "제안할 내용이 없습니다.",
    updatedStatuses: result.updatedStatuses || {},
  };
};

export const checkConflict = async (content: string, fileContent: string, signal?: AbortSignal): Promise<{ isMatch: boolean; reason: string }> => {
  const prompt = `
당신은 코드 대조 및 통합 관리자입니다. 설계 내용(사양)과 실제 Github 소스 코드를 비교하십시오.
소스 코드가 설계를 논리적으로 구현하고 있는지 판단하십시오.
모든 설명과 이유는 반드시 한국어로 작성하십시오.

설계 내용:
${content}

Github 소스 코드:
${fileContent.slice(0, 15000)}

작업:
1. 코드가 설계와 논리적으로 일치하는지 확인합니다.
2. 일치하면 isMatch를 true로 설정합니다.
3. 일치하지 않으면(예: 기능 누락, 다른 로직) isMatch를 false로 설정하고 간략한 한국어 이유를 제공합니다.

반환 JSON: { "isMatch": boolean, "reason": "한국어 문자열" }
`;
  try {
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

    if (signal?.aborted) throw new Error("Operation cancelled");

    return safeJsonParse(response.text || '{"isMatch": false, "reason": "Failed to parse"}');
  } catch (err) {
    if (err?.message === "Operation cancelled" || err === "Operation cancelled") throw err;
    console.error('Check conflict failed:', err);
    return { isMatch: false, reason: "오류 발생: " + (err instanceof Error ? err.message : String(err)) };
  }
};

export const updateSpecFromCode = async (content: string, fileContent: string, signal?: AbortSignal): Promise<string> => {
  const prompt = `
다음 설계 내용을 제공된 소스 코드와 일치하도록 업데이트하십시오.
동일한 형식을 유지하되, 코드의 내용을 반영하여 로직과 세부 사항을 조정하십시오.
모든 텍스트는 한국어로 작성하십시오.

현재 설계 내용:
${content}

소스 코드:
${fileContent.slice(0, 15000)}
`;
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: { systemInstruction }
    });

    if (signal?.aborted) throw new Error("Operation cancelled");

    return response.text || content;
  } catch (err) {
    if (err?.message === "Operation cancelled" || err === "Operation cancelled") throw err;
    console.error('Update spec from code failed:', err);
    return content;
  }
};

export const generateFixGuide = async (content: string, fileContent: string, signal?: AbortSignal): Promise<string> => {
  const prompt = `
소스 코드가 설계 내용과 일치하지 않습니다.
소스 코드를 설계 내용에 맞게 수정하는 방법에 대한 간결한 가이드를 한국어로 제공하십시오.

설계 내용:
${content}

소스 코드:
${fileContent.slice(0, 15000)}
`;
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: { systemInstruction }
    });

    if (signal?.aborted) throw new Error("Operation cancelled");

    return response.text || "가이드가 없습니다.";
  } catch (err) {
    if (err?.message === "Operation cancelled" || err === "Operation cancelled") throw err;
    console.error('Generate fix guide failed:', err);
    return "오류 발생: " + (err instanceof Error ? err.message : String(err));
  }
};

export const generateNoteFromCode = async (
  fileName: string,
  fileContent: string,
  existingNotes: Note[],
  signal?: AbortSignal
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
5. **제목 접두어 규칙**: 파일 단위 분석이면 **[파일]**, 개별 함수/유틸리티면 **[함수]**, 복합 로직이면 **[로직]** 접두어를 제목 앞에 반드시 붙이십시오.

파일 이름: ${fileName}
소스 코드:
${fileContent.slice(0, 15000)}

기존 노트 목록 (연결용):
${JSON.stringify(existingNotes.map(n => ({ id: n.id, title: n.title, summary: n.summary })))}

작업:
1. 코드의 핵심 로직과 역할을 분석하여 제목(title)과 요약(summary)을 작성합니다. (불필요한 접두어 제거)
2. 상세 기술 명세(content)를 Markdown 형식으로 작성합니다. (한국어 필수, 줄바꿈 필수)
3. 적절한 폴더(folder)를 지정합니다. (반드시 "상위범주/하위범주" 형태 사용. 'Imported' 또는 기술 계층 명칭 사용 금지.)
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

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: noteSchema,
      },
    });

    if (signal?.aborted) throw new Error("Operation cancelled");

    const result = safeJsonParse(response.text || "{}");
    const sanitized = sanitizeNotes([result], existingNotes);
    return sanitized[0];
  } catch (err) {
    if (err?.message === "Operation cancelled" || err === "Operation cancelled") throw err;
    console.error('Generate note from code failed:', err);
    return {
      title: `[파일] ${fileName}`,
      folder: "Imported/Source",
      content: "분석 중 오류가 발생했습니다.",
      summary: "분석 중 오류가 발생했습니다.",
      yamlMetadata: `noteId: ${Math.random().toString(36).substr(2, 9)}`,
      relatedNoteIds: [],
    };
  }
};

export const mergeLogicIntoNote = async (
  logicUnit: { title: string; content: string; summary: string; yamlMetadata?: string },
  targetNote: Note,
  signal?: AbortSignal
): Promise<Note> => {
  const prompt = `
당신은 코드 통합 전문가입니다. 기존 설계 노트에 새로운 코드 분석 결과(기능 단위)를 통합하여 노트를 업데이트하십시오.
단순히 덮어쓰는 것이 아니라, 기존의 설계 의도와 새로운 코드의 실제 구현 로직을 조화롭게 합쳐서 **'수직적 깊이'**를 더하십시오.

[기존 노트]
제목: ${targetNote.title}
내용: ${targetNote.content}
메타데이터: ${targetNote.yamlMetadata || ''}

[새로운 코드 분석 결과]
제목: ${logicUnit.title}
내용: ${logicUnit.content}
요약: ${logicUnit.summary}
새 메타데이터: ${logicUnit.yamlMetadata || ''}

[작업 지침]
1. **내용 통합**: 기존 설계의 핵심 개념을 유지하면서, 코드에서 발견된 구체적인 알고리즘과 데이터 흐름을 반영하여 'Detailed Algorithm & Technical Specification' 섹션을 보강하십시오. 단순히 내용을 이어 붙이지 말고, 중복을 제거하고 논리적으로 자연스럽게 융합하십시오.
2. **충돌 처리**: 기존 설계와 실제 코드가 다를 경우, 두 방식을 비교 설명하거나 더 나은 방식을 채택하여 상세히 기술하십시오.
3. **구조 유지**: 업데이트된 'content'는 반드시 시스템 지침의 4개 섹션 구조를 엄격히 따라야 합니다.
4. **요약 업데이트**: 통합된 기능을 잘 나타내도록 'summary'를 갱신하십시오.
5. **메타데이터 병합**: 기존 메타데이터와 새 메타데이터를 병합하십시오. 특히 'sourceFiles', 'sourceVersion', 'tags', 'childNoteIds' 등의 필드는 유실되지 않도록 반드시 포함하십시오.
6. 모든 텍스트는 한국어로 작성하십시오.

Return JSON:
{
  "content": "통합된 상세 내용 (Markdown)",
  "summary": "통합된 요약 (한국어)",
  "yamlMetadata": "병합된 YAML 메타데이터"
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
          content: { type: Type.STRING },
          summary: { type: Type.STRING },
          yamlMetadata: { type: Type.STRING },
        },
        required: ["content", "summary", "yamlMetadata"],
      },
    },
  });

  if (signal?.aborted) throw new Error("Operation cancelled");

  const result = safeJsonParse(response.text || "{}");
  return {
    ...targetNote,
    content: result.content || targetNote.content,
    summary: result.summary || targetNote.summary,
    yamlMetadata: result.yamlMetadata || targetNote.yamlMetadata,
    status: 'Done',
    lastUpdated: new Date().toISOString().split('T')[0]
  };
};

export const generateSubModules = async (
  mainNote: Note,
  currentGcm: GCM,
  existingNotes: Note[],
  githubContext?: { repoName: string; files: string[]; readme?: string },
  signal?: AbortSignal
): Promise<{ 
  newNotes: Omit<Note, 'id' | 'status'>[]; 
  updatedGcm: GCM 
}> => {
  const prompt = `
용도: 메인 기능의 하위 모듈 상세 설계 (마인드맵 기반)
목표: 주어진 메인 기능 노트를 분석하여 필요한 하위 구성 요소(Sub-modules)를 상세 설계합니다.
또한, 연결된 Github 저장소의 코드 구조를 참조하여 실제 구현 가능성을 고려합니다.

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

${githubContext ? `연결된 Github 저장소 (${githubContext.repoName}) 파일 목록:
${JSON.stringify(githubContext.files.slice(0, 100))}

${githubContext.readme ? `README.md 내용:
${githubContext.readme.slice(0, 2000)}` : ''}` : '연결된 Github 저장소가 없습니다.'}

Task:
1. 메인 기능을 구현하기 위해 필요한 하위 모듈(UI 컴포넌트, API, 데이터 모델 등)을 식별합니다.
2. Github 파일 목록을 참고하여, 해당 기능이 어떤 파일이나 모듈과 연관될지 추론하고 설계에 반영하십시오.
3. 기존 노트 중 재사용 가능한 공통 부품이 있다면 relatedNoteIds에 포함시키고, 새로운 논리 노드만 생성합니다. (반드시 ID 사용)
4. parentNoteId를 "${mainNote.id}"로 설정하고, 상호 연관된 노드끼리 relatedNoteIds를 설정하십시오. (반드시 ID 사용)
5. Metadata는 다음 형식을 따릅니다: version, lastUpdated(2026-03-15), tags.
6. [중요] 'Imported' 또는 기술 계층 폴더 사용을 금지하고, 도메인/기능 중심의 적절한 카테고리를 사용하십시오. 제목에서 불필요한 접두어를 제거하십시오.

Return JSON:
{
  "newNotes": [
    {
      "title": "한국어 하위 모듈 제목",
      "folder": "상위범주/하위범주 형태의 폴더",
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
    }
  });

  if (signal?.aborted) throw new Error("Operation cancelled");

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

export const validateYamlMetadata = (content: string): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
  
  if (!yamlMatch) {
    return { isValid: true, errors: [] };
  }

  const yamlStr = yamlMatch[1];
  const lines = yamlStr.split('\n');
  
  lines.forEach((line, index) => {
    if (line.trim() && !line.includes(':')) {
      errors.push(`Line ${index + 1}: 올바른 YAML 형식이 아닙니다 (키: 값 형식이 필요함)`);
    }
  });

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
  userGoal: string,
  signal?: AbortSignal
): Promise<{ features: { id: number; title: string; description: string; relatedFiles: string[] }[] }> => {
  const prompt = `
당신은 오픈소스 분석 전문가입니다. 외부 Github 레포지토리의 구조와 README를 분석하여, 시스템의 전체 모듈 구조와 모든 독립적인 기능 단위를 식별하십시오.

레포지토리: ${repoName}
사용자 목표: "${userGoal}"
README 일부:
${readmeContent.slice(0, 5000)}

파일 트리 (일부):
${JSON.stringify(fileTree.slice(0, 500))}

작업:
1. 레포지토리의 전체 파일 구조와 로직을 샅샅이 분석하여, 모든 독립적인 기능 단위와 모듈을 식별하십시오.
2. 개수 제한 없이 시스템을 구성하는 모든 세부 요소를 리스트업하십시오.
3. 각 기능에 대해 명확한 제목, 설명, 그리고 해당 기능을 구현하는 핵심 파일 경로 목록을 포함하십시오.
4. 모든 설명은 한국어로 작성하십시오.

Return JSON:
{
  "features": [
    { "id": 1, "title": "기능 제목", "description": "기능 설명", "relatedFiles": ["path/to/file1.ts", "path/to/file2.ts"] }
  ]
}
`;

  try {
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

    if (signal?.aborted) throw new Error("Operation cancelled");

    return safeJsonParse(response.text || '{"features": []}');
  } catch (err) {
    if (err?.message === "Operation cancelled" || err === "Operation cancelled") throw err;
    console.error('Summarize repo features failed:', err);
    return { features: [] };
  }
};

export const transpileExternalLogic = async (
  featureTitles: string[],
  externalCodes: { path: string; content: string }[],
  currentGcm: GCM,
  existingNotes: Note[],
  signal?: AbortSignal
): Promise<{ 
  newNotes: Omit<Note, 'id' | 'status'>[]; 
  updatedGcm: GCM 
}> => {
  const prompt = `
  당신은 '대화형 선별 이식(Interactive Selective Transfer)' 전문가입니다. 
  외부 프로젝트의 핵심 로직을 분석하여, 우리 프로젝트의 도메인 언어와 변수 체계(GCM)에 맞게 재구성한 설계도를 생성하십시오.
  
  대상 기능들: ${featureTitles.join(', ')}
  외부 소스 코드:
  ${externalCodes.map(c => `File: ${c.path}\nContent:\n${c.content.slice(0, 5000)}`).join('\n---\n')}
  
  우리 프로젝트 GCM:
  ${JSON.stringify(currentGcm)}
  
  기존 노트 목록 (참고용):
  ${JSON.stringify(existingNotes.map(n => ({ id: n.id, title: n.title, folder: n.folder })))}
  
  작업 지침:
  1. **변수 정문화 이식**: 외부 코드의 알고리즘 뼈대는 유지하되, 모든 변수명, 클래스명, 함수명은 우리 프로젝트의 GCM 및 도메인 구조에 맞춰 치환하십시오.
  2. **도메인 중심 분류**: 우리 프로젝트의 도메인 폴더 구조에 맞게 노트를 생성하십시오.
  3. **상세 설계**: 'content'는 시스템 지침의 4개 섹션 구조를 따라야 하며, 알고리즘을 우리 프로젝트의 문맥으로 상세히 설명하십시오.
  4. **연결성**: 기존 노트들과 논리적으로 연결될 수 있도록 relatedNoteIds를 설정하십시오. (반드시 ID 사용)
  
  Return JSON:
  {
    "newNotes": [ array of notes matching the schema ],
    "updatedGcm": { "entities": {...}, "variables": {...} }
  }
  `;

  try {
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

    if (signal?.aborted) throw new Error("Operation cancelled");

    const result = safeJsonParse(response.text || "{}");
    const sanitized = sanitizeNotes(result.newNotes || [], existingNotes);

    return {
      newNotes: sanitized,
      updatedGcm: result.updatedGcm || currentGcm,
    };
  } catch (err) {
    if (err?.message === "Operation cancelled" || err === "Operation cancelled") throw err;
    console.error('Transpilation failed:', err);
    return {
      newNotes: [],
      updatedGcm: currentGcm,
    };
  }
};

export const translateQueryForGithub = async (query: string, signal?: AbortSignal): Promise<{ queries: string[], suggestedRepos: string[] }> => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `사용자의 다음 요구사항을 만족하는 Github 레포지토리를 찾기 위한 최적의 검색 전략을 생성하십시오.
      
      요구사항: "${query}"
      
      가이드라인:
      1. googleSearch 도구를 사용하여 해당 기능을 구현한 유명한 오픈소스 프로젝트들을 찾으십시오.
      2. 검색에 사용할 최적화된 쿼리들을 생성하십시오 (가장 구체적인 것부터 범용적인 것까지).
      3. 직접적으로 연관된 유명 레포지토리의 'owner/repo' 형식을 알고 있다면 제안하십시오.
      
      출력 형식 (JSON):
      {
        "queries": ["query1", "query2"],
        "suggestedRepos": ["owner/repo1", "owner/repo2"]
      }
      
      반드시 위의 JSON 형식으로만 응답하십시오. 마크다운 백틱(\`\`\`json)이나 다른 설명은 포함하지 마십시오.`,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });
    if (signal?.aborted) throw new Error("Operation cancelled");
    return safeJsonParse(response.text || "{\"queries\":[], \"suggestedRepos\":[]}");
  } catch (err) {
    if (err?.message === "Operation cancelled" || err === "Operation cancelled") throw err;
    console.error('Translation failed:', err);
    return { queries: [], suggestedRepos: [] };
  }
};

export const refineSearchGoal = async (query: string, signal?: AbortSignal): Promise<string[]> => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `사용자가 입력한 키워드를 바탕으로, Github에서 검색하기에 적합한 '기능 중심의 설명' 3가지를 생성하십시오. 
      전문 용어나 라이브러리 이름보다는 사용자가 체감할 수 있는 '기능적 가치'와 '사용자 경험' 위주로 작성하십시오.
      
      입력 키워드: "${query}"
      
      출력 형식 (JSON Array):
      ["설명1", "설명2", "설명3"]`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: { type: Type.STRING }
        }
      }
    });
    if (signal?.aborted) throw new Error("Operation cancelled");
    return safeJsonParse(response.text || "[]");
  } catch (err) {
    if (err?.message === "Operation cancelled" || err === "Operation cancelled") throw err;
    console.error('Refining goals failed:', err);
    return [];
  }
};

export const summarizeReposShort = async (
  repos: { full_name: string; description: string }[],
  userGoal: string,
  signal?: AbortSignal
): Promise<{ summaries: Record<string, { nickname: string; summary: string; features: string }> }> => {
  const prompt = `
  사용자의 목표: "${userGoal}"
  
  다음 Github 레포지토리들의 목록을 보고, 각 레포지토리가 사용자의 목표를 어떻게 달성할 수 있는지 분석하십시오.
  각 레포지토리에 대해 다음 3가지를 작성하십시오:
  1. nickname: 해당 레포지토리의 핵심 가치를 나타내는 짧은 별명 (예: 필기 최적화의 정석)
  2. summary: 1문장 요약
  3. features: 주요 특징 및 참고할 점 (1~2문장)
  
  레포지토리 목록:
  ${JSON.stringify(repos)}
  
  출력 형식 (JSON):
  {
    "summaries": [
      {
        "repoName": "repo_full_name",
        "nickname": "...",
        "summary": "...",
        "features": "..."
      }
    ]
  }
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summaries: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  repoName: { type: Type.STRING },
                  nickname: { type: Type.STRING },
                  summary: { type: Type.STRING },
                  features: { type: Type.STRING }
                },
                required: ["repoName", "nickname", "summary", "features"]
              }
            }
          },
          required: ["summaries"]
        }
      }
    });

    if (signal?.aborted) throw new Error("Operation cancelled");

    const parsed = safeJsonParse(response.text || '{"summaries": []}');
    const summariesMap: Record<string, { nickname: string; summary: string; features: string }> = {};
    
    if (parsed && Array.isArray(parsed.summaries)) {
      parsed.summaries.forEach((item: any) => {
        if (item.repoName) {
          summariesMap[item.repoName] = {
            nickname: item.nickname || '',
            summary: item.summary || '',
            features: item.features || ''
          };
        }
      });
    }

    return { summaries: summariesMap };
  } catch (err) {
    if (err?.message === "Operation cancelled" || err === "Operation cancelled") throw err;
    console.error('Summarize repos failed:', err);
    return { summaries: {} };
  }
};
