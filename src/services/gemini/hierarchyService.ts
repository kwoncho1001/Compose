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
    action: 'match' | 'create' | 'clear';
    parentId?: string;
    newNote?: Omit<Note, 'id' | 'status'>;
  }[];
}> => {
  const existingPotentialParents = allNotes.filter(n => n.noteType !== 'Task');
  
  const prompt = `
당신은 '시스템 아키텍처 계층 구조 설계자'입니다. 
제공된 '말단 Task' 노트들을 분석하여, 이들을 논리적으로 그룹화할 수 있는 **상위 계층(Epic 또는 Feature)**을 제안하거나 생성하십시오.

[분석 대상 말단 Task들]
${JSON.stringify(childNotes.map(n => ({ id: n.id, title: n.title, folder: n.folder, summary: n.summary })))}

[기존 상위 계층 목록 (재사용 가능)]
${JSON.stringify(existingPotentialParents.map(n => ({ id: n.id, title: n.title, noteType: n.noteType, folder: n.folder, summary: n.summary })))}

[작업 지침]
1. **계층 구조 원칙 (Epic -> Feature -> Task)**:
   - 각 Task는 반드시 하나의 Feature에 속해야 합니다.
   - 각 Feature는 반드시 하나의 Epic에 속해야 합니다.
   - 만약 적절한 부모가 [기존 상위 계층 목록]에 없다면, 새로운 부모 노드를 **생성(create)**하십시오.
   - 만약 해당 Task가 어떤 상위 계층에도 속하지 않아야 한다면(매우 드문 경우), **연결 해제(clear)**를 선택하십시오.
2. **논리적 그룹화**:
   - 유사한 도메인이나 기능을 수행하는 Task들을 하나의 Feature로 묶으십시오.
   - Feature들을 하나의 거대한 Epic(예: 'Core Engine', 'UI Framework')으로 묶으십시오.
3. **결과 형식**:
   - 각 orphanNoteId에 대해 action을 'match'(기존 부모 연결), 'create'(새 부모 생성), 'clear'(연결 해제) 중 하나로 지정하십시오.
   - 'match'인 경우 parentId를 제공하십시오.
   - 'create'인 경우 newNote를 생성하십시오.
   - newNote 생성 시:
     - noteType: 'Epic' 또는 'Feature' 중 적절한 것 선택.
     - folder: 도메인 기반 경로 (예: '서비스/인증')
     - content: 시스템 지침의 4개 섹션 구조 준수.
     - summary: 1문장 핵심 요약.

Return JSON:
{
  "results": [
    {
      "orphanNoteId": "Task_ID",
      "action": "match" | "create" | "clear",
      "parentId": "기존_부모_ID (action이 match일 때)",
      "newNote": { ...Note schema without id/status (action이 create일 때)... }
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
                action: { type: Type.STRING, enum: ['match', 'create', 'clear'] },
                parentId: { type: Type.STRING },
                newNote: noteSchema
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
  });

  if (signal?.aborted) throw new Error("Operation cancelled");

  return safeJsonParse(response.text || "{}");
};
