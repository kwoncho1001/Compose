import { Type } from "@google/genai";
import { Note } from "../../types";
import { ai, MODEL_NAME, systemInstruction } from "./config";
import { safeJsonParse } from "./core";

export const checkConflict = async (content: string, fileContent: string, signal?: AbortSignal): Promise<{ isMatch: boolean; reason: string }> => {
  const prompt = `
당신은 코드 대조 및 통합 관리자입니다. 설계 내용(사양)과 실제 Github 소스 코드를 비교하십시오.
소스 코드가 설계를 논리적으로 구현하고 있는지 판단하십시오.
모든 설명과 이유는 반드시 한국어로 작성하십시오.

설계 내용:
${content}

Github 소스 코드:
${fileContent.slice(0, 15000)}

작업:
1. 코드가 설계와 논리적으로 일치하는지 확인합니다.
2. 일치하면 isMatch를 true로 설정합니다.
3. 일치하지 않으면(예: 기능 누락, 다른 로직) isMatch를 false로 설정하고 간략한 한국어 이유를 제공합니다.

반환 JSON: { "isMatch": boolean, "reason": "한국어 문자열" }
`;
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isMatch: { type: Type.BOOLEAN },
            reason: { type: Type.STRING },
          },
          required: ["isMatch", "reason"],
        },
      },
    });

    if (signal?.aborted) throw new Error("Operation cancelled");

    return safeJsonParse(response.text || '{"isMatch": false, "reason": "Failed to parse"}');
  } catch (err) {
    if (err?.message === "Operation cancelled" || err === "Operation cancelled") throw err;
    console.error('Check conflict failed:', err);
    return { isMatch: false, reason: "오류 발생: " + (err instanceof Error ? err.message : String(err)) };
  }
};

export const updateSpecFromCode = async (content: string, fileContent: string, signal?: AbortSignal): Promise<string> => {
  const prompt = `
다음 설계 내용을 제공된 소스 코드와 일치하도록 업데이트하십시오.
단순히 코드를 설명하는 것이 아니라, **'Technical Specification'** 관점에서 이 코드가 설계상의 요구사항을 어떻게 기술적으로 충족하고 있는지 상세히 기술하십시오.
동일한 형식을 유지하되, 코드의 실제 구현 로직(알고리즘, 데이터 흐름, 예외 처리 등)을 반영하여 세부 사항을 조정하십시오.
모든 텍스트는 한국어로 작성하십시오.

현재 설계 내용:
${content}

소스 코드:
${fileContent.slice(0, 15000)}
`;
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: { systemInstruction }
    });

    if (signal?.aborted) throw new Error("Operation cancelled");

    return response.text || content;
  } catch (err) {
    if (err?.message === "Operation cancelled" || err === "Operation cancelled") throw err;
    console.error('Update spec from code failed:', err);
    return content;
  }
};

export const generateFixGuide = async (content: string, fileContent: string, signal?: AbortSignal): Promise<string> => {
  const prompt = `
소스 코드를 설계 내용에 맞게 수정하는 방법에 대한 간결한 가이드를 한국어로 제공하십시오.

설계 내용:
${content}

소스 코드:
${fileContent.slice(0, 15000)}
`;
  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: { systemInstruction }
    });

    if (signal?.aborted) throw new Error("Operation cancelled");

    return response.text || "가이드가 없습니다.";
  } catch (err) {
    if (err?.message === "Operation cancelled" || err === "Operation cancelled") throw err;
    console.error('Generate fix guide failed:', err);
    return "오류 발생: " + (err instanceof Error ? err.message : String(err));
  }
};

export const generateImpactAnalysis = async (
  note: Note,
  allNotes: Note[],
  signal?: AbortSignal
): Promise<string> => {
  const context = allNotes.map(n => `- ${n.title} (${n.noteType}): ${n.summary}`).join('\n');

  const prompt = `
당신은 대규모 프로젝트의 아키텍트입니다.
현재 설계 노트가 변경되었거나 충돌(Conflict)이 발생했습니다.
이 설계 변경이 실제 코드의 어떤 파일들에 영향을 미칠지 분석하여 '수정 필요 파일 목록'을 추출해 주세요.

[현재 설계 노트]
제목: ${note.title}
유형: ${note.noteType}
요약: ${note.summary}
메타데이터:
- 중요도: ${note.importance}
- 태그: ${note.tags?.join(', ') || '없음'}
- 깃허브 링크: ${note.githubLink || 'N/A'}

[전체 프로젝트 컨텍스트]
${context}

[지시 사항]
1. 'githubLink' 필드와 'relatedNoteIds'를 참고하여 연관된 코드 파일들을 식별하세요.
2. 설계 변경의 내용을 바탕으로, 어떤 파일의 어떤 로직이 수정되어야 하는지 구체적으로 리스트업하세요.
3. 마크다운 형식으로 출력하세요.
4. 파일 경로는 프로젝트 루트 기준(예: src/components/...)으로 표시하세요.
`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: { systemInstruction }
    });

    if (signal?.aborted) throw new Error("Operation cancelled");

    return response.text || "분석 결과가 없습니다.";
  } catch (err) {
    if (err?.message === "Operation cancelled" || err === "Operation cancelled") throw err;
    console.error('Generate impact analysis failed:', err);
    return "분석을 수행하지 못했습니다.";
  }
};

export const partialMerge = async (spec: string, code: string): Promise<string> => {
  const prompt = `
디자인 명세와 실제 구현 코드 사이의 충돌이 발생했습니다. 두 내용을 지능적으로 병합하여 최적의 명세를 만드세요.
디자인 명세:
${spec}

구현 코드:
${code}

작업:
1. 코드에서 구현된 실제 로직과 변수명을 명세에 반영하세요.
2. 명세에만 있는 중요한 비즈니스 로직이나 주석은 유지하세요.
3. GCM 변수와 일치하지 않는 부분이 있다면 코드의 구현을 우선하되 명세에 기록하세요.
`;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: { systemInstruction }
  });

  return response.text || spec;
};
