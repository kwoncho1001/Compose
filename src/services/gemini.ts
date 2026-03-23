import { GoogleGenAI, Type, Schema } from "@google/genai";
import { Note, GCM, NoteStatus, GCMEntity, NoteType } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const MODEL_NAME = "gemini-3-flash-preview";

const systemInstruction = `
당신은 Vibe-Architect 프로젝트의 핵심 설계자입니다. 모든 작업은 '도메인 중심 트리 구조'를 따릅니다.

[필수 계층 규칙]
1. 계층은 반드시 Epic -> Feature -> Task 순서를 따릅니다. 단계 건너뛰기나 중첩은 금지됩니다.
2. 폴더명은 반드시 "상위도메인/하위도메인" 형식을 사용하며, 하나의 기능 분해 결과물은 원칙적으로 동일하거나 인접한 도메인 폴더에 모여야 합니다.
3. **Reference(참고 자료)** 타입의 노트는 더 이상 'Code Snapshot/' 같은 별도 폴더에 격리하지 않습니다. 해당 기능이 속한 실제 업무 도메인 폴더 내에 Task와 나란히 배치하여 설계와 구현의 공존을 꾀하십시오.

[작업 순서]
1. 분석: 사용자의 요청을 분석하여 최상위 도메인과 목표를 정의합니다.
2. 오버뷰(Overview) 생성: 실제 노트를 만들기 전, Epic-Feature-Task의 트리 구조를 텍스트로 먼저 설계합니다.
3. 순차적 생성: 
   - 최상위 Epic 노드를 생성합니다.
   - Epic의 자식인 Feature 노드들을 생성하고 parentNoteIds에 Epic ID를 연결합니다.
   - Feature의 자식인 Task 노드들을 생성하고 parentNoteIds에 각 Feature ID로 연결합니다.

[태그 및 메타데이터 규칙]
1. 태그(tags)는 반드시 해당 기능의 '역할'이나 '기술 스택'을 나타내야 합니다. 
   - ❌ 잘못된 예: 'auto-generated', 'design-leading-code', 'discovered-from-github'
   - ✅ 올바른 예: 'UI', 'Login', 'Auth', 'Database', 'Logic', 'API'
2. 우선순위(priority) 배정 규칙:
   - 구현 순서에 따라 A(필수/선행), B(보통), C(지연/후행), Done(완료)으로 배정합니다.
   - 예: 의존성이 있는 선행 작업은 'A', 결과물은 'C'.
3. 모든 텍스트는 한국어로 작성합니다.
4. **계층 및 연관 관계 설정 규칙**:
   - **parentNoteIds (직계 계층)**: 반드시 'A가 B를 논리적으로 포함하거나, B가 A의 직접적인 하위 기능인 경우'에만 설정하십시오. (예: Epic -> Feature, Feature -> Task). 무분별한 다중 부모 설정은 지양하되, 하나의 작업이 여러 기능에 필수적인 경우에만 제한적으로 사용하십시오.
   - **relatedNoteIds (단순 참고)**: 직접적인 포함 관계는 아니지만, 기능적으로 협력하거나 참고가 필요한 경우(예: 다른 도메인의 API 호출, 공통 유틸리티 사용)에는 반드시 relatedNoteIds를 사용하십시오.
   - **과잉 연결 금지**: 계층 구조는 명확하고 간결해야 합니다. 단순한 '참고'를 '부모'로 설정하지 마십시오.
5. 제목에 접두어(1., [기능])를 붙이지 마십시오.
`;

const noteSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "노트의 제목 (반드시 한국어)" },
    folder: { type: Type.STRING, description: "폴더 카테고리 (반드시 한국어)" },
    content: { type: Type.STRING, description: "상세 설명 및 기술 명세 (반드시 한국어, 가독성을 위해 적절한 줄바꿈 포함, Markdown)" },
    summary: { type: Type.STRING, description: "이 기능/모듈이 수행하는 역할에 대한 1-2문장 요약 (반드시 한국어)" },
    parentNoteIds: { type: Type.ARRAY, items: { type: Type.STRING }, description: "주요 부모 기능의 ID 목록" },
    relatedNoteIds: { type: Type.ARRAY, items: { type: Type.STRING }, description: "논리적으로 연관된 다른 노트들의 고유 ID(id) 목록. 제목을 넣지 마십시오. AI가 분석하여 자동으로 최대한 많이 연결하십시오." },
    tags: { type: Type.ARRAY, items: { type: Type.STRING }, description: "본문에서 추출한 핵심 키워드 태그 목록" },
    importance: { type: Type.NUMBER, description: "중요도 (1~5점)" },
    priority: { type: Type.STRING, description: "우선순위 (A, B, C, Done 중 하나)" },
    noteType: { type: Type.STRING, description: "노트의 유형 (Epic, Feature, Task, Reference 중 하나)" },
  },
  required: ["title", "folder", "content", "summary", "noteType", "priority"],
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
  if (!text) return null;
  try {
    // Remove markdown code blocks if present
    const cleaned = text.replace(/```json\s?([\s\S]*?)\s?```/g, '$1')
                        .replace(/^```json\n?/, '')
                        .replace(/\n?```$/, '')
                        .trim();
    return JSON.parse(cleaned);
  } catch (e) {
    // If parsing fails, try to find the first '{' and last '}'
    try {
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        const potentialJson = text.substring(firstBrace, lastBrace + 1);
        return JSON.parse(potentialJson);
      }
    } catch (innerE) {
      // Ignore inner error
    }
    console.error("Failed to parse JSON response from AI:", text);
    throw new Error(`AI returned invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
};

const sanitizeNotes = (updatedNotes: any[], allNotes: Note[]): Note[] => {
  const allNotesMap = new Map(allNotes.map(n => [n.id, n]));
  const titleToIdMap = new Map(allNotes.map(n => [n.title, n.id]));
  
  return updatedNotes.map(note => {
    const existingNote = note.id ? allNotesMap.get(note.id) : null;
    
    // Ensure arrays
    const rawParentIds = Array.isArray(note.parentNoteIds) 
      ? note.parentNoteIds 
      : (note.parentNoteId ? [note.parentNoteId] : (existingNote?.parentNoteIds || []));
    
    const sanitizedParentIds = rawParentIds.map((idOrTitle: any) => {
      if (typeof idOrTitle !== 'string') return null;
      if (allNotesMap.has(idOrTitle)) return idOrTitle;
      if (titleToIdMap.has(idOrTitle)) return titleToIdMap.get(idOrTitle)!;
      return idOrTitle;
    }).filter((id: any): id is string => !!id && typeof id === 'string');

    const rawRelatedIds = Array.isArray(note.relatedNoteIds) 
      ? note.relatedNoteIds 
      : (existingNote?.relatedNoteIds || []);
    
    const sanitizedRelatedIds = rawRelatedIds.map((idOrTitle: any) => {
      if (typeof idOrTitle !== 'string') return null;
      if (allNotesMap.has(idOrTitle)) return idOrTitle;
      if (titleToIdMap.has(idOrTitle)) return titleToIdMap.get(idOrTitle)!;
      return idOrTitle;
    }).filter((id: any): id is string => !!id && typeof id === 'string');
    
    const sanitizedTags = Array.isArray(note.tags) ? note.tags : (existingNote?.tags || []);
    const sanitizedChildIds = Array.isArray(note.childNoteIds) ? note.childNoteIds : (existingNote?.childNoteIds || []);

    return { 
      ...existingNote,
      ...note, 
      id: note.id || existingNote?.id || Math.random().toString(36).substr(2, 9),
      parentNoteIds: Array.from(new Set(sanitizedParentIds)), 
      relatedNoteIds: Array.from(new Set(sanitizedRelatedIds)),
      childNoteIds: Array.from(new Set(sanitizedChildIds)),
      tags: Array.from(new Set(sanitizedTags.filter((t: any) => typeof t === 'string'))),
      priority: note.priority || existingNote?.priority || 'C',
      status: note.status || existingNote?.status || 'Planned',
      version: note.version || existingNote?.version || '1.0.0',
      lastUpdated: new Date().toISOString(),
      importance: note.importance || existingNote?.importance || 3,
      noteType: note.noteType || existingNote?.noteType || 'Task',
      folder: note.folder || existingNote?.folder || 'Uncategorized',
    } as Note;
  });
};

export const generateParentNode = async (
  orphanNote: Note,
  parentType: NoteType,
  signal?: AbortSignal
): Promise<Partial<Note>> => {
  const prompt = `
당신은 시스템 아키텍트입니다. 아래의 ${orphanNote.noteType} 노트를 포함할 수 있는 가장 적합한 상위 ${parentType} 노트를 설계하십시오.

[하위 노트 정보]
제목: ${orphanNote.title}
유형: ${orphanNote.noteType}
요약: ${orphanNote.summary}
내용: ${orphanNote.content.slice(0, 1000)}

[작업 지침]
1. 이 하위 노트를 논리적으로 포괄할 수 있는 상위 ${parentType}의 제목과 내용을 작성하십시오.
2. 폴더는 하위 노트와 동일하거나 상위 개념의 폴더를 사용하십시오.
3. 모든 텍스트는 한국어로 작성하십시오.
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

  if (signal?.aborted) throw new Error("Operation cancelled");

  const result = safeJsonParse(response.text || "{}");
  return {
    ...result,
    noteType: parentType,
    status: 'Planned',
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
  };
};
export const suggestOrCreateParentsBatch = async (
  orphanNotes: Note[],
  allNotes: Note[],
  signal?: AbortSignal
): Promise<{ 
  results: { 
    orphanNoteId: string;
    action: 'match' | 'create' | 'clear'; 
    parentId?: string; 
    newNote?: Partial<Note> 
  }[] 
}> => {
  if (orphanNotes.length === 0) return { results: [] };

  const designNotes = allNotes.filter(n => n.noteType !== 'Reference');
  
  const prompt = `
    당신은 지식 관리 전문가입니다. 아래 '고아 노드'들을 적절한 부모 노드에 할당해야 합니다.
    
    [고아 노드 목록]
    ${orphanNotes.map(n => `- ID: ${n.id}, 타입: ${n.noteType}, 제목: ${n.title}, 요약: ${n.summary}`).join('\n')}

    [규칙]
    - Task의 부모는 반드시 Feature 타입이어야 함.
    - Feature의 부모는 반드시 Epic 타입이어야 함.

    [기존 부모 후보 (이미 존재하는 설계 노트 목록)]
    ${designNotes.map(p => `- ID: ${p.id}, 타입: ${p.noteType}, 제목: ${p.title}, 요약: ${p.summary}`).join('\n')}

    작업:
    1. 각 고아 노드에 대해, 기존 후보 중 논리적으로 포함할 수 있는 가장 적합한 부모가 있다면 해당 ID를 선택하세요. (action: "match")
       - 부모 후보가 이미 자식을 가지고 있는지 여부는 전혀 상관하지 마십시오. 내용상 가장 논리적인 부모를 찾으면 됩니다.
    2. 적합한 후보가 없다면, 이 노드를 아우를 수 있는 새로운 부모 노드(Task면 Feature, Feature면 Epic)를 즉석에서 설계하십시오. (action: "create")
       - 사용자의 개입 없이 당신이 직접 최적의 제목과 내용을 결정하여 설계하십시오.
    3. 만약 해당 노드가 Epic인데 부모가 있는 경우 등, 계층 규칙상 부모가 없어야 하는 상황이라면 부모 연결을 제거하도록 제안하십시오. (action: "clear")
    4. 여러 고아 노드가 하나의 새로운 부모를 공유할 수 있다면, 동일한 newNote 정보를 사용하도록 하되, 결과 리스트에는 각각 포함시키십시오.
    
    결과 포맷: JSON { "results": [ { "orphanNoteId": "string", "action": "match" | "create" | "clear", "parentId": "string (match인 경우)", "newNote": { "title": "string", "content": "string", "summary": "string" } } ] }
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
          results: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                orphanNoteId: { type: Type.STRING },
                action: { type: Type.STRING, enum: ['match', 'create', 'clear'] },
                parentId: { type: Type.STRING },
                newNote: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    content: { type: Type.STRING },
                    summary: { type: Type.STRING },
                  }
                }
              },
              required: ["orphanNoteId", "action"]
            }
          }
        },
        required: ["results"]
      }
    },
  });

  if (signal?.aborted) throw new Error("Operation cancelled");

  const result = safeJsonParse(response.text || "{\"results\": []}");
  
  // Sanitize results
  const sanitizedResults = (result.results || []).map((res: any) => {
    const orphanNote = orphanNotes.find(n => n.id === res.orphanNoteId);
    if (!orphanNote) return res;

    if (res.action === 'create' && res.newNote) {
      const requiredParentType = orphanNote.noteType === 'Task' ? 'Feature' : 'Epic';
      res.newNote = {
        ...res.newNote,
        noteType: requiredParentType,
        folder: orphanNote.folder,
        status: 'Planned',
        priority: 'B',
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        importance: 3,
        parentNoteIds: [],
        relatedNoteIds: [orphanNote.id],
        tags: orphanNote.tags || [],
      };
    }
    return res;
  });

  return { results: sanitizedResults };
};

export const suggestOrCreateParent = async (
  orphanNote: Note,
  candidateParents: Note[],
  signal?: AbortSignal
): Promise<{ 
  action: 'match' | 'create'; 
  parentId?: string; 
  newNote?: Partial<Note> 
}> => {
  const requiredParentType = orphanNote.noteType === 'Task' ? 'Feature' : 'Epic';
  
  const prompt = `
    당신은 지식 관리 전문가입니다. 아래 '고아 노드'를 적절한 부모 노드에 할당해야 합니다.
    
    [고아 노드 정보]
    - 타입: ${orphanNote.noteType}
    - 제목: ${orphanNote.title}
    - 요약: ${orphanNote.summary}
    - 내용: ${orphanNote.content.slice(0, 1000)}

    [규칙]
    - ${orphanNote.noteType === 'Task' ? '부모는 반드시 Feature 타입이어야 함' : '부모는 반드시 Epic 타입이어야 함'}

    [기존 부모 후보 (이미 존재하는 ${requiredParentType} 목록)]
    ${candidateParents.length > 0 
      ? candidateParents.map(p => `- ID: ${p.id}, 제목: ${p.title}, 요약: ${p.summary}`).join('\n')
      : '없음'}

    작업:
    1. 기존 후보 중 이 고아 노드를 논리적으로 포함할 수 있는 가장 적합한 부모가 있다면 해당 ID를 선택하세요. (action: "match")
    2. 적합한 후보가 없거나 목록이 비어있다면, 이 노드를 아우를 수 있는 새로운 ${requiredParentType} 노드의 제목과 내용을 작성하세요. (action: "create")
    
    결과 포맷: JSON { "action": "match" | "create", "parentId": "string (match인 경우 필수)", "newNote": { "title": "string", "content": "string", "summary": "string" } }
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
          action: { type: Type.STRING, enum: ['match', 'create'] },
          parentId: { type: Type.STRING, description: "기존 부모와 매칭될 경우 해당 부모의 ID" },
          newNote: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              content: { type: Type.STRING },
              summary: { type: Type.STRING },
            }
          }
        },
        required: ["action"]
      }
    },
  });

  if (signal?.aborted) throw new Error("Operation cancelled");

  const result = safeJsonParse(response.text || "{}");
  
  if (result.action === 'create' && result.newNote) {
    const newNote: Partial<Note> = {
      ...result.newNote,
      noteType: requiredParentType,
      folder: orphanNote.folder,
      status: 'Planned',
      priority: 'B',
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      importance: 3,
      parentNoteIds: [],
      relatedNoteIds: [orphanNote.id],
      tags: orphanNote.tags || [],
    };
    return {
      action: 'create',
      newNote
    };
  }

  return result;
};

