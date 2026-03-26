import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { Note, SyncRegistry, SyncEntry, NoteType } from '../types';
import { fetchGithubFileContent } from './github';
import { updateCodeSnapshot, analyzeLogicUnitDeeply, designTaskFromReferences, analyzeAndMapUnit } from './gemini';
import { extractLogicUnits } from '../utils/codeParser';
import { generateDeterministicId, generateTaskDeterministicId } from '../utils/idGenerator';

const SYNC_REGISTRY_ID = 'sync_index';

/**
 * AI가 생성한 콘텐츠에서 JSON 마크다운 블록이나 불필요한 따옴표를 제거하고 순수 텍스트만 추출합니다.
 */
export const parseAIContent = (rawContent: string): string => {
  if (!rawContent) return '';
  try {
    const parsed = JSON.parse(rawContent);
    return typeof parsed === 'object' ? (parsed.content || JSON.stringify(parsed, null, 2)) : String(parsed);
  } catch (e) {
    return rawContent
      .replace(/```json\s?|```/g, '')
      .replace(/^"|"$/g, '')
      .trim();
  }
};

export interface ExtractedUnit {
  unit: any;
  file: { path: string; sha: string };
}

export interface AnalysisItem {
  unit: any;
  taskId: string;
  file: { path: string; sha: string };
  globallyExistingRef?: Note;
  existingRef?: Note;
  analysis?: any;
}

export interface TaskGroup {
  taskId: string;
  title: string;
  references: Note[];
  suggestedData?: any;
}

/**
 * Phase 1 & 2: 원자적 분해 및 지문 생성
 */
export const decomposeAndHash = (fileContent: string, filePath: string) => {
  const units = extractLogicUnits(fileContent, filePath);
  return units.map(unit => ({
    ...unit,
    filePath
  }));
};

// ... existing registry functions ...

export const getSyncRegistry = async (userId: string, projectId: string): Promise<SyncRegistry | null> => {
  const registryRef = doc(db, 'users', userId, 'projects', projectId, 'sync', SYNC_REGISTRY_ID);
  try {
    const snap = await getDoc(registryRef);
    if (snap.exists()) {
      return snap.data() as SyncRegistry;
    }
    return null;
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, registryRef.path);
    return null;
  }
};

export const updateSyncRegistry = async (userId: string, projectId: string, registry: SyncRegistry) => {
  const registryRef = doc(db, 'users', userId, 'projects', projectId, 'sync', SYNC_REGISTRY_ID);
  try {
    await setDoc(registryRef, registry);
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, registryRef.path);
  }
};

export const getNote = async (userId: string, projectId: string, noteId: string): Promise<Note | null> => {
  const noteRef = doc(db, 'users', userId, 'projects', projectId, 'notes', noteId);
  try {
    const snap = await getDoc(noteRef);
    if (snap.exists()) {
      return snap.data() as Note;
    }
    return null;
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, noteRef.path);
    return null;
  }
};

export const saveNoteWithRegistry = async (
  userId: string, 
  projectId: string, 
  note: Note, 
  entry: SyncEntry,
  cleanObject: (obj: any) => any
) => {
  const batch = writeBatch(db);
  const noteRef = doc(db, 'users', userId, 'projects', projectId, 'notes', note.id);
  const registryRef = doc(db, 'users', userId, 'projects', projectId, 'sync', SYNC_REGISTRY_ID);

  batch.set(noteRef, cleanObject(note));
  
  // We need to update the registry as well.
  // Since we don't have the full registry here, we'll use a field update if possible,
  // but for simplicity in this implementation, we'll assume the registry is managed at a higher level
  // or we'll fetch and update.
  // Actually, using `setDoc` with `merge: true` on the registry might be better for individual updates.
  batch.set(registryRef, {
    entries: {
      [note.id]: entry
    },
    lastSyncedAt: new Date().toISOString()
  }, { merge: true });

  try {
    await batch.commit();
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, 'save-note-with-registry');
  }
};

