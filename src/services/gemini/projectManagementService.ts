import { Type } from "@google/genai";
import { Note, GCM } from "../../types";
import { MODEL_NAME, systemInstruction } from "./config";
import { generateContentWithRetry } from "./core";
import { safeJsonParse } from "./utils";

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

  const response = await generateContentWithRetry({
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

  const result = safeJsonParse(response.text || "{}", { suggestion: "", updatedStatuses: {} });
  return {
    suggestion: result?.suggestion || "제안할 내용이 없습니다.",
    updatedStatuses: result?.updatedStatuses || {},
  };
};
