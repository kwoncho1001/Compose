import { Type } from "@google/genai";
import { Note } from "../../types";
import { ai, MODEL_NAME, systemInstruction, noteSchema } from "./config";
import { generateContentWithRetry } from "./core";
import { safeJsonParse } from "./utils";

export const suggestOrCreateParentsBatch = async (
  childNotes: Note[],
  allNotes: Note[],
  signal?: AbortSignal
): Promise<{
  results: {
    orphanNoteId: string;
    action: 'match' | 'create' | 'clear' | 'update';
    parentId?: string;
    newNote?: Omit<Note, 'id' | 'status'>;
    updatedNote?: Partial<Note>;
  }[];
}> => {
  const existingPotentialParents = allNotes.filter(n => n.noteType !== 'Task');
  
  const prompt = `
당신은 '시스템 아키텍처 계층 구조 설계자'입니다. 
제공된 '규칙 위반' 또는 '고아' 노트들을 분석하여, 계층 구조를 보정하십시오.

[분석 대상 노트들]
${JSON.stringify(childNotes.map(n => ({ id: n.id, title: n.title, folder: n.folder, summary: n.summary, noteType: n.noteType, parentNoteIds: n.parentNoteIds })))}

[기존 전체 노트 목록 (재사용 가능)]
${JSON.stringify(allNotes.map(n => ({ id: n.id, title: n.title, noteType: n.noteType, folder: n.folder, summary: n.summary })))}

[작업 지침]
1. **엄격한 계층 규칙 (Epic -> Feature -> Task -> Reference)**:
   - **Epic**: 오직 Feature만 자식으로 가질 수 있음.
   - **Feature**: 오직 Task 또는 Reference만 자식으로 가질 수 있음 (Feature/Epic 자식 금지).
   - **Task**: 오직 Reference만 자식으로 가질 수 있음 (Feature/Epic/Task 자식 금지).
   - **공통**: Epic이 아닌 모든 노드는 반드시 적절한 상위 부모가 있어야 함 (고아 금지).
2. **Sibling Promotion 및 타입 전이 (Type Transition)**:
   - 만약 Task 아래에 또 다른 Task가 있다면, 부모 Task를 Feature로 승격시키거나, 자식 Task를 Feature로 승격시켜 부모의 부모(Epic)에게 연결하십시오.
   - 만약 Feature 아래에 또 다른 Feature가 있다면, 자식 Feature를 부모의 부모(Epic)에게 직접 연결하여 형제(Sibling) 관계로 만드십시오.
3. **결과 형식**:
   - 각 orphanNoteId에 대해 action을 지정하십시오:
     - 'match': 기존 부모 연결 (parentId 필수)
     - 'create': 새 부모 생성 (newNote 필수)
     - 'update': 현재 노드의 속성(예: noteType) 변경 (updatedNote 필수)
     - 'clear': 모든 부모 연결 해제
   - 'update' 사용 시, \`updatedNote\`에 변경할 필드(예: { "noteType": "Feature" })를 포함하십시오.

Return JSON:
{
  "results": [
    {
      "orphanNoteId": "Note_ID",
      "action": "match" | "create" | "update" | "clear",
      "parentId": "기존_부모_ID",
      "newNote": { ... },
      "updatedNote": { "noteType": "Feature", "parentNoteIds": ["..."] }
    }
  ]
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
          results: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                orphanNoteId: { type: Type.STRING },
                action: { type: Type.STRING, enum: ['match', 'create', 'update', 'clear'] },
                parentId: { type: Type.STRING },
                newNote: noteSchema,
                updatedNote: {
                  type: Type.OBJECT,
                  properties: {
                    noteType: { type: Type.STRING, enum: ['Epic', 'Feature', 'Task', 'Reference'] },
                    parentNoteIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                    title: { type: Type.STRING },
                    summary: { type: Type.STRING }
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
  }, 3, 1000, signal);

  if (signal?.aborted) throw new Error("Operation cancelled");

  return safeJsonParse(response.text || "{\"results\": []}");
};

export const generateParentNode = async (
  childNotes: Note[],
  allNotes: Note[],
  signal?: AbortSignal
): Promise<Omit<Note, 'id' | 'status'>> => {
  const prompt = `
당신은 시스템 아키텍트입니다. 다음 하위 노트들을 포괄하는 상위 계층(Epic 또는 Feature) 노트를 하나 생성하십시오.
이 노트는 하위 노트들의 공통된 목적과 설계를 정의해야 합니다.

[하위 노트 목록]
${JSON.stringify(childNotes.map(n => ({ id: n.id, title: n.title, summary: n.summary, folder: n.folder })))}

[기존 노트 목록 (참고용)]
${JSON.stringify(allNotes.map(n => ({ id: n.id, title: n.title, noteType: n.noteType })))}

[작업 지침]
1. 하위 노트들의 공통 분모를 찾아 제목(title)을 정하십시오.
2. noteType은 'Epic' 또는 'Feature' 중 적절한 것을 선택하십시오. (하위가 Task면 Feature, 하위가 Feature면 Epic)
3. 'content'는 시스템 지침의 4개 섹션 구조를 따르십시오.
4. 'summary'는 1문장 핵심 요약입니다.
5. 'childNoteIds'에 제공된 하위 노트 ID들을 모두 포함시키십시오.

Return JSON matching the Note schema (title, folder, content, summary, importance, tags, noteType, childNoteIds).
`;

  const response = await generateContentWithRetry({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: noteSchema,
    },
  }, 3, 1000, signal);

  if (signal?.aborted) throw new Error("Operation cancelled");

  return safeJsonParse(response.text || "{}");
};
