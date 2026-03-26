import { Type } from "@google/genai";
import { Note } from "../../types";
import { MODEL_NAME, systemInstruction } from "./config";
import { generateContentWithRetry } from "./core";
import { safeJsonParse } from "./utils";

/**
 * [Phase 3 전담] 로직 단위 매핑 서비스
 * 단일 로직 단위가 기존 설계도(Task/Feature) 중 어디에 속하는지, 
 * 혹은 새로운 노드가 필요한지 판단합니다.
 */
export const mapUnitToTask = async (
  unit: { title: string; purpose?: string; codeSnippet: string },
  existingTasks: { id: string; title: string; summary: string }[],
  signal?: AbortSignal
): Promise<{
  matchedTaskId?: string;
  suggestedTask?: {
    title: string;
    folder: string;
    content: string;
    summary: string;
    noteType: 'Task' | 'Feature';
  };
}> => {
  const prompt = `
 당신은 '아키텍처 매핑 전문가'입니다. 
 제공된 로직 단위가 기존 설계도의 어떤 작업(Task)이나 기능(Feature)에 속하는지 판단하십시오.
 
 [로직 단위]
 제목: ${unit.title}
 코드 요약: ${unit.codeSnippet.slice(0, 500)}...
 
 [기존 설계도 목록]
 ${JSON.stringify(existingTasks)}
 
 [지시]
 1. 위 로직 단위가 기존 설계도 중 하나에 명확히 속한다면 해당 ID를 \`matchedTaskId\`로 반환하십시오.
 2. 적절한 부모 노드가 없다면, 이 로직을 수용할 수 있는 새로운 Task 또는 Feature를 제안하십시오 (\`suggestedTask\`).
 3. 제안하는 노드는 구현 증빙의 부모 역할을 할 수 있도록 구체적이어야 합니다.
 
 Return JSON:
 {
   "matchedTaskId": "기존_ID_또는_null",
   "suggestedTask": {
     "title": "새로운 노드 제목",
     "folder": "도메인/경로",
     "content": "상세 설계 내용",
     "summary": "1문장 요약",
     "noteType": "Task"
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
          matchedTaskId: { type: Type.STRING },
          suggestedTask: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              folder: { type: Type.STRING },
              content: { type: Type.STRING },
              summary: { type: Type.STRING },
              noteType: { type: Type.STRING, enum: ['Task', 'Feature'] }
            },
            required: ["title", "folder", "content", "summary", "noteType"]
          }
        }
      },
      maxOutputTokens: 1024
    },
  }, 3, 1000, signal);

  if (signal?.aborted) throw new Error("Operation cancelled");

  return safeJsonParse(response.text || "{}", {});
};
