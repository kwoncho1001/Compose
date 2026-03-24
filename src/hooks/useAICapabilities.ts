import { useState } from 'react';
import { AppState, Note } from '../types';
import { 
  decomposeFeature, 
  optimizeBlueprint, 
  checkConsistency, 
  suggestNextSteps, 
  generateSubModules,
  suggestOrCreateParentsBatch
} from '../services/gemini';
import { findOrphanNotes } from '../utils/hierarchyValidator';

export const useAICapabilities = (
  state: AppState,
  setState: React.Dispatch<React.SetStateAction<AppState>>,
  saveNotesToFirestore: (notes: Note[]) => Promise<void>,
  syncProject: (updates: Partial<AppState>) => Promise<void>,
  setProcessStatus: (status: { message: string; current?: number; total?: number } | null) => void,
  abortControllerRef: React.MutableRefObject<AbortController | null>
) => {
  const [isSyncing, setIsSyncing] = useState(false);

  const handleDecompose = async (featureRequest: string) => {
    if (!featureRequest.trim()) return;
    setIsSyncing(true);
    setProcessStatus({ message: '요구사항을 분석하고 노트를 생성하는 중...' });
    abortControllerRef.current = new AbortController();
    
    try {
      const { newNotes, updatedNotes, updatedGcm } = await decomposeFeature(
        featureRequest, 
        state.gcm, 
        state.notes, 
        { repoName: state.githubRepo, files: [] },
        abortControllerRef.current.signal
      );
      
      if (abortControllerRef.current.signal.aborted) return;

      const newNotesList = [...state.notes.filter(n => !updatedNotes.find(un => un.id === n.id)), ...updatedNotes, ...newNotes];
      
      setState(prev => ({ ...prev, notes: newNotesList, gcm: updatedGcm }));
      await syncProject({ gcm: updatedGcm });
      await saveNotesToFirestore([...updatedNotes, ...newNotes]);
      
    } catch (e: any) {
      if (e?.message === "Operation cancelled" || e === "Operation cancelled") return;
      console.error('Decompose failed:', e);
      alert('분해 중 오류가 발생했습니다: ' + e.message);
    } finally {
      setIsSyncing(false);
      setProcessStatus(null);
      abortControllerRef.current = null;
    }
  };

  const handleOptimize = async () => {
    setIsSyncing(true);
    setProcessStatus({ message: '설계도를 최적화하는 중...' });
    abortControllerRef.current = new AbortController();
    
    try {
      const { updatedNotes, deletedNoteIds, updatedGcm, report } = await optimizeBlueprint(state.notes, state.gcm, abortControllerRef.current.signal);
      
      if (abortControllerRef.current.signal.aborted) return;

      const newNotesList = state.notes
        .filter(n => !deletedNoteIds.includes(n.id))
        .map(n => updatedNotes.find(un => un.id === n.id) || n);
      
      setState(prev => ({ ...prev, notes: newNotesList, gcm: updatedGcm }));
      await syncProject({ gcm: updatedGcm });
      await saveNotesToFirestore(updatedNotes);
      // deleteNotesFromFirestore(deletedNoteIds) should be called here, but we'll handle it in the component or pass it down
      alert(report);
    } catch (e: any) {
      if (e?.message === "Operation cancelled" || e === "Operation cancelled") return;
      console.error('Optimize failed:', e);
      alert('최적화 중 오류가 발생했습니다: ' + e.message);
    } finally {
      setIsSyncing(false);
      setProcessStatus(null);
      abortControllerRef.current = null;
    }
  };

  const handleConsistencyCheck = async () => {
    setIsSyncing(true);
    setProcessStatus({ message: '설계와 구현의 일관성을 검사하는 중...' });
    abortControllerRef.current = new AbortController();
    
    try {
      const { report, inconsistentNotes } = await checkConsistency(state.notes, state.gcm, abortControllerRef.current.signal);
      if (abortControllerRef.current.signal.aborted) return;
      alert(report);
    } catch (e: any) {
      if (e?.message === "Operation cancelled" || e === "Operation cancelled") return;
      console.error('Consistency check failed:', e);
      alert('일관성 검사 중 오류가 발생했습니다: ' + e.message);
    } finally {
      setIsSyncing(false);
      setProcessStatus(null);
      abortControllerRef.current = null;
    }
  };

  const handleSuggestNextSteps = async () => {
    setIsSyncing(true);
    setProcessStatus({ message: '다음 작업 단계를 제안받는 중...' });
    abortControllerRef.current = new AbortController();
    
    try {
      const { suggestion, updatedStatuses } = await suggestNextSteps(state.notes, state.gcm, abortControllerRef.current.signal);
      if (abortControllerRef.current.signal.aborted) return;
      
      if (Object.keys(updatedStatuses).length > 0) {
        const updatedNotes = state.notes.map(n => updatedStatuses[n.id] ? { ...n, status: updatedStatuses[n.id] } : n);
        setState(prev => ({ ...prev, notes: updatedNotes }));
        await saveNotesToFirestore(updatedNotes.filter(n => updatedStatuses[n.id]));
      }
      alert(suggestion);
    } catch (e: any) {
      if (e?.message === "Operation cancelled" || e === "Operation cancelled") return;
      console.error('Suggest next steps failed:', e);
      alert('다음 단계 제안 중 오류가 발생했습니다: ' + e.message);
    } finally {
      setIsSyncing(false);
      setProcessStatus(null);
      abortControllerRef.current = null;
    }
  };

  const handleGenerateSubModules = async (noteId: string) => {
    const note = state.notes.find(n => n.id === noteId);
    if (!note) return;
    
    setIsSyncing(true);
    setProcessStatus({ message: `'${note.title}'의 하위 모듈을 설계하는 중...` });
    abortControllerRef.current = new AbortController();
    
    try {
      const { newNotes, updatedGcm } = await generateSubModules(note, state.gcm, state.notes, undefined, abortControllerRef.current.signal);
      if (abortControllerRef.current.signal.aborted) return;

      const finalNewNotes = newNotes.map(n => ({
        ...n,
        id: Math.random().toString(36).substr(2, 9),
        status: 'Planned' as const
      }));
      
      const updatedParent = {
        ...note,
        childNoteIds: [...(note.childNoteIds || []), ...finalNewNotes.map(n => n.id)]
      };

      const newNotesList = state.notes.map(n => n.id === note.id ? updatedParent : n).concat(finalNewNotes);
      
      setState(prev => ({ ...prev, notes: newNotesList, gcm: updatedGcm }));
      await syncProject({ gcm: updatedGcm });
      await saveNotesToFirestore([updatedParent, ...finalNewNotes]);
      
    } catch (e: any) {
      if (e?.message === "Operation cancelled" || e === "Operation cancelled") return;
      console.error('Generate sub-modules failed:', e);
      alert('하위 모듈 설계 중 오류가 발생했습니다: ' + e.message);
    } finally {
      setIsSyncing(false);
      setProcessStatus(null);
      abortControllerRef.current = null;
    }
  };

  const handleAutoFixHierarchy = async () => {
    const orphans = findOrphanNotes(state.notes);
    if (orphans.length === 0) {
      alert('모든 노트가 올바른 계층 구조를 가지고 있습니다.');
      return;
    }

    setIsSyncing(true);
    setProcessStatus({ message: `고립된 노트 ${orphans.length}개의 부모를 찾는 중...` });
    abortControllerRef.current = new AbortController();

    try {
      const { results } = await suggestOrCreateParentsBatch(orphans, state.notes, abortControllerRef.current.signal);
      if (abortControllerRef.current.signal.aborted) return;

      let currentNotes = [...state.notes];
      const touchedNotes: Note[] = [];

      for (const res of results) {
        const orphanIndex = currentNotes.findIndex(n => n.id === res.orphanNoteId);
        if (orphanIndex === -1) continue;
        const orphan = currentNotes[orphanIndex];

        if (res.action === 'match' && res.parentId) {
          const parentIndex = currentNotes.findIndex(n => n.id === res.parentId);
          if (parentIndex !== -1) {
            const parent = currentNotes[parentIndex];
            const updatedOrphan = { ...orphan, parentNoteIds: [...(orphan.parentNoteIds || []), parent.id] };
            const updatedParent = { ...parent, childNoteIds: [...(parent.childNoteIds || []), orphan.id] };
            currentNotes[orphanIndex] = updatedOrphan;
            currentNotes[parentIndex] = updatedParent;
            touchedNotes.push(updatedOrphan, updatedParent);
          }
        } else if (res.action === 'create' && res.newNote) {
          const newParentId = Math.random().toString(36).substr(2, 9);
          const newParent: Note = {
            ...res.newNote,
            id: newParentId,
            childNoteIds: [orphan.id],
            parentNoteIds: [],
            noteType: res.newNote.noteType as any || (orphan.noteType === 'Task' ? 'Feature' : 'Epic'),
            status: 'Planned',
            version: '1.0.0',
            lastUpdated: new Date().toISOString(),
            title: res.newNote.title || 'Untitled Parent',
            folder: res.newNote.folder || orphan.folder,
            content: res.newNote.content || '',
            summary: res.newNote.summary || '',
            importance: res.newNote.importance || 3,
            tags: res.newNote.tags || [],
            relatedNoteIds: res.newNote.relatedNoteIds || []
          };
          const updatedOrphan = { ...orphan, parentNoteIds: [...(orphan.parentNoteIds || []), newParentId] };
          currentNotes[orphanIndex] = updatedOrphan;
          currentNotes.push(newParent);
          touchedNotes.push(updatedOrphan, newParent);
        }
      }

      setState(prev => ({ ...prev, notes: currentNotes }));
      if (touchedNotes.length > 0) {
        await saveNotesToFirestore(touchedNotes);
      }
      alert(`계층 구조 복구가 완료되었습니다. (${touchedNotes.length / 2}개 연결됨)`);
    } catch (e: any) {
      if (e?.message === "Operation cancelled" || e === "Operation cancelled") return;
      console.error('Hierarchy fix failed:', e);
      alert('계층 구조 복구 중 오류가 발생했습니다: ' + e.message);
    } finally {
      setIsSyncing(false);
      setProcessStatus(null);
      abortControllerRef.current = null;
    }
  };

  return {
    isSyncing,
    setIsSyncing,
    handleDecompose,
    handleOptimize,
    handleConsistencyCheck,
    handleSuggestNextSteps,
    handleGenerateSubModules,
    handleAutoFixHierarchy
  };
};
