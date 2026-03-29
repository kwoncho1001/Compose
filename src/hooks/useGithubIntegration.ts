import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Note, AppState, NoteType } from '../types';
import { subscribeSyncLog, saveSyncLog, clearSyncLog } from '../services/syncLog';
import { fetchGithubFiles, fetchLatestCommitSha, fetchGithubFileContent } from '../services/github';
import { 
  filterFilesPhase,
  extractPhase, 
  prepareAnalysisPhase, 
  analyzeReferencesPhase, 
  designTasksPhase,
  cleanupPhase,
  parseAIContent,
  AnalysisItem
} from '../services/syncService';
import { syncNoteRelationships } from '../utils/noteMirroring';
import { sanitizeNoteIntegrity } from '../utils/integrityChecker';
import { normalizeHierarchy } from '../utils/hierarchyValidator';
import { generateTaskDeterministicId } from '../utils/idGenerator';

export const useGithubIntegration = (
  userId: string | undefined,
  currentProjectId: string,
  state: AppState,
  setState: React.Dispatch<React.SetStateAction<AppState>>,
  syncProject: (updates: Partial<AppState>) => Promise<void>,
  saveNotesToFirestore: (notes: Note[]) => Promise<void>,
  deleteNotesFromFirestore: (noteIds: string[]) => Promise<void>,
  setDialogConfig: any,
  setProcessStatus: any,
  showAlert: any,
  abortControllerRef: React.MutableRefObject<AbortController | null>,
  isSyncing: boolean,
  setIsSyncing: React.Dispatch<React.SetStateAction<boolean>>,
  handleEnforceHierarchy: (notesList?: Note[], silentSuccess?: boolean) => Promise<void>
) => {
  const [githubFiles, setGithubFiles] = useState<{ path: string; sha: string }[]>([]);
  const [githubReadme, setGithubReadme] = useState<string>('');

  useEffect(() => {
    if (!userId || !currentProjectId) return;

    const unsubscribeSyncLogs = subscribeSyncLog(userId, currentProjectId, (logs) => {
      setState(prev => ({ ...prev, fileSyncLogs: logs }));
    });

    return () => {
      unsubscribeSyncLogs();
    };
  }, [userId, currentProjectId, setState]);

  const handleWipeSnapshots = async () => {
    setDialogConfig({
      isOpen: true,
      title: '스냅샷 초기화',
      message: 'GitHub에서 가져온 모든 코드 스냅샷 노트를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.',
      type: 'warning',
      confirmText: '초기화',
      cancelText: '취소',
      onConfirm: async () => {
        setDialogConfig(null);
        try {
          setProcessStatus({ message: '코드 스냅샷 초기화 중...' });
          
          if (userId && currentProjectId) {
            await clearSyncLog(userId, currentProjectId);
          }
          await syncProject({ lastSyncedSha: undefined });

          const snapshotNotes = state.notes.filter(n => n.noteType === 'Reference');
          const snapshotNoteIds = snapshotNotes.map(n => n.id);
          
          if (snapshotNoteIds.length > 0) {
            await deleteNotesFromFirestore(snapshotNoteIds);
          }
          
          let remainingNotes = state.notes.filter(n => !snapshotNoteIds.includes(n.id));

          const logTitle = '[로그] SHA 동기화 장부';
          const logFolder = '시스템/동기화 로그';
          const now = new Date().toISOString();
          const emptyLogContent = `**최종 동기화 시각:** 초기화됨\n\n| 파일 경로 | SHA 값 |\n| :--- | :--- |\n| (데이터 없음) | (데이터 없음) |`;
          
          const newLogNote: Note = {
            id: generateTaskDeterministicId(currentProjectId, logTitle),
            title: logTitle,
            content: emptyLogContent,
            folder: logFolder,
            summary: 'GitHub 동기화된 파일들의 SHA 값을 추적하는 장부입니다.',
            status: 'Done',
            priority: 'C',
            version: '1.0.0',
            lastUpdated: now,
            importance: 1,
            tags: ['system-log'],
            childNoteIds: [],
            relatedNoteIds: [],
            parentNoteIds: [],
            noteType: 'Task'
          };
          
          await saveNotesToFirestore([newLogNote]);
          remainingNotes.push(newLogNote);

          setState(prev => ({
            ...prev,
            notes: remainingNotes,
            fileSyncLogs: {},
            lastSyncedSha: undefined
          }));

          showAlert('초기화 완료', `${snapshotNoteIds.length}개의 코드 스냅샷이 삭제되고 SHA 장부가 초기화되었습니다.`, 'success');
        } catch (error) {
          console.error('Failed to wipe snapshots:', error);
          showAlert('오류', '코드 스냅샷 초기화에 실패했습니다.', 'error');
        } finally {
          setProcessStatus(null);
        }
      },
      onCancel: () => setDialogConfig(null)
    });
  };

  const reconcileNoteRelationships = async (allNotes: Note[]): Promise<Note[]> => {
    const notesMap = new Map(allNotes.map(n => [n.id, { ...n }]));
    let changed = false;

    for (const note of Array.from(notesMap.values())) {
      for (const parentId of (note.parentNoteIds || [])) {
        const parent = notesMap.get(parentId);
        if (parent && !(parent.childNoteIds || []).includes(note.id)) {
          parent.childNoteIds = Array.from(new Set([...(parent.childNoteIds || []), note.id]));
          changed = true;
        }
      }

      for (const childId of (note.childNoteIds || [])) {
        const child = notesMap.get(childId);
        if (child && !(child.parentNoteIds || []).includes(note.id)) {
          child.parentNoteIds = Array.from(new Set([...(child.parentNoteIds || []), note.id]));
          changed = true;
        }
      }

      for (const relId of (note.relatedNoteIds || [])) {
        const relNote = notesMap.get(relId);
        if (relNote && !(relNote.relatedNoteIds || []).includes(note.id)) {
          relNote.relatedNoteIds = Array.from(new Set([...(relNote.relatedNoteIds || []), note.id]));
          changed = true;
        }
      }
    }

    if (changed) {
      const updatedNotes = Array.from(notesMap.values());
      await saveNotesToFirestore(updatedNotes);
      setState(prev => ({
        ...prev,
        notes: updatedNotes
      }));
      return updatedNotes;
    }
    return allNotes;
  };

  const handleSyncGithub = async (forceUpdate: boolean = false) => {
    if (isSyncing) return;
    if (!state.githubRepo) {
      showAlert('알림', 'Github 저장소 URL을 입력해주세요.', 'warning');
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    const signal = abortController.signal;

    setIsSyncing(true);
    setProcessStatus({ message: 'Github 파일 목록 및 버전 확인 중...' });
    try {
      let filesToProcess: { path: string; sha: string }[] = [];
      let latestSha = '';

      const files = await fetchGithubFiles(state.githubRepo, state.githubToken, signal);
      if (signal.aborted) return;
      setGithubFiles(files);
      latestSha = await fetchLatestCommitSha(state.githubRepo, state.githubToken, signal);
      if (signal.aborted) return;
      
      const readmeFile = files.find(f => f.path.toLowerCase() === 'readme.md');
      if (readmeFile) {
        try {
          const content = await fetchGithubFileContent(state.githubRepo, readmeFile.path, state.githubToken, signal);
          if (signal.aborted) return;
          setGithubReadme(content);
        } catch (e) {
          console.warn("Failed to fetch README.md", e);
        }
      }

      const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.c', '.cpp'];
      filesToProcess = files.filter(file => 
        sourceExtensions.some(ext => file.path.endsWith(ext)) &&
        !file.path.includes('node_modules') &&
        !file.path.includes('.git') &&
        !file.path.includes('dist') &&
        !file.path.includes('build')
      );

      if (filesToProcess.length === 0) {
        showAlert('알림', '분석할 소스 파일이 없습니다.', 'info');
        setIsSyncing(false);
        setProcessStatus(null);
        return;
      }

      let currentNotes = [...state.notes];
      let currentLogs = { ...(state.fileSyncLogs || {}) };
      const githubFilePaths = new Set(files.map(f => f.path));
      let logsChanged = false;
      
      Object.keys(currentLogs).forEach(path => {
        if (!githubFilePaths.has(path)) {
          delete currentLogs[path];
          logsChanged = true;
        }
      });
      
      if (logsChanged && userId && currentProjectId) {
        await saveSyncLog(userId, currentProjectId, currentLogs);
        setState(prev => ({ ...prev, fileSyncLogs: currentLogs }));
      }

      // Phase 0: Pre-fetch Filtering (SHA 기반 사전 필터링)
      const { filesToProcess: filesActuallyToProcess, skippedItems } = filterFilesPhase(
        filesToProcess,
        currentLogs,
        currentNotes,
        forceUpdate
      );

      if (filesActuallyToProcess.length === 0 && skippedItems.length === 0) {
        showAlert('알림', '모든 파일이 이미 최신 상태입니다.', 'info');
        
        if (state.lastSyncedSha !== latestSha || logsChanged) {
          const now = new Date().toISOString();
          await syncProject({ 
            lastSyncedAt: now,
            lastSyncedSha: latestSha
          });
          
          const logTitle = '[로그] SHA 동기화 장부';
          const logFolder = '시스템/동기화 로그';
          let logNote = currentNotes.find(n => n.title === logTitle && n.folder === logFolder);
          
          const logContent = `**최종 동기화 시각:** ${new Date().toLocaleString()}\n\n| 파일 경로 | SHA 값 |\n| :--- | :--- |\n${Object.entries(currentLogs).sort((a, b) => a[0].localeCompare(b[0])).map(([path, sha]) => `| ${path} | ${sha} |`).join('\n')}`;
          
          if (logNote) {
            logNote = { ...logNote, content: logContent, lastUpdated: now };
            currentNotes = currentNotes.map(n => n.id === logNote!.id ? logNote! : n);
            await saveNotesToFirestore([logNote]);
          } else {
            const newLogNote: Note = {
              id: generateTaskDeterministicId(currentProjectId, logTitle),
              title: logTitle,
              folder: logFolder,
              content: logContent,
              summary: 'GitHub 파일의 현재 동기화된 SHA 정보를 담고 있는 시스템 장부입니다.',
              status: 'Done',
              priority: 'C',
              version: '1.0.0',
              lastUpdated: now,
              importance: 1,
              tags: ['system-log'],
              childNoteIds: [],
              relatedNoteIds: [],
              parentNoteIds: [],
              noteType: 'Task'
            };
            currentNotes.push(newLogNote);
            await saveNotesToFirestore([newLogNote]);
          }

          setState(prev => ({ 
            ...prev, 
            notes: currentNotes,
            lastSyncedAt: now, 
            lastSyncedSha: latestSha,
            fileSyncLogs: currentLogs
          }));
        }
        
        setIsSyncing(false);
        setProcessStatus(null);
        return;
      }

      // Process files one by one for robustness
      let workingNotes = [...currentNotes];
      const allProcessedUnits: AnalysisItem[] = [...skippedItems];
      const allProducedRefs: Note[] = skippedItems.map(si => si.existingRef!).filter(Boolean);

      for (let i = 0; i < filesActuallyToProcess.length; i++) {
        if (signal.aborted) break;
        const file = filesActuallyToProcess[i];
        
        try {
          setProcessStatus({ 
            message: `${file.path} 처리 중 (${i + 1}/${filesActuallyToProcess.length})...`,
            current: i + 1,
            total: filesActuallyToProcess.length
          });

          // 1. Extraction (Local Regex)
          const fileUnits = await extractPhase(
            state.githubRepo,
            state.githubToken,
            [file],
            setProcessStatus,
            signal
          );

          if (fileUnits.length === 0) {
            // No units in this file, just update the log
            currentLogs[file.path] = file.sha;
            if (userId && currentProjectId) {
              await saveSyncLog(userId, currentProjectId, currentLogs);
            }
            continue;
          }

          // 2. Filtering (Modified only)
          const { unitsToAnalyze, unitsToSkip } = prepareAnalysisPhase(
            fileUnits,
            workingNotes,
            forceUpdate
          );

          // 3. Mapping & Analysis (AI - Immediate Save inside)
          const { producedReferences, updatedNotes: notesAfterRefs, analyzedItems } = await analyzeReferencesPhase(
            userId!,
            currentProjectId,
            unitsToAnalyze,
            unitsToSkip,
            workingNotes,
            state.githubRepo,
            saveNotesToFirestore,
            setProcessStatus,
            signal
          );
          
          workingNotes = notesAfterRefs;
          allProcessedUnits.push(...analyzedItems);
          allProducedRefs.push(...producedReferences);

          // 4. Checkpoint: Update SHA log for this file immediately
          currentLogs[file.path] = file.sha;
          if (userId && currentProjectId) {
            await saveSyncLog(userId, currentProjectId, currentLogs);
          }
          
          // Update local state partially to show progress
          setState(prev => ({ ...prev, notes: workingNotes, fileSyncLogs: { ...currentLogs } }));

        } catch (fileError: any) {
          if (fileError?.message === "Operation cancelled" || fileError === "Operation cancelled") {
            console.log(`Operation cancelled during processing of ${file.path}`);
            break; // Stop processing files if cancelled
          }
          console.error(`Failed to process file ${file.path}:`, fileError);
          // Continue to next file for other errors
        }
      }

      if (signal.aborted) {
        setIsSyncing(false);
        setProcessStatus(null);
        return;
      }

      // Phase 4: Task/Feature Design (All affected tasks)
      const notesAfterTasks = await designTasksPhase(
        userId!,
        currentProjectId,
        allProducedRefs,
        allProcessedUnits,
        workingNotes,
        forceUpdate,
        saveNotesToFirestore,
        setProcessStatus,
        signal
      );
      workingNotes = notesAfterTasks;

      // Phase 5: Discarded Notes & Cleanup
      const finalNotes = await cleanupPhase(
        workingNotes,
        allProcessedUnits,
        githubFiles,
        saveNotesToFirestore
      );
      workingNotes = finalNotes;

      // Finalization
      setProcessStatus({ message: '마무리 작업 중 (관계 동기화 및 무결성 검사)...' });
      console.log("마무리 작업 중: 관계 동기화 및 무결성 검사");

      const now = new Date().toISOString();
      if (userId && currentProjectId) {
        await saveSyncLog(userId, currentProjectId, currentLogs);
      }
      await syncProject({ lastSyncedAt: now, lastSyncedSha: latestSha });

      setState(prev => ({ 
        ...prev, 
        notes: workingNotes,
        fileSyncLogs: { ...currentLogs },
        lastSyncedAt: now,
        lastSyncedSha: latestSha
      }));

      showAlert(
        'GitHub 최신 코드 반영 완료', 
        `분석 완료: ${filesActuallyToProcess.length}개 파일 처리됨.`, 
        'success'
      );

      await handleEnforceHierarchy(workingNotes, true);

    } catch (error) {
      if ((error as any)?.message === "Operation cancelled" || error === "Operation cancelled") {
        console.log('Sync GitHub cancelled');
      } else {
        console.error('Failed to sync with Github:', error);
        showAlert('오류', `Github 대조 및 통합 실패: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
    } finally {
      setIsSyncing(false);
      setProcessStatus(null);
    }
  };

  return {
    githubFiles,
    githubReadme,
    handleSyncGithub,
    handleWipeSnapshots,
    reconcileNoteRelationships
  };
};
