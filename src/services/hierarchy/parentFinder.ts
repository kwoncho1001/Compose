import { ai, MODEL_NAME } from "../gemini/config";
import { Note, NoteType, ParentSuggestion } from "../../types";
import { safeJsonParse } from "../gemini/utils";

/**
 * [로직 5] suggestOrCreateParent (Single)
 * 단일 고아 노드에 대해 최적의 부모를 매칭하거나 새로 생성합니다.
 */
export const suggestOrCreateParent = async (
  orphanNote: Note,
  candidateParents: Note[],
  signal?: AbortSignal
): Promise<ParentSuggestion> => {
  // 1. 계층 규칙 정의
  let requiredParentType: NoteType;
  let ruleDescription: string;

  switch (orphanNote.noteType) {
    case 'Reference':
      requiredParentType = 'Task'; // Reference can be under Task or Feature, but Task is more specific
      ruleDescription = '부모는 반드시 Task 또는 Feature 타입이어야 함';
      break;
    case 'Task':
      requiredParentType = 'Feature';
      ruleDescription = '부모는 반드시 Feature 타입이어야 함';
      break;
    case 'Feature':
      requiredParentType = 'Epic';
      ruleDescription = '부모는 반드시 Epic 타입이어야 함';
      break;
    default:
      requiredParentType = 'Epic';
      ruleDescription = '최상위 계층으로 Epic을 권장함';
  }
  
  // 2. 원본 프롬프트 유지
  const prompt = `
    당신은 지식 관리 전문가입니다. 아래 '고아 노드'를 적절한 부모 노드에 할당해야 합니다.
    
    [고아 노드 정보]
    - 타입: ${orphanNote.noteType}
    - 제목: ${orphanNote.title}
    - 요약: ${orphanNote.summary}
    - 내용: ${orphanNote.content.slice(0, 1000)}

    [규칙]
    - ${ruleDescription}
    - Epic: 오직 Feature만 자식으로 가질 수 있음.
    - Feature: 오직 Task 또는 Reference만 자식으로 가질 수 있음.
    - Task: 오직 Reference만 자식으로 가질 수 있음.

    [기존 부모 후보 (이미 존재하는 ${requiredParentType} 목록)]
    ${candidateParents.length > 0 
      ? candidateParents.map(p => `- ID: ${p.id}, 제목: ${p.title}, 요약: ${p.summary}`).join('\n')
      : '없음'}

    작업:
    1. 기존 후보 중 이 고아 노드를 논리적으로 포함할 수 있는 가장 적합한 부모가 있다면 해당 ID를 선택하세요. (action: "match")
    2. 적합한 후보가 없거나 목록이 비어있다면, 이 노드를 아우를 수 있는 새로운 ${requiredParentType} 노드의 제목과 내용을 작성하세요. (action: "create")
    
    결과 포맷: JSON { "action": "match" | "create", "parentId": "string (match인 경우 필수)", "newNote": { "title": "string", "content": "string", "summary": "string" } }
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    if (signal?.aborted) throw new Error("Operation cancelled");

    const result = safeJsonParse(response.text || "{}");
    
    // 3. 'create' 액션 시 기본 메타데이터 주입 로직 보존
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
      return { action: 'create', newNote };
    }

    return result;
  } catch (err) {
    if (err instanceof Error && err.message === "Operation cancelled") throw err;
    console.error('Suggest parent failed:', err);
    return { action: 'match', parentId: undefined }; // Fallback
  }
};
