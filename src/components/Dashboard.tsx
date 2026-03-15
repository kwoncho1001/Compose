import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './Sidebar';
import { NoteEditor } from './NoteEditor';
import { GCMViewer } from './GCMViewer';
import { MindMap } from './MindMap';
import { Note, GCM, AppState } from '../types';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  decomposeFeature, 
  suggestNextSteps, 
  checkConflict, 
  refactorFolders,
  updateSingleNote,
  checkConsistency,
  consolidateNotes,
  generateSubModules,
  generateNoteFromCode,
  suggestGcmUpdates,
  detectMissingLinks,
  analyzeSharedCore
} from '../services/gemini';
import { fetchGithubFiles, fetchGithubFileContent } from '../services/github';
import { Send, Github, RefreshCw, Lightbulb, Loader2, Download, Upload, FolderTree, ShieldAlert, FileUp, Merge, Layers, Moon, Sun, Database, X, PanelLeft, PanelRight, Sparkles, Link as LinkIcon } from 'lucide-react';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

export const Dashboard: React.FC = () => {
  const [state, setState] = useState<AppState>({
    notes: [],
    gcm: { entities: {}, variables: {} },
    githubRepo: '',
    githubToken: '',
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
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState<'editor' | 'mindmap'>('editor');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textFileInputRef = useRef<HTMLInputElement>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('vibe-architect-state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.notes) {
          // General logic: Ensure child notes are in the same folder as their parents
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
          setState({ ...parsed, notes: fixedNotes });
        }
      } catch (e) {
        console.error('Failed to load state from localStorage', e);
      }
    }
  }, []);

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
          alert('Project imported successfully!');
        }
      } catch (err) {
        alert('Invalid JSON file');
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
          notes: alignChildFolders(combinedNotes),
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
      alert(`Failed to decompose feature: ${error instanceof Error ? error.message : String(error)}`);
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
          folder: 'Imported',
          content: content,
          summary: `Imported from ${file.name}`,
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
      alert(`${newNotes.length} notes imported successfully.`);
    }

    if (textFileInputRef.current) textFileInputRef.current.value = '';
  };

  const handleAutoConsolidate = async (notesToUse?: Note[], gcmToUse?: GCM) => {
    setIsCheckingConsistency(true);
    setProcessStatus({ message: '노트 정리 분석 중...' });
    try {
      const { mergedNotes, removedNoteIds, updatedGcm } = await consolidateNotes(
        notesToUse || state.notes, 
        gcmToUse || state.gcm
      );
      
      setProcessStatus({ message: '병합된 구조 적용 중...' });
      setState(prev => {
        const newNotes = [...prev.notes.filter(n => !removedNoteIds.includes(n.id)), ...mergedNotes];
        return {
          ...prev,
          notes: alignChildFolders(newNotes),
          gcm: updatedGcm
        };
      });
      alert("불필요한 노트가 정리되었습니다.");
    } catch (e) {
      alert(`노트 정리 실패: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsCheckingConsistency(false);
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
          notes: alignChildFolders(newNotes),
          gcm: updatedGcm
        };
      });
      
      alert(`${newNotesWithIds.length}개의 하위 모듈이 생성되었습니다.`);
    } catch (error) {
      console.error('Failed to generate sub-modules:', error);
      alert(`하위 모듈 생성 실패: ${error instanceof Error ? error.message : String(error)}`);
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

  const handleDeleteNote = (noteId: string) => {
    if (window.confirm('이 노트를 삭제하시겠습니까?')) {
      setState(prev => ({
        ...prev,
        notes: prev.notes.filter(n => n.id !== noteId)
      }));
      if (selectedNoteId === noteId) {
        setSelectedNoteId(null);
      }
    }
  };

  const handleSyncGithub = async () => {
    if (!state.githubRepo) {
      alert('GitHub 저장소 URL을 입력해주세요.');
      return;
    }

    setIsSyncing(true);
    setProcessStatus({ message: 'GitHub 파일 목록 가져오는 중...' });
    try {
      const files = await fetchGithubFiles(state.githubRepo, state.githubToken);
      const updatedNotes = [...state.notes];
      let conflictCount = 0;
      const matchedFiles: string[] = [];

      setProcessStatus({ message: '기존 노트와 대조 중...', current: 0, total: updatedNotes.length });

      for (let i = 0; i < updatedNotes.length; i++) {
        setProcessStatus(prev => ({ ...prev!, current: i + 1 }));
        const note = updatedNotes[i];
        
        // Find a matching file by title or keywords
        const keywords = note.title.toLowerCase().split(' ');
        const matchedFile = files.find((file) => 
          keywords.some(kw => kw.length > 3 && file.toLowerCase().includes(kw)) && !file.includes('node_modules')
        );

        if (matchedFile) {
          matchedFiles.push(matchedFile);
          try {
            const content = await fetchGithubFileContent(state.githubRepo, matchedFile, state.githubToken);
            const { isMatch, reason } = await checkConflict(note.content, content);

            if (isMatch) {
              updatedNotes[i] = { ...note, status: 'Done', conflictInfo: undefined };
            } else {
              updatedNotes[i] = {
                ...note,
                status: 'Conflict',
                conflictInfo: { filePath: matchedFile, fileContent: content, reason }
              };
              conflictCount++;
            }
          } catch (e) {
            console.error('Failed to check conflict for', note.title, e);
          }
        }
      }

      // --- Auto-Discovery Flow ---
      setProcessStatus({ message: '새로운 파일 탐색 중 (Auto-Discovery)...' });
      
      const sourceExtensions = ['.ts', '.tsx', '.js', '.jsx', '.css', '.html', '.py', '.go', '.java', '.c', '.cpp'];
      const unmatchedFiles = files.filter(file => 
        !matchedFiles.includes(file) && 
        sourceExtensions.some(ext => file.endsWith(ext)) &&
        !file.includes('node_modules') &&
        !file.includes('.git') &&
        !file.includes('dist') &&
        !file.includes('build')
      );

      // Limit discovery to avoid hitting AI limits
      const discoveryLimit = 10;
      const filesToDiscover = unmatchedFiles.slice(0, discoveryLimit);
      const discoveredNotes: Note[] = [];

      if (filesToDiscover.length > 0) {
        setProcessStatus({ message: '새로운 파일 분석 및 노트 생성 중...', current: 0, total: filesToDiscover.length });
        
        for (let i = 0; i < filesToDiscover.length; i++) {
          const file = filesToDiscover[i];
          setProcessStatus(prev => ({ ...prev!, current: i + 1 }));
          
          try {
            const content = await fetchGithubFileContent(state.githubRepo, file, state.githubToken);
            const noteData = await generateNoteFromCode(file, content, updatedNotes);
            
            const newNote: Note = {
              ...noteData,
              id: Math.random().toString(36).substr(2, 9),
              status: 'Done', // Since it's discovered from code, it's already implemented
            };
            discoveredNotes.push(newNote);
          } catch (e) {
            console.error('Failed to discover note from file:', file, e);
          }
        }
      }

      const finalNotes = [...updatedNotes, ...discoveredNotes];
      setState((prev) => ({ ...prev, notes: finalNotes }));
      
      const { suggestion } = await suggestNextSteps(finalNotes, files);
      setNextStepSuggestion(suggestion);

      let alertMsg = '동기화 완료.';
      if (conflictCount > 0) alertMsg += ` ${conflictCount}개의 충돌을 발견했습니다.`;
      if (discoveredNotes.length > 0) alertMsg += ` ${discoveredNotes.length}개의 새로운 노트를 자동으로 발견하여 생성했습니다.`;
      
      alert(alertMsg);

    } catch (error) {
      console.error('Failed to sync with GitHub:', error);
      alert('GitHub 동기화 실패. 콘솔에서 상세 내용을 확인하세요.');
    } finally {
      setIsSyncing(false);
      setProcessStatus(null);
    }
  };

  const handleRefactorFolders = async () => {
    if (state.notes.length === 0) return;
    setIsRefactoring(true);
    try {
      const mapping = await refactorFolders(state.notes);
      setState(prev => {
        const newNotes = prev.notes.map(n => ({
          ...n,
          folder: mapping[n.id] || n.folder
        }));
        return {
          ...prev,
          notes: alignChildFolders(newNotes)
        };
      });
    } catch (e) {
      alert('폴더 구조 재구성 실패.');
    } finally {
      setIsRefactoring(false);
    }
  };

  const handleCheckConsistency = async () => {
    if (state.notes.length === 0) return;
    setIsCheckingConsistency(true);
    try {
      const conflicts = await checkConsistency(state.notes, state.gcm);
      setState(prev => ({
        ...prev,
        notes: prev.notes.map(n => {
          if (conflicts[n.id]) {
            return { ...n, consistencyConflict: conflicts[n.id] };
          }
          return { ...n, consistencyConflict: undefined };
        })
      }));
      
      const conflictCount = Object.keys(conflicts).length;
      if (conflictCount > 0) {
        alert(`${conflictCount}개의 일관성 충돌을 발견했습니다. 빨간색으로 강조된 노트를 확인하세요.`);
      } else {
        alert('일관성 충돌이 발견되지 않았습니다! 모든 것이 정상입니다.');
      }
    } catch (e) {
      alert('일관성 검사 실패.');
    } finally {
      setIsCheckingConsistency(false);
    }
  };

  const alignChildFolders = (notes: Note[]): Note[] => {
    const notesMap = new Map<string, Note>(notes.map(n => [n.id, n]));
    let changed = false;
    const fixedNotes = notes.map(n => {
      if (n.parentNoteId) {
        const parent = notesMap.get(n.parentNoteId);
        if (parent && parent.folder !== n.folder) {
          changed = true;
          return { ...n, folder: parent.folder };
        }
      }
      return n;
    });
    // Recursive check in case of deep nesting
    if (changed) return alignChildFolders(fixedNotes);
    return fixedNotes;
  };

  const handleUpdateNote = (updatedNote: Note) => {
    setState((prev) => {
      const newNotes = prev.notes.map((n) => (n.id === updatedNote.id ? updatedNote : n));
      return {
        ...prev,
        notes: alignChildFolders(newNotes),
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

  const [gcmSuggestions, setGcmSuggestions] = useState<{ suggestedEntities: any[]; suggestedVariables: Record<string, string> } | null>(null);
  const [linkSuggestions, setLinkSuggestions] = useState<{ fromId: string; toId: string; reason: string }[]>([]);
  const [sharedCoreSuggestions, setSharedCoreSuggestions] = useState<{ noteId: string; reason: string }[]>([]);

  const handleSuggestGcm = async () => {
    if (state.notes.length === 0) return;
    setProcessStatus({ message: 'GCM 추천 분석 중...' });
    try {
      const suggestions = await suggestGcmUpdates(state.notes, state.gcm);
      setGcmSuggestions(suggestions);
      setRightSidebarOpen(true);
    } catch (e) {
      console.error(e);
    } finally {
      setProcessStatus(null);
    }
  };

  const handleDetectLinks = async () => {
    if (state.notes.length === 0) return;
    setProcessStatus({ message: '누락된 연결점 탐색 중...' });
    try {
      const suggestions = await detectMissingLinks(state.notes);
      setLinkSuggestions(suggestions.suggestedLinks);
      setRightSidebarOpen(true);
    } catch (e) {
      console.error(e);
    } finally {
      setProcessStatus(null);
    }
  };

  const handleAnalyzeSharedCore = async () => {
    if (state.notes.length === 0) return;
    setProcessStatus({ message: 'Shared Core 후보 분석 중...' });
    try {
      const suggestions = await analyzeSharedCore(state.notes);
      setSharedCoreSuggestions(suggestions.suggestedPromotions);
      setRightSidebarOpen(true);
    } catch (e) {
      console.error(e);
    } finally {
      setProcessStatus(null);
    }
  };

  const applySharedCorePromotion = (noteId: string) => {
    setState(prev => ({
      ...prev,
      notes: prev.notes.map(n => {
        if (n.id === noteId) {
          return { ...n, folder: 'Shared' };
        }
        return n;
      })
    }));
    setSharedCoreSuggestions(prev => prev.filter(s => s.noteId !== noteId));
  };

  const applyGcmSuggestion = (type: 'entity' | 'variable', data: any) => {
    setState(prev => {
      const newGcm = { ...prev.gcm };
      if (type === 'entity') {
        newGcm.entities[data.name] = data;
      } else {
        newGcm.variables[data.key] = data.value;
      }
      return { ...prev, gcm: newGcm };
    });
    
    if (type === 'entity') {
      setGcmSuggestions(prev => prev ? { ...prev, suggestedEntities: prev.suggestedEntities.filter(e => e.name !== data.name) } : null);
    } else {
      setGcmSuggestions(prev => {
        if (!prev) return null;
        const newVars = { ...prev.suggestedVariables };
        delete newVars[data.key];
        return { ...prev, suggestedVariables: newVars };
      });
    }
  };

  const applyLinkSuggestion = (link: { fromId: string; toId: string }) => {
    setState(prev => ({
      ...prev,
      notes: prev.notes.map(n => {
        if (n.id === link.fromId) {
          return { ...n, relatedNoteIds: Array.from(new Set([...(n.relatedNoteIds || []), link.toId])) };
        }
        return n;
      })
    }));
    setLinkSuggestions(prev => prev.filter(l => !(l.fromId === link.fromId && l.toId === link.toId)));
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
        />
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navigation / Input Area */}
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-4 shadow-sm z-10 flex flex-col gap-4 transition-colors duration-200">
          
          {/* Top Row: Input & Global Actions */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 mr-4">
              <button
                onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
                className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
                title={leftSidebarOpen ? "사이드바 접기" : "사이드바 펴기"}
              >
                <PanelLeft className={`w-5 h-5 ${leftSidebarOpen ? 'text-indigo-500' : ''}`} />
              </button>
            </div>
            <div className="flex-1 max-w-2xl flex items-center gap-2">
              <input
                type="text"
                placeholder="구축하고 싶은 기능을 입력하세요 (예: '로그인 시스템')"
                value={featureInput}
                onChange={(e) => setFeatureInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDecompose()}
                className="flex-1 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:text-white"
                disabled={isDecomposing}
              />
              <button
                onClick={handleDecompose}
                disabled={isDecomposing || !featureInput.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isDecomposing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                기능 분해
              </button>
            </div>

            <div className="flex items-center gap-4 ml-8">
              <button
                onClick={() => setViewMode(viewMode === 'editor' ? 'mindmap' : 'editor')}
                className={`p-2 rounded-full transition-colors ${viewMode === 'mindmap' ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                title={viewMode === 'mindmap' ? "에디터 보기" : "마인드맵 보기"}
              >
                <Layers className="w-4 h-4" />
              </button>
              <button
                onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
                className={`p-2 rounded-full transition-colors ${rightSidebarOpen ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                title={rightSidebarOpen ? "제안 사이드바 닫기" : "제안 사이드바 열기"}
              >
                <PanelRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowGcm(!showGcm)}
                className={`p-2 rounded-full transition-colors ${showGcm ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
                title={showGcm ? "GCM 숨기기" : "GCM 보기"}
              >
                <Database className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 border-r border-slate-200 dark:border-slate-700 pr-4">
                <button
                  onClick={handleExport}
                  className="text-slate-600 hover:text-slate-900 p-2 rounded-md hover:bg-slate-100 transition-colors"
                  title="프로젝트 내보내기"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-slate-600 hover:text-slate-900 p-2 rounded-md hover:bg-slate-100 transition-colors"
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
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="GitHub 레포지토리 URL"
                  value={state.githubRepo}
                  onChange={(e) => setState({ ...state, githubRepo: e.target.value })}
                  className="w-48 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-500 dark:text-white"
                />
                <input
                  type="password"
                  placeholder="PAT (선택 사항)"
                  value={state.githubToken}
                  onChange={(e) => setState({ ...state, githubToken: e.target.value })}
                  className="w-32 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-500 dark:text-white"
                />
              </div>
              <button
                onClick={handleSyncGithub}
                disabled={isSyncing}
                className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
              >
                {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
                GitHub와 동기화
              </button>
            </div>
          </div>

          {/* Bottom Row: Tools */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => textFileInputRef.current?.click()}
              className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-colors"
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
            <button
              onClick={() => handleAutoConsolidate()}
              disabled={isCheckingConsistency || state.notes.length === 0}
              className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {isCheckingConsistency ? <Loader2 className="w-3 h-3 animate-spin" /> : <Merge className="w-3 h-3" />}
              노트 통합
            </button>
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1" />
            <button
              onClick={handleRefactorFolders}
              disabled={isRefactoring || state.notes.length === 0}
              className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {isRefactoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <FolderTree className="w-3 h-3" />}
              폴더 구조 재구축
            </button>
            <button
              onClick={handleCheckConsistency}
              disabled={isCheckingConsistency || state.notes.length === 0}
              className="bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {isCheckingConsistency ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldAlert className="w-3 h-3" />}
              일관성 검사
            </button>
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1" />
            <button
              onClick={handleSuggestGcm}
              disabled={state.notes.length === 0}
              className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800/50 hover:bg-indigo-100 dark:hover:bg-indigo-800/50 text-indigo-700 dark:text-indigo-300 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-colors"
            >
              <Sparkles className="w-3 h-3" />
              GCM 추천
            </button>
            <button
              onClick={handleDetectLinks}
              disabled={state.notes.length === 0}
              className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 hover:bg-amber-100 dark:hover:bg-amber-800/50 text-amber-700 dark:text-amber-300 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-colors"
            >
              <LinkIcon className="w-3 h-3" />
              연결점 탐색
            </button>
            <button
              onClick={handleAnalyzeSharedCore}
              disabled={state.notes.length === 0}
              className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800/50 hover:bg-rose-100 dark:hover:bg-rose-800/50 text-rose-700 dark:text-rose-300 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 transition-colors"
            >
              <Layers className="w-3 h-3" />
              Shared Core 분석
            </button>
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
                  상단 바에 기능 아이디어를 입력하면 자동으로 모듈형 노트로 분해하고, 글로벌 컨텍스트 맵을 업데이트하며, GitHub 저장소와 동기화합니다.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* GCM Viewer */}
      {showGcm && <GCMViewer gcm={state.gcm} />}

      {/* Right Sidebar: Suggestions & Recommendations */}
      {rightSidebarOpen && (
        <div className="w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 h-full flex flex-col shadow-xl z-20 transition-colors duration-200">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/50">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 uppercase tracking-tight">
              <Sparkles className="w-4 h-4 text-amber-500" />
              AI 제안 및 분석
            </h2>
            <button onClick={() => setRightSidebarOpen(false)} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md">
              <X className="w-4 h-4 text-slate-500" />
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
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

            {/* GCM Suggestions */}
            {gcmSuggestions && (gcmSuggestions.suggestedEntities.length > 0 || Object.keys(gcmSuggestions.suggestedVariables).length > 0) && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                  <Database className="w-3 h-3 text-emerald-500" />
                  GCM 추천 엔진
                </h3>
                
                {gcmSuggestions.suggestedEntities.map(entity => (
                  <div key={entity.name} className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/50 p-3 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300">{entity.name} ({entity.type})</span>
                      <button 
                        onClick={() => applyGcmSuggestion('entity', entity)}
                        className="text-[10px] bg-emerald-600 text-white px-2 py-0.5 rounded hover:bg-emerald-700"
                      >
                        추가
                      </button>
                    </div>
                    <p className="text-[10px] text-emerald-700 dark:text-emerald-400">{entity.description}</p>
                  </div>
                ))}

                {Object.entries(gcmSuggestions.suggestedVariables).map(([key, value]) => (
                  <div key={key} className="bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800/50 p-3 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-mono font-bold text-indigo-800 dark:text-indigo-300">{key}</span>
                      <button 
                        onClick={() => applyGcmSuggestion('variable', { key, value })}
                        className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded hover:bg-indigo-700"
                      >
                        추가
                      </button>
                    </div>
                    <p className="text-[10px] text-indigo-700 dark:text-indigo-400">{value}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Link Suggestions */}
            {linkSuggestions.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                  <LinkIcon className="w-3 h-3 text-blue-500" />
                  누락된 연결점 탐색
                </h3>
                {linkSuggestions.map((link, idx) => {
                  const fromNote = state.notes.find(n => n.id === link.fromId);
                  const toNote = state.notes.find(n => n.id === link.toId);
                  if (!fromNote || !toNote) return null;
                  
                  return (
                    <div key={idx} className="bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/50 p-3 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-blue-800 dark:text-blue-300 truncate max-w-[150px]">
                          {fromNote.title} → {toNote.title}
                        </span>
                        <button 
                          onClick={() => applyLinkSuggestion(link)}
                          className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded hover:bg-blue-700"
                        >
                          연결
                        </button>
                      </div>
                      <p className="text-[10px] text-blue-700 dark:text-blue-400">{link.reason}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Shared Core Suggestions */}
            {sharedCoreSuggestions.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                  <Layers className="w-3 h-3 text-rose-500" />
                  Shared Core 격상 제안
                </h3>
                {sharedCoreSuggestions.map((suggestion, idx) => {
                  const note = state.notes.find(n => n.id === suggestion.noteId);
                  if (!note) return null;
                  
                  return (
                    <div key={idx} className="bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-800/50 p-3 rounded-lg space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-rose-800 dark:text-rose-300 truncate max-w-[150px]">
                          {note.title}
                        </span>
                        <button 
                          onClick={() => applySharedCorePromotion(suggestion.noteId)}
                          className="text-[10px] bg-rose-600 text-white px-2 py-0.5 rounded hover:bg-rose-700"
                        >
                          격상
                        </button>
                      </div>
                      <p className="text-[10px] text-rose-700 dark:text-rose-400">{suggestion.reason}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {!nextStepSuggestion && !gcmSuggestions && linkSuggestions.length === 0 && sharedCoreSuggestions.length === 0 && (
              <div className="text-center py-12">
                <Sparkles className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                <p className="text-xs text-slate-400">현재 분석된 제안이 없습니다.<br/>상단 도구를 사용하여 분석을 시작하세요.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
