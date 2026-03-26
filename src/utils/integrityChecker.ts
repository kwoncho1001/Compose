import { Note } from '../types';

/**
 * 노트 데이터의 무결성을 전수 조사하고 복구하는 유틸리티입니다.
 * 
 * 규칙 1 (부모 -> 자식): 부모 A가 자식 B를 갖고 있다면, B의 parentNoteIds에도 A가 있어야 함.
 * 규칙 2 (자식 -> 부모): 자식 B가 부모 A를 갖고 있다면, A의 childNoteIds에도 B가 있어야 함.
 * 규칙 3 (연관 관계): A가 B와 연관되어 있다면, B도 A와 연관되어 있어야 함.
 * 규칙 4 (죽은 링크 제거): 참조하고 있는 ID의 실제 노트가 존재하지 않는 경우 해당 ID 삭제.
 */
export const sanitizeNoteIntegrity = (notes: Note[]): { 
  fixedNotes: Note[], 
  fixCount: number,
  logs: string[]
} => {
  const notesMap = new Map<string, Note>();
  // 깊은 복사를 통해 원본 데이터 보호 (필요한 필드만 복사하거나 전체 복사)
  notes.forEach(note => {
    notesMap.set(note.id, JSON.parse(JSON.stringify(note)));
  });

  let fixCount = 0;
  const logs: string[] = [];

  const changedNoteIds = new Set<string>();

  const addLog = (noteId: string, message: string) => {
    logs.push(`[${new Date().toISOString()}] ${message}`);
    changedNoteIds.add(noteId);
    fixCount++;
  };

  const allNoteIds = Array.from(notesMap.keys());

  notesMap.forEach((note) => {
    // 1. 죽은 링크 제거 (Dead Link Removal)
    const originalParentCount = note.parentNoteIds?.length || 0;
    const filteredParents = (note.parentNoteIds || []).filter(id => notesMap.has(id));
    if (filteredParents.length !== originalParentCount) {
      note.parentNoteIds = filteredParents;
      addLog(note.id, `노트 '${note.title}'(${note.id})에서 존재하지 않는 부모 ID 제거`);
    }

    const originalChildCount = note.childNoteIds?.length || 0;
    const filteredChildren = (note.childNoteIds || []).filter(id => notesMap.has(id));
    if (filteredChildren.length !== originalChildCount) {
      note.childNoteIds = filteredChildren;
      addLog(note.id, `노트 '${note.title}'(${note.id})에서 존재하지 않는 자식 ID 제거`);
    }

    const originalRelatedCount = note.relatedNoteIds?.length || 0;
    const filteredRelated = (note.relatedNoteIds || []).filter(id => notesMap.has(id));
    if (filteredRelated.length !== originalRelatedCount) {
      note.relatedNoteIds = filteredRelated;
      addLog(note.id, `노트 '${note.title}'(${note.id})에서 존재하지 않는 연관 ID 제거`);
    }

    // 2. 부모 -> 자식 역참조 확인 및 복구 (규칙 1)
    note.childNoteIds.forEach(childId => {
      const child = notesMap.get(childId);
      if (child && !(child.parentNoteIds || []).includes(note.id)) {
        child.parentNoteIds = Array.from(new Set([...(child.parentNoteIds || []), note.id]));
        addLog(child.id, `자식 노드 '${child.title}'(${child.id})의 부모 목록에 '${note.title}'(${note.id}) 추가 (역참조 복구)`);
      }
    });

    // 3. 자식 -> 부모 역참조 확인 및 복구 (규칙 2)
    note.parentNoteIds.forEach(parentId => {
      const parent = notesMap.get(parentId);
      if (parent && !(parent.childNoteIds || []).includes(note.id)) {
        parent.childNoteIds = Array.from(new Set([...(parent.childNoteIds || []), note.id]));
        addLog(parent.id, `부모 노드 '${parent.title}'(${parent.id})의 자식 목록에 '${note.title}'(${note.id}) 추가 (역참조 복구)`);
      }
    });

    // 4. 연관 관계 대칭 확인 및 복구 (규칙 3)
    note.relatedNoteIds.forEach(relatedId => {
      const related = notesMap.get(relatedId);
      if (related && !(related.relatedNoteIds || []).includes(note.id)) {
        related.relatedNoteIds = Array.from(new Set([...(related.relatedNoteIds || []), note.id]));
        addLog(related.id, `연관 노드 '${related.title}'(${related.id})의 연관 목록에 '${note.title}'(${note.id}) 추가 (대칭성 복구)`);
      }
    });
  });

  // 중복 ID 제거 (최종 확인)
  notesMap.forEach(note => {
    const pSet = new Set(note.parentNoteIds);
    if (pSet.size !== note.parentNoteIds.length) {
      note.parentNoteIds = Array.from(pSet);
      addLog(note.id, `노트 '${note.title}'의 중복된 부모 ID 제거`);
    }
    
    const cSet = new Set(note.childNoteIds);
    if (cSet.size !== note.childNoteIds.length) {
      note.childNoteIds = Array.from(cSet);
      addLog(note.id, `노트 '${note.title}'의 중복된 자식 ID 제거`);
    }

    const rSet = new Set(note.relatedNoteIds);
    if (rSet.size !== note.relatedNoteIds.length) {
      note.relatedNoteIds = Array.from(rSet);
      addLog(note.id, `노트 '${note.title}'의 중복된 연관 ID 제거`);
    }
  });

  return { 
    fixedNotes: Array.from(changedNoteIds).map(id => notesMap.get(id)!), 
    fixCount,
    logs
  };
};
};
