import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './Sidebar';
import { NoteEditor } from './NoteEditor';
import { GCMViewer } from './GCMViewer';
import { ExternalTransferSidebar } from './ExternalTransferSidebar';
import { MindMap } from './MindMap';
import { Dialog } from './common/Dialog';
import { Note, GCM, AppState } from '../types';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  decomposeFeature, 
  suggestNextSteps, 
  checkConflict, 
  updateSingleNote,
  optimizeBlueprint,
  generateSubModules,
  generateNoteFromCode,
  decomposeAndMatchCode,
  mergeLogicIntoNote,
  summarizeRepoFeatures,
  transpileExternalLogic,
  translateQueryForGithub,
  refineSearchGoal,
  summarizeReposShort
} from '../services/gemini';
import { fetchGithubFiles, fetchGithubFileContent, searchGithubRepos, fetchGithubRepoDetails } from '../services/github';
import { Send, Github, RefreshCw, Lightbulb, Loader2, Download, Upload, FolderTree, ShieldAlert, FileUp, Merge, Layers, Moon, Sun, Database, X, PanelLeft, PanelRight, Sparkles, Search, ChevronRight } from 'lucide-react';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export const Dashboard: React.FC = () => {
  const [state, setState] = useState<AppState>(() => {
    const saved = localStorage.getItem('vibe-architect-state');
    let initialState: AppState = {
      notes: [],
      gcm: { entities: {}, variables: {} },
      githubRepo: '',
      githubToken: process.env.GIthub_Token || '',
    };

    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.notes) {
          const notesMap = new Map<string, Note>(parsed.notes.map((n: Note) => [n.id, n]));
          const fixedNotes = parsed.notes.map((n: Note) => {
            if (n.parentNoteId) {
              const parent = notesMap.get(n.parentNoteId);
              if (parent && parent.folder !== n.folder) {
                return { ...n, folder: parent.folder };
              }
            }
            return n;
          });
          initialState = { 
            ...parsed, 
            notes: fixedNotes,
            githubToken: parsed.githubToken || process.env.Github_Token || '' 
          };
        } else {
          initialState = { 
            ...parsed, 
            githubToken: parsed.githubToken || process.env.Github_Token || '' 
          };
        }
      } catch (e) {
        console.error('Failed to parse saved state', e);
      }
    }
    return initialState;
  });
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [featureInput, setFeatureInput] = useState('');
  const [darkMode, setDarkMode] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('vibe-architect-theme') === 'dark' || 
             (!localStorage.getItem('vibe-architect-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
    return false;
  });
  
  // Loading states
  const [isDecomposing, setIsDecomposing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefactoring, setIsRefactoring] = useState(false);
  const [isCheckingConsistency, setIsCheckingConsistency] = useState(false);
  const [processStatus, setProcessStatus] = useState<{ message: string; current?: number; total?: number } | null>(null);
  
  const [nextStepSuggestion, setNextStepSuggestion] = useState<string | null>(null);
  const [showGcm, setShowGcm] = useState(false);
  const [showExternalTransfer, setShowExternalTransfer] = useState(false);
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState<'editor' | 'mindmap'>('editor');
  
  // External Reference Transfer State
  const [externalSearchQuery, setExternalSearchQuery] = useState('');
  const [externalRepos, setExternalRepos] = useState<{ full_name: string; html_url: string; description: string }[]>([]);
  const [selectedExternalRepo, setSelectedExternalRepo] = useState<string | null>(null);
  const [repoFeatures, setRepoFeatures] = useState<{ id: number; title: string; description: string; relatedFiles: string[] }[]>([]);
  const [isSearchingExternal, setIsSearchingExternal] = useState(false);
  const [isAnalyzingRepo, setIsAnalyzingRepo] = useState(false);
  const [isTranspiling, setIsTranspiling] = useState(false);
  const [refinedGoals, setRefinedGoals] = useState<string[]>([]);
  const [isRefiningGoals, setIsRefiningGoals] = useState(false);
  const [transferStep, setTransferStep] = useState<1 | 2 | 3 | 4>(1);
  const [repoSummaries, setRepoSummaries] = useState<Record<string, { nickname: string; summary: string; features: string }>>({});
  const [selectedFeatures, setSelectedFeatures] = useState<any[]>([]);
  const [selectedGoal, setSelectedGoal] = useState<string | null>(null);
  const [dialogConfig, setDialogConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'info' | 'warning' | 'error' | 'success';
    onConfirm: () => void;
    onCancel?: () => void;
    confirmText?: string;
    cancelText?: string;
  } | null>(null);

  const showAlert = (title: string, message: string, type: 'info' | 'warning' | 'error' | 'success' = 'info') => {
    setDialogConfig({
      isOpen: true,
      title,
      message,
      type,
      onConfirm: () => setDialogConfig(null)
    });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textFileInputRef = useRef<HTMLInputElement>(null);

  // Save to localStorage on change
  useEffect(() => {
    localStorage.setItem('vibe-architect-state', JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('vibe-architect-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('vibe-architect-theme', 'light');
    }
  }, [darkMode]);

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vibe-architect-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedState = JSON.parse(event.target?.result as string);
        if (importedState.notes) {
          setState(importedState);
          showAlert('가져오기 성공', '프로젝트를 성공적으로 불러왔습니다.', 'success');
        }
      } catch (err) {
        showAlert('오류', '유효하지 않은 JSON 파일입니다.', 'error');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDecompose = async () => {
    if (!featureInput.trim()) return;

    setIsDecomposing(true);
    setProcessStatus({ message: 'Analyzing feature request...' });
    try {
      const { newNotes, updatedNotes, updatedGcm } = await decomposeFeature(featureInput, state.gcm, state.notes);
      
      setProcessStatus({ message: 'Updating project state...' });
      const newNotesWithIds = newNotes.map((n) => ({
        ...n,
        id: Math.random().toString(36).substr(2, 9),
        status: 'Planned' as const,
      }));

      setState((prev) => {
        const existingNotesMap = new Map(prev.notes.map(n => [n.id, n]));
        updatedNotes.forEach(un => {
          existingNotesMap.set(un.id, un);
        });

        const combinedNotes = [...Array.from(existingNotesMap.values()), ...newNotesWithIds];
        return {
          ...prev,
          notes: combinedNotes,
          gcm: updatedGcm,
        };
      });
      setFeatureInput('');
      
      if (newNotesWithIds.length > 0) {
        setSelectedNoteId(newNotesWithIds[0].id);
      } else if (updatedNotes.length > 0) {
        setSelectedNoteId(updatedNotes[0].id);
      }
    } catch (error) {
      console.error('Failed to decompose feature:', error);
      showAlert('오류', `기능 분해에 실패했습니다: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsDecomposing(false);
      setProcessStatus(null);
    }
  };

  const handleTextFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
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
          yamlMetadata: `type: imported\nsource: ${file.name}`
        };
        newNotes.push(newNote);
      } catch (err) {
        console.error(`Failed to read file ${file.name}`, err);
      }
    }

    if (newNotes.length > 0) {
      setState(prev => ({
        ...prev,
        notes: [...prev.notes, ...newNotes]
      }));
      setSelectedNoteId(newNotes[0].id);
      showAlert('가져오기 성공', `${newNotes.length}개의 노트를 성공적으로 불러왔습니다.`, 'success');
    }

    if (textFileInputRef.current) textFileInputRef.current.value = '';
  };

  const handleOptimizeBlueprint = async () => {
    if (state.notes.length === 0) return;
    setIsSyncing(true);
    setProcessStatus({ message: '설계도 최적화 진행 중 (일관성, 연결점, 구조 재배치)...' });
    try {
      const { updatedNotes, deletedNoteIds, updatedGcm, report } = await optimizeBlueprint(state.notes, state.gcm);
      
      setState(prev => {
        const existingNotesMap = new Map(prev.notes.map(n => [n.id, n]));
        
        // Apply updates
        updatedNotes.forEach(un => {
          existingNotesMap.set(un.id, un);
        });
        
        // Remove deleted notes
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
      console.error('Optimization failed', error);
      showAlert('오류', '설계도 최적화 중 오류가 발생했습니다.', 'error');
    } finally {
      setIsSyncing(false);
      setProcessStatus(null);
    }
  };

  const handleGenerateSubModules = async (mainNote: Note) => {
    setIsDecomposing(true);
    setProcessStatus({ message: `${mainNote.title}의 하위 모듈 생성 중...` });
    try {
      const { newNotes, updatedGcm } = await generateSubModules(mainNote, state.gcm, state.notes);
      
      const newNotesWithIds = newNotes.map((n) => ({
        ...n,
        id: Math.random().toString(36).substr(2, 9),
        status: 'Planned' as const,
      }));

      setState(prev => {
        const newNotes = [...prev.notes, ...newNotesWithIds];
        return {
          ...prev,
          notes: newNotes,
          gcm: updatedGcm
        };
      });
      
      showAlert('생성 완료', `${newNotesWithIds.length}개의 하위 모듈이 생성되었습니다.`, 'success');
    } catch (error) {
      console.error('Failed to generate sub-modules:', error);
      showAlert('오류', `하위 모듈 생성 실패: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      setIsDecomposing(false);
      setProcessStatus(null);
    }
  };

  const handleAddNote = () => {
    const newNote: Note = {
      id: Math.random().toString(36).substr(2, 9),
      title: '새 노트',
      folder: '미분류',
      content: '# 새 노트\n여기에 기능을 설명하세요.',
      summary: '새로운 기능 설명',
      status: 'Planned',
      yamlMetadata: 'version: 1.0.0\nlastUpdated: 2026-03-15\ntags: []'
    };
    setState(prev => ({
      ...prev,
      notes: [...prev.notes, newNote]
    }));
    setSelectedNoteId(newNote.id);
  };

  const handleAddChildNote = (parentId: string) => {
    const parentNote = state.notes.find(n => n.id === parentId);
    const newNote: Note = {
      id: Math.random().toString(36).substr(2, 9),
      title: '새 하위 노트',
      folder: parentNote ? parentNote.folder : '미분류',
      parentNoteId: parentId,
      content: `# ${parentNote?.title || ''}의 하위 기능\n여기에 세부 기능을 설명하세요.`,
      summary: '하위 기능 설명',
      status: 'Planned',
      yamlMetadata: 'version: 1.0.0\nlastUpdated: 2026-03-15\ntags: []'
    };
    setState(prev => ({
      ...prev,
      notes: [...prev.notes, newNote]
    }));
    setSelectedNoteId(newNote.id);
  };

  const handleDeleteNote = (noteId: string) => {
    setDialogConfig({
      isOpen: true,
      title: '노트 삭제',
      message: '이 노트를 삭제하시겠습니까?\n삭제된 노트는 복구할 수 없습니다.',
      type: 'warning',
      confirmText: '삭제',
      cancelText: '취소',
      onConfirm: () => {
        setState(prev => ({
          ...prev,
          notes: prev.notes.filter(n => n.id !== noteId)
        }));
        if (selectedNoteId === noteId) {
          setSelectedNoteId(null);
        }
        setDialogConfig(null);
      },
      onCancel: () => setDialogConfig(null)
    });
  };

  const handleSyncGithub = async () => {
    if (!state.githubRepo) {
      showAlert('알림', 'Github 저장소 URL을 입력해주세요.', 'warning');
      return;
    }

    setIsSyncing(true);
    setProcessStatus({ message: 'Github 파일 목록 가져오는 중...' });
    try {
      const files = await fetchGithubFiles(state.githubRepo, state.githubToken);
      
      const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.py', '.go', '.java', '.c', '.cpp'];
      const sourceFiles = files.filter(file => 
        sourceExtensions.some(ext => file.endsWith(ext)) &&
        !file.includes('node_modules') &&
        !file.includes('.git') &&
        !file.includes('dist') &&
        !file.includes('build')
      );

      if (sourceFiles.length === 0) {
        showAlert('알림', '분석할 소스 파일이 없습니다.', 'info');
        return;
      }

      // Limit files to process for now to avoid excessive AI calls
      const filesToProcess = sourceFiles.slice(0, 5); 
      let currentNotes = [...state.notes];
      let updateCount = 0;
      let newCount = 0;

      for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
        setProcessStatus({ 
          message: `${file} 분석 및 기능 분해 중 (${i + 1}/${filesToProcess.length})...`,
          current: i + 1,
          total: filesToProcess.length
        });

        try {
          const content = await fetchGithubFileContent(state.githubRepo, file, state.githubToken);
          const { logicUnits } = await decomposeAndMatchCode(file, content, currentNotes);

          for (const unit of logicUnits) {
            if (!unit.isNew && unit.matchedNoteId) {
              // Update existing note
              const targetNote = currentNotes.find(n => n.id === unit.matchedNoteId);
              if (targetNote) {
                setProcessStatus(prev => ({ ...prev!, message: `기존 노트 업데이트 중: ${targetNote.title}` }));
                const updatedNote = await mergeLogicIntoNote(unit, targetNote);
                currentNotes = currentNotes.map(n => n.id === updatedNote.id ? updatedNote : n);
                updateCount++;
              }
            } else {
              // Create new note
              const newNote: Note = {
                id: Math.random().toString(36).substr(2, 9),
                title: unit.title,
                folder: unit.folder,
                content: unit.content,
                summary: unit.summary,
                yamlMetadata: unit.yamlMetadata,
                status: 'Done',
              };
              currentNotes.push(newNote);
              newCount++;
            }
          }
        } catch (e) {
          console.error(`Failed to process file ${file}:`, e);
        }
      }

      setState(prev => ({ ...prev, notes: currentNotes }));
      
      const { suggestion } = await suggestNextSteps(currentNotes, files);
      setNextStepSuggestion(suggestion);

      showAlert(
        '대조 및 통합 완료', 
        `분석 완료: ${updateCount}개 노트 업데이트, ${newCount}개 새 기능 노트 생성. (분석된 파일: ${filesToProcess.length}개)`, 
        'success'
      );

    } catch (error) {
      console.error('Failed to sync with Github:', error);
      showAlert('오류', 'Github 대조 및 통합 실패. 콘솔에서 상세 내용을 확인하세요.', 'error');
    } finally {
      setIsSyncing(false);
      setProcessStatus(null);
    }
  };


  const handleUpdateNote = (updatedNote: Note) => {
    setState((prev) => {
      const newNotes = prev.notes.map((n) => (n.id === updatedNote.id ? updatedNote : n));
      return {
        ...prev,
        notes: newNotes,
      };
    });
  };

  const handleTargetedUpdate = async (noteId: string, command: string) => {
    const targetNote = state.notes.find(n => n.id === noteId);
    if (!targetNote) return;

    try {
      const { updatedNote, updatedGcm, affectedNoteIds } = await updateSingleNote(
        targetNote,
        command,
        state.gcm,
        state.notes
      );

      setState(prev => ({
        ...prev,
        gcm: updatedGcm,
        notes: prev.notes.map(n => {
          if (n.id === noteId) return updatedNote;
          if (affectedNoteIds.includes(n.id)) {
            // Flag affected notes for user review
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
    } catch (e) {
      console.error(e);
      throw e;
    }
  };

  const selectedNote = state.notes.find((n) => n.id === selectedNoteId) || null;

  const handleAnalyzeNextSteps = async () => {
    setProcessStatus({ message: '다음 단계 분석 중...' });
    try {
      const { suggestion, updatedStatuses } = await suggestNextSteps(state.notes, []);
      setNextStepSuggestion(suggestion);
      
      if (Object.keys(updatedStatuses).length > 0) {
        setState(prev => ({
          ...prev,
          notes: prev.notes.map(n => updatedStatuses[n.id] ? { ...n, status: updatedStatuses[n.id] } : n)
        }));
      }
      setRightSidebarOpen(true);
    } catch (e) {
      console.error(e);
      showAlert('오류', '다음 단계 분석에 실패했습니다.', 'error');
    } finally {
      setProcessStatus(null);
    }
  };

  const handleSearchExternal = async (customQuery?: string) => {
    const queryToSearch = customQuery || externalSearchQuery;
    if (!queryToSearch.trim()) return;
    
    setIsSearchingExternal(true);
    setSelectedGoal(queryToSearch);
    
    try {
      let allRepos: { full_name: string; html_url: string; description: string }[] = [];
      const isKorean = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(queryToSearch);
      
      if (isKorean) {
        const { queries, suggestedRepos } = await translateQueryForGithub(queryToSearch);
        
        // 1. Fetch suggested repos directly
        if (suggestedRepos && suggestedRepos.length > 0) {
          const details = await Promise.all(
            suggestedRepos.map(name => fetchGithubRepoDetails(name, state.githubToken))
          );
          allRepos = [...allRepos, ...details.filter((r): r is any => r !== null)];
        }

        // 2. Search using multiple queries until we have enough results
        for (const q of queries) {
          if (allRepos.length >= 5) break;
          try {
            const searchResults = await searchGithubRepos(q, state.githubToken);
            // Avoid duplicates
            const newResults = searchResults.filter(r => !allRepos.some(existing => existing.full_name === r.full_name));
            allRepos = [...allRepos, ...newResults];
          } catch (e) {
            console.error(`Search failed for query: ${q}`, e);
          }
        }
      } else {
        allRepos = await searchGithubRepos(queryToSearch, state.githubToken);
      }

      if (!state.githubToken) {
        setProcessStatus({ message: 'Github 토큰이 설정되지 않아 검색 속도가 제한될 수 있습니다.' });
        setTimeout(() => setProcessStatus(null), 3000);
      }

      const top3Repos = allRepos.slice(0, 3);
      setExternalRepos(top3Repos);
      
      if (top3Repos.length > 0) {
        setTransferStep(2);
        const summaryResult = await summarizeReposShort(top3Repos, queryToSearch);
        setRepoSummaries(summaryResult.summaries);
      } else {
        setProcessStatus({ message: '검색 결과가 없습니다. 다른 키워드로 시도해보세요.' });
        setTimeout(() => setProcessStatus(null), 3000);
      }
    } catch (e) {
      console.error(e);
      setProcessStatus({ message: 'Github 검색 중 오류가 발생했습니다.' });
      setTimeout(() => setProcessStatus(null), 3000);
    } finally {
      setIsSearchingExternal(false);
    }
  };

  const handleRefineGoals = async () => {
    if (!externalSearchQuery.trim()) return;
    setIsRefiningGoals(true);
    setExternalRepos([]);
    setTransferStep(1);
    try {
      const goals = await refineSearchGoal(externalSearchQuery);
      setRefinedGoals(goals);
    } catch (e) {
      console.error(e);
      setProcessStatus({ message: '키워드 정제 중 오류가 발생했습니다.' });
      setTimeout(() => setProcessStatus(null), 3000);
    } finally {
      setIsRefiningGoals(false);
    }
  };

  const handleAnalyzeRepo = async (repoUrl: string) => {
    setSelectedExternalRepo(repoUrl);
    setIsAnalyzingRepo(true);
    setTransferStep(3);
    setProcessStatus({ message: '레포지토리 분석 중 (README 및 파일 트리)...' });
    try {
      const fileTree = await fetchGithubFiles(repoUrl, state.githubToken);
      let readme = '';
      try {
        readme = await fetchGithubFileContent(repoUrl, 'README.md', state.githubToken);
      } catch (e) {
        try {
          readme = await fetchGithubFileContent(repoUrl, 'readme.md', state.githubToken);
        } catch (e2) {}
      }

      const result = await summarizeRepoFeatures(repoUrl, fileTree, readme, selectedGoal || externalSearchQuery);
      setRepoFeatures(result.features.slice(0, 3)); // Limit to 3 features
    } catch (e) {
      console.error(e);
      setProcessStatus({ message: '레포지토리 분석 중 오류가 발생했습니다.' });
      setTimeout(() => setProcessStatus(null), 3000);
    } finally {
      setIsAnalyzingRepo(false);
      setProcessStatus(null);
    }
  };

  const handleTranspileFeature = async (featuresToTranspile: any[]) => {
    if (featuresToTranspile.length === 0 || !selectedExternalRepo) return;
    
    setIsTranspiling(true);
    setTransferStep(4);
    setProcessStatus({ message: `${featuresToTranspile.length}개 기능 선별 이식 중...` });
    
    try {
      // Collect all related files for all selected features
      const allRelatedFiles = Array.from(new Set(featuresToTranspile.flatMap(f => f.relatedFiles)));
      
      const fileContents = await Promise.all(
        allRelatedFiles.map(async (path) => {
          try {
            const content = await fetchGithubFileContent(selectedExternalRepo, path, state.githubToken);
            return { path, content };
          } catch (e) {
            console.error(`Failed to fetch ${path}`, e);
            return null;
          }
        })
      );

      const validContents = fileContents.filter((c): c is { path: string; content: string } => c !== null);
      
      const result = await transpileExternalLogic(
        featuresToTranspile.map(f => f.title),
        validContents,
        state.gcm,
        state.notes
      );

      const newNotesWithIds = result.newNotes.map(n => ({
        ...n,
        id: Math.random().toString(36).substr(2, 9),
        status: 'Planned' as const
      }));

      setState(prev => ({
        ...prev,
        notes: [...prev.notes, ...newNotesWithIds],
        gcm: result.updatedGcm
      }));

      setProcessStatus({ message: '이식이 완료되었습니다!' });
      setTimeout(() => setProcessStatus(null), 3000);
      
      // Reset transfer state after success
      setTimeout(() => {
        setTransferStep(1);
        setSelectedExternalRepo(null);
        setRepoFeatures([]);
        setExternalRepos([]);
        setRefinedGoals([]);
        setSelectedFeatures([]);
      }, 3500);

    } catch (e) {
      console.error(e);
      setProcessStatus({ message: '이식 중 오류가 발생했습니다.' });
      setTimeout(() => setProcessStatus(null), 3000);
      setTransferStep(3);
    } finally {
      setIsTranspiling(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-slate-950 font-sans overflow-hidden transition-colors duration-200">
      {/* Sidebar */}
      {leftSidebarOpen && (
        <Sidebar
          notes={state.notes}
          selectedNoteId={selectedNoteId}
          onSelectNote={setSelectedNoteId}
          onAddNote={handleAddNote}
          onAddChildNote={handleAddChildNote}
          onDeleteNote={handleDeleteNote}
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 슬림해진 상단 헤더 */}
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-3 shadow-sm z-10 flex items-center justify-between transition-colors duration-200">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
              className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
              title={leftSidebarOpen ? "사이드바 접기" : "사이드바 펴기"}
            >
              <PanelLeft className={`w-5 h-5 ${leftSidebarOpen ? 'text-indigo-500' : ''}`} />
            </button>
            <h1 className="text-lg font-bold text-slate-800 dark:text-white ml-2">Vibe-Architect</h1>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setViewMode(viewMode === 'editor' ? 'mindmap' : 'editor')}
              className={`p-2 rounded-md flex items-center gap-2 text-xs font-medium transition-colors ${viewMode === 'mindmap' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              <Layers className="w-4 h-4" />
              {viewMode === 'mindmap' ? '에디터 보기' : '마인드맵 보기'}
            </button>
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1" />
            <button
              onClick={() => {
                setShowExternalTransfer(!showExternalTransfer);
                if (!showExternalTransfer) {
                  setShowGcm(false);
                  setRightSidebarOpen(false);
                }
              }}
              className={`p-2 rounded-full transition-colors ${showExternalTransfer ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              title="외부 레퍼런스 선별 이식"
            >
              <Github className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setShowGcm(!showGcm);
                if (!showGcm) {
                  setShowExternalTransfer(false);
                  setRightSidebarOpen(false);
                }
              }}
              className={`p-2 rounded-full transition-colors ${showGcm ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              title="GCM 보기"
            >
              <Database className="w-4 h-4" />
            </button>
            <button
              onClick={() => {
                setRightSidebarOpen(!rightSidebarOpen);
                if (!rightSidebarOpen) {
                  setShowGcm(false);
                  setShowExternalTransfer(false);
                }
              }}
              className={`p-2 rounded-full transition-colors ${rightSidebarOpen ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
              title="도구함 열기"
            >
              <PanelRight className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 ml-2">
              <button
                onClick={handleExport}
                className="text-slate-500 hover:text-slate-900 p-2 rounded-md hover:bg-slate-100 transition-colors"
                title="프로젝트 내보내기"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-slate-500 hover:text-slate-900 p-2 rounded-md hover:bg-slate-100 transition-colors"
                title="프로젝트 가져오기"
              >
                <Upload className="w-4 h-4" />
              </button>
              <input
                type="file"
                accept=".json"
                ref={fileInputRef}
                onChange={handleImport}
                className="hidden"
              />
            </div>
          </div>
        </header>

        {/* Progress / Status Banner */}
        {processStatus && (
          <div className="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between shadow-lg animate-in slide-in-from-top duration-300">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="font-medium">{processStatus.message}</span>
            </div>
            {processStatus.current !== undefined && processStatus.total !== undefined && (
              <div className="flex items-center gap-4">
                <div className="text-xs font-mono bg-indigo-500 px-2 py-1 rounded">
                  {processStatus.current} / {processStatus.total} 파일
                </div>
                <div className="w-48 h-2 bg-indigo-800 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-white transition-all duration-500" 
                    style={{ width: `${(processStatus.current / processStatus.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Center Content Area */}
        <div className="flex-1 overflow-hidden flex">
          {viewMode === 'mindmap' ? (
            <MindMap 
              notes={state.notes} 
              onSelectNote={(id) => {
                setSelectedNoteId(id);
                setViewMode('editor');
              }}
              selectedNoteId={selectedNoteId}
              darkMode={darkMode}
            />
          ) : selectedNote ? (
            <NoteEditor 
              note={selectedNote} 
              allNotes={state.notes}
              onUpdateNote={handleUpdateNote} 
              onTargetedUpdate={handleTargetedUpdate}
              onGenerateSubModules={handleGenerateSubModules}
              onDeleteNote={handleDeleteNote}
              darkMode={darkMode}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-400 transition-colors duration-200">
              <div className="text-center max-w-md p-6">
                <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-500 dark:text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <RefreshCw className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">Vibe-Architect에 오신 것을 환영합니다</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  상단 바에 기능 아이디어를 입력하면 자동으로 모듈형 노트로 분해하고, 글로벌 컨텍스트 맵을 업데이트하며, Github 저장소와 코드 대조 및 통합을 수행합니다.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* GCM Viewer */}
      {showGcm && <GCMViewer gcm={state.gcm} />}

      {/* External Reference Transfer Sidebar */}
      {showExternalTransfer && (
        <ExternalTransferSidebar 
          externalSearchQuery={externalSearchQuery}
          setExternalSearchQuery={setExternalSearchQuery}
          externalRepos={externalRepos}
          isSearchingExternal={isSearchingExternal}
          handleSearchExternal={handleSearchExternal}
          selectedExternalRepo={selectedExternalRepo}
          setSelectedExternalRepo={setSelectedExternalRepo}
          isAnalyzingRepo={isAnalyzingRepo}
          repoFeatures={repoFeatures}
          handleAnalyzeRepo={handleAnalyzeRepo}
          isTranspiling={isTranspiling}
          handleTranspileFeature={handleTranspileFeature}
          setRepoFeatures={setRepoFeatures}
          onClose={() => setShowExternalTransfer(false)}
          refinedGoals={refinedGoals}
          isRefiningGoals={isRefiningGoals}
          handleRefineGoals={handleRefineGoals}
          transferStep={transferStep}
          setTransferStep={setTransferStep}
          repoSummaries={repoSummaries}
          selectedFeatures={selectedFeatures}
          setSelectedFeatures={setSelectedFeatures}
        />
      )}

      {/* 오른쪽 사이드바: 도구 및 제안 통합 */}
      {rightSidebarOpen && (
        <div className="w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 h-full flex flex-col shadow-xl z-20 transition-colors duration-200">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/50">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 uppercase tracking-tight">
              <Sparkles className="w-4 h-4 text-amber-500" />
              프로젝트 제어 및 분석
            </h2>
            <button onClick={() => setRightSidebarOpen(false)} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {/* 섹션 1: 기능 설계 도구 */}
            <div className="space-y-3">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">기능 설계</h3>
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="추가할 기능 입력..."
                  value={featureInput}
                  onChange={(e) => setFeatureInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleDecompose()}
                  className="w-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 rounded-md px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                />
                <button
                  onClick={handleDecompose}
                  disabled={isDecomposing || !featureInput.trim()}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                  {isDecomposing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  기능 분해 실행
                </button>
              </div>
            </div>

            {/* 섹션 2: Github 코드 대조 및 통합 */}
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Github 코드 대조 및 통합</h3>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Github Repo URL"
                  value={state.githubRepo}
                  onChange={(e) => setState({ ...state, githubRepo: e.target.value })}
                  className="w-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 rounded-md px-3 py-1.5 text-[11px] dark:text-white"
                />
                <input
                  type="password"
                  placeholder="Github PAT (선택 사항)"
                  value={state.githubToken}
                  onChange={(e) => setState({ ...state, githubToken: e.target.value })}
                  className="w-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 rounded-md px-3 py-1.5 text-[11px] dark:text-white"
                />
                <button
                  onClick={handleSyncGithub}
                  disabled={isSyncing}
                  className="w-full bg-slate-800 hover:bg-slate-900 text-white py-2 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-all"
                >
                  {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Github className="w-3 h-3" />}
                  Github와 코드 대조 및 통합
                </button>
              </div>
            </div>

            {/* 섹션 3: 분석 도구 모음 */}
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">설계 최적화 및 분석</h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleOptimizeBlueprint}
                  disabled={isSyncing || state.notes.length === 0}
                  className="col-span-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 py-2.5 rounded-md text-xs font-bold border border-indigo-100 dark:border-indigo-800/50 flex items-center justify-center gap-2 shadow-sm"
                >
                  {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} 설계도 최적화
                </button>
                <button
                  onClick={handleAnalyzeNextSteps}
                  disabled={state.notes.length === 0}
                  className="col-span-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 py-2 rounded-md text-[10px] font-medium hover:bg-slate-50 flex items-center justify-center gap-1.5"
                >
                  <Lightbulb className="w-3 h-3 text-amber-500" /> 다음 단계 분석 (5개 추천)
                </button>
              </div>
              <button
                onClick={() => textFileInputRef.current?.click()}
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-md text-[10px] font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <FileUp className="w-3 h-3" />
                텍스트 파일 업로드 (.md, .txt)
              </button>
              <input
                type="file"
                multiple
                accept=".md,.txt,.yaml"
                ref={textFileInputRef}
                onChange={handleTextFileUpload}
                className="hidden"
              />
            </div>

            {/* AI 제안 및 분석 결과 */}
            <div className="pt-2 space-y-6 border-t border-slate-100 dark:border-slate-800">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">AI 분석 및 제안</h3>
              
              {/* Next Step Suggestion */}
              {nextStepSuggestion && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                    <Lightbulb className="w-3 h-3 text-amber-500" />
                    다음 단계 제안
                  </h3>
                  <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/50 p-3 rounded-lg text-sm text-amber-900 dark:text-amber-200 prose prose-sm prose-amber dark:prose-invert max-w-none">
                    <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{nextStepSuggestion}</Markdown>
                  </div>
                </div>
              )}

              {!nextStepSuggestion && (
                <div className="text-center py-12">
                  <Sparkles className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                  <p className="text-xs text-slate-400">현재 분석된 제안이 없습니다.<br/>상단 도구를 사용하여 분석을 시작하세요.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {dialogConfig && (
        <Dialog
          isOpen={dialogConfig.isOpen}
          title={dialogConfig.title}
          message={dialogConfig.message}
          type={dialogConfig.type}
          onConfirm={dialogConfig.onConfirm}
          onCancel={dialogConfig.onCancel}
          confirmText={dialogConfig.confirmText}
          cancelText={dialogConfig.cancelText}
        />
      )}
    </div>
  );
};
