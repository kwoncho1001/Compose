import { Type } from "@google/genai";
import { MODEL_NAME, systemInstruction } from "./config";
import { generateContentWithRetry } from "./core";
import { safeJsonParse } from "./utils";

/**
 * [Phase 3 통합] 로직 단위 배치 매핑 및 심층 분석 서비스
 * 단 한 번의 AI 호출로 여러 로직 단위가 어디에 속하는지(Mapping)와 
 * 그 로직의 기술적 상세 명세(Analysis)를 동시에 수행합니다.
 */
export const analyzeAndMapBatch = async (
  units: { title: string; codeSnippet: string }[],
  existingTasks: { id: string; title: string; summary: string }[],
  signal?: AbortSignal
): Promise<{
  results: {
    matchedTaskId?: string;
    suggestedTask?: {
      title: string;
      folder: string;
      content: string;
      summary: string;
      noteType: 'Task' | 'Feature';
    };
    analysis: {
      title: string;
      content: string;
      summary: string;
      importance: number;
      tags: string[];
    };
  }[];
}> => {
  if (units.length === 0) return { results: [] };

  const unitsPrompt = units.map((u, i) => `
[로직 단위 ${i + 1}]
제목: ${u.title}
코드:
${u.codeSnippet}
`).join('\n---\n');

  const prompt = `
 당신은 '아키텍처 매핑 및 기술 명세 전문가'입니다. 
 제공된 여러 로직 단위들이 기존 설계도의 어떤 작업(Task)이나 기능(Feature)에 속하는지 판단하고, 
 동시에 각 코드의 상세 기술 명세(Technical Specification)를 작성하십시오.

 [로직 단위 목록]
 ${unitsPrompt}
  
 [기존 설계도 목록]
 ${JSON.stringify(existingTasks)}
  
 [지시 1: 매핑]
 1. 각 로직 단위가 기존 설계도 중 하나에 명확히 속한다면 해당 ID를 \`matchedTaskId\`로 반환하십시오.
 2. 적절한 부모 노드가 없다면, 이 로직을 수용할 수 있는 새로운 Task 또는 Feature를 제안하십시오 (\`suggestedTask\`).
 3. 제안하는 노드는 구현 증빙의 부모 역할을 할 수 있도록 구체적이어야 합니다.

 [지시 2: 분석]
 1. 각 로직 단위가 설계상의 요구사항을 어떻게 기술적으로 충족하고 있는지 심층 분석하여 'Technical Specification'을 작성하십시오.
 2. 기능적이고 명확한 한국어 제목을 지으세요 (예: "구글 로그인 팝업 예외 처리")
 3. 상세 구현 로직을 3문장 이내로 기술하세요.
 4. 이 로직의 핵심 가치를 설명하세요.
 5. 구조: 시스템 지침의 4개 섹션 구조(Context, Specification, Constraints, Impact)를 따르되, Specification 섹션을 가장 상세히 작성하십시오.
 6. 모든 텍스트는 한국어로 작성하십시오.
  
 Return JSON (배열 순서를 유지하십시오):
 {
   "results": [
     {
       "matchedTaskId": "기존_ID_또는_null",
       "suggestedTask": {
         "title": "새로운 노드 제목",
         "folder": "도메인/경로",
         "content": "상세 설계 내용",
         "summary": "1문장 요약",
         "noteType": "Task"
       },
       "analysis": {
         "title": "기능적이고 명확한 한국어 제목",
         "content": "심층 분석된 상세 내용 (Markdown)",
         "summary": "구현 핵심 요약 (한국어)",
         "importance": 1~5,
         "tags": ["tag1", "tag2"]
       }
     },
     ...
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
                },
                analysis: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING },
                    content: { type: Type.STRING },
                    summary: { type: Type.STRING },
                    importance: { type: Type.NUMBER },
                    tags: { type: Type.ARRAY, items: { type: Type.STRING } }
                  },
                  required: ["title", "content", "summary", "importance", "tags"]
                }
              }
            }
          }
        }
      },
      maxOutputTokens: 8192
    },
  }, 3, 1000, signal);

  if (signal?.aborted) throw new Error("Operation cancelled");

  return safeJsonParse(response.text || "{}", { results: [] });
};
