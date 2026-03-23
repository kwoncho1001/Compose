import { Note } from '../types';

/**
 * 상위 계층이 없는 '고아(Orphan)' 노드를 찾습니다.
 * - Task: 상위 Feature가 반드시 있어야 함
 * - Feature: 상위 Epic이 반드시 있어야 함
 */
export const findOrphanNotes = (notes: Note[]): Note[] => {
  return notes.filter(note => {
    // 1. Task인 경우: 적어도 하나의 Feature 타입 부모가 있는지 확인
    if (note.noteType === 'Task') {
      return !note.parentNoteIds.some(pId => 
        notes.find(n => n.id === pId && n.noteType === 'Feature')
      );
    }
    // 2. Feature인 경우: 적어도 하나의 Epic 타입 부모가 있는지 확인
    if (note.noteType === 'Feature') {
      return !note.parentNoteIds.some(pId => 
        notes.find(n => n.id === pId && n.noteType === 'Epic')
      );
    }
    return false;
  });
};