export const saveNotesBatchWithRegistry = async (
  userId: string,
  projectId: string,
  notes: Note[],
  entries: Record<string, SyncEntry>,
  cleanObject: (obj: any) => any
) => {
  const batch = writeBatch(db);
  const registryRef = doc(db, 'users', userId, 'projects', projectId, 'sync', SYNC_REGISTRY_ID);

  notes.forEach(note => {
    const noteRef = doc(db, 'users', userId, 'projects', projectId, 'notes', note.id);
    batch.set(noteRef, cleanObject(note));
  });

  batch.set(registryRef, {
    entries: entries,
    lastSyncedAt: new Date().toISOString()
  }, { merge: true });

  try {
    await batch.commit();
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, 'save-notes-batch-with-registry');
  }
};

export const deleteNotesWithRegistry = async (
  userId: string,
  projectId: string,
  noteIds: string[],
  registry: SyncRegistry
) => {
  const batch = writeBatch(db);
  const registryRef = doc(db, 'users', userId, 'projects', projectId, 'sync', SYNC_REGISTRY_ID);

  noteIds.forEach(id => {
    const noteRef = doc(db, 'users', userId, 'projects', projectId, 'notes', id);
    batch.delete(noteRef);
    delete registry.entries[id];
  });

  batch.set(registryRef, registry);

  try {
    await batch.commit();
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, 'delete-notes-with-registry');
  }
};

// --- Phase 0: Pre-fetch Filtering ---
export const filterFilesPhase = (
  githubFiles: { path: string; sha: string }[],
  syncLog: Record<string, string>,
  currentNotes: Note[],
  forceUpdate: boolean
): { filesToProcess: { path: string; sha: string }[]; skippedItems: AnalysisItem[] } => {
  console.log("Phase 0 시작: SHA 기반 사전 필터링");
  const filesToProcess: { path: string; sha: string }[] = [];
  const skippedItems: AnalysisItem[] = [];

  for (const file of githubFiles) {
    const lastSyncedSha = syncLog[file.path];
    
    if (!forceUpdate && lastSyncedSha === file.sha) {
      // SHA가 동일하면 Fetch 건너뜀. 기존 노드들을 추적 목록에 추가.
      const existingRefs = currentNotes.filter(n => 
        n.noteType === 'Reference' && 
        n.filePath === file.path
      );
      
      for (const ref of existingRefs) {
        skippedItems.push({
          unit: { 
            title: ref.title, 
            logicHash: ref.logicHash,
            codeSnippet: "" // Fetch를 안했으므로 스니펫은 없지만, 추적용으로는 충분
          },
          taskId: ref.parentNoteIds?.[0] || 'unmapped_task',
          file,
          globallyExistingRef: ref,
          existingRef: ref
        });
      }
    } else {
      filesToProcess.push(file);
    }
  }
  
  console.log(`Phase 0 완료. 처리 대상: ${filesToProcess.length}개, 건너뜀: ${githubFiles.length - filesToProcess.length}개`);
  return { filesToProcess, skippedItems };
};

// --- Phase 1: Local Extraction ---
export const extractPhase = async (
  githubRepo: string,
  githubToken: string,
  files: { path: string; sha: string }[],
  setProcessStatus: (status: any) => void,
  signal?: AbortSignal
): Promise<{ unit: any, file: any, content: string }[]> => {
  const allExtractedUnits: { unit: any, file: any, content: string }[] = [];

  for (let i = 0; i < files.length; i++) {
    if (signal?.aborted) throw new Error("Operation cancelled");
    const file = files[i];
    
    setProcessStatus({ 
      message: `${file.path} 로직 추출 중 (${i + 1}/${files.length})...`,
      current: i + 1,
      total: files.length
    });

    try {
      const content = await fetchGithubFileContent(githubRepo, file.path, githubToken, signal);
      const physicalUnits = extractLogicUnits(content, file.path);
      allExtractedUnits.push(...physicalUnits.map(u => ({ unit: u, file, content })));
    } catch (e: any) {
      console.error(`Failed to extract units from ${file.path}:`, e);
    }
  }
  return allExtractedUnits;
};

