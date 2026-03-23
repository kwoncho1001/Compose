import { Note } from '../types';

/**
 * 양방향 역참조(Mirroring)를 처리하는 순수 함수 모음입니다.
 * 상태 업데이트 시 이 함수들을 사용하여 변경이 필요한 모든 노트를 계산합니다.
 */

export const syncNoteRelationships = (
  updatedNote: Note,
  allNotes: Note[]
): Note[] => {
  const oldNote = allNotes.find(n => n.id === updatedNote.id);
  if (!oldNote) return [updatedNote];

  const affectedNotesMap = new Map<string, Note>();
  affectedNotesMap.set(updatedNote.id, updatedNote);

  // 1. 부모-자식 관계 동기화 (Hierarchy)
  syncHierarchy(oldNote, updatedNote, allNotes, affectedNotesMap);

  // 2. 연관 관계 동기화 (Peer-to-Peer)
  syncRelated(oldNote, updatedNote, allNotes, affectedNotesMap);

  return Array.from(affectedNotesMap.values());
};

/**
 * 버전 번호를 0.0.1씩 증가시킵니다. (예: 1.0.0 -> 1.0.1)
 */
export const incrementVersion = (version: string): string => {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return '1.0.1';
  parts[2] += 1;
  return parts.join('.');
};

const syncHierarchy = (
  oldNote: Note,
  newNote: Note,
  allNotes: Note[],
  affectedNotes: Map<string, Note>
) => {
  // Case A: parentNoteIds 변경
  const addedParents = newNote.parentNoteIds.filter(id => !oldNote.parentNoteIds.includes(id));
  const removedParents = oldNote.parentNoteIds.filter(id => !newNote.parentNoteIds.includes(id));

  addedParents.forEach(pId => {
    const parent = affectedNotes.get(pId) || allNotes.find(n => n.id === pId);
    if (parent && !parent.childNoteIds.includes(newNote.id)) {
      const updatedParent = {
        ...parent,
        childNoteIds: Array.from(new Set([...parent.childNoteIds, newNote.id]))
      };
      affectedNotes.set(updatedParent.id, updatedParent);
    }
  });

  removedParents.forEach(pId => {
    const parent = affectedNotes.get(pId) || allNotes.find(n => n.id === pId);
    if (parent && parent.childNoteIds.includes(newNote.id)) {
      const updatedParent = {
        ...parent,
        childNoteIds: parent.childNoteIds.filter(id => id !== newNote.id)
      };
      affectedNotes.set(updatedParent.id, updatedParent);
    }
  });

  // Case B: childNoteIds 변경
  const addedChildren = newNote.childNoteIds.filter(id => !oldNote.childNoteIds.includes(id));
  const removedChildren = oldNote.childNoteIds.filter(id => !newNote.childNoteIds.includes(id));

  addedChildren.forEach(childId => {
    const child = affectedNotes.get(childId) || allNotes.find(n => n.id === childId);
    if (child && !child.parentNoteIds.includes(newNote.id)) {
      affectedNotes.set(childId, { 
        ...child, 
        parentNoteIds: Array.from(new Set([...child.parentNoteIds, newNote.id])) 
      });
    }
  });

  removedChildren.forEach(childId => {
    const child = affectedNotes.get(childId) || allNotes.find(n => n.id === childId);
    if (child && child.parentNoteIds.includes(newNote.id)) {
      affectedNotes.set(childId, { 
        ...child, 
        parentNoteIds: child.parentNoteIds.filter(id => id !== newNote.id) 
      });
    }
  });
};

const syncRelated = (
  oldNote: Note,
  newNote: Note,
  allNotes: Note[],
  affectedNotes: Map<string, Note>
) => {
  const addedRelated = newNote.relatedNoteIds.filter(id => !oldNote.relatedNoteIds.includes(id));
  const removedRelated = oldNote.relatedNoteIds.filter(id => !newNote.relatedNoteIds.includes(id));

  addedRelated.forEach(relId => {
    const relNote = affectedNotes.get(relId) || allNotes.find(n => n.id === relId);
    if (relNote && !relNote.relatedNoteIds.includes(newNote.id)) {
      affectedNotes.set(relId, {
        ...relNote,
        relatedNoteIds: Array.from(new Set([...relNote.relatedNoteIds, newNote.id]))
      });
    }
  });

  removedRelated.forEach(relId => {
    const relNote = affectedNotes.get(relId) || allNotes.find(n => n.id === relId);
    if (relNote && relNote.relatedNoteIds.includes(newNote.id)) {
      affectedNotes.set(relId, {
        ...relNote,
        relatedNoteIds: relNote.relatedNoteIds.filter(id => id !== newNote.id)
      });
    }
  });
};

export const cleanupNoteRelationships = (
  deletedNoteId: string,
  allNotes: Note[]
): Note[] => {
  const affectedNotesMap = new Map<string, Note>();

  allNotes.forEach(note => {
    let changed = false;
    let updatedNote = { ...note };

    // 1. 부모 관계 정리
    if (updatedNote.parentNoteIds.includes(deletedNoteId)) {
      updatedNote.parentNoteIds = updatedNote.parentNoteIds.filter(id => id !== deletedNoteId);
      changed = true;
    }

    // 2. 자식 관계 정리
    if (updatedNote.childNoteIds.includes(deletedNoteId)) {
      updatedNote.childNoteIds = updatedNote.childNoteIds.filter(id => id !== deletedNoteId);
      changed = true;
    }

    // 3. 연관 관계 정리
    if (updatedNote.relatedNoteIds.includes(deletedNoteId)) {
      updatedNote.relatedNoteIds = updatedNote.relatedNoteIds.filter(id => id !== deletedNoteId);
      changed = true;
    }

    if (changed) {
      affectedNotesMap.set(updatedNote.id, updatedNote);
    }
  });

  return Array.from(affectedNotesMap.values());
};
