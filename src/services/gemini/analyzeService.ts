import { ai, MODEL_NAME } from "./config";
import { RepoSummaries } from "../../types";
import { safeJsonParse } from "./utils";

/**
 * [로직 3] summarizeReposShort
 * 다수의 레포지토리를 사용자의 목표에 맞춰 분석하고 짧은 별명과 요약을 생성합니다.
 */
export const summarizeReposShort = async (
  repos: { full_name: string; description: string }[],
  userGoal: string,
  signal?: AbortSignal
): Promise<RepoSummaries> => {
  // 1. 프롬프트 구성 (과거 버전의 문구 100% 보존)
  const prompt = `
  사용자의 목표: "${userGoal}"
  
  다음 Github 레포지토리들의 목록을 보고, 각 레포지토리가 사용자의 목표를 어떻게 달성할 수 있는지 분석하십시오.
  각 레포지토리에 대해 다음 3가지를 작성하십시오:
  1. nickname: 해당 레포지토리의 핵심 가치를 나타내는 짧은 별명 (예: 필기 최적화의 정석)
  2. summary: 1문장 요약
  3. features: 주요 특징 및 참고할 점 (1~2문장)
  
  레포지토리 목록:
  ${JSON.stringify(repos)}
  
  출력 형식 (JSON):
  {
    "summaries": [
      {
        "repoName": "repo_full_name",
        "nickname": "...",
        "summary": "...",
        "features": "..."
      }
    ]
  }
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

    const text = response.text || '{"summaries": []}';
    const parsed = safeJsonParse(text);
    
    // 2. 데이터 구조 변환 (Array -> Record) - 로직 피델리티 보존
    const summariesMap: RepoSummaries = {};
    
    if (parsed && Array.isArray(parsed.summaries)) {
      parsed.summaries.forEach((item: any) => {
        if (item.repoName) {
          summariesMap[item.repoName] = {
            nickname: item.nickname || '',
            summary: item.summary || '',
            features: item.features || ''
          };
        }
      });
    }

    return summariesMap;
  } catch (err) {
    if (err instanceof Error && err.message === "Operation cancelled") throw err;
    console.error('Summarize repos failed:', err);
    return {}; // 실패 시 빈 객체 반환으로 시스템 중단 방지
  }
};
