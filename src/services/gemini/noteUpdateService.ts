import { Type } from "@google/genai";
import { Note, GCM } from "../../types";
import { ai, MODEL_NAME, systemInstruction, noteSchema } from "./config";
import { generateContentWithRetry } from "./core";
import { safeJsonParse } from "./utils";

export const updateSingleNote = async (
  note: Note,
  command: string,
  gcm: GCM,
  allNotes: Note[],
  signal?: AbortSignal
): Promise<{ updatedNote: Note; updatedGcm: GCM; affectedNoteIds: string[] }> => {
  const relevantNotes = allNotes.filter(n => 
    n.id !== note.id && (n.folder === note.folder || n.importance >= 4)
  );

  const prompt = `
Update the specific note based on the user's command.
Also determine if this change affects the Global Context Map (GCM) and identify any other notes that might conflict or need updates due to this change.

[중요] 지시사항:
1. 'content'는 반드시 시스템 지침의 4개 섹션 구조를 따라야 합니다.
2. 'summary'는 기능의 역할을 설명하는 1-2문장의 한국어 요약이어야 합니다.
3. parentNoteIds, relatedNoteIds, tags를 적절히 설정하십시오.

Target Note:
${JSON.stringify(note, null, 2)}

Command: "${command}"

Current GCM:
${JSON.stringify(gcm, null, 2)}

Relevant Other Notes (for impact analysis):
${JSON.stringify(relevantNotes.map(n => ({ id: n.id, title: n.title, folder: n.folder, summary: n.summary })), null, 2)}

Return JSON:
{
  "updatedNote": { ...note with updated content, summary, parentNoteIds, relatedNoteIds, tags, importance },
  "updatedGcm": { ...updated GCM if affected, else current GCM },
  "affectedNoteIds": ["id1", "id2"]
}
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
            updatedNote: noteSchema,
            updatedGcm: {
              type: Type.OBJECT,
              properties: {
                entities: { type: Type.OBJECT },
                variables: { type: Type.OBJECT },
              },
            },
            affectedNoteIds: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ["updatedNote", "updatedGcm", "affectedNoteIds"],
        },
      },
    });
    
    if (signal?.aborted) throw new Error("Operation cancelled");

    const result = safeJsonParse(response.text || "{}");
    return {
      updatedNote: { ...note, ...result.updatedNote },
      updatedGcm: result.updatedGcm || gcm,
      affectedNoteIds: result.affectedNoteIds || [],
    };
  } catch (err) {
    if (err?.message === "Operation cancelled" || err === "Operation cancelled") throw err;
    console.error('Update single note failed:', err);
    return {
      updatedNote: note,
      updatedGcm: gcm,
      affectedNoteIds: [],
    };
  }
};

export const mergeLogicIntoNote = async (
  logicUnit: { title: string; content: string; summary: string; yamlMetadata?: string },
  targetNote: Note,
  signal?: AbortSignal
): Promise<Note> => {
  const prompt = `
당신은 코드 통합 전문가입니다. 기존 설계 노트에 새로운 코드 분석 결과(기능 단위)를 통합하여 노트를 업데이트하십시오.
단순히 덮어쓰는 것이 아니라, 기존의 설계 의도와 새로운 코드의 실제 구현 로직을 조화롭게 합쳐서 **'수직적 깊이'**를 더하십시오.

[기존 노트]
제목: ${targetNote.title}
내용: ${targetNote.content}
메타데이터:
- 중요도: ${targetNote.importance}
- 태그: ${targetNote.tags?.join(', ') || '없음'}

[새로운 코드 분석 결과]
제목: ${logicUnit.title}
내용: ${logicUnit.content}
요약: ${logicUnit.summary}
새 메타데이터:
- 중요도: ${(logicUnit as any).importance || 3}
- 태그: ${((logicUnit as any).tags || []).join(', ')}

[작업 지침]
1. **내용 통합**: 기존 설계의 핵심 개념을 유지하면서, 코드에서 발견된 구체적인 알고리즘과 데이터 흐름을 반영하여 'Technical Specification' 섹션을 보강하십시오. 이 코드가 설계서의 어떤 요구사항을 어떻게 기술적으로 해결했는지(Design Fulfillment)를 명확히 기술하십시오. 단순히 내용을 이어 붙이지 말고, 중복을 제거하고 논리적으로 자연스럽게 융합하십시오.
2. **충돌 처리**: 기존 설계와 실제 코드가 다를 경우, 두 방식을 비교 설명하거나 더 나은 방식을 채택하여 상세히 기술하십시오.
3. **구조 유지**: 업데이트된 'content'는 반드시 시스템 지침의 4개 섹션 구조를 엄격히 따라야 합니다.
4. **요약 업데이트**: 통합된 기능을 잘 나타내도록 'summary'를 갱신하십시오.
5. **메타데이터 병합**: 기존 메타데이터와 새 메타데이터를 병합하십시오. 특히 'githubLink', 'tags', 'childNoteIds' 등의 필드는 유실되지 않도록 반드시 포함하십시오.
6. 모든 텍스트는 한국어로 작성하십시오.

Return JSON:
{
  "content": "통합된 상세 내용 (Markdown)",
  "summary": "통합된 요약 (한국어)",
  "importance": 1~5,
  "tags": ["tag1", "tag2"]
}
`;

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
      systemInstruction,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          content: { type: Type.STRING },
          summary: { type: Type.STRING },
          importance: { type: Type.NUMBER },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } },
        },
        required: ["content", "summary", "importance", "tags"],
      },
    },
  });

  if (signal?.aborted) throw new Error("Operation cancelled");

  const result = safeJsonParse(response.text || "{}");
  return {
    ...targetNote,
    content: result.content || targetNote.content,
    summary: result.summary || targetNote.summary,
    importance: result.importance || targetNote.importance,
    tags: Array.from(new Set([...targetNote.tags, ...(result.tags || [])])),
    status: 'Done',
    lastUpdated: new Date().toISOString()
  };
};