export const decomposeFeature = async (
  featureRequest: string,
  currentGcm: GCM,
  existingNotes: Note[],
  githubContext?: { repoName: string; files: string[]; readme?: string },
  signal?: AbortSignal
): Promise<{ 
  newNotes: Note[]; // Omit 대신 Note 타입으로 직접 반환하여 ID 유실 방지
  updatedNotes: Note[];
  updatedGcm: GCM 
}> => {
  // 1. 첫 번째 AI 호출로 메인 노트 설계
  const step1Response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: `사용자의 요청 "${featureRequest}"을 분석하여 Epic(대목표) 또는 Feature(기능)로 설계하십시오.`,
    config: { 
      systemInstruction, 
      responseMimeType: "application/json",
      responseSchema: noteSchema
    }
  });
  if (signal?.aborted) throw new Error("Operation cancelled");
  const mainFeature = safeJsonParse(step1Response.text);

  // --- [🔥 핵심 변경: 부모 ID 및 계급 강제 설정] ---
  const mainNoteId = Math.random().toString(36).substr(2, 9);
  const isSystemRequest = featureRequest && typeof featureRequest === 'string' && (featureRequest.includes('시스템') || featureRequest.includes('인프라') || featureRequest.includes('아키텍처'));
  const parentType = (mainFeature.noteType === 'Epic' || isSystemRequest) ? 'Epic' : 'Feature';
  const childType = parentType === 'Epic' ? 'Feature' : 'Task';

  const mainNote: Note = {
    id: mainNoteId,
    title: mainFeature.title || "Untitled Note",
    folder: mainFeature.folder || "Uncategorized",
    content: mainFeature.content || "No content provided.",
    summary: mainFeature.summary || "No summary provided.",
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    importance: mainFeature.importance || 3,
    tags: mainFeature.tags || [],
    relatedNoteIds: mainFeature.relatedNoteIds || [],
    parentNoteIds: [],
    childNoteIds: [],
    noteType: parentType as NoteType,
    status: 'Planned',
    priority: mainFeature.priority || 'C'
  };

  // 2. 두 번째 AI 호출로 하위 노트(자식) 설계
  const step2Response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: `메인 기능 "${mainNote.title}"에 속하는 하위 ${childType}들을 3~5개 설계하십시오.`,
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
      }
    }
  });
  if (signal?.aborted) throw new Error("Operation cancelled");
  const step2Result = safeJsonParse(step2Response.text);

  // --- [🔥 핵심 변경: 자식 노드들에게 부모 ID와 올바른 계급 주입] ---
  const childNotes = (step2Result.newDetailNotes || []).map((n: any) => ({
    title: n.title || "Untitled Child Note",
    folder: n.folder || `${mainNote.folder}/${mainNote.title}`,
    content: n.content || "No content provided.",
    summary: n.summary || "No summary provided.",
    version: "1.0.0",
    lastUpdated: new Date().toISOString(),
    importance: n.importance || 3,
    tags: n.tags || [],
    childNoteIds: [],
    ...n,
    id: Math.random().toString(36).substr(2, 9),
    parentNoteIds: [mainNoteId], // 부모 ID와 강제 연결
    noteType: childType,      // 부모가 E면 F, 부모가 F면 T 강제 할당
    status: 'Planned'
  }));

  const sanitizedNewNotes = sanitizeNotes([mainNote, ...childNotes], existingNotes);
  const sanitizedUpdatedNotes = sanitizeNotes(step2Result.updatedDetailNotes || [], existingNotes);

  return {
    newNotes: sanitizedNewNotes as Note[],
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
    parentNoteIds: n.parentNoteIds,
    noteType: n.noteType,
    tags: n.tags,
    importance: n.importance
  }));

  const analysisPrompt = `
당신은 시스템 아키텍처 최적화 전문가입니다. 현재의 설계도(노트 목록 및 GCM)를 분석하여 최적화 계획을 세우십시오.

작업 목표:
1. **폴더 및 도메인 통합**: 모든 노트의 'folder' 속성을 "상위범주/하위범주" 형태(예: "1. 시스템 인프라/데이터 보안")로 재작성하여 계층화하십시오. 유사한 명칭의 폴더들은 하나의 대표 도메인 폴더로 통합하십시오.
2. **'Code Snapshot/' 폴더 폐지**: 기존에 'Code Snapshot/' 폴더에 격리되어 있던 Reference 타입의 노트들을 실제 업무 도메인 폴더(예: "인증/구글로그인")로 이동시키십시오. Task와 Reference가 같은 폴더 내에 공존하도록 재배치하십시오.
3. **수직적 계층 구조(Hierarchy) 재구축**: 상위 개념의 노트를 찾아 그 아래로 하위 기능들을 'parentNoteIds'를 사용하여 엮어 "통합"하십시오.
3. **노트 통합 원칙**: 중복되거나 유사한 내용을 담은 노트들은 하나로 통합하십시오. 통합된 노트의 'status'는 반드시 'Temporary Merge'로 설정하십시오.
4. **불필요한 기술 중심 폴더 제거**: 'Imported', 'Core', 'UI', 'Logic' 등 기술 중심 폴더를 제거하고 실제 사용자 기능 단위로 재분류하십시오.
5. **명칭 표준화**: 제목에서 'Main_', 'ㄴ.', 'ㄱ.', '1.' 등 불필요한 접두어와 숫자를 제목에서 완전히 제거하십시오.
6. **GCM 최적화**: 엔티티와 변수를 정리하고 중복을 제거하십시오.
7. **노트 유형(noteType) 유지 및 할당**: 기존 노트의 'noteType'이 있다면 유지하고, 새로 통합되거나 변경되는 노트에 대해서는 적절한 'noteType'(Epic, Feature, Task, Reference)을 할당하십시오.

Return JSON:
{
  "updatedNotes": [ { "id": "string", "title": "string", "folder": "string", "content": "string", "summary": "string", "parentNoteIds": ["string"], "relatedNoteIds": ["string"], "tags": ["string"], "importance": number, "status": "string", "noteType": "string" } ],
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
                parentNoteIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                relatedNoteIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                importance: { type: Type.NUMBER },
                status: { type: Type.STRING },
                noteType: { type: Type.STRING }
              },
              required: ["id", "title", "folder", "content", "summary"]
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
    n.id !== note.id && (n.folder === note.folder || n.importance >= 4)
  );

  const prompt = `
