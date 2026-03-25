import { Note } from '../types';

/**
 * Checks if adding a new parent to a note would create a circular reference.
 * @param noteId The ID of the note being updated.
 * @param newParentId The ID of the potential new parent.
 * @param allNotes All notes in the system.
 * @returns true if a cycle would be created, false otherwise.
 */
export const wouldCreateCycle = (noteId: string, newParentId: string, allNotes: Note[]): boolean => {
  if (noteId === newParentId) return true;

  const notesMap = new Map(allNotes.map(n => [n.id, n]));
  const visited = new Set<string>();

  const check = (currentId: string): boolean => {
    if (currentId === noteId) return true; // Found the original note in the ancestry
    if (visited.has(currentId)) return false;

    visited.add(currentId);
    const note = notesMap.get(currentId);
    if (!note || !note.parentNoteIds) return false;

    // Check all parents of the current node recursively
    return note.parentNoteIds.some(pId => check(pId));
  };

  return check(newParentId);
};

/**
 * 타입 기반 부모 허용 여부 체크
 * Epic > Feature > Task > Reference 계층 구조를 강제합니다.
 */
export const isValidRelationship = (parentId: string, childId: string, allNotes: Note[]): boolean => {
  const parent = allNotes.find(n => n.id === parentId);
  const child = allNotes.find(n => n.id === childId);

  if (!parent || !child) return false;

  // Epic은 어떤 부모도 가질 수 없음
  if (child.noteType === 'Epic') return false;

  // Epic의 자식은 반드시 Feature이어야 함
  if (parent.noteType === 'Epic' && child.noteType !== 'Feature') return false;

  // Feature의 부모는 반드시 Epic이어야 함
  if (child.noteType === 'Feature' && parent.noteType !== 'Epic') return false;

  // Feature의 자식은 Task 또는 Reference이어야 함
  if (parent.noteType === 'Feature' && (child.noteType !== 'Task' && child.noteType !== 'Reference')) return false;

  // Task의 부모는 반드시 Feature이어야 함
  if (child.noteType === 'Task' && parent.noteType !== 'Feature') return false;

  // Task의 자식은 반드시 Reference이어야 함
  if (parent.noteType === 'Task' && child.noteType !== 'Reference') return false;

  // Reference의 부모는 Feature 또는 Task 또는 Reference이어야 함
  if (child.noteType === 'Reference' && (parent.noteType !== 'Feature' && parent.noteType !== 'Task' && parent.noteType !== 'Reference')) return false;

  return true;
};

/**
 * "불완전한 노드(Incomplete)" 또는 "규칙 위반 노드" 탐색
 * 사용자 정의 엄격한 규칙:
 * 1. Epic: 오직 Feature만 자식으로 가질 수 있음.
 * 2. Feature: 오직 Task 또는 Reference만 자식으로 가질 수 있음.
 * 3. Task: 오직 Reference만 자식으로 가질 수 있음.
 * 4. 공통: Epic이 아닌 모든 노드는 반드시 적절한 상위 부모가 있어야 함 (고아 금지).
 */
export const findInvalidHierarchyNotes = (allNotes: Note[]): Note[] => {
  return allNotes.filter(note => {
    // 1. 고아 체크 (Epic 제외)
    if (note.noteType !== 'Epic') {
      const hasParent = note.parentNoteIds && note.parentNoteIds.length > 0;
      if (!hasParent) return true;

      // 적절한 타입의 부모가 하나라도 있는지 체크
      const hasValidParent = (note.parentNoteIds || []).some(pid => {
        return isValidRelationship(pid, note.id, allNotes);
      });
      if (!hasValidParent) return true;
    }

    // 2. 자식 타입 체크
    if (note.childNoteIds && note.childNoteIds.length > 0) {
      const hasInvalidChild = note.childNoteIds.some(cid => {
        return !isValidRelationship(note.id, cid, allNotes);
      });
      if (hasInvalidChild) return true;
    }

    // 3. Epic이 부모를 가지는 경우
    if (note.noteType === 'Epic' && note.parentNoteIds && note.parentNoteIds.length > 0) {
      return true;
    }

    return false;
  });
};

/**
 * Finds notes that have no parents.
 */
export const findOrphanNotes = (allNotes: Note[]): Note[] => {
  return allNotes.filter(n => !n.parentNoteIds || n.parentNoteIds.length === 0);
};
/**
 * Gets all descendants of a note.
 */
export const getAllDescendants = (noteId: string, allNotes: Note[]): string[] => {
  const descendants: string[] = [];
  const queue = [noteId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const children = allNotes.filter(n => (n.parentNoteIds || []).includes(currentId));
    children.forEach(child => {
      if (!visited.has(child.id)) {
        descendants.push(child.id);
        queue.push(child.id);
      }
    });
  }

  return descendants;
};

/**
 * 계층 구조 정상화 (Sibling Promotion)
 * Feature로 승격되었는데 부모도 Feature인 경우, 부모의 부모(Epic)에게 직접 붙입니다.
 */
export const normalizeHierarchy = (promotedNote: Note, allNotes: Note[]): Note[] => {
  const touchedNotes: Note[] = [];
  
  // 1. Feature로 승격되었는데 부모도 Feature인 경우 (규칙 위반)
  if (promotedNote.noteType === 'Feature') {
    const parentIds = [...(promotedNote.parentNoteIds || [])];
    let hierarchyChanged = false;

    parentIds.forEach(parentId => {
      const parentNote = allNotes.find(n => n.id === parentId);
      if (parentNote && parentNote.noteType === 'Feature') {
        // 2. 부모 Feature의 부모(Epic)를 찾음
        const grandParentEpic = allNotes.find(n => 
          (parentNote.parentNoteIds || []).includes(n.id) && n.noteType === 'Epic'
        );

        if (grandParentEpic) {
          // 3. 재배치: 부모의 부모(Epic)에게 직접 붙임
          promotedNote.parentNoteIds = (promotedNote.parentNoteIds || []).filter(id => id !== parentId);
          promotedNote.parentNoteIds.push(grandParentEpic.id);
          
          // 4. 기존 부모와의 관계는 '연관됨'으로 유지
          promotedNote.relatedNoteIds = Array.from(new Set([...(promotedNote.relatedNoteIds || []), parentId]));
          
          hierarchyChanged = true;
        } else {
          // 만약 조부모 Epic이 없다면? 이 Feature는 최상위 Feature로서 독립시킴 (부모 연결 해제)
          promotedNote.parentNoteIds = (promotedNote.parentNoteIds || []).filter(id => id !== parentId);
          hierarchyChanged = true;
        }
      }
    });

    if (hierarchyChanged) {
      touchedNotes.push(promotedNote);
    }
  }
  
  return touchedNotes;
};
