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
      contents: `입력 키워드 "${query}"를 바탕으로 GitHub 검색에 적합한 기능 중심 설명 3가지를 생성하십시오.`,
      config: {
        responseMimeType: "application/json",
        // 기존 규격 복구: JSON Array 반환 강제
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
      contents: `요구사항 "${query}"에 대해 googleSearch 도구를 사용하여 최적의 검색 전략과 유명 레포지토리를 찾으십시오.`,
      config: {
        // [핵심] 도구 호출 권한 복구
        tools: [{ googleSearch: {} }] 
      }
    });
    if (signal?.aborted) throw new Error("Operation cancelled");
    const parsed = safeJsonParse(response.text || "{}");
    
    if (parsed) {
      return parsed as SearchStrategy;
    }
    
    throw new Error("Invalid JSON format from AI");
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
