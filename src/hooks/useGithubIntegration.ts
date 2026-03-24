import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Note, AppState } from '../types';
import { subscribeSyncLog, saveSyncLog, clearSyncLog } from '../services/syncLog';
import { fetchGithubFiles, fetchGithubFileContent, fetchLatestCommitSha } from '../services/github';
import { updateCodeSnapshot, analyzeLogicUnitDeeply } from '../services/gemini';
import { syncNoteRelationships } from '../utils/noteMirroring';
import { sanitizeNoteIntegrity } from '../utils/integrityChecker';

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
            id: Math.random().toString(36).substr(2, 9),
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
            noteType: 'Reference'
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
          parent.childNoteIds = Array.from(new Set([...parent.childNoteIds, note.id]));
          changed = true;
        }
      }

      for (const childId of note.childNoteIds) {
        const child = notesMap.get(childId);
        if (child && !(child.parentNoteIds || []).includes(note.id)) {
          child.parentNoteIds = Array.from(new Set([...(child.parentNoteIds || []), note.id]));
          changed = true;
        }
      }

      for (const relId of note.relatedNoteIds) {
        const relNote = notesMap.get(relId);
        if (relNote && !(relNote.relatedNoteIds || []).includes(note.id)) {
          relNote.relatedNoteIds = Array.from(new Set([...relNote.relatedNoteIds, note.id]));
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

  const handleSyncGithub = async () => {
    if (!state.githubRepo) {
      showAlert('알림', 'Github 저장소 URL을 입력해주세요.', 'warning');
      return;
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

      const filesActuallyToProcess = filesToProcess.filter(f => 
        currentLogs[f.path] !== f.sha
      );

      if (filesActuallyToProcess.length === 0) {
        showAlert('알림', '모든 파일이 이미 최신 상태입니다.', 'info');
        
        let currentNotes = [...state.notes];
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
              id: Math.random().toString(36).substr(2, 9),
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
              noteType: 'Reference'
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

      let currentNotes = [...state.notes];
      let updateCount = 0;
      let newCount = 0;

      for (let i = 0; i < filesActuallyToProcess.length; i++) {
        if (signal.aborted) return;
        const file = filesActuallyToProcess[i];
        setProcessStatus({ 
          message: `${file.path} 분석 및 코드 스냅샷 생성 중 (${i + 1}/${filesActuallyToProcess.length})...`,
          current: i + 1,
          total: filesActuallyToProcess.length
        });

        try {
          const content = await fetchGithubFileContent(state.githubRepo, file.path, state.githubToken, signal);
          if (signal.aborted) return;
          const snapshotNotes = currentNotes.filter(n => n.noteType === 'Reference');
          
          const existingFileNotes = snapshotNotes.filter(n => n.githubLink === file.path || n.originPath === file.path);
          const oldNoteIds = existingFileNotes.map(n => n.id);

          const { logicUnits } = await updateCodeSnapshot(file.path, content, currentNotes, file.sha, signal);
          if (signal.aborted) return;
          const touchedNotes: Note[] = [];
          const processedNoteIds: string[] = [];
          
          const suggestedTaskMap = new Map<string, string>();
          const seenLogicHashes = new Set<string>();
          const unitsToAnalyze: any[] = [];
          const unitsToSkip: any[] = [];
          
          for (const unit of logicUnits) {
            if (signal.aborted) return;
            
            if (seenLogicHashes.has(unit.logicHash)) {
              console.log(`Skipping duplicate logicHash ${unit.logicHash} in same file.`);
              continue;
            }
            seenLogicHashes.add(unit.logicHash);
            
            let taskId = unit.matchedTaskId;
            if (!taskId && unit.suggestedTask) {
              const existingTask = currentNotes.find(n => 
                n.title === unit.suggestedTask!.title && 
                (n.noteType === 'Task' || n.noteType === 'Feature')
              );
              
              if (existingTask) {
                taskId = existingTask.id;
              } else if (suggestedTaskMap.has(unit.suggestedTask.title)) {
                taskId = suggestedTaskMap.get(unit.suggestedTask.title);
              } else {
                const newTaskId = Math.random().toString(36).substr(2, 9);
                suggestedTaskMap.set(unit.suggestedTask.title, newTaskId);
                taskId = newTaskId;
                
                const newTask: Note = {
                  id: newTaskId,
                  title: unit.suggestedTask.title,
                  folder: unit.suggestedTask.folder,
                  content: unit.suggestedTask.content,
                  summary: unit.suggestedTask.summary,
                  noteType: 'Task',
                  status: (unit.suggestedTask.status as any) || 'Done',
                  priority: 'C',
                  version: '1.0.0',
                  lastUpdated: new Date().toISOString(),
                  importance: 3,
                  tags: unit.suggestedTask.tags || ['auto-generated', 'design-leading-code'],
                  relatedNoteIds: [],
                  childNoteIds: [],
                  parentNoteIds: []
                };
                currentNotes.push(newTask);
                touchedNotes.push(newTask);
                newCount++;
              }
            }

            if (!taskId) continue;

            const globallyExistingRef = currentNotes.find(n => n.noteType === 'Reference' && n.logicHash === unit.logicHash);
            const existingRef = currentNotes.find(n => n.id === unit.matchedReferenceId) || 
                                currentNotes.find(n => n.title === unit.title && (n.githubLink === file.path || n.originPath === file.path));

            if (globallyExistingRef) {
              console.log(`Skipping deep-dive for ${unit.title} as logicHash matches globally.`);
              unitsToSkip.push({ 
                unit, 
                taskId, 
                analysis: { 
                  content: globallyExistingRef.content, 
                  summary: globallyExistingRef.summary, 
                  importance: globallyExistingRef.importance, 
                  tags: globallyExistingRef.tags 
                }, 
                globallyExistingRef, 
                existingRef 
              });
            } else if (existingRef && existingRef.logicHash === unit.logicHash) {
              console.log(`Skipping deep-dive for ${unit.title} as logicHash matches locally.`);
              unitsToSkip.push({ 
                unit, 
                taskId, 
                analysis: { 
                  content: existingRef.content, 
                  summary: existingRef.summary, 
                  importance: existingRef.importance, 
                  tags: existingRef.tags 
                }, 
                globallyExistingRef, 
                existingRef 
              });
            } else {
              unitsToAnalyze.push({ unit, taskId, globallyExistingRef, existingRef });
            }
          }

          const analyzedResults: any[] = [];
          const chunkSize = 5;
          
          for (let j = 0; j < unitsToAnalyze.length; j += chunkSize) {
            if (signal.aborted) return;
            const chunk = unitsToAnalyze.slice(j, j + chunkSize);
            
            setProcessStatus((prev: any) => ({ 
              ...prev!, 
              message: `로직 심층 분석 중 (${j + 1}~${Math.min(j + chunkSize, unitsToAnalyze.length)}/${unitsToAnalyze.length})...` 
            }));
            
            const promises = chunk.map(async (item) => {
              const taskNote = currentNotes.find(n => n.id === item.taskId);
              if (!taskNote) return null;
              
              try {
                const analysis = await analyzeLogicUnitDeeply(item.unit.title, item.unit.codeSnippet, {
                  title: taskNote.title,
                  content: taskNote.content,
                  summary: taskNote.summary
                }, signal);
                return { ...item, analysis };
              } catch (e) {
                console.error(`Failed to analyze logic unit ${item.unit.title}:`, e);
                return null;
              }
            });
            
            const results = await Promise.all(promises);
            analyzedResults.push(...results.filter(r => r !== null));
          }

          if (signal.aborted) return;

          const allProcessedUnits = [...unitsToSkip, ...analyzedResults];
          
          for (const item of allProcessedUnits) {
            if (signal.aborted) return;
            const { unit, taskId, analysis, globallyExistingRef, existingRef } = item;
            
            // [개선 1] 부모 Task를 currentNotes에서 즉시 확보
            const taskNoteIndex = currentNotes.findIndex(n => n.id === taskId);
            if (taskNoteIndex === -1) continue;
            const taskNote = { ...currentNotes[taskNoteIndex] };

            let finalNote: Note;
            if (globallyExistingRef && globallyExistingRef.originPath !== file.path) {
              finalNote = {
                ...globallyExistingRef,
                parentNoteIds: Array.from(new Set([...(globallyExistingRef.parentNoteIds || []), taskId])),
                relatedNoteIds: Array.from(new Set([...(globallyExistingRef.relatedNoteIds || []), taskId])),
                lastUpdated: new Date().toISOString()
              };
              currentNotes = currentNotes.map(n => n.id === finalNote.id ? finalNote : n);
              updateCount++;
            } else if (existingRef) {
              finalNote = {
                ...existingRef,
                content: analysis.content,
                summary: analysis.summary,
                importance: analysis.importance,
                tags: Array.from(new Set([...(existingRef.tags || []), ...analysis.tags])),
                lastUpdated: new Date().toISOString(),
                parentNoteIds: Array.from(new Set([...(existingRef.parentNoteIds || []), taskId])),
                folder: taskNote.folder,
                logicHash: unit.logicHash,
                originPath: file.path
              };
              currentNotes = currentNotes.map(n => n.id === finalNote.id ? finalNote : n);
              updateCount++;
            } else {
              finalNote = {
                id: Math.random().toString(36).substr(2, 9),
                title: unit.title,
                folder: taskNote.folder,
                content: analysis.content,
                summary: analysis.summary,
                version: '1.0.0',
                lastUpdated: new Date().toISOString(),
                importance: analysis.importance,
                tags: analysis.tags,
                status: 'Done',
                priority: 'C',
                childNoteIds: [],
                parentNoteIds: [taskId],
                noteType: 'Reference',
                relatedNoteIds: [taskId],
                githubLink: file.path,
                originPath: file.path,
                logicHash: unit.logicHash
              };
              currentNotes.push(finalNote);
              newCount++;
            }

            // [개선 2] 루프 내에서 즉각적인 양방향 링크 (Bi-directional Link)
            if (!taskNote.childNoteIds.includes(finalNote.id)) {
              taskNote.childNoteIds = [...taskNote.childNoteIds, finalNote.id];
              currentNotes[taskNoteIndex] = taskNote; // currentNotes 배열 업데이트
              
              // 부모 Task도 변경되었으므로 DB 저장 대상에 포함
              if (!touchedNotes.some(n => n.id === taskNote.id)) {
                touchedNotes.push(taskNote);
              }
            }

            touchedNotes.push(finalNote);
            processedNoteIds.push(finalNote.id);
          }

          const discardedNoteIds = oldNoteIds.filter(id => !processedNoteIds.includes(id));
          for (const id of discardedNoteIds) {
            const noteIndex = currentNotes.findIndex(n => n.id === id);
            if (noteIndex !== -1) {
              const discardedNote = { ...currentNotes[noteIndex] };
              discardedNote.folder = '시스템/폐기된 소스';
              discardedNote.parentNoteIds = [];
              discardedNote.status = 'Deprecated';
              if (!(discardedNote.tags || []).includes('discarded')) {
                discardedNote.tags = [...(discardedNote.tags || []), 'discarded'];
              }
              currentNotes[noteIndex] = discardedNote;
              touchedNotes.push(discardedNote);
            }
          }

          if (touchedNotes.length > 0) {
            await saveNotesToFirestore(touchedNotes);
          }
          
          currentLogs[file.path] = file.sha;
          const now = new Date().toISOString();
          if (userId && currentProjectId) {
            await saveSyncLog(userId, currentProjectId, currentLogs);
          }
          await syncProject({ 
            lastSyncedAt: now
          });

          setState(prev => ({ 
            ...prev, 
            notes: currentNotes,
            fileSyncLogs: { ...currentLogs },
            lastSyncedAt: now
          }));

        } catch (e) {
          if ((e as any)?.message === "Operation cancelled" || e === "Operation cancelled") {
            console.log(`Processing file ${file.path} cancelled`);
            return;
          }
          console.error(`Failed to process file ${file.path}:`, e);
        }
      }

      await syncProject({
        lastSyncedSha: latestSha
      });

      setState(prev => ({ 
        ...prev, 
        lastSyncedSha: latestSha
      }));

      setProcessStatus({ message: '노트 간 연관 관계(부모-자식) 자동 동기화 중...' });
      currentNotes = await reconcileNoteRelationships(currentNotes);
      if (signal.aborted) return;

      const logTitle = '[로그] SHA 동기화 장부';
      const logFolder = '시스템/동기화 로그';
      let logNote = currentNotes.find(n => n.title === logTitle && n.folder === logFolder);
      
      const logContent = `**최종 동기화 시각:** ${new Date().toLocaleString()}\n\n| 파일 경로 | SHA 값 |\n| :--- | :--- |\n${Object.entries(currentLogs).sort((a, b) => a[0].localeCompare(b[0])).map(([path, sha]) => `| ${path} | ${sha} |`).join('\n')}`;
      
      if (logNote) {
        logNote = { ...logNote, content: logContent, lastUpdated: new Date().toISOString() };
        currentNotes = currentNotes.map(n => n.id === logNote!.id ? logNote! : n);
        await saveNotesToFirestore([logNote]);
      } else {
        const newLogNote: Note = {
          id: Math.random().toString(36).substr(2, 9),
          title: logTitle,
          folder: logFolder,
          content: logContent,
          summary: 'GitHub 파일의 현재 동기화된 SHA 정보를 담고 있는 시스템 장부입니다.',
          status: 'Done',
          priority: 'C',
          lastUpdated: new Date().toISOString(),
          version: '1.0.0',
          importance: 1,
          tags: ['system-log'],
          noteType: 'Task',
          relatedNoteIds: [],
          childNoteIds: [],
          parentNoteIds: []
        };
        currentNotes.push(newLogNote);
        await saveNotesToFirestore([newLogNote]);
      }
      
      // const { suggestion } = await suggestNextSteps(currentNotes, state.gcm, signal);
      // if (signal.aborted) return;
      // setNextStepSuggestion(suggestion);

      setState(prev => ({ ...prev, notes: currentNotes }));

      showAlert(
        'GitHub 최신 코드 반영 완료', 
        `분석 완료: ${updateCount}개 스냅샷 업데이트, ${newCount}개 새 스냅샷 생성. (분석된 파일: ${filesActuallyToProcess.length}개)`, 
        'success'
      );

      await handleEnforceHierarchy(currentNotes, true);

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
