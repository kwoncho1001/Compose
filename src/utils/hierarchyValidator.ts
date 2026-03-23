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
 * Epic > Feature > Task 계층 구조를 강제합니다.
 */
export const isValidRelationship = (parentId: string, childId: string, allNotes: Note[]): boolean => {
  const parent = allNotes.find(n => n.id === parentId);
  const child = allNotes.find(n => n.id === childId);

  if (!parent || !child) return false;

  // Epic은 어떤 부모도 가질 수 없음
  if (child.noteType === 'Epic') return false;

  // Feature의 부모는 반드시 Epic이어야 함
  if (child.noteType === 'Feature' && parent.noteType !== 'Epic') return false;

  // Task의 부모는 반드시 Feature이어야 함
  if (child.noteType === 'Task' && parent.noteType !== 'Feature') return false;

  // Reference는 자유로운 편이지만, Feature/Task의 자식이 될 수는 있음 (반대는 X)
  if (parent.noteType === 'Reference' && (child.noteType === 'Feature' || child.noteType === 'Task')) return false;

  return true;
};

/**
 * "불완전한 노드(Incomplete)" 또는 "규칙 위반 노드" 탐색
 */
export const findInvalidHierarchyNotes = (allNotes: Note[]): Note[] => {
  return allNotes.filter(note => {
    if (note.noteType === 'Epic') {
      // Epic인데 부모가 있거나 자식(Feature)이 없는 경우
      const hasParent = note.parentNoteIds && note.parentNoteIds.length > 0;
      const hasFeatureChild = (note.childNoteIds || []).some(cid => {
        const child = allNotes.find(n => n.id === cid);
        return child?.noteType === 'Feature';
      });
      return hasParent || !hasFeatureChild;
    }
    if (note.noteType === 'Feature') {
      // Feature인데 부모(Epic)가 없거나 자식(Task)이 없는 경우
      const hasEpicParent = (note.parentNoteIds || []).some(pid => {
        const p = allNotes.find(n => n.id === pid);
        return p?.noteType === 'Epic';
      });
      const hasTaskChild = (note.childNoteIds || []).some(cid => {
        const child = allNotes.find(n => n.id === cid);
        return child?.noteType === 'Task';
      });
      return !hasEpicParent || !hasTaskChild;
    }
    if (note.noteType === 'Task') {
      // Task인데 부모(Feature)가 없는 경우
      const hasFeatureParent = (note.parentNoteIds || []).some(pid => {
        const p = allNotes.find(n => n.id === pid);
        return p?.noteType === 'Feature';
      });
      return !hasFeatureParent;
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

    const children = allNotes.filter(n => n.parentNoteIds?.includes(currentId));
    children.forEach(child => {
      if (!visited.has(child.id)) {
        descendants.push(child.id);
        queue.push(child.id);
      }
    });
  }

  return descendants;
};
