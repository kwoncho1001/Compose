import { ai, MODEL_NAME } from "./config";
import { Note, GCM, TranspilationResult } from "../../types";
import { safeJsonParse, sanitizeNotes } from "./utils"; 
import { generateContentWithRetry } from "./core";

/**
 * [로직 4] transpileExternalLogic
 * 외부 프로젝트의 로직을 우리 프로젝트의 GCM 및 도메인 체계로 정문화하여 이식합니다.
 */
export const transpileExternalLogic = async (
  featureTitles: string[],
  externalCodes: { path: string; content: string }[],
  currentGcm: GCM,
  existingNotes: Note[],
  signal?: AbortSignal
): Promise<TranspilationResult> => {
  // 원본 프롬프트 100% 보존
  const prompt = `
  당신은 '대화형 선별 이식(Interactive Selective Transfer)' 전문가입니다. 
  외부 프로젝트의 핵심 로직을 분석하여, 우리 프로젝트의 도메인 언어와 변수 체계(GCM)에 맞게 재구성한 설계도를 생성하십시오.
  
  대상 기능들: ${featureTitles?.join(', ') || '없음'}
  외부 소스 코드:
  ${externalCodes.map(c => `File: ${c.path}\nContent:\n${c.content.slice(0, 5000)}`).join('\n---\n')}
  
  우리 프로젝트 GCM:
  ${JSON.stringify(currentGcm)}
  
  기존 노트 목록 (참고용):
  ${JSON.stringify(existingNotes.map(n => ({ id: n.id, title: n.title, folder: n.folder })))}
  
  작업 지침:
  1. **변수 정문화 이식**: 외부 코드의 알고리즘 뼈대는 유지하되, 모든 변수명, 클래스명, 함수명은 우리 프로젝트의 GCM 및 도메인 구조에 맞춰 치환하십시오.
  2. **도메인 중심 분류**: 우리 프로젝트의 도메인 폴더 구조에 맞게 노트를 생성하십시오.
  3. **상세 설계**: 'content'는 시스템 지침의 4개 섹션 구조를 따라야 하며, 알고리즘을 우리 프로젝트의 문맥으로 상세히 설명하십시오.
  4. **연결성**: 기존 노트들과 논리적으로 연결될 수 있도록 relatedNoteIds를 설정하십시오. (반드시 ID 사용)
  
  Return JSON:
  {
    "newNotes": [ array of notes matching the schema ],
    "updatedGcm": { "entities": {...}, "variables": {...} }
  }
  `;

  try {
    const result = await generateContentWithRetry({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    }, 3, 1000, signal);

    if (signal?.aborted) throw new Error("Operation cancelled");

    const responseText = result.text || "{}";
    const parsed = safeJsonParse(responseText);

    // 데이터 정제 및 무결성 확보 (Logic Fidelity)
    const sanitizedNewNotes = sanitizeNotes(parsed?.newNotes || [], existingNotes);

    return {
      newNotes: sanitizedNewNotes,
      updatedGcm: parsed?.updatedGcm || currentGcm,
    };
  } catch (err) {
    if (err instanceof Error && err.message === "Operation cancelled") throw err;
    console.error('Transpilation failed:', err);
    return {
      newNotes: [],
      updatedGcm: currentGcm,
    };
  }
};
