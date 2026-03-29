import { Type } from "@google/genai";
import { Note, GCM } from "../../types";
import { MODEL_NAME, systemInstruction } from "./config";
import { generateContentWithRetry } from "./core";
import { safeJsonParse } from "./utils";

export const optimizeBlueprint = async (
  notes: Note[],
  gcm: GCM,
  signal?: AbortSignal
): Promise<{ 
  updatedNotes: Note[], 
  deletedNoteIds: string[],
  updatedGcm: GCM, 
  report: string 
}> => {
  const simplifiedNotes = notes.map(n => ({
    id: n.id,
    title: n.title,
    folder: n.folder,
    summary: n.summary,
    content: n.content.slice(0, 2000),
    relatedNoteIds: n.relatedNoteIds,
    parentNoteIds: n.parentNoteIds,
    noteType: n.noteType,
    tags: n.tags,
    importance: n.importance
  }));

  const analysisPrompt = `
당신은 시스템 아키텍처 최적화 전문가입니다. 현재의 설계도(노트 목록 및 GCM)를 분석하여 최적화 계획을 세우십시오.

작업 목표:
1. **폴더 및 도메인 통합**: 모든 노트의 'folder' 속성을 "상위범주/하위범주" 형태(예: "1. 시스템 인프라/데이터 보안")로 재작성하여 계층화하십시오. 유사한 명칭의 폴더들은 하나의 대표 도메인 폴더로 통합하십시오.
2. **'Code Snapshot/' 폴더 폐지**: 기존에 'Code Snapshot/' 폴더에 격리되어 있던 Reference 타입의 노트들을 실제 업무 도메인 폴더(예: "인증/구글로그인")로 이동시키십시오. Task와 Reference가 같은 폴더 내에 공존하도록 재배치하십시오.
3. **수직적 계층 구조(Hierarchy) 재구축**: 상위 개념의 노트를 찾아 그 아래로 하위 기능들을 'parentNoteIds'를 사용하여 엮어 "통합"하십시오.
3. **노트 통합 원칙**: 중복되거나 유사한 내용을 담은 노트들은 하나로 통합하십시오. 통합된 노트의 'status'는 반드시 'Temporary Merge'로 설정하십시오.
4. **불필요한 기술 중심 폴더 제거**: 'Imported', 'Core', 'UI', 'Logic' 등 기술 중심 폴더를 제거하고 실제 사용자 기능 단위로 재분류하십시오.
5. **명칭 표준화**: 제목에서 'Main_', 'ㄴ.', 'ㄱ.', '1.' 등 불필요한 접두어와 숫자를 제목에서 완전히 제거하십시오.
6. **GCM 최적화**: 엔티티와 변수를 정리하고 중복을 제거하십시오.
7. **노트 유형(noteType) 유지 및 할당**: 기존 노트의 'noteType'이 있다면 유지하고, 새로 통합되거나 변경되는 노트에 대해서는 적절한 'noteType'(Epic, Feature, Task, Reference)을 할당하십시오.

Return JSON:
{
  "updatedNotes": [ { "id": "string", "title": "string", "folder": "string", "content": "string", "summary": "string", "parentNoteIds": ["string"], "relatedNoteIds": ["string"], "tags": ["string"], "importance": number, "status": "string", "noteType": "string" } ],
  "deletedNoteIds": ["string"],
  "updatedGcm": { "entities": {}, "variables": {} },
  "report": "최적화 작업 내용 요약 (Markdown)"
}
`;

  const response = await generateContentWithRetry({
    model: MODEL_NAME,
    contents: [
      { text: analysisPrompt },
      { text: `Current Notes: ${JSON.stringify(simplifiedNotes)}` },
      { text: `Current GCM: ${JSON.stringify(gcm)}` }
    ],
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          updatedNotes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                id: { type: Type.STRING },
                title: { type: Type.STRING },
                folder: { type: Type.STRING },
                content: { type: Type.STRING },
                summary: { type: Type.STRING },
                parentNoteIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                relatedNoteIds: { type: Type.ARRAY, items: { type: Type.STRING } },
                tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                importance: { type: Type.NUMBER },
                status: { type: Type.STRING },
                noteType: { type: Type.STRING }
              },
              required: ["id", "title", "folder", "content", "summary"]
            }
          },
          deletedNoteIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          updatedGcm: {
            type: Type.OBJECT,
            properties: {
              entities: { type: Type.OBJECT },
              variables: { type: Type.OBJECT }
            }
          },
          report: { type: Type.STRING }
        },
        required: ["updatedNotes", "deletedNoteIds", "updatedGcm", "report"]
      }
    }
  }, 3, 1000, signal);

  if (signal?.aborted) throw new Error("Operation cancelled");

  const result = safeJsonParse(response.text || "{}", { updatedNotes: [], deletedNoteIds: [], updatedGcm: gcm, report: "" });
  return {
    updatedNotes: result?.updatedNotes || [],
    deletedNoteIds: result?.deletedNoteIds || [],
    updatedGcm: result?.updatedGcm || gcm,
    report: result?.report || "최적화가 완료되었습니다."
  };
};