// --- Phase 2: Analysis Preparation (Filtering) ---
export const prepareAnalysisPhase = (
  allExtractedUnits: { unit: any, file: any, content: string }[],
  currentNotes: Note[],
  forceUpdate: boolean
): { unitsToAnalyze: any[]; unitsToSkip: any[] } => {
  const unitsToAnalyze: any[] = [];
  const unitsToSkip: any[] = [];
  const seenLogicHashes = new Set<string>();

  for (const item of allExtractedUnits) {
    const { unit, file } = item;
    if (seenLogicHashes.has(unit.logicHash)) continue;
    seenLogicHashes.add(unit.logicHash);

    const globallyExistingRef = currentNotes.find(n => n.noteType === 'Reference' && n.logicHash === unit.logicHash);
    const existingRef = currentNotes.find(n => n.title === unit.title && n.githubLink && n.githubLink.startsWith(file.path));

    if (!forceUpdate && globallyExistingRef) {
      unitsToSkip.push({ ...item, globallyExistingRef });
    } else if (!forceUpdate && existingRef && existingRef.logicHash === unit.logicHash) {
      unitsToSkip.push({ ...item, existingRef });
    } else {
      unitsToAnalyze.push(item);
    }
  }
  return { unitsToAnalyze, unitsToSkip };
};

