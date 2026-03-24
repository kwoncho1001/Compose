import { Note } from "../../types";

/**
 * AI가 반환한 텍스트에서 JSON 블록을 안전하게 추출하고 파싱합니다.
 * 잘린 JSON(Truncated JSON)에 대한 기본적인 복구 시도를 포함합니다.
 */
export const safeJsonParse = (text: string, fallback: any = null): any => {
  if (!text || typeof text !== 'string') return fallback;

  const tryParse = (jsonStr: string) => {
    try {
      return JSON.parse(jsonStr);
    } catch (e) {
      // 잘린 JSON 복구 시도 (닫히지 않은 객체/배열 닫기)
      let repaired = jsonStr.trim();
      const stack: string[] = [];
      for (let i = 0; i < repaired.length; i++) {
        const char = repaired[i];
        if (char === '{') stack.push('}');
        else if (char === '[') stack.push(']');
        else if (char === '}' || char === ']') {
          if (stack.length > 0 && stack[stack.length - 1] === char) {
            stack.pop();
          }
        }
      }
      
      // 스택에 남은 닫는 괄호들을 역순으로 추가
      while (stack.length > 0) {
        repaired += stack.pop();
      }

      try {
        return JSON.parse(repaired);
      } catch (innerError) {
        return null;
      }
    }
  };

  // 1. 순수 JSON 파싱 시도
  const directResult = tryParse(text);
  if (directResult !== null) return directResult;

  // 2. Markdown 코드 블록 내 JSON 추출 시도
  const jsonMatch = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  if (jsonMatch) {
    const matchedResult = tryParse(jsonMatch[0]);
    if (matchedResult !== null) return matchedResult;
  }

  // 3. 최후의 수단: 가장 큰 중괄호/대괄호 범위 찾기 (정규식 실패 대비)
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  const startIdx = (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) ? firstBrace : firstBracket;

  if (startIdx !== -1) {
    const lastBrace = text.lastIndexOf('}');
    const lastBracket = text.lastIndexOf(']');
    const endIdx = Math.max(lastBrace, lastBracket);
    
    if (endIdx > startIdx) {
      const subResult = tryParse(text.substring(startIdx, endIdx + 1));
      if (subResult !== null) return subResult;
    } else {
      // 시작은 있는데 끝이 없는 경우 (완전 잘림)
      const subResult = tryParse(text.substring(startIdx));
      if (subResult !== null) return subResult;
    }
  }

  console.error("Failed to parse JSON even with repair attempts. Text length:", text.length);
  return fallback;
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
