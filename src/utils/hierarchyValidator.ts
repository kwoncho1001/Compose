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
