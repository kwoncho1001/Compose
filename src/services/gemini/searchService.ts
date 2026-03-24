import { ai, MODEL_NAME } from "./config";
import { SearchStrategy } from "../../types";
import { safeJsonParse } from "./utils";

/**
 * [로직 1] refineSearchGoal
 * 키워드를 구체적인 기능 구현 목표로 정제합니다.
 */
export const refineSearchGoal = async (keyword: string): Promise<string> => {
  const prompt = `
    You are a Senior Efficiency Architect. 
    Refine the following search keyword into a specific, functional development goal for a GitHub search.
    Focus on implementation details and core logic.
    
    Keyword: "${keyword}"
    
    Output only the refined goal sentence.
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
    });
    return response.text?.trim() || keyword;
  } catch (error) {
    console.error("Error in refineSearchGoal:", error);
    return keyword; // 실패 시 원본 키워드 반환 (Functional Integrity)
  }
};

/**
 * [로직 2] translateQueryForGithub
 * 정제된 목표를 GitHub 검색 전략으로 변환합니다.
 */
export const translateQueryForGithub = async (goal: string): Promise<SearchStrategy> => {
  const prompt = `
    Convert the following development goal into a GitHub search strategy.
    Goal: "${goal}"
    
    Return a JSON object with exactly these fields:
    - query: The main search string (e.g., "react-dnd treeview")
    - filters: An array of GitHub search filters (e.g., ["stars:>100", "language:typescript"])
    - rationale: A brief explanation of why this search is effective.
    
    Return ONLY valid JSON.
  `;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
    });
    const text = response.text || "";
    const parsed = safeJsonParse(text);
    
    if (parsed) {
      return parsed as SearchStrategy;
    }
    
    throw new Error("Invalid JSON format from AI");
  } catch (error) {
    console.error("Error in translateQueryForGithub:", error);
    // Fallback: 최소한의 검색이라도 가능하도록 기본값 제공
    return {
      query: goal,
      filters: ["stars:>0"],
      rationale: "Fallback search strategy due to processing error."
    };
  }
};
