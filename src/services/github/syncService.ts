import { Note, NoteType } from '../../types';
import { extractLogicUnits } from '../../utils/codeParser';
import { updateCodeSnapshot, analyzeLogicUnitDeeply, designTaskFromReferences } from '../gemini';
import { fetchGithubFileContent } from '../github';

export interface SyncContext {
  githubRepo: string;
  githubToken: string;
  notes: Note[];
  signal?: AbortSignal;
}

export interface ExtractionResult {
  allExtractedUnits: { unit: any; file: { path: string; sha: string } }[];
  updatedLogs: Record<string, string>;
}

/**
 * Phase 1: Extraction & Mapping
 * 소스 파일에서 로직 단위를 추출하고 스냅샷을 업데이트합니다.
 */
export async function extractUnitsPhase(
  filesToProcess: { path: string; sha: string }[],
  context: SyncContext,
  currentLogs: Record<string, string>,
  onProgress: (message: string, current: number, total: number) => void
): Promise<ExtractionResult> {
  const { githubRepo, githubToken, notes, signal } = context;
  const allExtractedUnits: { unit: any; file: { path: string; sha: string } }[] = [];
  const newLogs = { ...currentLogs };

  for (let i = 0; i < filesToProcess.length; i++) {
    if (signal?.aborted) throw new Error('Operation cancelled');
    const file = filesToProcess[i];
    
    onProgress(`${file.path} 분석 및 로직 추출 중`, i + 1, filesToProcess.length);

    try {
      const content = await fetchGithubFileContent(githubRepo, file.path, githubToken, signal);
      if (signal?.aborted) throw new Error('Operation cancelled');

      const physicalUnits = extractLogicUnits(content, file.path);
      const { logicUnits } = await updateCodeSnapshot(file.path, content, notes, file.sha, physicalUnits, signal);
      if (signal?.aborted) throw new Error('Operation cancelled');

      allExtractedUnits.push(...logicUnits.map(u => ({ unit: u, file })));
      newLogs[file.path] = file.sha;
    } catch (e: any) {
      if (e?.message === "Operation cancelled" || e === "Operation cancelled") throw e;
      console.error(`Failed to extract units from ${file.path}:`, e);
    }
  }

  return { allExtractedUnits, updatedLogs: newLogs };
}

/**
 * Phase 2: Analysis Preparation & Execution
 * 추출된 로직 단위를 Gemini를 통해 심층 분석합니다.
 */
