import { useState } from 'react';
import { Note, AppState } from '../types';
import { optimizeBlueprint, checkConsistency, generateSubModules, suggestNextSteps } from '../services/gemini';
import { findInvalidHierarchyNotes } from '../utils/hierarchyValidator';
import { suggestOrCreateParentsBatch } from '../services/gemini';
import { syncNoteRelationships } from '../utils/noteMirroring';
import { sanitizeNoteIntegrity } from '../utils/integrityChecker';

export const useAIAnalysis = (
  userId: string | undefined,
  currentProjectId: string,
  state: AppState,
  setState: React.Dispatch<React.SetStateAction<AppState>>,
  syncProject: (updates: Partial<AppState>) => Promise<void>,
  saveNotesToFirestore: (notes: Note[]) => Promise<void>,
  deleteNoteFromFirestore: (noteId: string) => Promise<void>,
  setProcessStatus: any,
  showAlert: any,
  abortControllerRef: React.MutableRefObject<AbortController | null>,
  setIsDecomposing: React.Dispatch<React.SetStateAction<boolean>>,
  setIsSyncing: React.Dispatch<React.SetStateAction<boolean>>,
  setSelectedNoteId: React.Dispatch<React.SetStateAction<string | null>>,
  setNextStepSuggestion: React.Dispatch<React.SetStateAction<string | null>>,
  setRightSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>,
  githubFiles: { path: string; sha: string }[],
  githubReadme: string
) => {

  const handleOptimizeBlueprint = async () => {
    if (state.notes.length === 0) return;

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal;

    setIsSyncing(true);
    setProcessStatus({ message: '설계도 최적화 진행 중 (일관성, 연결점, 구조 재배치)...' });
    try {
      const { updatedNotes, deletedNoteIds, updatedGcm, report } = await optimizeBlueprint(state.notes, state.gcm, signal);
      
      if (signal.aborted) return;

      saveNotesToFirestore(updatedNotes);
      deletedNoteIds.forEach(id => deleteNoteFromFirestore(id));
      syncProject({ gcm: updatedGcm });

      setState(prev => {
        const existingNotesMap = new Map(prev.notes.map(n => [n.id, n]));
        
        updatedNotes.forEach(un => {
          existingNotesMap.set(un.id, un);
        });
        
        const deletedIdsSet = new Set(deletedNoteIds);
        const filteredNotes = Array.from(existingNotesMap.values()).filter(n => !deletedIdsSet.has(n.id));
        
        return {
          ...prev,
          notes: filteredNotes,
          gcm: updatedGcm
        };
      });
      
      setNextStepSuggestion(report);
      setRightSidebarOpen(true);
    } catch (error) {
      if ((error as any)?.message === "Operation cancelled" || error === "Operation cancelled") {
        console.log('Optimize blueprint cancelled');
      } else {
        console.error('Optimization failed', error);
        showAlert('오류', '설계도 최적화 중 오류가 발생했습니다.', 'error');
      }
    } finally {
      setIsSyncing(false);
      setProcessStatus(null);
    }
  };

  const handleEnforceHierarchy = async (notesList?: Note[], silentSuccess = false, skipSave = false) => {
    let targetNotes = notesList || state.notes;
    if (targetNotes.length === 0 || !userId || !currentProjectId) return targetNotes;

    let iteration = 0;
    const maxIterations = 5;
    let hasChanges = false;

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal;

    setIsSyncing(true);

    try {
      while (iteration < maxIterations) {
        const invalidNotes = findInvalidHierarchyNotes(targetNotes);
        
        if (invalidNotes.length === 0) {
          if (iteration === 0 && !silentSuccess) {
            showAlert('알림', '모든 노드가 계층 구조 규칙을 잘 따르고 있습니다.', 'success');
          }
          break;
        }

        iteration++;
        setProcessStatus({ message: `계층 구조 자동 보정 중 (반복 ${iteration}/${maxIterations}, ${invalidNotes.length}개 노드)...` });

        const { results } = await suggestOrCreateParentsBatch(invalidNotes, targetNotes, signal);
        
        if (signal.aborted) return targetNotes;

        const newNotes: Note[] = [];
        const updatedNotes: Note[] = [];
        let currentAllNotes = [...targetNotes];

        const newParentMap = new Map<string, string>();

        for (const res of results) {
          const orphanNote = invalidNotes.find(n => n.id === res.orphanNoteId);
          if (!orphanNote) continue;

          let parentId = res.parentId;

          if (res.action === 'update' && res.updatedNote) {
            const updatedOrphan = {
              ...orphanNote,
              ...res.updatedNote
            };
            updatedNotes.push(updatedOrphan);
            continue;
          }

          if (res.action === 'clear') {
            const updatedOrphan = {
              ...orphanNote,
              parentNoteIds: []
            };
            updatedNotes.push(updatedOrphan);
            continue;
          }

          if (res.action === 'create' && res.newNote) {
            const parentTitle = res.newNote.title || 'New Parent';
            if (newParentMap.has(parentTitle)) {
              parentId = newParentMap.get(parentTitle);
            } else {
              const newParent: Note = {
                ...res.newNote,
                id: Math.random().toString(36).substr(2, 9),
                childNoteIds: [orphanNote.id],
              } as Note;
              newNotes.push(newParent);
              currentAllNotes.push(newParent);
              parentId = newParent.id;
              newParentMap.set(parentTitle, parentId!);
            }
          }

          if (parentId) {
            const updatedOrphan = {
              ...orphanNote,
              parentNoteIds: Array.from(new Set([...(orphanNote.parentNoteIds || []), parentId]))
            };
            updatedNotes.push(updatedOrphan);
            
            const existingParent = currentAllNotes.find(n => n.id === parentId);
            if (existingParent) {
              const updatedParent = {
                ...existingParent,
                childNoteIds: Array.from(new Set([...(existingParent.childNoteIds || []), orphanNote.id]))
              };
              const existingInUpdated = updatedNotes.findIndex(un => un.id === parentId);
              if (existingInUpdated !== -1) {
                updatedNotes[existingInUpdated] = updatedParent;
              } else {
                const existingInNew = newNotes.findIndex(nn => nn.id === parentId);
                if (existingInNew !== -1) {
                  newNotes[existingInNew] = updatedParent;
                } else {
                  updatedNotes.push(updatedParent);
                }
              }
            }
          }
        }

        if (newNotes.length > 0 || updatedNotes.length > 0) {
          hasChanges = true;
          
          const affectedMap = new Map<string, Note>();
          const finalNotes = [...targetNotes, ...newNotes];

          updatedNotes.forEach(un => {
            const affected = syncNoteRelationships(un, finalNotes);
            affected.forEach(an => affectedMap.set(an.id, an));
            affectedMap.set(un.id, un);
          });

          const syncedNotes = finalNotes.map(note => affectedMap.get(note.id) || note);
          const { fixedNotes: finalSanitizedNotes } = sanitizeNoteIntegrity(syncedNotes);

          targetNotes = finalSanitizedNotes;
        } else {
          break;
        }
      }

      if (hasChanges && !skipSave) {
        // Only save once at the end if not skipping
        await saveNotesToFirestore(targetNotes);
        setState(prev => ({ ...prev, notes: targetNotes }));
        if (!silentSuccess) {
          showAlert('성공', '계층 구조 자동 보정이 완료되었습니다.', 'success');
        }
      }
      return targetNotes;
    } catch (error) {
      if ((error as any)?.message === "Operation cancelled" || error === "Operation cancelled") {
        console.log('Hierarchy optimization cancelled');
      } else {
        console.error('Hierarchy optimization failed', error);
        showAlert('오류', '최적화 중 오류가 발생했습니다.', 'error');
      }
      return targetNotes;
    } finally {
      setIsSyncing(false);
      setProcessStatus(null);
    }
  };

  const handleCheckConsistency = async () => {
    if (state.notes.length === 0) return;

    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal;

    setIsSyncing(true);
    setProcessStatus({ message: '설계도 일관성 검증 진행 중...' });
    try {
      const { report, inconsistentNotes } = await checkConsistency(state.notes, state.gcm, signal);
      
      if (signal.aborted) return;

      const inconsistentMap = new Map(inconsistentNotes.map(n => [n.id, n]));
      const updatedNotes = state.notes.map(note => {
        const conflict = inconsistentMap.get(note.id);
        if (conflict) {
          return { 
            ...note, 
            consistencyConflict: {
              description: conflict.description,
              suggestion: conflict.suggestion
            } 
          };
        }
        if (note.consistencyConflict) {
          return { ...note, consistencyConflict: undefined };
        }
        return note;
      });

      saveNotesToFirestore(updatedNotes);

      setState(prev => ({
        ...prev,
        notes: updatedNotes
      }));
      
      setNextStepSuggestion(report);
      setRightSidebarOpen(true);
    } catch (error) {
      if ((error as any)?.message === "Operation cancelled" || error === "Operation cancelled") {
        console.log('Check consistency cancelled');
      } else {
        console.error('Consistency check failed', error);
        showAlert('오류', '설계도 일관성 검증 중 오류가 발생했습니다.', 'error');
      }
    } finally {
      setIsSyncing(false);
      setProcessStatus(null);
    }
  };

  const handleGenerateSubModules = async (mainNote: Note) => {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal;

    setIsDecomposing(true);
    setProcessStatus({ message: `${mainNote.title}의 하위 모듈 생성 중...` });
    try {
      const githubContext = state.githubRepo ? {
        repoName: state.githubRepo,
        files: githubFiles.map(f => f.path),
        readme: githubReadme
      } : undefined;

      const result = await generateSubModules(mainNote, state.gcm, state.notes, githubContext, signal);
      
      if (signal.aborted) return;

      const newNotesWithIds = result.newNotes.map((n) => ({
        ...n,
        id: Math.random().toString(36).substr(2, 9),
        status: 'Planned' as const,
        priority: 'C' as const,
      }));

      let updatedNotesList = [...state.notes, ...newNotesWithIds];

      if (result.mainNoteUpdates) {
        updatedNotesList = updatedNotesList.map(n => 
          n.id === mainNote.id ? { 
            ...n, 
            ...result.mainNoteUpdates,
            noteType: result.mainNoteUpdates!.noteType as any
          } : n
        );
      }

      saveNotesToFirestore(updatedNotesList);
      syncProject({ gcm: result.updatedGcm });

      setState(prev => {
        return {
          ...prev,
          notes: updatedNotesList,
          gcm: result.updatedGcm
        };
      });
      
      showAlert('생성 완료', `${newNotesWithIds.length}개의 하위 모듈이 생성되었습니다.`, 'success');
    } catch (error) {
      if ((error as any)?.message === "Operation cancelled" || error === "Operation cancelled") {
        console.log('Generate sub-modules cancelled');
      } else {
        console.error('Failed to generate sub-modules:', error);
        showAlert('오류', `하위 모듈 생성 실패: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
    } finally {
      setIsDecomposing(false);
      setProcessStatus(null);
    }
  };

  const handleAnalyzeNextSteps = async () => {
    setProcessStatus({ message: '다음 단계 분석 중...' });
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    try {
      const { suggestion, updatedStatuses } = await suggestNextSteps(state.notes, state.gcm, signal);
      
      if (signal.aborted) return;
      
      setNextStepSuggestion(suggestion);
      
      if (Object.keys(updatedStatuses).length > 0) {
        const updatedNotes = state.notes.map(n => updatedStatuses[n.id] ? { ...n, status: updatedStatuses[n.id] } : n);
        saveNotesToFirestore(updatedNotes);
        setState(prev => ({
          ...prev,
          notes: updatedNotes
        }));
      }
      setRightSidebarOpen(true);
    } catch (error) {
      if ((error as any)?.message === "Operation cancelled" || error === "Operation cancelled") {
        console.log('Analyze next steps cancelled');
      } else {
        console.error(error);
        showAlert('오류', '다음 단계 분석에 실패했습니다.', 'error');
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setProcessStatus(null);
    }
  };

  return {
    handleOptimizeBlueprint,
    handleCheckConsistency,
    handleEnforceHierarchy,
    handleGenerateSubModules,
    handleAnalyzeNextSteps
  };
};
