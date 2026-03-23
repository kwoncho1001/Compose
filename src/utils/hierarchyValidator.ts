import { Note } from '../types';

/**
 * 상위 계층이 없는 '고아(Orphan)' 노드를 찾습니다.
 * - Task: 상위 Feature가 반드시 있어야 함
 * - Feature: 상위 Epic이 반드시 있어야 함
 */
export const findOrphanNotes = (notes: Note[]): Note[] => {
  return notes.filter(note => {
    // 1. Task인 경우: 상위 Feature가 반드시 있어야 함
    if (note.noteType === 'Task') {
      const parent = notes.find(n => n.id === note.parentNoteId);
      return !parent || parent.noteType !== 'Feature';
    }
    // 2. Feature인 경우: 상위 Epic이 반드시 있어야 함
    if (note.noteType === 'Feature') {
      const parent = notes.find(n => n.id === note.parentNoteId);
      return !parent || parent.noteType !== 'Epic';
    }
    return false;
  });
};
