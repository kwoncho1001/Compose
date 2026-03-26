import { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Note, AppState, NoteType } from '../types';
import { subscribeSyncLog, saveSyncLog, clearSyncLog } from '../services/syncLog';
import { fetchGithubFiles, fetchGithubFileContent, fetchLatestCommitSha } from '../services/github';
import { updateCodeSnapshot, analyzeLogicUnitDeeply, suggestLogicBoundaries, designTaskFromReferences } from '../services/gemini';
import { extractLogicUnits } from '../utils/codeParser';
import { syncNoteRelationships } from '../utils/noteMirroring';
import { sanitizeNoteIntegrity } from '../utils/integrityChecker';
import { normalizeHierarchy } from '../utils/hierarchyValidator';

/**
 * AI가 생성한 콘텐츠에서 JSON 마크다운 블록이나 불필요한 따옴표를 제거하고 순수 텍스트만 추출합니다.
 */
const parseAIContent = (rawContent: string): string => {
  if (!rawContent) return '';
  try {
    // 만약 내용 전체가 JSON 문자열로 감싸져 있다면 파싱 시도
    const parsed = JSON.parse(rawContent);
    // JSON 객체 내부에 content 필드가 있다면 그것을 반환, 없으면 문자열화하여 반환
    return typeof parsed === 'object' ? (parsed.content || JSON.stringify(parsed, null, 2)) : String(parsed);
  } catch (e) {
    // JSON이 아니면 마크다운 코드 블록(```json ... ```) 제거 및 정리
    return rawContent
      .replace(/```json\s?|```/g, '') // 마크다운 태그 제거
      .replace(/^"|"$/g, '')         // 불필요한 앞뒤 따옴표 제거
      .trim();
  }
};

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

      let currentNotes = [...state.notes];
      let updateCount = 0;
      let newCount = 0;
      const touchedNotes: Note[] = [];
      const allExtractedUnits: { unit: any; file: { path: string; sha: string } }[] = [];
      const processedNoteIdsByFile = new Map<string, string[]>();

      // Phase 1: Extraction & Mapping (All Files)
      for (let i = 0; i < filesActuallyToProcess.length; i++) {
        if (signal.aborted) return;
        const file = filesActuallyToProcess[i];
        
        setProcessStatus({ 
          message: `${file.path} 분석 및 로직 추출 중 (${i + 1}/${filesActuallyToProcess.length})...`,
          current: i + 1,
          total: filesActuallyToProcess.length
        });

        try {
          const content = await fetchGithubFileContent(state.githubRepo, file.path, state.githubToken, signal);
          if (signal.aborted) return;

          const physicalUnits = extractLogicUnits(content, file.path);
          const { logicUnits } = await updateCodeSnapshot(file.path, content, currentNotes, file.sha, physicalUnits, signal);
          if (signal.aborted) return;

          allExtractedUnits.push(...logicUnits.map(u => ({ unit: u, file })));
          currentLogs[file.path] = file.sha;
        } catch (e: any) {
          if (e?.message === "Operation cancelled" || e === "Operation cancelled") {
            throw e; // Re-throw to be caught by the outer catch
          }
          console.error(`Failed to extract units from ${file.path}:`, e);
        }
      }

      if (allExtractedUnits.length === 0) {
        showAlert('알림', '분석된 로직 단위가 없습니다.', 'info');
        setIsSyncing(false);
        setProcessStatus(null);
        return;
      }

      // Phase 2: Analysis Preparation
      const unitsToAnalyze: any[] = [];
      const unitsToSkip: any[] = [];
      const seenLogicHashes = new Set<string>();
      const suggestedTaskMap = new Map<string, string>();

      for (const { unit, file } of allExtractedUnits) {
        if (seenLogicHashes.has(unit.logicHash)) continue;
        seenLogicHashes.add(unit.logicHash);

        // 1. Find/Create Parent Task ID
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
          }
        }

        if (!taskId) continue;

        const globallyExistingRef = currentNotes.find(n => n.noteType === 'Reference' && n.logicHash === unit.logicHash);
        const existingRef = currentNotes.find(n => n.id === unit.matchedReferenceId) || 
                            currentNotes.find(n => n.title === unit.title && n.githubLink && n.githubLink.startsWith(file.path));

        const item = { unit, taskId, file, globallyExistingRef, existingRef };

        if (!forceUpdate && globallyExistingRef) {
          unitsToSkip.push({ ...item, analysis: { content: globallyExistingRef.content, summary: globallyExistingRef.summary, importance: globallyExistingRef.importance, tags: globallyExistingRef.tags } });
        } else if (!forceUpdate && existingRef && existingRef.logicHash === unit.logicHash) {
          unitsToSkip.push({ ...item, analysis: { content: existingRef.content, summary: existingRef.summary, importance: existingRef.importance, tags: existingRef.tags } });
        } else {
          unitsToAnalyze.push(item);
        }
      }

      // Stage 1: Batch Reference Production (Batch 5)
      const producedReferences: Note[] = [];
      const chunkSize = 5;
      
      // 1.1 Analyze units that need deep analysis
      for (let j = 0; j < unitsToAnalyze.length; j += chunkSize) {
        if (signal.aborted) return;
        const chunk = unitsToAnalyze.slice(j, j + chunkSize);
        setProcessStatus({ message: `로직 심층 분석 및 부품 생산 중 (${j + 1}~${Math.min(j + chunkSize, unitsToAnalyze.length)}/${unitsToAnalyze.length})...` });
        
        const results = await Promise.all(chunk.map(async (item) => {
          const taskNote = currentNotes.find(n => n.id === item.taskId) || 
                           (item.unit.suggestedTask ? { title: item.unit.suggestedTask.title, content: item.unit.suggestedTask.content, summary: item.unit.suggestedTask.summary } : null);
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
        }));
        
        // Convert analyzed results to real Reference notes immediately
        for (const res of results) {
          if (!res) continue;
          const { unit, taskId, analysis, existingRef, file } = res;
          const fileName = file.path.split('/').pop() || file.path;
          const sourceUrl = `${state.githubRepo}/blob/main/${file.path}#${unit.title}`;
          
          let finalNote: Note;
          if (existingRef) {
            finalNote = {
              ...existingRef,
              title: unit.title,
              content: parseAIContent(analysis.content),
              summary: analysis.summary,
              importance: analysis.importance,
              tags: Array.from(new Set([...(existingRef.tags || []), ...analysis.tags])),
              lastUpdated: new Date().toISOString(),
              parentNoteIds: [taskId],
              folder: `시스템/소스/${file.path}`,
              logicHash: unit.logicHash,
              originPath: file.path,
              fileName,
              filePath: file.path,
              sourceUrl,
              githubLink: `${file.path}#${unit.title}`,
              sha: file.sha
            };
            currentNotes = currentNotes.map(n => n.id === finalNote.id ? finalNote : n);
            updateCount++;
          } else {
            finalNote = {
              id: Math.random().toString(36).substr(2, 9),
              title: unit.title,
              folder: `시스템/소스/${file.path}`,
              content: parseAIContent(analysis.content),
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
              relatedNoteIds: [],
              githubLink: `${file.path}#${unit.title}`,
              originPath: file.path,
              fileName,
              filePath: file.path,
              sourceUrl,
              logicHash: unit.logicHash,
              sha: file.sha
            };
            currentNotes.push(finalNote);
            newCount++;
          }
          producedReferences.push(finalNote);
          touchedNotes.push(finalNote);
        }
        
        // Add a small delay between batches to avoid overwhelming the API
        if (j + chunkSize < unitsToAnalyze.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // 1.2 Process skipped units (already have latest analysis)
      for (const item of unitsToSkip) {
        const { unit, taskId, analysis, globallyExistingRef, existingRef, file } = item;
        const targetRef = globallyExistingRef || existingRef;
        if (!targetRef) continue;

        const fileName = file.path.split('/').pop() || file.path;
        const sourceUrl = `${state.githubRepo}/blob/main/${file.path}#${unit.title}`;

        const updatedRef: Note = {
          ...targetRef,
          parentNoteIds: Array.from(new Set([...(targetRef.parentNoteIds || []), taskId])),
          relatedNoteIds: Array.from(new Set([...(targetRef.relatedNoteIds || []), taskId])),
          lastUpdated: new Date().toISOString(),
          sha: file.sha // Update SHA even if logic hash is same
        };
        
        currentNotes = currentNotes.map(n => n.id === updatedRef.id ? updatedRef : n);
        producedReferences.push(updatedRef);
        touchedNotes.push(updatedRef);
        updateCount++;
      }

      // Stage 2: Batch Task/Feature Design (Batch 5)
      // Group produced references by their parent Task ID
      const taskGroups = new Map<string, { taskId: string; title: string; references: Note[]; suggestedData?: any }>();
      
      // We need to map all processed units back to their task groups, using the produced notes for content
      for (const item of [...unitsToAnalyze, ...unitsToSkip]) {
        const key = item.taskId;
        const producedNote = producedReferences.find(n => n.logicHash === item.unit.logicHash);
        if (!producedNote) continue;

        if (!taskGroups.has(key)) {
          const existing = currentNotes.find(n => n.id === key);
          taskGroups.set(key, { 
            taskId: key, 
            title: existing?.title || item.unit.suggestedTask?.title || "Unknown Task", 
            references: [],
            suggestedData: item.unit.suggestedTask
          });
        }
        taskGroups.get(key)!.references.push(producedNote);
      }

      const taskGroupsToDesign = Array.from(taskGroups.values());
      for (let j = 0; j < taskGroupsToDesign.length; j += chunkSize) {
        if (signal.aborted) return;
        const chunk = taskGroupsToDesign.slice(j, j + chunkSize);
        setProcessStatus({ message: `상위 설계(Task/Feature) 정밀 디자인 중 (${j + 1}~${Math.min(j + chunkSize, taskGroupsToDesign.length)}/${taskGroupsToDesign.length})...` });

        await Promise.all(chunk.map(async (group) => {
          const existingTask = currentNotes.find(n => n.id === group.taskId);
          // Only redesign if it's a new task or if any of its references were newly analyzed/forced
          const hasNewAnalysis = group.references.some(ref => touchedNotes.some(tn => tn.id === ref.id)) || forceUpdate;
          
          if (!existingTask || hasNewAnalysis) {
            try {
              const design = await designTaskFromReferences(
                group.title,
                group.references.map(r => ({ title: r.title, summary: r.summary, content: r.content })),
                existingTask,
                signal
              );

              let finalTask: Note;
              if (existingTask) {
                finalTask = {
                  ...existingTask,
                  content: design.content,
                  summary: design.summary,
                  folder: design.folder,
                  importance: design.importance,
                  tags: Array.from(new Set([...(existingTask.tags || []), ...design.tags])),
                  lastUpdated: new Date().toISOString(),
                  childNoteIds: Array.from(new Set([...(existingTask.childNoteIds || []), ...group.references.map(r => r.id)]))
                };
                currentNotes = currentNotes.map(n => n.id === finalTask.id ? finalTask : n);
              } else {
                finalTask = {
                  id: group.taskId,
                  title: group.title,
                  folder: design.folder,
                  content: design.content,
                  summary: design.summary,
                  noteType: (group.suggestedData?.noteType as NoteType) || 'Task',
                  status: 'Done',
                  priority: 'C',
                  version: '1.0.0',
                  lastUpdated: new Date().toISOString(),
                  importance: design.importance,
                  tags: design.tags,
                  relatedNoteIds: [],
                  childNoteIds: group.references.map(r => r.id),
                  parentNoteIds: []
                };
                currentNotes.push(finalTask);
                newCount++;
              }
              if (!touchedNotes.some(tn => tn.id === finalTask.id)) touchedNotes.push(finalTask);
            } catch (e) {
              console.error(`Failed to design task ${group.title}:`, e);
              // Fallback for new tasks if design fails
              if (!existingTask && group.suggestedData) {
                const newTask: Note = {
                  id: group.taskId,
                  title: group.title,
                  folder: group.suggestedData.folder,
                  content: group.suggestedData.content,
                  summary: group.suggestedData.summary,
                  noteType: (group.suggestedData.noteType as NoteType) || 'Task',
                  status: 'Done',
                  priority: 'C',
                  version: '1.0.0',
                  lastUpdated: new Date().toISOString(),
                  importance: 3,
                  tags: group.suggestedData.tags || ['auto-generated'],
                  relatedNoteIds: [],
                  childNoteIds: group.references.map(r => r.id),
                  parentNoteIds: []
                };
                currentNotes.push(newTask);
                touchedNotes.push(newTask);
                newCount++;
              }
            }
          } else {
            // Even if not redesigned, ensure childNoteIds are linked
            const updatedTask = {
              ...existingTask,
              childNoteIds: Array.from(new Set([...(existingTask.childNoteIds || []), ...group.references.map(r => r.id)]))
            };
            if (JSON.stringify(updatedTask.childNoteIds) !== JSON.stringify(existingTask.childNoteIds)) {
              currentNotes = currentNotes.map(n => n.id === updatedTask.id ? updatedTask : n);
              if (!touchedNotes.some(tn => tn.id === updatedTask.id)) touchedNotes.push(updatedTask);
            }
          }
        }));

        // Add a small delay between batches
        if (j + chunkSize < taskGroupsToDesign.length) {
          await new Promise(resolve => setTimeout(resolve, 1500));
        }
      }

      // Final Phase: Discarded Notes & Cleanup
      // Track processed IDs per file for discarded notes logic
      for (const ref of producedReferences) {
        if (ref.filePath) {
          const ids = processedNoteIdsByFile.get(ref.filePath) || [];
          ids.push(ref.id);
          processedNoteIdsByFile.set(ref.filePath, ids);
        }
      }

      // Handle Discarded Notes (Per File)
      for (const [filePath, processedIds] of processedNoteIdsByFile.entries()) {
        const oldNoteIds = currentNotes.filter(n => n.noteType === 'Reference' && n.githubLink && n.githubLink.startsWith(filePath)).map(n => n.id);
        const discardedNoteIds = oldNoteIds.filter(id => !processedIds.includes(id));
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
      }


      if (touchedNotes.length > 0) {
        await saveNotesToFirestore(touchedNotes);
      }
      
      const now = new Date().toISOString();
      if (userId && currentProjectId) {
        await saveSyncLog(userId, currentProjectId, currentLogs);
      }
      await syncProject({ lastSyncedAt: now });

      setState(prev => ({ 
        ...prev, 
        notes: currentNotes,
        fileSyncLogs: { ...currentLogs },
        lastSyncedAt: now
      }));


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