// --- Phase 3: Mapping & Reference Production ---
export const analyzeReferencesPhase = async (
  userId: string,
  projectId: string,
  unitsToAnalyze: any[],
  unitsToSkip: any[],
  currentNotes: Note[],
  githubRepo: string,
  saveNotesToFirestore: (notes: Note[]) => Promise<void>,
  setProcessStatus: (status: any) => void,
  signal?: AbortSignal
): Promise<{ producedReferences: Note[]; updatedNotes: Note[]; analyzedItems: AnalysisItem[] }> => {
  let workingNotes = [...currentNotes];
  const producedReferences: Note[] = [];
  const analyzedItems: AnalysisItem[] = [];
  const chunkSize = 5;

  const existingTasks = workingNotes
    .filter(n => n.noteType === 'Task' || n.noteType === 'Feature')
    .map(n => ({ id: n.id, title: n.title, summary: n.summary }));

  const suggestedTaskMap = new Map<string, string>();

  for (let j = 0; j < unitsToAnalyze.length; j += chunkSize) {
    if (signal?.aborted) throw new Error("Operation cancelled");
    const chunk = unitsToAnalyze.slice(j, j + chunkSize);
    
    const results = await Promise.allSettled(chunk.map(async (item) => {
      // 1. Integrated Mapping & Analysis (AI)
      const result = await analyzeAndMapUnit({
        title: item.unit.title,
        codeSnippet: item.unit.codeSnippet
      }, existingTasks, signal);

      let taskId = result.matchedTaskId;
      let suggestedTask = result.suggestedTask;
      const analysis = result.analysis;

      if (!taskId && suggestedTask) {
        const existingTask = workingNotes.find(n => n.title === suggestedTask!.title);
        if (existingTask) {
          taskId = existingTask.id;
        } else if (suggestedTaskMap.has(suggestedTask.title)) {
          taskId = suggestedTaskMap.get(suggestedTask.title);
        } else {
          const newTaskId = generateTaskDeterministicId(projectId, suggestedTask.title);
          suggestedTaskMap.set(suggestedTask.title, newTaskId);
          taskId = newTaskId;
        }
      }

      if (!taskId) taskId = 'unmapped_task';

      return { ...item, analysis, taskId, suggestedTask };
    }));

    const batchNotes: Note[] = [];
    for (const res of results) {
      if (res.status !== 'fulfilled' || !res.value) continue;
      const { unit, taskId, analysis, existingRef, file, suggestedTask } = res.value;
      
      const analyzedItem: AnalysisItem = { ...res.value };
      analyzedItems.push(analyzedItem);

      const fileName = file.path.split('/').pop() || file.path;
      const sourceUrl = `${githubRepo}/blob/main/${file.path}#${unit.title}`;
      
      let finalNote: Note;
      if (existingRef) {
        finalNote = {
          ...existingRef,
          title: analysis.title,
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
        workingNotes = workingNotes.map(n => n.id === finalNote.id ? finalNote : n);
      } else {
        finalNote = {
          id: generateDeterministicId(file.path, unit.logicHash),
          title: analysis.title,
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
        workingNotes.push(finalNote);
      }
      producedReferences.push(finalNote);
      batchNotes.push(finalNote);

      // If suggestedTask exists and taskId was newly generated, we need to handle it in Phase 4
      // For now, we just ensure taskId is consistent
    }

    if (batchNotes.length > 0) {
      await saveNotesToFirestore(batchNotes);
    }
  }

  // Handle skipped units
  for (const item of unitsToSkip) {
    const { globallyExistingRef, existingRef, file } = item;
    const targetRef = globallyExistingRef || existingRef;
    if (!targetRef) continue;

    const taskId = targetRef.parentNoteIds?.[0] || 'unmapped_task';
    analyzedItems.push({ ...item, taskId, existingRef: targetRef });

    const updatedRef: Note = {
      ...targetRef,
      lastUpdated: new Date().toISOString(),
      sha: file.sha
    };
    
    workingNotes = workingNotes.map(n => n.id === updatedRef.id ? updatedRef : n);
    producedReferences.push(updatedRef);
  }
  
  // Save skipped notes to ensure their SHA/timestamp is updated in DB
  const skippedNotes = producedReferences.filter(n => !analyzedItems.some(ai => ai.unit.logicHash === n.logicHash));
  if (skippedNotes.length > 0) {
    await saveNotesToFirestore(skippedNotes);
  }

  return { producedReferences, updatedNotes: workingNotes, analyzedItems };
};

// --- Phase 4: Task/Feature Design ---
export const designTasksPhase = async (
  userId: string,
  projectId: string,
  producedReferences: Note[],
  allProcessedUnits: AnalysisItem[],
  currentNotes: Note[],
  forceUpdate: boolean,
  saveNotesToFirestore: (notes: Note[]) => Promise<void>,
  setProcessStatus: (status: any) => void,
  signal?: AbortSignal
): Promise<Note[]> => {
  console.log("Phase 4 시작: Task/Feature 정밀 디자인");
  
  let workingNotes = [...currentNotes];
  const touchedNotes: Note[] = [];
  const chunkSize = 5;

  const taskGroups = new Map<string, TaskGroup>();
  for (const item of allProcessedUnits) {
    const key = item.taskId;
    const producedNote = producedReferences.find(n => n.logicHash === item.unit.logicHash);
    if (!producedNote) continue;

    if (!taskGroups.has(key)) {
      const existing = workingNotes.find(n => n.id === key);
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
  console.log("디자인 대상 Task 그룹 개수:", taskGroupsToDesign.length);

  for (let j = 0; j < taskGroupsToDesign.length; j += chunkSize) {
    if (signal?.aborted) throw new Error("Operation cancelled");
    const chunk = taskGroupsToDesign.slice(j, j + chunkSize);
    setProcessStatus({ message: `상위 설계(Task/Feature) 정밀 디자인 중 (${j + 1}~${Math.min(j + chunkSize, taskGroupsToDesign.length)}/${taskGroupsToDesign.length})...` });

    console.log(`배치 디자인 중 (${j + 1}~${Math.min(j + chunkSize, taskGroupsToDesign.length)}/${taskGroupsToDesign.length})`);

    const results = await Promise.allSettled(chunk.map(async (group) => {
      const existingTask = workingNotes.find(n => n.id === group.taskId);
      // Only redesign if it's a new task or if any of its references were newly analyzed
      const hasNewAnalysis = forceUpdate || !existingTask; 
      
      if (!existingTask || hasNewAnalysis) {
        const design = await designTaskFromReferences(
          group.title,
          group.references.map(r => ({ title: r.title, summary: r.summary, content: r.content })),
          existingTask,
          signal
        );
        return { group, design, existingTask };
      }
      return { group, existingTask, skip: true };
    }));

    const batchTasks: Note[] = [];
    for (const res of results) {
      if (res.status !== 'fulfilled' || !res.value || res.value.skip) continue;
      const { group, design, existingTask } = res.value;
      
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
        workingNotes = workingNotes.map(n => n.id === finalTask.id ? finalTask : n);
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
        workingNotes.push(finalTask);
      }
      batchTasks.push(finalTask);
    }

    if (batchTasks.length > 0) {
      console.log(`배치 저장 중 (${batchTasks.length}개)`);
      await saveNotesToFirestore(batchTasks);
    }

    if (j + chunkSize < taskGroupsToDesign.length) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }

  console.log("Phase 4 완료.");
  return workingNotes;
};

// --- Phase 5: Cleanup & Finalization ---
export const cleanupPhase = async (
  currentNotes: Note[],
  allProcessedUnits: AnalysisItem[],
  githubFiles: { path: string; sha: string }[],
  saveNotesToFirestore: (notes: Note[]) => Promise<void>
): Promise<Note[]> => {
  console.log("Phase 5 시작: 폐기된 노드 처리 및 마무리");
  
  let workingNotes = [...currentNotes];
  const touchedNotes: Note[] = [];
  const processedNoteIdsByFile = new Map<string, string[]>();

  // 1. 이번 동기화에서 확인된(분석됨 + 건너뜀) ID들을 파일별로 분류
  for (const item of allProcessedUnits) {
    const producedNote = workingNotes.find(n => n.logicHash === item.unit.logicHash);
    if (producedNote && producedNote.filePath) {
      const ids = processedNoteIdsByFile.get(producedNote.filePath) || [];
      if (!ids.includes(producedNote.id)) {
        ids.push(producedNote.id);
        processedNoteIdsByFile.set(producedNote.filePath, ids);
      }
    }
  }

  // 2. 파일 내에서 사라진 로직 단위 처리 (파일은 존재하나 일부 로직이 삭제된 경우)
  for (const [filePath, processedIds] of processedNoteIdsByFile.entries()) {
    const oldNoteIds = workingNotes
      .filter(n => n.noteType === 'Reference' && n.githubLink && n.githubLink.startsWith(filePath))
      .map(n => n.id);
    
    const discardedNoteIds = oldNoteIds.filter(id => !processedIds.includes(id));
    
    for (const id of discardedNoteIds) {
      const noteIndex = workingNotes.findIndex(n => n.id === id);
      if (noteIndex !== -1 && workingNotes[noteIndex].status !== 'Deprecated') {
        const discardedNote = { 
          ...workingNotes[noteIndex],
          folder: '시스템/폐기된 소스',
          parentNoteIds: [],
          status: 'Deprecated' as const,
          tags: Array.from(new Set([...(workingNotes[noteIndex].tags || []), 'discarded']))
        };
        workingNotes[noteIndex] = discardedNote;
        touchedNotes.push(discardedNote);
      }
    }
  }

  // 3. 완전히 삭제된 파일 처리 (GitHub 트리에는 없으나 노트에는 존재하는 파일)
  const currentFilePaths = new Set(githubFiles.map(f => f.path));
  for (let i = 0; i < workingNotes.length; i++) {
    const note = workingNotes[i];
    if (note.noteType === 'Reference' && note.filePath && !currentFilePaths.has(note.filePath)) {
      if (note.status !== 'Deprecated') {
        const deletedNote = {
          ...note,
          status: 'Deprecated' as const,
          folder: '시스템/폐기된 소스',
          parentNoteIds: [],
          tags: Array.from(new Set([...(note.tags || []), 'file_deleted']))
        };
        workingNotes[i] = deletedNote;
        touchedNotes.push(deletedNote);
      }
    }
  }

  if (touchedNotes.length > 0) {
    console.log(`폐기된 노드 저장 중 (${touchedNotes.length}개)`);
    await saveNotesToFirestore(touchedNotes);
  }

  console.log("Phase 5 완료.");
  return workingNotes;
};
