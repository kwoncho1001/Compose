import { useEffect, useRef, useCallback, useState } from 'react';
import { db, handleFirestoreError, OperationType, getDocsWithCacheFallback, getDocWithCacheFallback } from '../firebase';
import { doc, collection, setDoc, deleteDoc, writeBatch, getDoc, onSnapshot } from 'firebase/firestore';
import { Note, AppState, NoteType, NoteMetadata } from '../types';
import { syncNoteRelationships, cleanupNoteRelationships } from '../utils/noteMirroring';
import { sanitizeNoteIntegrity } from '../utils/integrityChecker';
import { wouldCreateCycle, normalizeHierarchy } from '../utils/hierarchyValidator';
import { generateNoteSHA } from '../utils/sha';

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
  const isRemoteUpdate = useRef(false);
  const isFetched = useRef(false);
  const integrityCheckTimeout = useRef<NodeJS.Timeout | null>(null);
  const dirtyNotesRef = useRef<Map<string, Note>>(new Map());
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const fetchNotes = useCallback(async () => {
    if (!userId || !currentProjectId) return;
    
    setIsInitialLoading(true);
    const metadataRef = doc(db, 'users', userId, 'projects', currentProjectId, 'metadata', 'all');
    
    try {
      // 1. 메타데이터 먼저 가져오기 (1회 읽기)
      const metaSnap = await getDocWithCacheFallback(metadataRef);
      if (metaSnap.exists()) {
        const metadata = (metaSnap.data() as { notes: NoteMetadata[] }).notes || [];
        setState(prev => ({ ...prev, noteMetadata: metadata }));
      } else {
        // 메타데이터가 없으면 전체 노트를 읽어서 메타데이터 생성 (초기 1회)
        const notesRef = collection(db, 'users', userId, 'projects', currentProjectId, 'notes');
        const querySnap = await getDocsWithCacheFallback(notesRef);
        const notesList: Note[] = [];
        querySnap.forEach((doc) => {
          notesList.push(doc.data() as Note);
        });
        
        const notesWithSha = await Promise.all(notesList.map(async n => {
          const sha = await generateNoteSHA(n);
          return { ...n, sha };
        }));

        const metadata: NoteMetadata[] = notesWithSha.map(n => ({
          id: n.id,
          title: n.title,
          folder: n.folder,
          noteType: n.noteType,
          parentNoteIds: n.parentNoteIds || [],
          childNoteIds: n.childNoteIds || [],
          relatedNoteIds: n.relatedNoteIds || [],
          lastUpdated: n.lastUpdated,
          status: n.status,
          priority: n.priority,
          consistencyConflict: n.consistencyConflict,
          sha: n.sha
        }));
        
        await setDoc(metadataRef, { notes: metadata });
        setState(prev => ({ ...prev, notes: notesWithSha, noteMetadata: metadata }));
      }
      isFetched.current = true;
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, metadataRef.path);
    } finally {
      setIsInitialLoading(false);
    }

    // Set up real-time listener for metadata/all
    const unsubscribe = onSnapshot(metadataRef, (docSnap) => {
      if (docSnap.exists()) {
        const metadata = (docSnap.data() as { notes: NoteMetadata[] }).notes || [];
        setState(prev => {
          // Only update if there are changes to avoid unnecessary re-renders
          const prevShaMap = new Map(prev.noteMetadata.map(m => [m.id, m.sha]));
          const newShaMap = new Map(metadata.map(m => [m.id, m.sha]));
          
          let hasChanges = false;
          if (prev.noteMetadata.length !== metadata.length) {
            hasChanges = true;
          } else {
            for (const m of metadata) {
              if (prevShaMap.get(m.id) !== m.sha) {
                hasChanges = true;
                break;
              }
            }
          }
          
          if (hasChanges) {
            // Clean up deleted notes from state.notes
            const updatedNotes = prev.notes.filter(n => newShaMap.has(n.id));
            return { ...prev, notes: updatedNotes, noteMetadata: metadata };
          }
          return prev;
        });
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, metadataRef.path);
    });

    return unsubscribe;
  }, [userId, currentProjectId, setState, setIsInitialLoading]);

  const fetchNoteContent = useCallback(async (noteId: string) => {
    if (!userId || !currentProjectId || !noteId) return;
    
    // 이미 본문이 로드되어 있는지 확인하고, 메타데이터의 SHA와 일치하는지 확인
    const existingNote = state.notes.find(n => n.id === noteId);
    const metadataSha = state.noteMetadata.find(m => m.id === noteId)?.sha;
    
    // 로컬에 노트가 있고, SHA가 일치하면 (또는 메타데이터에 SHA가 없으면) 다시 가져오지 않음
    if (existingNote && existingNote.content && (!metadataSha || existingNote.sha === metadataSha)) {
      return;
    }

    // If the note is currently being edited locally, don't overwrite it with remote changes
    if (dirtyNotesRef.current.has(noteId)) {
      return;
    }

    const noteRef = doc(db, 'users', userId, 'projects', currentProjectId, 'notes', noteId);
    try {
      const docSnap = await getDocWithCacheFallback(noteRef);
      if (docSnap.exists()) {
        const fullNote = docSnap.data() as Note;
        const sha = await generateNoteSHA(fullNote);
        const noteWithSha = { ...fullNote, sha };
        
        setState(prev => {
          const newNotes = [...prev.notes];
          const idx = newNotes.findIndex(n => n.id === noteId);
          if (idx !== -1) {
            newNotes[idx] = noteWithSha;
          } else {
            newNotes.push(noteWithSha);
          }
          return { ...prev, notes: newNotes };
        });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, noteRef.path);
    }
  }, [userId, currentProjectId, state.notes, state.noteMetadata, setState]);

  useEffect(() => {
    if (selectedNoteId) {
      fetchNoteContent(selectedNoteId);
    }
  }, [selectedNoteId, fetchNoteContent]);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    
    if (userId && currentProjectId) {
      fetchNotes().then(unsub => {
        unsubscribe = unsub;
      });
    }
    
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [userId, currentProjectId, fetchNotes]);

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

  const performSync = async () => {
    if (!userId || !currentProjectId || dirtyNotesRef.current.size === 0) return;

    const notesToSync = Array.from(dirtyNotesRef.current.values());
    dirtyNotesRef.current.clear();

    try {
      const notesWithSha = await Promise.all(notesToSync.map(async note => {
        const sha = await generateNoteSHA(note);
        return { ...note, sha };
      }));

      const metadataRef = doc(db, 'users', userId, 'projects', currentProjectId, 'metadata', 'all');
      const metadataSnap = await getDocWithCacheFallback(metadataRef);
      let existingMetadata: NoteMetadata[] = [];
      if (metadataSnap.exists()) {
        existingMetadata = metadataSnap.data().notes || [];
      }

      const existingShaMap = new Map(existingMetadata.map(m => [m.id, m.sha]));

      const notesToUpload = notesWithSha.filter(note => {
        const existingSha = existingShaMap.get(note.id);
        return existingSha !== note.sha;
      });

      if (notesToUpload.length > 0) {
        const chunkSize = 500;
        for (let i = 0; i < notesToUpload.length; i += chunkSize) {
          const chunk = notesToUpload.slice(i, i + chunkSize);
          const batch = writeBatch(db);
          chunk.forEach(note => {
            const noteRef = doc(db, 'users', userId, 'projects', currentProjectId, 'notes', note.id);
            batch.set(noteRef, cleanObject(note));
          });
          await batch.commit();
        }
      }

      // Update metadata/all with new SHAs, merging with existing metadata from Firestore
      const mergedMetadataMap = new Map<string, NoteMetadata>();
      existingMetadata.forEach(m => mergedMetadataMap.set(m.id, m));
      
      notesWithSha.forEach(n => {
        mergedMetadataMap.set(n.id, {
          id: n.id,
          title: n.title,
          folder: n.folder,
          noteType: n.noteType,
          parentNoteIds: n.parentNoteIds || [],
          childNoteIds: n.childNoteIds || [],
          relatedNoteIds: n.relatedNoteIds || [],
          lastUpdated: n.lastUpdated,
          status: n.status,
          priority: n.priority,
          consistencyConflict: n.consistencyConflict,
          sha: n.sha
        });
      });
      
      const mergedMetadata = Array.from(mergedMetadataMap.values());
      
      setDoc(metadataRef, { notes: mergedMetadata }).catch(e => console.error('Metadata update failed', e));

      setState(prev => {
        const updatedNotes = prev.notes.filter(n => mergedMetadataMap.has(n.id));
        notesWithSha.forEach(n => {
          const idx = updatedNotes.findIndex(un => un.id === n.id);
          if (idx !== -1) updatedNotes[idx] = n;
          else updatedNotes.push(n);
        });
        
        return { ...prev, notes: updatedNotes, noteMetadata: mergedMetadata };
      });

    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, 'sync-notes');
      notesToSync.forEach(note => {
        if (!dirtyNotesRef.current.has(note.id)) {
          dirtyNotesRef.current.set(note.id, note);
        }
      });
    }
  };

  const saveNotesToFirestore = async (notes: Note[], immediate = false) => {
    if (!userId || !currentProjectId) return;
    
    setState(prev => {
      const updatedNotes = [...prev.notes];
      notes.forEach(n => {
        const idx = updatedNotes.findIndex(un => un.id === n.id);
        if (idx !== -1) updatedNotes[idx] = n;
        else updatedNotes.push(n);
      });
      
      const updatedMetadata = [...prev.noteMetadata];
      notes.forEach(n => {
        const idx = updatedMetadata.findIndex(m => m.id === n.id);
        const newMeta: NoteMetadata = {
          id: n.id,
          title: n.title,
          folder: n.folder,
          noteType: n.noteType,
          parentNoteIds: n.parentNoteIds || [],
          childNoteIds: n.childNoteIds || [],
          relatedNoteIds: n.relatedNoteIds || [],
          lastUpdated: n.lastUpdated,
          status: n.status,
          priority: n.priority,
          consistencyConflict: n.consistencyConflict,
          sha: prev.noteMetadata?.find(m => m.id === n.id)?.sha
        };
        if (idx !== -1) updatedMetadata[idx] = newMeta;
        else updatedMetadata.push(newMeta);
      });
      
      return { ...prev, notes: updatedNotes, noteMetadata: updatedMetadata };
    });

    notes.forEach(note => {
      dirtyNotesRef.current.set(note.id, note);
    });

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    if (immediate) {
      await performSync();
    } else {
      syncTimeoutRef.current = setTimeout(() => {
        performSync();
      }, 5000);
    }
  };

  const deleteNotesFromFirestore = async (noteIds: string[]) => {
    if (!userId || !currentProjectId) return;
    
    // Optimistic Update: Update local state immediately
    setState(prev => {
      const updatedNotes = prev.notes.filter(n => !noteIds.includes(n.id));
      const updatedMetadata = prev.noteMetadata.filter(m => !noteIds.includes(m.id));
      return { ...prev, notes: updatedNotes, noteMetadata: updatedMetadata };
    });

    // Remove from dirty notes if pending
    noteIds.forEach(id => dirtyNotesRef.current.delete(id));

    // Update metadata/all in Firestore
    const metadataRef = doc(db, 'users', userId, 'projects', currentProjectId, 'metadata', 'all');
    try {
      const metaSnap = await getDocWithCacheFallback(metadataRef);
      if (metaSnap.exists()) {
        const existingMetadata = (metaSnap.data() as { notes: NoteMetadata[] }).notes || [];
        const updatedMetadata = existingMetadata.filter(m => !noteIds.includes(m.id));
        await setDoc(metadataRef, { notes: updatedMetadata });
      }
    } catch (e) {
      console.error('Metadata update failed during deletion', e);
    }

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

  const handleUpdateNote = async (updatedNote: Note) => {
    const oldMeta = state.noteMetadata.find(n => n.id === updatedNote.id);
    if (oldMeta) {
      const newParents = (updatedNote.parentNoteIds || []).filter(id => !(oldMeta.parentNoteIds || []).includes(id));
      for (const pId of newParents) {
        if (wouldCreateCycle(updatedNote.id, pId, state.noteMetadata)) {
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

    const updatedMeta: NoteMetadata = {
      id: updatedNote.id,
      title: updatedNote.title,
      folder: updatedNote.folder,
      noteType: updatedNote.noteType,
      parentNoteIds: updatedNote.parentNoteIds || [],
      childNoteIds: updatedNote.childNoteIds || [],
      relatedNoteIds: updatedNote.relatedNoteIds || [],
      lastUpdated: updatedNote.lastUpdated,
      status: updatedNote.status,
      priority: updatedNote.priority,
      consistencyConflict: updatedNote.consistencyConflict,
      sha: updatedNote.sha
    };

    const affectedMetadata = syncNoteRelationships(updatedMeta, state.noteMetadata);
    
    const fullNotesToSave: Note[] = [updatedNote]; // The updated note is always saved
    
    for (const meta of affectedMetadata) {
      if (meta.id === updatedNote.id) continue; // Already added
      
      let fullNote = state.notes.find(n => n.id === meta.id);
      if (!fullNote) {
        const noteRef = doc(db, 'users', userId!, 'projects', currentProjectId!, 'notes', meta.id);
        const docSnap = await getDocWithCacheFallback(noteRef);
        if (docSnap.exists()) {
          fullNote = docSnap.data() as Note;
        }
      }
      if (fullNote) {
        fullNotesToSave.push({
          ...fullNote,
          parentNoteIds: meta.parentNoteIds || [],
          childNoteIds: meta.childNoteIds || [],
          relatedNoteIds: meta.relatedNoteIds || []
        });
      }
    }

    saveNotesToFirestore(fullNotesToSave);
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

  const handleAddChildNote = async (parentId: string) => {
    const parentMeta = state.noteMetadata.find(n => n.id === parentId);
    if (!parentMeta) return;

    let childNoteType: NoteType = 'Task';
    let updatedParentMeta: NoteMetadata | null = null;
    
    if (parentMeta.noteType === 'Task') {
      // 1. 부모가 Task인데 자식이 생기려 한다면, 부모를 Feature로 승격
      updatedParentMeta = { ...parentMeta, noteType: 'Feature' };
      childNoteType = 'Task';
    } else if (parentMeta.noteType === 'Epic') {
      childNoteType = 'Feature';
    } else if (parentMeta.noteType === 'Feature') {
      childNoteType = 'Task';
    }

    const newNoteId = Math.random().toString(36).substr(2, 9);
    const newNote: Note = {
      id: newNoteId,
      title: '새 하위 노트',
      folder: parentMeta.folder,
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

    let fullNotesToSave: Note[] = [newNote];
    
    if (updatedParentMeta) {
      // 승격된 부모의 계층 정상화 (Sibling Promotion)
      const hierarchyFixes = normalizeHierarchy(updatedParentMeta, state.noteMetadata);
      
      const metaToSave = [updatedParentMeta, ...hierarchyFixes.filter(f => f.id !== updatedParentMeta!.id)];
      
      for (const meta of metaToSave) {
        let fullNote = state.notes.find(n => n.id === meta.id);
        if (!fullNote) {
          const noteRef = doc(db, 'users', userId!, 'projects', currentProjectId!, 'notes', meta.id);
          const docSnap = await getDocWithCacheFallback(noteRef);
          if (docSnap.exists()) {
            fullNote = docSnap.data() as Note;
          }
        }
        if (fullNote) {
          fullNotesToSave.push({
            ...fullNote,
            noteType: meta.noteType,
            parentNoteIds: meta.parentNoteIds || [],
            relatedNoteIds: meta.relatedNoteIds || []
          });
        }
      }
    }

    saveNotesToFirestore(fullNotesToSave);
    setSelectedNoteId(newNote.id);
  };

  const handleDeleteNote = (noteId: string) => {
    const targetNote = state.noteMetadata.find(n => n.id === noteId);
    if (!targetNote) return;

    setDialogConfig({
      isOpen: true,
      title: '노트 삭제',
      message: `"${targetNote.title}" 노트를 삭제하시겠습니까?\n이 노트를 부모로 가진 하위 노트들은 부모 연결이 해제됩니다.`,
      type: 'warning',
      confirmText: '삭제',
      cancelText: '취소',
      onConfirm: () => {
        const affectedMetadata = cleanupNoteRelationships(noteId, state.noteMetadata);
        
        const orphans = affectedMetadata.filter(n => {
          const oldMeta = state.noteMetadata.find(old => old.id === n.id);
          return (oldMeta?.parentNoteIds || []).includes(noteId) && n.parentNoteIds.length === 0;
        });

        const executeDelete = async (deleteOrphans: boolean = false) => {
          const finalAffectedMetadata = [...affectedMetadata];
          const notesToDelete = [noteId];
          
          if (deleteOrphans) {
            orphans.forEach(o => notesToDelete.push(o.id));
          }

          const metadataToSave = finalAffectedMetadata.filter(n => !notesToDelete.includes(n.id));
          
          if (metadataToSave.length > 0) {
            const fullNotesToSave: Note[] = [];
            for (const meta of metadataToSave) {
              let fullNote = state.notes.find(n => n.id === meta.id);
              if (!fullNote) {
                const noteRef = doc(db, 'users', userId!, 'projects', currentProjectId!, 'notes', meta.id);
                const docSnap = await getDocWithCacheFallback(noteRef);
                if (docSnap.exists()) {
                  fullNote = docSnap.data() as Note;
                }
              }
              if (fullNote) {
                fullNotesToSave.push({
                  ...fullNote,
                  parentNoteIds: meta.parentNoteIds || [],
                  childNoteIds: meta.childNoteIds || [],
                  relatedNoteIds: meta.relatedNoteIds || []
                });
              }
            }
            if (fullNotesToSave.length > 0) {
              saveNotesToFirestore(fullNotesToSave);
            }
          }
          
          await deleteNotesFromFirestore(notesToDelete);

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
    const notesToDelete = state.noteMetadata.filter(n => n.folder === folderPath || n.folder.startsWith(`${folderPath}/`));
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
        
        const remainingMetadata = state.noteMetadata.filter(n => !idsSet.has(n.id));
        const affectedMetadataMap = new Map<string, NoteMetadata>();
        
        remainingMetadata.forEach(meta => {
          let changed = false;
          let updatedMeta = { ...meta };
          
          if ((updatedMeta.parentNoteIds || []).some(id => idsSet.has(id))) {
            updatedMeta.parentNoteIds = updatedMeta.parentNoteIds.filter(id => !idsSet.has(id));
            changed = true;
          }
          if ((updatedMeta.childNoteIds || []).some(id => idsSet.has(id))) {
            updatedMeta.childNoteIds = updatedMeta.childNoteIds.filter(id => !idsSet.has(id));
            changed = true;
          }
          if ((updatedMeta.relatedNoteIds || []).some(id => idsSet.has(id))) {
            updatedMeta.relatedNoteIds = updatedMeta.relatedNoteIds.filter(id => !idsSet.has(id));
            changed = true;
          }
          
          if (changed) {
            affectedMetadataMap.set(updatedMeta.id, updatedMeta);
          }
        });
        
        const finalAffectedMetadata = Array.from(affectedMetadataMap.values());
        if (finalAffectedMetadata.length > 0) {
          const fullNotesToSave: Note[] = [];
          for (const meta of finalAffectedMetadata) {
            let fullNote = state.notes.find(n => n.id === meta.id);
            if (!fullNote) {
              const noteRef = doc(db, 'users', userId!, 'projects', currentProjectId!, 'notes', meta.id);
              const docSnap = await getDocWithCacheFallback(noteRef);
              if (docSnap.exists()) {
                fullNote = docSnap.data() as Note;
              }
            }
            if (fullNote) {
              fullNotesToSave.push({
                ...fullNote,
                parentNoteIds: meta.parentNoteIds || [],
                childNoteIds: meta.childNoteIds || [],
                relatedNoteIds: meta.relatedNoteIds || []
              });
            }
          }
          if (fullNotesToSave.length > 0) {
            saveNotesToFirestore(fullNotesToSave);
          }
        }
        
        await deleteNotesFromFirestore(ids);
        
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
        const remainingMetadata = state.noteMetadata.filter(n => !idsSet.has(n.id));
        const affectedMetadataMap = new Map<string, NoteMetadata>();
        
        remainingMetadata.forEach(meta => {
          let changed = false;
          let updatedMeta = { ...meta };
          
          if ((updatedMeta.parentNoteIds || []).some(id => idsSet.has(id))) {
            updatedMeta.parentNoteIds = updatedMeta.parentNoteIds.filter(id => !idsSet.has(id));
            changed = true;
          }
          if ((updatedMeta.childNoteIds || []).some(id => idsSet.has(id))) {
            updatedMeta.childNoteIds = updatedMeta.childNoteIds.filter(id => !idsSet.has(id));
            changed = true;
          }
          if ((updatedMeta.relatedNoteIds || []).some(id => idsSet.has(id))) {
            updatedMeta.relatedNoteIds = updatedMeta.relatedNoteIds.filter(id => !idsSet.has(id));
            changed = true;
          }
          
          if (changed) {
            affectedMetadataMap.set(updatedMeta.id, updatedMeta);
          }
        });
        
        const finalAffectedMetadata = Array.from(affectedMetadataMap.values());
        if (finalAffectedMetadata.length > 0) {
          const fullNotesToSave: Note[] = [];
          for (const meta of finalAffectedMetadata) {
            let fullNote = state.notes.find(n => n.id === meta.id);
            if (!fullNote) {
              const noteRef = doc(db, 'users', userId!, 'projects', currentProjectId!, 'notes', meta.id);
              const docSnap = await getDocWithCacheFallback(noteRef);
              if (docSnap.exists()) {
                fullNote = docSnap.data() as Note;
              }
            }
            if (fullNote) {
              fullNotesToSave.push({
                ...fullNote,
                parentNoteIds: meta.parentNoteIds || [],
                childNoteIds: meta.childNoteIds || [],
                relatedNoteIds: meta.relatedNoteIds || []
              });
            }
          }
          if (fullNotesToSave.length > 0) {
            saveNotesToFirestore(fullNotesToSave);
          }
        }
        
        await deleteNotesFromFirestore(noteIds);
        
        if (selectedNoteId && idsSet.has(selectedNoteId)) setSelectedNoteId(null);
        setDialogConfig(null);
      },
      onCancel: () => setDialogConfig(null)
    });
  };

  const handleSanitizeIntegrity = async (silent = false) => {
    if (state.noteMetadata.length === 0 || !userId || !currentProjectId) return;
    
    // 디바운스 처리: 너무 자주 실행되지 않도록 함
    if (integrityCheckTimeout.current) {
      clearTimeout(integrityCheckTimeout.current);
    }

    integrityCheckTimeout.current = setTimeout(async () => {
      // Skip automatic integrity check if the last update was from remote to prevent loops
      if (silent && isRemoteUpdate.current) {
        console.log('[useNoteSync] Skipping silent integrity check due to remote update flag');
        return;
      }

      const { fixedNotes: fixedMetadata, fixCount, logs } = sanitizeNoteIntegrity(state.noteMetadata);

      if (fixCount > 0) {
        if (!silent) {
          setProcessStatus({ message: `데이터 무결성 복구 중 (${fixCount}건)...` });
        }
        
        try {
          // Fetch full notes for the fixed metadata
          const fullNotesToSave: Note[] = [];
          for (const meta of fixedMetadata) {
            let fullNote = state.notes.find(n => n.id === meta.id);
            if (!fullNote) {
              const noteRef = doc(db, 'users', userId, 'projects', currentProjectId, 'notes', meta.id);
              const docSnap = await getDocWithCacheFallback(noteRef);
              if (docSnap.exists()) {
                fullNote = docSnap.data() as Note;
              }
            }
            if (fullNote) {
              fullNotesToSave.push({
                ...fullNote,
                parentNoteIds: meta.parentNoteIds || [],
                childNoteIds: meta.childNoteIds || [],
                relatedNoteIds: meta.relatedNoteIds || []
              });
            }
          }

          if (fullNotesToSave.length > 0) {
            saveNotesToFirestore(fullNotesToSave);
          }
          
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
    }, silent ? 5000 : 0); // 자동(silent) 체크는 5초 디바운스
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
        state.noteMetadata,
        signal
      );

      if (signal.aborted) return;

      const fullNotesToSave: Note[] = [updatedNote];
      
      for (const id of affectedNoteIds) {
        if (id === updatedNote.id) continue;
        let fullNote = state.notes.find(n => n.id === id);
        if (!fullNote) {
          const noteRef = doc(db, 'users', userId!, 'projects', currentProjectId!, 'notes', id);
          const docSnap = await getDocWithCacheFallback(noteRef);
          if (docSnap.exists()) {
            fullNote = docSnap.data() as Note;
          }
        }
        if (fullNote) {
          fullNotesToSave.push({
            ...fullNote,
            consistencyConflict: {
              description: `이 노트는 "${updatedNote.title}"의 최근 변경 사항에 영향을 받을 수 있습니다.`,
              suggestion: "업데이트된 GCM 및 로직과 일치하는지 이 노트를 검토하십시오."
            }
          });
        }
      }

      saveNotesToFirestore(fullNotesToSave);
      syncProject({ gcm: updatedGcm });

      setState(prev => ({
        ...prev,
        gcm: updatedGcm
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
    handleTextFileUpload,
    handleRefreshNotes: fetchNotes,
    isRemoteUpdate
  };
};