Update the specific note based on the user's command.
Also determine if this change affects the Global Context Map (GCM) and identify any other notes that might conflict or need updates due to this change.

[중요] 지시사항:
1. 'content'는 반드시 시스템 지침의 4개 섹션 구조를 따라야 합니다.
2. 'summary'는 기능의 역할을 설명하는 1-2문장의 한국어 요약이어야 합니다.
3. parentNoteIds, relatedNoteIds, tags를 적절히 설정하십시오.

Target Note:
${JSON.stringify(note, null, 2)}

Command: "${command}"

Current GCM:
${JSON.stringify(gcm, null, 2)}

Relevant Other Notes (for impact analysis):
${JSON.stringify(relevantNotes.map(n => ({ id: n.id, title: n.title, folder: n.folder, summary: n.summary })), null, 2)}

Return JSON:
{
  "updatedNote": { ...note with updated content, summary, parentNoteIds, relatedNoteIds, tags, importance },
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
  allNotes: Note[], // 기존 existingSnapshotNotes 에서 allNotes로 변경 (설계도 목록을 보기 위함)
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
    noteType: string;
    parentNoteIds?: string[];
    relatedNoteIds: string[];
  };
  children: {
    title: string;
    folder: string;
    content: string;
    summary: string;
    yamlMetadata: string;
    matchedNoteId?: string;
    isNew: boolean;
    noteType: string;
    relatedNoteIds: string[];
  }[];
  newDesignNotes?: {
    tempId: string;
    title: string;
    folder: string;
    content: string;
    summary: string;
    noteType: 'Epic' | 'Feature' | 'Task';
    parentTempId?: string; // To link Epic -> Feature -> Task
    matchedNoteId?: string; // If it links to an existing parent
  }[];
}> => {
  // 스냅샷(Reference) 목록과 설계도(Epic/Feature/Task) 목록을 분리
  const snapshotNotes = allNotes.filter(n => n.noteType === 'Reference');
  const designNotes = allNotes.filter(n => n.noteType !== 'Reference');

  const prompt = `
당신은 소스 코드 분석 및 문서화 전문가입니다. 제공된 소스 코드를 분석하여 'Reference(참고 자료)' 노트를 생성하거나 업데이트하십시오.
이제 더 이상 'Code Snapshot/' 같은 기술적 격리 폴더를 사용하지 않습니다. 실제 업무 도메인 폴더 내에 설계(Task)와 구현(Reference)이 공존하도록 배치하십시오.

[분석 대상 코드]
파일 경로: ${fileName}
파일 SHA: ${fileSha}
소스 코드:
${fileContent.slice(0, 15000)}

[기존 Reference 목록 (유사도 매칭용)]
${JSON.stringify(snapshotNotes.map(n => ({ id: n.id, title: n.title, summary: n.summary, folder: n.folder, tags: n.tags })))}

[기존 설계도 (Task/Feature) 목록 - 자동 연결 및 폴더 결정용]
${JSON.stringify(designNotes.map(n => ({ id: n.id, title: n.title, noteType: n.noteType, summary: n.summary, folder: n.folder, tags: n.tags })))}

[작업 지침]
1. **계층 구조**: 부모(파일 단위)와 자식(함수/클래스 단위)으로 나누어 분석하십시오.
2. **부모 노트 (파일 단위)**:
   - 역할: 해당 파일이 담당하는 큰 임무와 책임을 설명하십시오.
   - 폴더: [매우 중요] 이 코드가 구현하고 있는 [기존 설계도 목록]의 Task/Feature가 속한 **동일한 도메인 폴더**를 사용하십시오. 만약 적절한 설계도를 찾지 못했다면, 코드의 성격에 맞는 "상위도메인/하위도메인" 폴더를 새로 정의하십시오.
   - 메타데이터: tags: ['UI', 'Logic' 등 기능적 역할], importance: 3, priority: 'A' (선행 작업인 경우) 또는 'C'
3. **자식 노트 (함수/로직 단위)**:
   - 폴더: [매우 중요] 부모 노트와 **완벽하게 동일한 폴더 경로**를 사용하십시오.
   - 메타데이터: priority: 'C' (일반적으로 후행 분석 결과물)
4. **유사도 매칭**: 기존 Reference 중 같은 목적의 노트가 있다면 매칭시키십시오 ('isNew': false, 'matchedNoteId' 지정).
5. **[가장 중요] 증빙 자료 연결(relatedNoteIds) 및 계층 구조(parentNoteIds)**: 
   - 이 코드가 [기존 설계도 목록]의 어떤 'Task'나 'Feature'를 실제 구현한 결과물인지 찾아내십시오.
   - **구조적 자식 설정**: 매칭되는 'Task'나 'Feature'가 있다면, 해당 ID를 Reference 노드의 'parentNoteIds'에 포함시켜 설계도 아래에 구조적 자식으로 배치하십시오.
   - **관련성 연결**: 관련된 설계도의 ID를 'relatedNoteIds' 배열에도 포함시키십시오.
   - **코드 우선(Code-First) 설계도 자동 생성**: 만약 이 코드가 구현하는 로직이 [기존 설계도 목록]에 **없다면**, 이를 '오류'가 아닌 **'새로운 설계의 발견(Design-Leading Code)'**으로 간주하십시오.
   - 이 경우, 코드를 역공학하여 누락된 설계 계층(Epic -> Feature -> Task)을 \`newDesignNotes\` 배열에 생성하십시오.
   - 생성된 \`newDesignNotes\`의 \`tempId\`를 Reference 노트의 \`relatedNoteIds\`에 포함시켜, 코드가 설계도의 증빙 자료로 연결되도록 하십시오.
[엄격한 계층 구조 규칙]
- 모든 'Feature' 타입의 노트는 반드시 'Epic' 타입의 노트를 부모(parentNoteIds)로 가져야 합니다.
- 기존 설계도 목록에 적절한 Epic이 없다면, 반드시 새로운 Epic을 생성하여 'newDesignNotes'에 포함시키고 해당 Feature를 그 아래에 배치하십시오.
- 모든 'Task' 타입의 노트는 반드시 'Feature' 타입의 노트를 부모로 가져야 합니다.
- 계층은 무조건 Epic -> Feature -> Task 순서를 유지해야 하며, 고립된 Feature나 Task가 생기지 않도록 하십시오.

[가장 중요: 연관성 및 태그 부여]
1. 새로 생성되는 'newDesignNotes'들은 분석 중인 소스 코드(Reference)와 반드시 'relatedNoteIds'로 연결되어야 합니다.
2. 각 설계 노트(Epic, Feature, Task)의 태그는 코드의 실제 도메인 역할(예: '인증 로직', '데이터 매핑')을 반영해야 합니다.
3. 'newDesignNotes' 간에도 계층에 따라 parentNoteIds와 childNoteIds(또는 tempId 기반 연결)가 완벽하게 구성되어야 합니다.

6. 생성되는 모든 코드 분석 노트의 'noteType'은 반드시 "Reference"로 지정하십시오.

Return JSON:
{
    "parent": {
      "title": "제목",
      "folder": "도메인/서브도메인",
      "content": "...",
      "summary": "...",
      "tags": ["tag1"],
      "importance": 4,
      "priority": "A",
      "matchedNoteId": "기존_노트_ID",
      "isNew": boolean,
      "noteType": "Reference",
      "parentNoteIds": ["연결할_Task_ID_또는_tempId"],
      "relatedNoteIds": ["연결할_Task_ID_또는_tempId"]
    },
    "children": [
      {
        "title": "함수명",
        "folder": "도메인/서브도메인",
        "content": "...",
        "summary": "...",
        "tags": ["tag1"],
        "importance": 3,
        "priority": "C",
        "matchedNoteId": "기존_노트_ID",
        "isNew": boolean,
        "noteType": "Reference",
        "relatedNoteIds": ["연결할_Task_ID_또는_tempId"]
      }
    ],
  "newDesignNotes": [
    {
      "tempId": "temp_epic_1",
      "title": "새로 발견된 Epic",
      "folder": "도메인",
      "content": "...",
      "summary": "...",
      "noteType": "Epic",
      "priority": "A"
    },
    {
      "tempId": "temp_feature_1",
      "title": "새로 발견된 Feature",
      "folder": "도메인/서브도메인",
      "content": "...",
      "summary": "...",
      "noteType": "Feature",
      "parentTempId": "temp_epic_1"
    },
    {
      "tempId": "temp_task_1",
      "title": "새로 발견된 Task",
      "folder": "도메인/서브도메인",
      "content": "...",
      "summary": "...",
      "noteType": "Task",
      "parentTempId": "temp_feature_1",
      "matchedNoteId": "기존_Feature_ID에_연결할경우_사용"
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
              tags: { type: Type.ARRAY, items: { type: Type.STRING } },
              importance: { type: Type.NUMBER },
              matchedNoteId: { type: Type.STRING },
              isNew: { type: Type.BOOLEAN },
              noteType: { type: Type.STRING },
              parentNoteIds: { type: Type.ARRAY, items: { type: Type.STRING } },
              relatedNoteIds: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["title", "folder", "content", "summary", "isNew", "noteType"],
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
                tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                importance: { type: Type.NUMBER },
                matchedNoteId: { type: Type.STRING },
                isNew: { type: Type.BOOLEAN },
                noteType: { type: Type.STRING },
                relatedNoteIds: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["title", "folder", "content", "summary", "isNew", "noteType"],
            },
          },
          newDesignNotes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                tempId: { type: Type.STRING },
                title: { type: Type.STRING },
                folder: { type: Type.STRING },
                content: { type: Type.STRING },
                summary: { type: Type.STRING },
                noteType: { type: Type.STRING },
                parentTempId: { type: Type.STRING },
                matchedNoteId: { type: Type.STRING }
              },
              required: ["tempId", "title", "folder", "content", "summary", "noteType"]
            }
          }
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
): Promise<{ report: string; inconsistentNotes: { id: string, description: string, suggestion: string }[] }> => {
  const prompt = `
당신은 시스템 아키텍트입니다. 현재 설계도(노트)와 실제 코드 기반의 'Reference(참고 자료)' 간의 일관성을 검사하십시오.
설계 의도(Design)와 실제 구현(Reality) 사이의 차이점을 찾아내어 보고서를 작성하십시오.

[설계 노트 목록]
${JSON.stringify(notes.filter(n => n.noteType !== 'Reference').map(n => ({ id: n.id, title: n.title, summary: n.summary, content: n.content })))}

[Reference(참고 자료) 목록]
${JSON.stringify(notes.filter(n => n.noteType === 'Reference').map(n => ({ id: n.id, title: n.title, summary: n.summary, content: n.content })))}

[작업 지침]
1. **차이점 분석**: 설계도에는 정의되어 있으나 코드에는 구현되지 않은 기능, 또는 코드에는 구현되어 있으나 설계도에 누락된 기능을 찾으십시오.
2. **불일치 식별**: 설계도와 구현 내용이 서로 상충되는 부분을 찾으십시오.
3. **보고서 작성**: 발견된 문제점들을 한국어로 상세히 기술하십시오.
4. **불일치 노트 추출**: 일관성이 깨진 것으로 판단되는 '설계 노트'의 ID와 불일치 사유, 해결 제안을 추출하십시오.

Return JSON:
{
  "report": "상세 분석 보고서 (Markdown)",
  "inconsistentNotes": [
    {
      "id": "note_id_1",
      "description": "코드에는 A로 구현되어 있으나 설계도에는 B로 되어 있음",
      "suggestion": "설계도를 A로 수정하거나 코드를 B로 수정"
    }
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
            report: { type: Type.STRING },
            inconsistentNotes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  description: { type: Type.STRING },
                  suggestion: { type: Type.STRING }
                },
                required: ["id", "description", "suggestion"]
              }
            }
          },
          required: ["report", "inconsistentNotes"]
        }
      },
    });

    if (signal?.aborted) throw new Error("Operation cancelled");

    const result = safeJsonParse(response.text || '{"report": "분석 실패", "inconsistentNotes": []}');
    return {
      report: result.report || "분석 결과가 없습니다.",
      inconsistentNotes: result.inconsistentNotes || [],
    };
  } catch (err) {
    if (err?.message === "Operation cancelled" || err === "Operation cancelled") throw err;
    console.error('Check consistency failed:', err);
    return {
      report: "일관성 검사 중 오류가 발생했습니다.",
      inconsistentNotes: [],
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

export const generateImpactAnalysis = async (
  note: Note,
  allNotes: Note[],
  signal?: AbortSignal
): Promise<string> => {
  const context = allNotes.map(n => `- ${n.title} (${n.noteType}): ${n.summary}`).join('\n');

  const prompt = `
당신은 대규모 프로젝트의 아키텍트입니다.
현재 설계 노트가 변경되었거나 충돌(Conflict)이 발생했습니다.
이 설계 변경이 실제 코드의 어떤 파일들에 영향을 미칠지 분석하여 '수정 필요 파일 목록'을 추출해 주세요.

[현재 설계 노트]
제목: ${note.title}
유형: ${note.noteType}
요약: ${note.summary}
메타데이터:
- 중요도: ${note.importance}
- 태그: ${note.tags?.join(', ') || '없음'}
- 깃허브 링크: ${note.githubLink || 'N/A'}

[전체 프로젝트 컨텍스트]
${context}

[지시 사항]
1. 'githubLink' 필드와 'relatedNoteIds'를 참고하여 연관된 코드 파일들을 식별하세요.
2. 설계 변경의 내용을 바탕으로, 어떤 파일의 어떤 로직이 수정되어야 하는지 구체적으로 리스트업하세요.
3. 마크다운 형식으로 출력하세요.
4. 파일 경로는 프로젝트 루트 기준(예: src/components/...)으로 표시하세요.
`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: { systemInstruction }
    });

    if (signal?.aborted) throw new Error("Operation cancelled");

    return response.text || "분석 결과가 없습니다.";
  } catch (err) {
    if (err?.message === "Operation cancelled" || err === "Operation cancelled") throw err;
    console.error('Generate impact analysis failed:', err);
    return "분석을 수행하지 못했습니다.";
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
2. 'summary'는 파일 경로가 아닌, 기능의 역할을 설명하는 1-2문장의 한국어 요약이어야 합니다.

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
5. 메타데이터를 작성합니다:
   - version: 1.0.0
   - tags: [discovered-from-github, ...]
   - importance: 1~5

Return JSON matching the Note schema (title, folder, content, summary, importance, tags, relatedNoteIds).
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
      title: `${fileName}`,
      folder: "시스템/미분류 소스",
      content: "분석 중 오류가 발생했습니다.",
      summary: "분석 중 오류가 발생했습니다.",
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      importance: 1,
      priority: 'C',
      tags: ['error'],
      noteType: 'Reference',
      parentNoteIds: [],
      relatedNoteIds: [],
      childNoteIds: []
    };
  }
};

