import { useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, collection, onSnapshot, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { Note, AppState, NoteType } from '../types';
import { syncNoteRelationships, cleanupNoteRelationships } from '../utils/noteMirroring';
import { sanitizeNoteIntegrity } from '../utils/integrityChecker';
import { wouldCreateCycle } from '../utils/hierarchyValidator';

import { updateSingleNote } from '../services/gemini';

export const useNoteSync = (
  userId: string | undefined,
  currentProjectId: string,
  state: AppState,
  setState: React.Dispatch<React.SetStateAction<AppState>>,
  setIsInitialLoading: React.Dispatch<React.SetStateAction<boolean>>,
  cleanObject: (obj: any) => any,
  setDialogConfig: any,
  setProcessStatus: any,
  showAlert: any,
  selectedNoteId: string | null,
  setSelectedNoteId: React.Dispatch<React.SetStateAction<string | null>>,
  syncProject: (updates: Partial<AppState>) => Promise<void>,
  abortControllerRef: React.MutableRefObject<AbortController | null>
) => {

  useEffect(() => {
    if (!userId || !currentProjectId) return;

    const notesRef = collection(db, 'users', userId, 'projects', currentProjectId, 'notes');

    const unsubscribeNotes = onSnapshot(notesRef, (querySnap) => {
      const notesList: Note[] = [];
      querySnap.forEach((doc) => {
        notesList.push(doc.data() as Note);
      });
      
      notesList.sort((a, b) => (a.title || "").localeCompare(b.title || ""));

      setState(prev => ({ ...prev, notes: notesList }));
      setIsInitialLoading(false);
    }, (e) => handleFirestoreError(e, OperationType.GET, notesRef.path));

    return () => {
      unsubscribeNotes();
    };
  }, [userId, currentProjectId, setState, setIsInitialLoading]);

  const syncNote = async (note: Note) => {
    if (!userId || !currentProjectId) return;
    const noteRef = doc(db, 'users', userId, 'projects', currentProjectId, 'notes', note.id);
    try {
      await setDoc(noteRef, cleanObject(note));
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, noteRef.path);
    }
  };

  const deleteNoteFromFirestore = async (noteId: string) => {
    if (!userId || !currentProjectId) return;
    const noteRef = doc(db, 'users', userId, 'projects', currentProjectId, 'notes', noteId);
    try {
      await deleteDoc(noteRef);
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, noteRef.path);
    }
  };

  const saveNotesToFirestore = async (notes: Note[]) => {
    if (!userId || !currentProjectId) return;
    
    const chunkSize = 500;
    for (let i = 0; i < notes.length; i += chunkSize) {
      const chunk = notes.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach(note => {
        const noteRef = doc(db, 'users', userId, 'projects', currentProjectId, 'notes', note.id);
        batch.set(noteRef, cleanObject(note));
      });
      try {
        await batch.commit();
      } catch (e) {
        handleFirestoreError(e, OperationType.WRITE, 'batch-notes');
      }
    }
  };

  const deleteNotesFromFirestore = async (noteIds: string[]) => {
    if (!userId || !currentProjectId) return;
    
    const chunkSize = 500;
    for (let i = 0; i < noteIds.length; i += chunkSize) {
      const chunk = noteIds.slice(i, i + chunkSize);
      const batch = writeBatch(db);
      chunk.forEach(id => {
        const noteRef = doc(db, 'users', userId, 'projects', currentProjectId, 'notes', id);
        batch.delete(noteRef);
      });
      try {
        await batch.commit();
      } catch (e) {
        handleFirestoreError(e, OperationType.DELETE, 'batch-notes');
      }
    }
  };

  const handleUpdateNote = (updatedNote: Note) => {
    const oldNote = state.notes.find(n => n.id === updatedNote.id);
    if (oldNote) {
      const newParents = (updatedNote.parentNoteIds || []).filter(id => !(oldNote.parentNoteIds || []).includes(id));
      for (const pId of newParents) {
        if (wouldCreateCycle(updatedNote.id, pId, state.notes)) {
          setDialogConfig({
            isOpen: true,
            title: '순환 참조 발견',
            message: `"${updatedNote.title}"를 부모로 설정하면 순환 참조가 발생합니다. 계층 구조를 다시 확인하십시오.`,
            type: 'error',
            confirmText: '확인',
            onConfirm: () => setDialogConfig(null)
          });
          return;
        }
      }
    }

    const affectedNotes = syncNoteRelationships(updatedNote, state.notes);
    saveNotesToFirestore(affectedNotes);
    
    setState(prev => {
      const newNotes = [...prev.notes];
      affectedNotes.forEach(an => {
        const idx = newNotes.findIndex(n => n.id === an.id);
        if (idx !== -1) {
          newNotes[idx] = an;
        } else {
          newNotes.push(an);
        }
      });
      return { ...prev, notes: newNotes };
    });
  };

  const handleAddNote = () => {
    const newNote: Note = {
      id: Math.random().toString(36).substr(2, 9),
      title: '새 노트',
      folder: '미분류',
      content: '# 새 노트\n여기에 기능을 설명하세요.',
      summary: '새로운 기능 설명',
      status: 'Planned',
      priority: 'C',
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      importance: 3,
      tags: [],
      childNoteIds: [],
      relatedNoteIds: [],
      parentNoteIds: [],
      noteType: 'Feature'
    };
    handleUpdateNote(newNote);
    setSelectedNoteId(newNote.id);
  };

  const handleAddChildNote = (parentId: string) => {
    const parentNote = state.notes.find(n => n.id === parentId);
    if (!parentNote) return;

    let childNoteType: NoteType = 'Task';
    
    if (parentNote.noteType === 'Task') {
      // 1. 부모가 Task인데 자식이 생기려 한다면, 부모를 Feature로 승격
      handleUpdateNote({ ...parentNote, noteType: 'Feature' });
      childNoteType = 'Task';
    } else if (parentNote.noteType === 'Epic') {
      childNoteType = 'Feature';
    } else if (parentNote.noteType === 'Feature') {
      childNoteType = 'Task';
    }

    const newNote: Note = {
      id: Math.random().toString(36).substr(2, 9),
      title: '새 하위 노트',
      folder: parentNote.folder,
      content: '# 새 하위 노트\n여기에 세부 기능을 설명하세요.',
      summary: '세부 기능 설명',
      status: 'Planned',
      priority: 'C',
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      importance: 3,
      tags: [],
      childNoteIds: [],
      relatedNoteIds: [],
      parentNoteIds: [parentId],
      noteType: childNoteType
    };
    handleUpdateNote(newNote);
    setSelectedNoteId(newNote.id);
  };

  const handleDeleteNote = (noteId: string) => {
    const targetNote = state.notes.find(n => n.id === noteId);
    if (!targetNote) return;

    setDialogConfig({
      isOpen: true,
      title: '노트 삭제',
      message: `"${targetNote.title}" 노트를 삭제하시겠습니까?\n이 노트를 부모로 가진 하위 노트들은 부모 연결이 해제됩니다.`,
      type: 'warning',
      confirmText: '삭제',
      cancelText: '취소',
      onConfirm: () => {
        const affectedNotes = cleanupNoteRelationships(noteId, state.notes);
        
        const orphans = affectedNotes.filter(n => {
          const oldNote = state.notes.find(old => old.id === n.id);
          return (oldNote?.parentNoteIds || []).includes(noteId) && n.parentNoteIds.length === 0;
        });

        const executeDelete = async (deleteOrphans: boolean = false) => {
          const finalAffectedNotes = [...affectedNotes];
          const notesToDelete = [noteId];
          
          if (deleteOrphans) {
            orphans.forEach(o => notesToDelete.push(o.id));
          }

          if (finalAffectedNotes.length > 0) {
            saveNotesToFirestore(finalAffectedNotes.filter(n => !notesToDelete.includes(n.id)));
          }
          
          await deleteNotesFromFirestore(notesToDelete);

          setState(prev => {
            const notesMap = new Map(prev.notes.map(n => [n.id, n]));
            finalAffectedNotes.forEach(an => notesMap.set(an.id, an));
            const filteredNotes = Array.from(notesMap.values()).filter(n => !notesToDelete.includes(n.id));
            
            return {
              ...prev,
              notes: filteredNotes
            };
          });

          if (notesToDelete.includes(selectedNoteId || '')) {
            setSelectedNoteId(null);
          }
          setDialogConfig(null);
        };

        if (orphans.length > 0) {
          setDialogConfig({
            isOpen: true,
            title: '고아 노드 처리',
            message: `"${targetNote.title}"를 삭제하면 다음 노드들의 부모가 없어집니다:\n${orphans.map(o => `• ${o.title}`).join('\n')}\n\n이 하위 노드들도 함께 삭제하시겠습니까?`,
            type: 'warning',
            confirmText: '모두 삭제',
            cancelText: '부모 연결만 해제',
            onConfirm: () => executeDelete(true),
            onCancel: () => executeDelete(false)
          });
        } else {
          executeDelete(false);
        }
      },
      onCancel: () => setDialogConfig(null)
    });
  };

  const handleDeleteFolder = (folderPath: string) => {
    const notesToDelete = state.notes.filter(n => n.folder === folderPath || n.folder.startsWith(`${folderPath}/`));
    if (notesToDelete.length === 0) return;
    
    setDialogConfig({
      isOpen: true,
      title: '폴더 삭제',
      message: `'${folderPath}' 폴더와 그 안의 하위 노트 ${notesToDelete.length}개를 모두 삭제하시겠습니까?\n이 작업은 복구할 수 없습니다.`,
      type: 'warning',
      confirmText: '일괄 삭제',
      cancelText: '취소',
      onConfirm: async () => {
        const ids = notesToDelete.map(n => n.id);
        const idsSet = new Set(ids);
        
        const remainingNotes = state.notes.filter(n => !idsSet.has(n.id));
        const affectedNotesMap = new Map<string, Note>();
        
        remainingNotes.forEach(note => {
          let changed = false;
          let updatedNote = { ...note };
          
          if ((updatedNote.parentNoteIds || []).some(id => idsSet.has(id))) {
            updatedNote.parentNoteIds = updatedNote.parentNoteIds.filter(id => !idsSet.has(id));
            changed = true;
          }
          if ((updatedNote.childNoteIds || []).some(id => idsSet.has(id))) {
            updatedNote.childNoteIds = updatedNote.childNoteIds.filter(id => !idsSet.has(id));
            changed = true;
          }
          if ((updatedNote.relatedNoteIds || []).some(id => idsSet.has(id))) {
            updatedNote.relatedNoteIds = updatedNote.relatedNoteIds.filter(id => !idsSet.has(id));
            changed = true;
          }
          
          if (changed) {
            affectedNotesMap.set(updatedNote.id, updatedNote);
          }
        });
        
        const finalAffectedNotes = Array.from(affectedNotesMap.values());
        if (finalAffectedNotes.length > 0) {
          saveNotesToFirestore(finalAffectedNotes);
        }
        
        await deleteNotesFromFirestore(ids);
        
        setState(prev => ({
          ...prev,
          notes: prev.notes.filter(n => !idsSet.has(n.id)).map(n => affectedNotesMap.has(n.id) ? affectedNotesMap.get(n.id)! : n)
        }));
        
        if (selectedNoteId && idsSet.has(selectedNoteId)) setSelectedNoteId(null);
        setDialogConfig(null);
      },
      onCancel: () => setDialogConfig(null)
    });
  };

  const handleDeleteMultiple = (noteIds: string[]) => {
    setDialogConfig({
      isOpen: true,
      title: '노트 일괄 삭제',
      message: `선택한 노트 ${noteIds.length}개를 모두 삭제하시겠습니까?\n이 작업은 복구할 수 없습니다.`,
      type: 'warning',
      confirmText: '일괄 삭제',
      cancelText: '취소',
      onConfirm: async () => {
        const idsSet = new Set(noteIds);
        const remainingNotes = state.notes.filter(n => !idsSet.has(n.id));
        const affectedNotesMap = new Map<string, Note>();
        
        remainingNotes.forEach(note => {
          let changed = false;
          let updatedNote = { ...note };
          
          if ((updatedNote.parentNoteIds || []).some(id => idsSet.has(id))) {
            updatedNote.parentNoteIds = updatedNote.parentNoteIds.filter(id => !idsSet.has(id));
            changed = true;
          }
          if ((updatedNote.childNoteIds || []).some(id => idsSet.has(id))) {
            updatedNote.childNoteIds = updatedNote.childNoteIds.filter(id => !idsSet.has(id));
            changed = true;
          }
          if ((updatedNote.relatedNoteIds || []).some(id => idsSet.has(id))) {
            updatedNote.relatedNoteIds = updatedNote.relatedNoteIds.filter(id => !idsSet.has(id));
            changed = true;
          }
          
          if (changed) {
            affectedNotesMap.set(updatedNote.id, updatedNote);
          }
        });
        
        const finalAffectedNotes = Array.from(affectedNotesMap.values());
        if (finalAffectedNotes.length > 0) {
          saveNotesToFirestore(finalAffectedNotes);
        }
        
        await deleteNotesFromFirestore(noteIds);
        
        setState(prev => ({
          ...prev,
          notes: prev.notes.filter(n => !idsSet.has(n.id)).map(n => affectedNotesMap.has(n.id) ? affectedNotesMap.get(n.id)! : n)
        }));
        
        if (selectedNoteId && idsSet.has(selectedNoteId)) setSelectedNoteId(null);
        setDialogConfig(null);
      },
      onCancel: () => setDialogConfig(null)
    });
  };

  const handleSanitizeIntegrity = async (silent = false) => {
    if (state.notes.length === 0 || !userId || !currentProjectId) return;

    const { fixedNotes, fixCount, logs } = sanitizeNoteIntegrity(state.notes);

    if (fixCount > 0) {
      if (!silent) {
        setProcessStatus({ message: `데이터 무결성 복구 중 (${fixCount}건)...` });
      }
      
      try {
        const batch = writeBatch(db);
        fixedNotes.forEach(note => {
          const noteRef = doc(db, 'users', userId, 'projects', currentProjectId, 'notes', note.id);
          batch.set(noteRef, cleanObject(note));
        });
        await batch.commit();
        
        logs.forEach(log => console.log(`[IntegrityFix] ${log}`));

        if (!silent) {
          showAlert('성공', `데이터 무결성 복구가 완료되었습니다. (${fixCount}건 수정)`, 'success');
        }
      } catch (e) {
        if (!silent) {
          handleFirestoreError(e, OperationType.WRITE, 'integrity-check');
        }
      } finally {
        if (!silent) {
          setProcessStatus(null);
        }
      }
    } else {
      if (!silent) {
        showAlert('알림', '데이터 무결성에 이상이 없습니다.', 'info');
      }
    }
  };

  const handleTargetedUpdate = async (noteId: string, command: string) => {
    const targetNote = state.notes.find(n => n.id === noteId);
    if (!targetNote) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    try {
      const { updatedNote, updatedGcm, affectedNoteIds } = await updateSingleNote(
        targetNote,
        command,
        state.gcm,
        state.notes,
        signal
      );

      if (signal.aborted) return;

      saveNotesToFirestore([updatedNote, ...state.notes.filter(n => affectedNoteIds.includes(n.id)).map(n => ({
        ...n,
        consistencyConflict: {
          description: `이 노트는 "${updatedNote.title}"의 최근 변경 사항에 영향을 받을 수 있습니다.`,
          suggestion: "업데이트된 GCM 및 로직과 일치하는지 이 노트를 검토하십시오."
        }
      }))]);
      syncProject({ gcm: updatedGcm });

      setState(prev => ({
        ...prev,
        gcm: updatedGcm,
        notes: prev.notes.map(n => {
          if (n.id === noteId) return updatedNote;
          if (affectedNoteIds.includes(n.id)) {
            return {
              ...n,
              consistencyConflict: {
                description: `이 노트는 "${updatedNote.title}"의 최근 변경 사항에 영향을 받을 수 있습니다.`,
                suggestion: "업데이트된 GCM 및 로직과 일치하는지 이 노트를 검토하십시오."
              }
            };
          }
          return n;
        })
      }));
    } catch (error) {
      if ((error as any)?.message === "Operation cancelled" || error === "Operation cancelled") {
        console.log('Targeted update cancelled');
      } else {
        console.error('Failed to update note:', error);
        showAlert('오류', '노트 업데이트에 실패했습니다.', 'error');
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
    }
  };

  const handleTextFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, textFileInputRef: React.RefObject<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newNotes: Note[] = [];

    for (const file of files) {
      try {
        const content = await file.text();
        const title = file.name.replace(/\.[^/.]+$/, ""); // Remove extension
        
        const newNote: Note = {
          id: Math.random().toString(36).substr(2, 9),
          title: title,
          folder: '미분류',
          content: content,
          summary: `파일에서 가져옴: ${file.name}`,
          status: 'Planned',
          priority: 'C',
          version: '1.0.0',
          lastUpdated: new Date().toISOString(),
          importance: 3,
          tags: ['imported'],
          noteType: 'Task',
          relatedNoteIds: [],
          childNoteIds: [],
          parentNoteIds: []
        };
        newNotes.push(newNote);
      } catch (err) {
        console.error(`Failed to read file ${file.name}`, err);
      }
    }

    if (newNotes.length > 0) {
      saveNotesToFirestore(newNotes);
      setState(prev => ({
        ...prev,
        notes: [...prev.notes, ...newNotes]
      }));
      setSelectedNoteId(newNotes[0].id);
      showAlert('가져오기 성공', `${newNotes.length}개의 노트를 성공적으로 불러왔습니다.`, 'success');
    }

    if (textFileInputRef.current) textFileInputRef.current.value = '';
  };

  return {
    syncNote,
    deleteNoteFromFirestore,
    saveNotesToFirestore,
    deleteNotesFromFirestore,
    handleUpdateNote,
    handleDeleteNote,
    handleDeleteFolder,
    handleDeleteMultiple,
    handleSanitizeIntegrity,
    handleTargetedUpdate,
    handleAddNote,
    handleAddChildNote,
    handleTextFileUpload
  };
};