export const checkConsistency = async (
  notes: Note[],
  gcm: GCM,
  signal?: AbortSignal
): Promise<{ report: string; inconsistentNotes: { id: string, description: string, suggestion: string }[] }> => {
  const prompt = `
당신은 시스템 아키텍트입니다. 현재 설계도(노트)와 실제 코드 기반의 'Reference(참고 자료)' 간의 일관성을 검사하십시오.
설계 의도(Design)와 실제 구현(Reality) 사이의 차이점을 찾아내어 보고서를 작성하십시오.

[설계 노트 목록]
${JSON.stringify(notes.filter(n => n.noteType !== 'Reference').map(n => ({ id: n.id, title: n.title, summary: n.summary, content: n.content })))}

[Reference(참고 자료) 목록]
${JSON.stringify(notes.filter(n => n.noteType === 'Reference').map(n => ({ id: n.id, title: n.title, summary: n.summary, content: n.content })))}

[작업 지침]
1. **차이점 분석**: 설계도에는 정의되어 있으나 코드에는 구현되지 않은 기능, 또는 코드에는 구현되어 있으나 설계도에 누락된 기능을 찾으십시오.
2. **불일치 식별**: 설계도와 구현 내용이 서로 상충되는 부분을 찾으십시오.
3. **보고서 작성**: 발견된 문제점들을 한국어로 상세히 기술하십시오.
4. **불일치 노트 추출**: 일관성이 깨진 것으로 판단되는 '설계 노트'의 ID와 불일치 사유, 해결 제안을 추출하십시오.

Return JSON:
{
  "report": "상세 분석 보고서 (Markdown)",
  "inconsistentNotes": [
    {
      "id": "note_id_1",
      "description": "코드에는 A로 구현되어 있으나 설계도에는 B로 되어 있음",
      "suggestion": "설계도를 A로 수정하거나 코드를 B로 수정"
    }
  ]
}
`;

  try {
    const response = await generateContentWithRetry({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            report: { type: Type.STRING },
            inconsistentNotes: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  description: { type: Type.STRING },
                  suggestion: { type: Type.STRING }
                },
                required: ["id", "description", "suggestion"]
              }
            }
          },
          required: ["report", "inconsistentNotes"]
        }
      },
    }, 3, 1000, signal);

    if (signal?.aborted) throw new Error("Operation cancelled");

    const result = safeJsonParse(response.text || "{}", { report: "분석 실패", inconsistentNotes: [] });
    return {
      report: result?.report || "분석 결과가 없습니다.",
      inconsistentNotes: result?.inconsistentNotes || [],
    };
  } catch (err) {
    if (err?.message === "Operation cancelled" || err === "Operation cancelled") throw err;
    console.error('Check consistency failed:', err);
    return {
      report: "일관성 검사 중 오류가 발생했습니다.",
      inconsistentNotes: [],
    };
  }
};
