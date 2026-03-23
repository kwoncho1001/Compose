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
  // Case A: parentNoteId 변경
  if (oldNote.parentNoteId !== newNote.parentNoteId) {
    // 이전 부모에서 제거
    if (oldNote.parentNoteId) {
      const oldParent = affectedNotes.get(oldNote.parentNoteId) || allNotes.find(n => n.id === oldNote.parentNoteId);
      if (oldParent) {
        const updatedOldParent = {
          ...oldParent,
          childNoteIds: oldParent.childNoteIds.filter(id => id !== newNote.id)
        };
        affectedNotes.set(updatedOldParent.id, updatedOldParent);
      }
    }
    // 새 부모에 추가
    if (newNote.parentNoteId) {
      const newParent = affectedNotes.get(newNote.parentNoteId) || allNotes.find(n => n.id === newNote.parentNoteId);
      if (newParent) {
        const updatedNewParent = {
          ...newParent,
          childNoteIds: Array.from(new Set([...newParent.childNoteIds, newNote.id]))
        };
        affectedNotes.set(updatedNewParent.id, updatedNewParent);
      }
    }
  }

  // Case B: childNoteIds 변경
  const addedChildren = newNote.childNoteIds.filter(id => !oldNote.childNoteIds.includes(id));
  const removedChildren = oldNote.childNoteIds.filter(id => !newNote.childNoteIds.includes(id));

  addedChildren.forEach(childId => {
    const child = affectedNotes.get(childId) || allNotes.find(n => n.id === childId);
    if (child && child.parentNoteId !== newNote.id) {
      // 자식의 이전 부모에서 자식 제거 (재귀적 처리는 복잡하므로 여기서는 단순 할당)
      if (child.parentNoteId) {
        const prevParent = affectedNotes.get(child.parentNoteId) || allNotes.find(n => n.id === child.parentNoteId);
        if (prevParent && prevParent.id !== newNote.id) {
          affectedNotes.set(prevParent.id, {
            ...prevParent,
            childNoteIds: prevParent.childNoteIds.filter(id => id !== childId)
          });
        }
      }
      affectedNotes.set(childId, { ...child, parentNoteId: newNote.id });
    }
  });

  removedChildren.forEach(childId => {
    const child = affectedNotes.get(childId) || allNotes.find(n => n.id === childId);
    if (child && child.parentNoteId === newNote.id) {
      affectedNotes.set(childId, { ...child, parentNoteId: undefined });
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
    if (updatedNote.parentNoteId === deletedNoteId) {
      updatedNote.parentNoteId = undefined;
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
