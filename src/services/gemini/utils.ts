import { Note } from "../../types";

/**
 * AI가 반환한 텍스트에서 JSON 블록을 안전하게 추출하고 파싱합니다.
 */
export const safeJsonParse = (text: string): any => {
  try {
    // 1. 순수 JSON 파싱 시도
    return JSON.parse(text);
  } catch (e) {
    // 2. Markdown 코드 블록 내 JSON 추출 시도
    const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (innerError) {
        console.error("Failed to parse extracted JSON:", innerError);
        return null;
      }
    }
    console.error("No JSON found in text:", text);
    return null;
  }
};

/**
 * AI가 생성한 노트들의 데이터 무결성을 검사하고 보정합니다.
 */
export const sanitizeNotes = (newNotes: any[], existingNotes: Note[]): Note[] => {
  const existingIds = new Set(existingNotes.map(n => n.id));
  
  return newNotes.map((note, index) => {
    const id = note.id || `note-${Date.now()}-${index}`;
    
    return {
      id,
      title: note.title || "Untitled Note",
      summary: note.summary || "",
      version: note.version || "1.0.0",
      lastUpdated: new Date().toISOString(),
      folder: note.folder || "Uncategorized",
      status: note.status || "Planned",
      priority: note.priority || "C",
      importance: note.importance || 3,
      noteType: note.noteType || "Task",
      parentNoteIds: Array.isArray(note.parentNoteIds) ? note.parentNoteIds : [],
      childNoteIds: Array.isArray(note.childNoteIds) ? note.childNoteIds : [],
      relatedNoteIds: Array.isArray(note.relatedNoteIds) ? note.relatedNoteIds : [],
      tags: Array.isArray(note.tags) ? note.tags : [],
      content: note.content || "",
      ...note // AI가 생성한 추가 필드 보존
    } as Note;
  });
};