export async function analyzeReferencesPhase(
  allExtractedUnits: { unit: any; file: { path: string; sha: string } }[],
  context: SyncContext,
  forceUpdate: boolean,
  onProgress: (message: string) => void
): Promise<any[]> {
  const { notes, signal } = context;
  const unitsToAnalyze: any[] = [];
  const unitsToSkip: any[] = [];
  const seenLogicHashes = new Set<string>();
  const suggestedTaskMap = new Map<string, string>();

  for (const { unit, file } of allExtractedUnits) {
    if (seenLogicHashes.has(unit.logicHash)) continue;
    seenLogicHashes.add(unit.logicHash);

    let taskId = unit.matchedTaskId;
    if (!taskId && unit.suggestedTask) {
      const existingTask = notes.find(n => 
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

    const globallyExistingRef = notes.find(n => n.noteType === 'Reference' && n.logicHash === unit.logicHash);
    const existingRef = notes.find(n => n.id === unit.matchedReferenceId) || 
                        notes.find(n => n.title === unit.title && n.githubLink && n.githubLink.startsWith(file.path));

    const item = { unit, taskId, file, globallyExistingRef, existingRef };

    if (!forceUpdate && globallyExistingRef) {
      unitsToSkip.push({ ...item, analysis: { content: globallyExistingRef.content, summary: globallyExistingRef.summary, importance: globallyExistingRef.importance, tags: globallyExistingRef.tags } });
    } else if (!forceUpdate && existingRef && existingRef.logicHash === unit.logicHash) {
      unitsToSkip.push({ ...item, analysis: { content: existingRef.content, summary: existingRef.summary, importance: existingRef.importance, tags: existingRef.tags } });
    } else {
      unitsToAnalyze.push(item);
    }
  }

  const analyzedResults: any[] = [];
  const chunkSize = 5;
  for (let j = 0; j < unitsToAnalyze.length; j += chunkSize) {
    if (signal?.aborted) throw new Error('Operation cancelled');
    const chunk = unitsToAnalyze.slice(j, j + chunkSize);
    onProgress(`로직 심층 분석 중 (${j + 1}~${Math.min(j + chunkSize, unitsToAnalyze.length)}/${unitsToAnalyze.length})...`);
    
    const results = await Promise.all(chunk.map(async (item) => {
      const taskNote = notes.find(n => n.id === item.taskId) || 
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
    analyzedResults.push(...results.filter(r => r !== null));
  }

  return [...unitsToSkip, ...analyzedResults];
}

/**
 * Phase 3: Task/Feature Design
 * 분석된 레퍼런스를 바탕으로 상위 태스크의 내용을 업데이트하거나 생성합니다.
 */
export async function designTasksPhase(
  allProcessedUnits: any[],
  context: SyncContext,
  forceUpdate: boolean,
  onProgress: (message: string) => void
): Promise<{ updatedNotes: Note[]; newCount: number }> {
  const { notes, signal } = context;
  let currentNotes = [...notes];
  let newCount = 0;
  const chunkSize = 5;

  const taskGroups = new Map<string, { taskId: string; title: string; units: any[]; suggestedData?: any }>();
  for (const item of allProcessedUnits) {
    const key = item.taskId;
    if (!taskGroups.has(key)) {
      const existing = currentNotes.find(n => n.id === key);
      taskGroups.set(key, { 
        taskId: key, 
        title: existing?.title || item.unit.suggestedTask?.title || "Unknown Task", 
        units: [],
        suggestedData: item.unit.suggestedTask
      });
    }
    taskGroups.get(key)!.units.push(item);
  }

  const taskGroupsToDesign = Array.from(taskGroups.values());
  for (let j = 0; j < taskGroupsToDesign.length; j += chunkSize) {
    if (signal?.aborted) throw new Error('Operation cancelled');
    const chunk = taskGroupsToDesign.slice(j, j + chunkSize);
    onProgress(`상위 설계(Task/Feature) 정밀 디자인 중 (${j + 1}~${Math.min(j + chunkSize, taskGroupsToDesign.length)}/${taskGroupsToDesign.length})...`);

    await Promise.all(chunk.map(async (group) => {
      const existingTask = currentNotes.find(n => n.id === group.taskId);
      const hasNewAnalysis = group.units.some(u => !u.globallyExistingRef && !u.existingRef) || forceUpdate;
      
      if (!existingTask || hasNewAnalysis) {
        try {
          const design = await designTaskFromReferences(
            group.title,
            group.units.map(u => ({ title: u.unit.title, summary: u.analysis.summary, content: u.analysis.content })),
            existingTask,
            signal
          );

          if (existingTask) {
            const updatedTask = {
              ...existingTask,
              content: design.content,
              summary: design.summary,
              folder: design.folder,
              importance: design.importance,
              tags: Array.from(new Set([...(existingTask.tags || []), ...design.tags])),
              lastUpdated: new Date().toISOString()
            };
            currentNotes = currentNotes.map(n => n.id === updatedTask.id ? updatedTask : n);
          } else {
            const newTask: Note = {
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
              childNoteIds: [],
              parentNoteIds: []
            };
            currentNotes.push(newTask);
            newCount++;
          }
        } catch (e) {
          console.error(`Failed to design task ${group.title}:`, e);
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
              childNoteIds: [],
              parentNoteIds: []
            };
            currentNotes.push(newTask);
            newCount++;
          }
        }
      }
    }));
  }

  return { updatedNotes: currentNotes, newCount };
}

/**
 * Phase 4: Metadata & Relationship Reconciliation
 * 노트 간의 관계를 복구하고 SHA 장부를 업데이트합니다.
 */
export function reconcileMetadataPhase(
  allProcessedUnits: any[],
  currentNotes: Note[],
  githubRepo: string
): { finalNotes: Note[]; updateCount: number; newCount: number } {
  let notes = [...currentNotes];
  let updateCount = 0;
  let newCount = 0;

  for (const item of allProcessedUnits) {
    const { unit, taskId, analysis, globallyExistingRef, existingRef, file } = item;
    const taskNoteIndex = notes.findIndex(n => n.id === taskId);
    if (taskNoteIndex === -1) continue;
    const taskNote = { ...notes[taskNoteIndex] };

    let finalNote: Note;
    const fileName = file.path.split('/').pop() || file.path;
    const sourceUrl = `${githubRepo}/blob/main/${file.path}#${unit.title}`;

    if (globallyExistingRef && globallyExistingRef.originPath !== file.path) {
      finalNote = {
        ...globallyExistingRef,
        parentNoteIds: [taskId],
        relatedNoteIds: Array.from(new Set([...(globallyExistingRef.relatedNoteIds || []), taskId])),
        lastUpdated: new Date().toISOString()
      };
      notes = notes.map(n => n.id === finalNote.id ? finalNote : n);
      updateCount++;
    } else if (existingRef) {
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
      notes = notes.map(n => n.id === finalNote.id ? finalNote : n);
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
      notes.push(finalNote);
      newCount++;
    }

    if (!taskNote.childNoteIds.includes(finalNote.id)) {
      taskNote.childNoteIds = [...taskNote.childNoteIds, finalNote.id];
      notes[taskNoteIndex] = taskNote;
    }
  }

  return { finalNotes: notes, updateCount, newCount };
}

/**
 * AI가 생성한 콘텐츠에서 JSON 마크다운 블록이나 불필요한 따옴표를 제거하고 순수 텍스트만 추출합니다.
 */
function parseAIContent(rawContent: string): string {
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
}
