import { ai, MODEL_NAME } from "./config";
import { SearchStrategy } from "../../types";
import { safeJsonParse } from "./utils";

/**
 * [교정] refineSearchGoal
 * 3가지의 기능 중심 목표로 정제 (Array 구조 복구)
 */
export const refineSearchGoal = async (query: string, signal?: AbortSignal): Promise<string[]> => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `
입력 키워드: "${query}"

위 키워드를 바탕으로 GitHub에서 참고할 만한 오픈소스 프로젝트를 찾기 위한 구체적인 구현 목표 3가지를 생성하십시오.
결과는 반드시 다음 JSON 문자열 배열 형식으로만 반환하십시오:
["목표1", "목표2", "목표3"]
`,
      config: {
        responseMimeType: "application/json",
      }
    });
    if (signal?.aborted) throw new Error("Operation cancelled");
    return safeJsonParse(response.text || "[]") || [query];
  } catch (error) {
    if (error instanceof Error && error.message === "Operation cancelled") throw error;
    console.error('Refining goals failed:', error);
    return [query]; // 최소 무결성 유지
  }
};

/**
 * [교정] translateQueryForGithub
 * googleSearch 도구 활용 로직 복구 (Intelligence Restoration)
 */
export const translateQueryForGithub = async (query: string, signal?: AbortSignal): Promise<SearchStrategy> => {
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: `
요구사항: "${query}"

1. googleSearch 도구를 사용하여 위 요구사항을 구현한 유명한 GitHub 레포지토리들을 찾으십시오.
2. 검색 결과를 바탕으로 최적의 GitHub 검색 쿼리 3개와 추천 레포지토리 목록을 작성하십시오.
3. 결과를 반드시 다음 JSON 형식으로만 반환하십시오:
{
  "queries": ["query1", "query2", "query3"],
  "suggestedRepos": [
    { "full_name": "owner/repo", "description": "요약" }
  ],
  "rationale": "검색 전략 설명"
}
`,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json"
      }
    });
    if (signal?.aborted) throw new Error("Operation cancelled");
    const parsed = safeJsonParse(response.text || "{}");
    
    if (parsed && Array.isArray(parsed.queries)) {
      return parsed as SearchStrategy;
    }
    
    return { 
      queries: [query], 
      suggestedRepos: [],
      rationale: "기본 검색 전략으로 전환되었습니다."
    };
  } catch (error) {
    if (error instanceof Error && error.message === "Operation cancelled") throw error;
    console.error('Translation failed:', error);
    return { 
      queries: [query], 
      suggestedRepos: [],
      rationale: "Fallback search strategy due to processing error."
    };
  }
};
