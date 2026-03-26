import { Type } from "@google/genai";
import { MODEL_NAME, systemInstruction } from "./config";
import { generateContentWithRetry } from "./core";
import { safeJsonParse } from "./utils";

/**
 * [Phase 4 전담] 원자적 로직 심층 분석 서비스
 * 쪼개진 LogicUnit 딱 하나와 그게 속한 부모 Task 정보만 전달하여
 * Gemini가 지치지 않고 완벽하게 분석하도록 합니다.
 */
export const produceReferenceNote = async (
  unit: { title: string; codeSnippet: string }, 
  parentTaskContext: { title: string; summary: string; content: string }, // 부모가 될 Task의 요약 정보
  signal?: AbortSignal
): Promise<{
  title: string;
  content: string;
  summary: string;
  importance: number;
  tags: string[];
}> => {
  const prompt = `
 당신은 '기술 명세 및 구현 증빙 전문가'입니다. 
 제공된 소스 코드 조각이 설계상의 요구사항을 어떻게 기술적으로 충족하고 있는지 심층 분석하여 **'Technical Specification'**을 작성하십시오.

 [조각 코드]
 제목: ${unit.title}
 코드:
 ${unit.codeSnippet}
 
 [맥락]
 이 코드는 "${parentTaskContext.title}" 기능을 구현하는 부품입니다.
 설계 요약: ${parentTaskContext.summary}
 
 [지시]
 이 작은 조각 하나만 완벽하게 분석하여 '참조(Reference) 문서'를 작성하세요.
 - 기능적이고 명확한 한국어 제목을 지으세요 (예: "구글 로그인 팝업 예외 처리")
 - 상세 구현 로직을 3문장 이내로 기술하세요.
 - 이 로직의 핵심 가치를 설명하세요.
 - 구조: 시스템 지침의 4개 섹션 구조(Context, Specification, Constraints, Impact)를 따르되, Specification 섹션을 가장 상세히 작성하십시오.
 - 모든 텍스트는 한국어로 작성하십시오.

 Return JSON:
 {
   "title": "기능적이고 명확한 한국어 제목",
   "content": "심층 분석된 상세 내용 (Markdown)",
   "summary": "구현 핵심 요약 (한국어)",
   "importance": 1~5,
   "tags": ["tag1", "tag2"]
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
          title: { type: Type.STRING },
          content: { type: Type.STRING },
          summary: { type: Type.STRING },
          importance: { type: Type.NUMBER },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } }
        },
        required: ["title", "content", "summary", "importance", "tags"],
      },
      maxOutputTokens: 2048
    },
  }, 3, 1000, signal);

  if (signal?.aborted) throw new Error("Operation cancelled");

  const result = safeJsonParse(response.text || "{}", { 
    title: unit.title, 
    content: "분석 실패", 
    summary: "분석 실패", 
    importance: 3, 
    tags: [] 
  });

  return {
    title: result?.title || unit.title,
    content: result?.content || "분석 실패",
    summary: result?.summary || "분석 실패",
    importance: result?.importance || 3,
    tags: result?.tags || []
  };
};
