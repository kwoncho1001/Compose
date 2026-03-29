import { useEffect, useCallback, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, collection, onSnapshot, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { Note, AppState, NoteType, SyncEntry, SyncRegistry } from '../types';
import { syncNoteRelationships, cleanupNoteRelationships } from '../utils/noteMirroring';
import { sanitizeNoteIntegrity } from '../utils/integrityChecker';
import { wouldCreateCycle, normalizeHierarchy } from '../utils/hierarchyValidator';
import { generateNoteFingerprint } from '../utils/crypto';
import { getSyncRegistry, getNote, saveNoteWithRegistry, deleteNotesWithRegistry, saveNotesBatchWithRegistry } from '../services/syncService';
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
  const syncQueueRef = useRef<Record<string, Note>>({});
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- [단계 2: 비교 및 최적화 판단] ---
  // 초기화 단계: Registry만 읽어와서 로컬 맵 구성 (Lazy Loading 전략)
  useEffect(() => {
    if (!userId || !currentProjectId) return;

    const loadRegistry = async () => {
      setIsInitialLoading(true);
      const registry = await getSyncRegistry(userId, currentProjectId);
      
      if (registry) {
        // Registry 정보를 바탕으로 "뼈대" 노트 목록 생성
        const skeletonNotes: Note[] = Object.values(registry.entries).map(entry => ({
          id: entry.id,
          title: entry.title,
          folder: entry.folder,
          status: entry.status,
          priority: entry.priority,
          noteType: entry.noteType,
          lastUpdated: entry.lastUpdated,
          sha: entry.sha,
          content: '', // 실제 내용은 나중에 로딩 (Lazy Loading)
          summary: '',
          version: '1.0.0',
          importance: 3,
          tags: [],
          parentNoteIds: [],
          childNoteIds: [],
          relatedNoteIds: []
        }));

        skeletonNotes.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        
        setState(prev => ({ 
          ...prev, 
          notes: skeletonNotes,
          syncRegistry: registry 
        }));
      }
      setIsInitialLoading(false);
    };

    loadRegistry();

    // Registry 실시간 감시 (다른 기기에서의 변경 감지용)
    const registryRef = doc(db, 'users', userId, 'projects', currentProjectId, 'sync', 'sync_index');
    const unsubscribeRegistry = onSnapshot(registryRef, (docSnap) => {
      if (docSnap.exists()) {
        const newRegistry = docSnap.data() as SyncRegistry;
        setState(prev => {
          // 서버 Registry와 로컬 상태 비교
          const updatedNotes = [...prev.notes];
          let hasChanges = false;

          Object.values(newRegistry.entries).forEach(entry => {
            const localNote = updatedNotes.find(n => n.id === entry.id);
            if (!localNote || localNote.sha !== entry.sha) {
              // 서버가 더 최신이거나 새로운 노트인 경우
              if (!localNote) {
                updatedNotes.push({
                  ...entry,
                  content: '',
                  summary: '',
                  version: '1.0.0',
                  importance: 3,
                  tags: [],
                  parentNoteIds: [],
                  childNoteIds: [],
                  relatedNoteIds: []
                } as Note);
              } else {
                // 기존 노트의 메타데이터 업데이트 (내용은 나중에 fetch)
                const idx = updatedNotes.findIndex(n => n.id === entry.id);
                updatedNotes[idx] = {
                  ...updatedNotes[idx],
                  ...entry,
                  // SHA가 다르면 내용을 비워서 다시 로드하게 함 (혹은 서버에서 가져옴)
                  content: localNote.sha !== entry.sha ? '' : localNote.content
                };
              }
              hasChanges = true;
            }
          });

          // 삭제된 노트 처리
          const serverIds = new Set(Object.keys(newRegistry.entries));
          const filteredNotes = updatedNotes.filter(n => serverIds.has(n.id));
          if (filteredNotes.length !== updatedNotes.length) hasChanges = true;

          if (hasChanges) {
            filteredNotes.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
            return { ...prev, notes: filteredNotes, syncRegistry: newRegistry };
          }
          return prev;
        });
      }
    });

    return () => {
      unsubscribeRegistry();
    };
  }, [userId, currentProjectId, setState, setIsInitialLoading]);

  // --- [지연 로딩(Lazy Loading) 구현] ---
  // 사용자가 노트를 선택했을 때 내용이 없으면 Firestore에서 가져옴
  useEffect(() => {
    if (!userId || !currentProjectId || !selectedNoteId) return;

    const currentNote = state.notes.find(n => n.id === selectedNoteId);
    if (currentNote && !currentNote.content && currentNote.sha) {
      const fetchFullNote = async () => {
        setProcessStatus({ message: '노트 내용을 불러오는 중...' });
        const fullNote = await getNote(userId, currentProjectId, selectedNoteId);
        if (fullNote) {
          setState(prev => ({
            ...prev,
            notes: prev.notes.map(n => n.id === selectedNoteId ? fullNote : n)
          }));
        }
        setProcessStatus(null);
      };
      fetchFullNote();
    }
  }, [selectedNoteId, userId, currentProjectId]);

  // --- [단계 3: 데이터 백업(쓰기) 및 디바운싱] ---
  const performSync = useCallback(async () => {
    if (!userId || !currentProjectId || Object.keys(syncQueueRef.current).length === 0) return;

    const notesToSync = Object.values(syncQueueRef.current);
    syncQueueRef.current = {};
    
    setProcessStatus({ message: '변경 사항 동기화 중...' });

    const entries: Record<string, SyncEntry> = { ...state.syncRegistry.entries };
    
    for (const note of notesToSync) {
      const sha = await generateNoteFingerprint(note);
      const entry: SyncEntry = {
        id: note.id,
        sha,
        lastUpdated: note.lastUpdated,
        title: note.title,
        folder: note.folder,
        status: note.status,
        priority: note.priority,
        noteType: note.noteType
      };
      entries[note.id] = entry;
      note.sha = sha;
    }

    await saveNotesBatchWithRegistry(userId, currentProjectId, notesToSync, entries, cleanObject);
    
    setState(prev => ({
      ...prev,
      notes: prev.notes.map(n => {
        const syncedNote = notesToSync.find(sn => sn.id === n.id);
        return syncedNote ? { ...n, sha: syncedNote.sha } : n;
      }),
      syncRegistry: {
        ...prev.syncRegistry,
        entries
      }
    }));

    setProcessStatus(null);
  }, [userId, currentProjectId, state.syncRegistry, cleanObject, setState, setProcessStatus]);

  const queueSync = useCallback((note: Note) => {
    syncQueueRef.current[note.id] = note;
    if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    syncTimeoutRef.current = setTimeout(performSync, 5000); // 5초 디바운싱
  }, [performSync]);

  const syncNote = async (note: Note) => {
    queueSync(note);
  };

  const deleteNoteFromFirestore = async (noteId: string) => {
    if (!userId || !currentProjectId) return;
    const newRegistry = { ...state.syncRegistry };
    delete newRegistry.entries[noteId];
    await deleteNotesWithRegistry(userId, currentProjectId, [noteId], newRegistry);
  };

  const saveNotesToFirestore = async (notes: Note[]) => {
    if (!userId || !currentProjectId) return;
    
    const entries = { ...state.syncRegistry.entries };
    for (const note of notes) {
      const sha = await generateNoteFingerprint(note);
      note.sha = sha;
      entries[note.id] = {
        id: note.id,
        sha,
        lastUpdated: note.lastUpdated,
        title: note.title,
        folder: note.folder,
        status: note.status,
        priority: note.priority,
        noteType: note.noteType
      };
    }

    await saveNotesBatchWithRegistry(userId, currentProjectId, notes, entries, cleanObject);
    
    setState(prev => ({
      ...prev,
      notes: prev.notes.map(n => {
        const savedNote = notes.find(sn => sn.id === n.id);
        return savedNote ? { ...n, sha: savedNote.sha } : n;
      }),
      syncRegistry: {
        ...prev.syncRegistry,
        entries
      }
    }));
  };

  const deleteNotesFromFirestore = async (noteIds: string[]) => {
    if (!userId || !currentProjectId) return;
    const newRegistry = { ...state.syncRegistry };
    await deleteNotesWithRegistry(userId, currentProjectId, noteIds, newRegistry);
  };

  const handleUpdateNote = async (updatedNote: Note) => {
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
    
    // SHA 갱신 및 동기화 큐 등록
    for (const note of affectedNotes) {
      note.lastUpdated = new Date().toISOString();
      note.sha = await generateNoteFingerprint(note);
      queueSync(note);
    }
    
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

  const handleAddNote = async () => {
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
    await handleUpdateNote(newNote);
    setSelectedNoteId(newNote.id);
  };

  const handleAddChildNote = async (parentId: string) => {
    const parentNote = state.notes.find(n => n.id === parentId);
    if (!parentNote) return;

    let childNoteType: NoteType = 'Task';
    let updatedParent: Note | null = null;
    
    if (parentNote.noteType === 'Task') {
      // 1. 부모가 Task인데 자식이 생기려 한다면, 부모를 Feature로 승격
      updatedParent = { ...parentNote, noteType: 'Feature' };
      childNoteType = 'Task';
    } else if (parentNote.noteType === 'Epic') {
      childNoteType = 'Feature';
    } else if (parentNote.noteType === 'Feature') {
      childNoteType = 'Task';
    }

    const newNoteId = Math.random().toString(36).substr(2, 9);
    const newNote: Note = {
      id: newNoteId,
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

    let notesToUpdate = [newNote];
    if (updatedParent) {
      // 승격된 부모의 계층 정상화 (Sibling Promotion)
      const hierarchyFixes = normalizeHierarchy(updatedParent, state.notes);
      notesToUpdate = [...notesToUpdate, updatedParent, ...hierarchyFixes.filter(f => f.id !== updatedParent!.id)];
    }

    await saveNotesToFirestore(notesToUpdate);
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
    const notesToDelete = state.notes.filter(n => {
      const nFolder = n.folder || '미분류';
      return nFolder === folderPath || nFolder.startsWith(`${folderPath}/`);
    });
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

      await saveNotesToFirestore([updatedNote, ...state.notes.filter(n => affectedNoteIds.includes(n.id)).map(n => ({
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

  const handleRefreshNotes = async () => {
    if (!userId || !currentProjectId) return;
    setIsInitialLoading(true);
    const registry = await getSyncRegistry(userId, currentProjectId);
    if (registry) {
      setState(prev => ({ ...prev, syncRegistry: registry }));
    }
    setIsInitialLoading(false);
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
    handleTextFileUpload,
    handleRefreshNotes
  };
};