export const chatWithNotes = async (
  query: string,
  notes: Note[],
  chatHistory: { role: 'user' | 'model', parts: string }[],
  signal?: AbortSignal
): Promise<string> => {
  // 모든 노트를 다 넣으면 토큰 제한에 걸릴 수 있으므로, 
  // 우선은 제목과 요약, 핵심 내용을 요약해서 컨텍스트로 구성합니다.
  const context = notes.map(n => ({
    title: n.title,
    folder: n.folder,
    summary: n.summary,
    content: n.content.slice(0, 500) // 내용이 너무 길면 자름
  }));

  const prompt = `
당신은 'Vibe-Architect'의 프로젝트 지식 가이드입니다. 
아래 제공된 [프로젝트 설계 정보]를 바탕으로 사용자의 질문에 친절하게 답하십시오.

[프로젝트 설계 정보]
${JSON.stringify(context, null, 2)}

사용자 질문: "${query}"
`;

  try {
    const chat = ai.chats.create({
      model: MODEL_NAME,
      config: {
        systemInstruction,
        maxOutputTokens: 1000,
      },
      history: chatHistory.map(h => ({
        role: h.role,
        parts: [{ text: h.parts }]
      })),
    });

    const response = await chat.sendMessage({ message: prompt });
    
    if (signal?.aborted) throw new Error("Operation cancelled");
    
    return response.text || "답변을 생성하지 못했습니다.";
  } catch (err) {
    if (err?.message === "Operation cancelled" || err === "Operation cancelled") throw err;
    console.error('Chat with notes failed:', err);
    return "대화 중 오류가 발생했습니다.";
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
메타데이터:
- 중요도: ${targetNote.importance}
- 태그: ${targetNote.tags?.join(', ') || '없음'}

[새로운 코드 분석 결과]
제목: ${logicUnit.title}
내용: ${logicUnit.content}
요약: ${logicUnit.summary}
새 메타데이터:
- 중요도: ${(logicUnit as any).importance || 3}
- 태그: ${((logicUnit as any).tags || []).join(', ')}

[작업 지침]
1. **내용 통합**: 기존 설계의 핵심 개념을 유지하면서, 코드에서 발견된 구체적인 알고리즘과 데이터 흐름을 반영하여 'Detailed Algorithm & Technical Specification' 섹션을 보강하십시오. 단순히 내용을 이어 붙이지 말고, 중복을 제거하고 논리적으로 자연스럽게 융합하십시오.
2. **충돌 처리**: 기존 설계와 실제 코드가 다를 경우, 두 방식을 비교 설명하거나 더 나은 방식을 채택하여 상세히 기술하십시오.
3. **구조 유지**: 업데이트된 'content'는 반드시 시스템 지침의 4개 섹션 구조를 엄격히 따라야 합니다.
4. **요약 업데이트**: 통합된 기능을 잘 나타내도록 'summary'를 갱신하십시오.
5. **메타데이터 병합**: 기존 메타데이터와 새 메타데이터를 병합하십시오. 특히 'githubLink', 'tags', 'childNoteIds' 등의 필드는 유실되지 않도록 반드시 포함하십시오.
6. 모든 텍스트는 한국어로 작성하십시오.

Return JSON:
{
  "content": "통합된 상세 내용 (Markdown)",
  "summary": "통합된 요약 (한국어)",
  "importance": 1~5,
  "tags": ["tag1", "tag2"]
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
          importance: { type: Type.NUMBER },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["content", "summary", "importance", "tags"],
      },
    },
  });

  if (signal?.aborted) throw new Error("Operation cancelled");

  const result = safeJsonParse(response.text || "{}");
  return {
    ...targetNote,
    content: result.content || targetNote.content,
    summary: result.summary || targetNote.summary,
    importance: result.importance || targetNote.importance,
    tags: Array.from(new Set([...targetNote.tags, ...(result.tags || [])])),
    status: 'Done',
    lastUpdated: new Date().toISOString()
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
  updatedGcm: GCM;
  mainNoteUpdates?: { noteType?: string; parentNoteIds?: string[] };
}> => {
  const noteType = mainNote.noteType || 'Feature';
  let typeSpecificPrompt = '';
  let targetChildType = 'Task';

  if (noteType === 'Epic') {
    targetChildType = 'Feature';
    typeSpecificPrompt = `현재 사용자의 대목표(Epic)는 '${mainNote.title}'이야. 이 거대한 목표를 이루기 위해 사용자가 앱에서 실제로 구현해야 할 '핵심 기능(Feature)' 3~5가지를 도출해 줘.`;
  } else if (noteType === 'Feature') {
    targetChildType = 'Task';
    typeSpecificPrompt = `현재 구현할 기능(Feature)은 '${mainNote.title}'이야. 1인 개발자가 오늘 당장 컴퓨터를 켜고 코딩할 수 있는 구체적이고 순차적인 '실제 행동(Task)' 단위로 쪼개줘. 
(예: "users 컬렉션에 대한 firestore.rules 작성", "Google 로그인 버튼 UI 컴포넌트 생성", "로그인 성공 시 /dashboard로 라우팅하는 로직 추가" 등 구체적인 코드 레벨의 작업 명세)`;
  } else {
    targetChildType = 'Task';
    typeSpecificPrompt = `다음 기능/모듈을 더 작은 하위 모듈이나 구체적인 구현 단계로 분해해줘.`;
  }

  const prompt = `
용도: 입력된 기능의 논리적 레벨(Epic/Feature/Task)을 자동 분석하고, 필요한 상위/하위 모듈을 동시에 설계합니다.

[입력된 메인 노트]
제목: ${mainNote.title}
내용: ${mainNote.content}
요약: ${mainNote.summary}

[기존 노트 목록 (부모 탐색 및 중복 방지용)]
${JSON.stringify(existingNotes.map(n => ({ id: n.id, title: n.title, folder: n.folder, noteType: n.noteType })))}

[작업 지시사항]
1. **레벨 자동 판별 및 엄격한 하위 생성**:
   - 현재 노트가 'Epic'이면 -> 하위 노트는 **무조건 'Feature'** 단위(구체적 기능)로만 생성하십시오.
   - 현재 노트가 'Feature'면 -> 하위 노트는 **무조건 'Task'** 단위(실제 코딩/작업 단위)로만 생성하십시오. (절대 Feature 밑에 Feature를 만들지 마십시오)
   - 현재 노트가 'Task'면 -> 하위 노트는 더 잘게 쪼갠 'Task' 단위로 생성하십시오.
2. **상위 노드 탐색 및 생성 (Upward)**:
   - 현재 노트가 'Feature'라면 이것을 품을 'Epic'이 부모로 있어야 합니다. 기존 노트 중 적절한 Epic이 없다면 새로 만들어서 'newParentEpic'에 반환하십시오.
   - 현재 노트가 'Task'라면 이것을 품을 'Feature'가 부모로 있어야 합니다.
3. 생성되는 모든 노트의 제목에는 '[파일]', '[기능]' 등의 접두어를 일절 붙이지 마십시오.

Return JSON:
{
  "detectedNoteType": "Feature", 
  "suggestedParentId": "existing-id", 
  "newParentEpic": { 
    "title": "사용자 인증 시스템 구축",
    "folder": "핵심 도메인/인증",
    "content": "...",
    "summary": "...",
    "importance": 5,
    "tags": ["auth"],
    "noteType": "Epic" 
  },
  "newChildNotes": [ 
    {
      "title": "구글 API 키 발급", 
      "folder": "...",
      "content": "...",
      "summary": "...",
      "importance": 3,
      "tags": ["setup"],
      "noteType": "Task", 
      "parentNoteIds": ["${mainNote.id}"],
      "relatedNoteIds": []
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
          detectedNoteType: { type: Type.STRING },
          suggestedParentId: { type: Type.STRING },
          newParentEpic: noteSchema,
          newChildNotes: { type: Type.ARRAY, items: noteSchema },
          updatedGcm: {
            type: Type.OBJECT,
            properties: {
              entities: { type: Type.OBJECT },
              variables: { type: Type.OBJECT },
            },
            required: ["entities", "variables"],
          },
        },
        required: ["detectedNoteType", "newChildNotes", "updatedGcm"],
      },
    }
  });

  if (signal?.aborted) throw new Error("Operation cancelled");

  const result = safeJsonParse(response.text);
  
  // --- [🔥 새로 추가: AI가 뭐라 하든 무시하고 계급 강제 할당] ---
  const detectedType = result.detectedNoteType || 'Feature';
  const expectedChildType = detectedType === 'Epic' ? 'Feature' : 'Task';

  // 자식 노트들은 부모 계급에 따라 무조건 강제 설정
  const rawNewNotes = [...(result.newChildNotes || [])].map(n => ({ 
    ...n, 
    noteType: expectedChildType 
  }));
  
  // 새 에픽을 만들었다면 무조건 에픽으로 고정
  if (result.newParentEpic) {
    rawNewNotes.push({ ...result.newParentEpic, noteType: 'Epic' });
  }
  // -------------------------------------------------------------
  
  const sanitizedNewNotes = sanitizeNotes(rawNewNotes, existingNotes);

  return {
    newNotes: sanitizedNewNotes,
    updatedGcm: result.updatedGcm || currentGcm,
    mainNoteUpdates: {
      noteType: detectedType,
      parentNoteIds: result.suggestedParentIds
    }
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

export const validateYamlMetadata = (content: string, gcm?: GCM): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
  
  if (!yamlMatch) {
    return { isValid: true, errors: [] };
  }

  const yamlStr = yamlMatch[1];
  const lines = yamlStr.split('\n');
  const meta: Record<string, string> = {};
  
  lines.forEach((line, index) => {
    if (!line) return;
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.includes(':')) {
      errors.push(`Line ${index + 1}: 올바른 YAML 형식이 아닙니다 (키: 값 형식이 필요함)`);
    } else if (trimmedLine.includes(':')) {
      const [key, ...val] = trimmedLine.split(':');
      meta[key.trim()] = val.join(':').trim();
    }
  });

  if (yamlStr && !yamlStr.includes('relatedNoteIds:')) {
    errors.push("마인드맵 연결을 위한 'relatedNoteIds' 필드가 메타데이터에 필요합니다.");
  }
  if (yamlStr && !yamlStr.includes('noteId:')) {
    errors.push("노트 식별을 위한 'noteId' 필드가 메타데이터에 필요합니다.");
  }

  // GCM Consistency Check
  if (gcm) {
    // Check entities
    if (meta.entities) {
      const usedEntities = meta.entities.replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean);
      usedEntities.forEach(entity => {
        if (!gcm.entities[entity]) {
          errors.push(`GCM 경고: 정의되지 않은 엔티티 '${entity}'가 사용되었습니다.`);
        }
      });
    }

    // Check variables
    if (meta.variables) {
      const usedVars = meta.variables.replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean);
      usedVars.forEach(v => {
        if (!gcm.variables[v]) {
          errors.push(`GCM 경고: 정의되지 않은 변수 '${v}'가 사용되었습니다.`);
        }
      });
    }
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
  
  대상 기능들: ${featureTitles?.join(', ') || '없음'}
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
