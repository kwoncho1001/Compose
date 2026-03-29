import { Type } from "@google/genai";
import { Note, GCM, NoteType } from "../../types";
import { generateTaskDeterministicId } from "../../utils/idGenerator";
import { ai, MODEL_NAME, systemInstruction, noteSchema } from "./config";
import { generateContentWithRetry } from "./core";
import { safeJsonParse, sanitizeNotes } from "./utils";

export const decomposeFeature = async (
  projectId: string,
  featureRequest: string,
  currentGcm: GCM,
  existingNotes: Note[],
  githubContext?: { repoName: string; files: string[]; readme?: string },
  signal?: AbortSignal
): Promise<{ 
  newNotes: Note[]; 
  updatedNotes: Note[];
  updatedGcm: GCM 
}> => {
  // 1. 첫 번째 AI 호출로 메인 노트 설계
  const step1Response = await generateContentWithRetry({
    model: MODEL_NAME,
    contents: `사용자의 요청 "${featureRequest}"을 분석하여 Epic(대목표) 또는 Feature(기능)로 설계하십시오.`,
    config: { 
      systemInstruction, 
      responseMimeType: "application/json",
      responseSchema: noteSchema
    }
  }, 3, 1000, signal);
  if (signal?.aborted) throw new Error("Operation cancelled");
  const mainFeature = safeJsonParse(step1Response.text);

  // --- [🔥 핵심 변경: 부모 ID 및 계급 강제 설정] ---
  const mainNoteId = generateTaskDeterministicId(projectId, mainFeature.title || "Untitled Note");
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
  const step2Response = await generateContentWithRetry({
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
  }, 3, 1000, signal);
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
    id: generateTaskDeterministicId(projectId, n.title || "Untitled Child Note"),
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

  const response = await generateContentWithRetry({
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
  }, 3, 1000, signal);

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
