import { Type } from "@google/genai";
import { Note } from "../../types";
import { ai, MODEL_NAME, systemInstruction } from "./config";
import { safeJsonParse, generateContentWithRetry } from "./core";

export const chatWithNotes = async (
  query: string,
  allNotes: Note[],
  history: { role: string; parts: string }[] = [],
  signal?: AbortSignal
): Promise<string> => {
  const context = allNotes.map(n => `- ${n.title} (${n.noteType}): ${n.summary}`).join('\n');

  const prompt = `
당신은 프로젝트의 '수석 아키텍트이자 지식 관리자'입니다. 
사용자의 질문에 대해 프로젝트의 설계도(노트)를 기반으로 답변하십시오.

[프로젝트 설계도 요약]
${context}

[사용자 질문]
${query}

[답변 지침]
1. 설계도에 명시된 내용을 바탕으로 사실에 근거하여 답변하십시오.
2. 만약 설계도에 없는 내용이라면, 아키텍트로서의 전문 지식을 바탕으로 제안하거나, 정보가 부족함을 명시하십시오.
3. 답변은 친절하고 전문적인 톤의 한국어로 작성하십시오.
4. 마크다운 형식을 사용하여 가독성을 높이십시오.
`;

  try {
    const contents = [
      ...history.map(h => ({ role: h.role === 'user' ? 'user' : 'model', parts: [{ text: h.parts }] })),
      { role: 'user', parts: [{ text: prompt }] }
    ];

    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents,
      config: { systemInstruction }
    });

    if (signal?.aborted) throw new Error("Operation cancelled");

    return response.text || "답변을 생성하지 못했습니다.";
  } catch (err) {
    if (err?.message === "Operation cancelled" || err === "Operation cancelled") throw err;
    console.error('Chat with notes failed:', err);
    return "오류 발생: " + (err instanceof Error ? err.message : String(err));
  }
};

export const summarizeRepoFeatures = async (
  fileList: string[],
  allNotes: Note[],
  signal?: AbortSignal
): Promise<string> => {
  const designContext = allNotes.map(n => `- ${n.title} (${n.noteType}): ${n.summary}`).join('\n');

  const prompt = `
당신은 '저장소 분석 및 기능 요약 전문가'입니다. 
제공된 파일 목록과 기존 설계도를 대조하여, 이 프로젝트가 어떤 핵심 기능들을 구현하고 있는지 요약하십시오.

[파일 목록]
${fileList.join('\n')}

[기존 설계도]
${designContext}

[작업 지침]
1. 파일 목록에서 유추할 수 있는 주요 기술 스택과 아키텍처 패턴을 식별하십시오.
2. 기존 설계도와 매칭되는 구현체들을 그룹화하여 설명하십시오.
3. 설계도에는 없으나 파일 목록에서 발견된 새로운 잠재적 기능들을 언급하십시오.
4. 마크다운 형식의 한국어 보고서로 작성하십시오.
`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: { systemInstruction }
    });

    if (signal?.aborted) throw new Error("Operation cancelled");

    return response.text || "요약을 생성하지 못했습니다.";
  } catch (err) {
    if (err?.message === "Operation cancelled" || err === "Operation cancelled") throw err;
    console.error('Summarize repo features failed:', err);
    return "분석 중 오류가 발생했습니다.";
  }
};
