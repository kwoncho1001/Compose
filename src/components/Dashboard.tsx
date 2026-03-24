import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './Sidebar';
import { NoteEditor } from './NoteEditor';
import { MindMap } from './MindMap';
import { Dialog } from './common/Dialog';
import { Note, GCM, AppState, ChatMessage, NoteType, NoteStatus } from '../types';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Github, RefreshCw, Lightbulb, Loader2, Download, Upload, FolderTree, ShieldAlert, FileUp, Merge, Layers, Moon, Sun, Database, X, PanelLeft, PanelRight, Sparkles, Search, ChevronRight, FileText, Trash2, MessageSquare, CheckCircle2 } from 'lucide-react';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

import { useProjectState } from '../hooks/useProjectState';
import { useNoteSync } from '../hooks/useNoteSync';
import { useGithubIntegration } from '../hooks/useGithubIntegration';
import { useAIAnalysis } from '../hooks/useAIAnalysis';
import { useChatSession } from '../hooks/useChatSession';

import { Auth } from './Auth';

export const Dashboard: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [githubFiles, setGithubFiles] = useState<{ path: string; sha: string }[]>([]);
  const [githubReadme, setGithubReadme] = useState<string>('');
  
  const [activeSidebarTab, setActiveSidebarTab] = useState<'tools' | 'chat'>('tools');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textFileInputRef = useRef<HTMLInputElement>(null);

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
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
  const [viewMode, setViewMode] = useState<'editor' | 'mindmap'>('editor');
  
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleCancelProcess = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsDecomposing(false);
    setIsSyncing(false);
    setIsRefactoring(false);
    setIsCheckingConsistency(false);
    setProcessStatus(null);
  };

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
      confirmText: '확인',
      onConfirm: () => setDialogConfig(null)
    });
  };

  // Use hooks
  const {
    state,
    setState,
    projects,
    currentProjectId,
    setCurrentProjectId,
    isInitialLoading,
    setIsInitialLoading,
    userId,
    syncProject,
    cleanObject,
    handleCreateProject,
    handleRenameProject,
    handleDeleteProject
  } = useProjectState(setDialogConfig, setProcessStatus, showAlert);

  const {
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
    handleTextFileUpload
  } = useNoteSync(
    userId,
    currentProjectId,
    state,
    setState,
    setIsInitialLoading,
    cleanObject,
    setDialogConfig,
    setProcessStatus,
    showAlert,
    selectedNoteId,
    setSelectedNoteId,
    syncProject,
    abortControllerRef
  );

  const {
    handleDecompose,
    handleOptimizeBlueprint,
    handleCheckConsistency,
    handleEnforceHierarchy,
    handleGenerateSubModules,
    handleAnalyzeNextSteps
  } = useAIAnalysis(
    userId,
    currentProjectId,
    state,
    setState,
    syncProject,
    saveNotesToFirestore,
    deleteNoteFromFirestore,
    setProcessStatus,
    showAlert,
    abortControllerRef,
    setIsDecomposing,
    setIsSyncing,
    setSelectedNoteId,
    setNextStepSuggestion,
    setRightSidebarOpen,
    githubFiles,
    githubReadme
  );

  const {
    handleSyncGithub,
    handleWipeSnapshots,
    reconcileNoteRelationships
  } = useGithubIntegration(
    userId,
    currentProjectId,
    state,
    setState,
    syncProject,
    saveNotesToFirestore,
    deleteNotesFromFirestore,
    setDialogConfig,
    setProcessStatus,
    showAlert,
    abortControllerRef,
    setIsSyncing,
    handleEnforceHierarchy
  );

  const {
    chatInput,
    setChatInput,
    isChatting,
    handleChat,
    handleClearChat,
    chatEndRef
  } = useChatSession(
    userId,
    currentProjectId,
    state,
    setState,
    showAlert,
    abortControllerRef
  );

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
          saveNotesToFirestore(importedState.notes);
          syncProject({
            gcm: importedState.gcm,
            githubRepo: importedState.githubRepo,
            githubToken: importedState.githubToken
          });
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

  const selectedNote = state.notes.find(n => n.id === selectedNoteId);

  return (
    <div className="flex h-screen bg-slate-100 dark:bg-slate-950 font-sans overflow-hidden transition-colors duration-200">
      {/* Sidebar Rail - Desktop */}
      <div className="hidden lg:flex w-16 bg-slate-900 border-r border-slate-800 flex-col items-center py-4 gap-4 z-30">
        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/20">
          <span className="text-white font-bold text-lg">VA</span>
        </div>
        
        <button
          onClick={() => setViewMode('editor')}
          className={`p-3 rounded-xl transition-all duration-200 ${viewMode === 'editor' ? 'bg-indigo-500/20 text-indigo-400 shadow-inner' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
          title="에디터 뷰"
        >
          <FileText className="w-6 h-6" />
        </button>
        
        <button
          onClick={() => setViewMode('mindmap')}
          className={`p-3 rounded-xl transition-all duration-200 ${viewMode === 'mindmap' ? 'bg-indigo-500/20 text-indigo-400 shadow-inner' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
          title="마인드맵 뷰"
        >
          <Layers className="w-6 h-6" />
        </button>
        
        <div className="mt-auto flex flex-col gap-4">
          <button
            onClick={() => setDarkMode(!darkMode)}
            className="p-3 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-xl transition-all"
          >
            {darkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
          </button>
        </div>
      </div>

      {/* Sidebar - Desktop */}
      <div className={`hidden lg:block transition-all duration-300 ease-in-out ${isSidebarOpen ? 'w-72' : 'w-0'}`}>
        {isSidebarOpen && (
          <Sidebar
            notes={state.notes}
            title="Design Notes"
            projects={projects}
            currentProjectId={currentProjectId}
            onSelectProject={setCurrentProjectId}
            onCreateProject={handleCreateProject}
            onRenameProject={handleRenameProject}
            onDeleteProject={handleDeleteProject}
            selectedNoteId={selectedNoteId}
            onSelectNote={setSelectedNoteId}
            onAddNote={handleAddNote}
            onAddChildNote={handleAddChildNote}
            onDeleteNote={handleDeleteNote}
            onDeleteFolder={handleDeleteFolder}
            onDeleteMultiple={handleDeleteMultiple}
            isOpen={isSidebarOpen}
            setIsOpen={setIsSidebarOpen}
          />
        )}
      </div>

      {/* Sidebar - Mobile Overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 shadow-2xl animate-in slide-in-from-left duration-300">
            <Sidebar
              notes={state.notes}
              title="Design Notes"
              projects={projects}
              currentProjectId={currentProjectId}
              onSelectProject={(id) => {
                setCurrentProjectId(id);
                setIsMobileMenuOpen(false);
              }}
              onCreateProject={handleCreateProject}
              onRenameProject={handleRenameProject}
              onDeleteProject={handleDeleteProject}
              selectedNoteId={selectedNoteId}
              onSelectNote={(id) => {
                setSelectedNoteId(id);
                setIsMobileMenuOpen(false);
              }}
              onAddNote={handleAddNote}
              onAddChildNote={handleAddChildNote}
              onDeleteNote={handleDeleteNote}
              onDeleteFolder={handleDeleteFolder}
              onDeleteMultiple={handleDeleteMultiple}
              onClose={() => setIsMobileMenuOpen(false)}
              isOpen={isMobileMenuOpen}
              setIsOpen={setIsMobileMenuOpen}
            />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 슬림해진 상단 헤더 */}
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-3 shadow-sm z-10 flex items-center justify-between transition-colors duration-200">
          <div className="flex items-center gap-2">
            {/* Mobile Menu Toggle */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors lg:hidden"
            >
              <PanelLeft className="w-5 h-5" />
            </button>
            
            {/* Desktop Sidebar Toggle */}
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="hidden lg:block p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
              title={isSidebarOpen ? "사이드바 접기" : "사이드바 펴기"}
            >
              <PanelLeft className={`w-5 h-5 ${isSidebarOpen ? 'text-indigo-500' : ''}`} />
            </button>
            
            <h1 className="text-lg font-bold text-slate-800 dark:text-white ml-2 hidden sm:block">Vibe-Architect</h1>
          </div>

          <div className="flex items-center gap-3">
            <Auth />
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1" />
            <button
              onClick={() => {
                setRightSidebarOpen(!rightSidebarOpen);
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
            <div className="flex items-center gap-4">
              {processStatus.current !== undefined && processStatus.total !== undefined && (
                <>
                  <div className="text-xs font-mono bg-indigo-500 px-2 py-1 rounded">
                    {processStatus.current} / {processStatus.total} 파일
                  </div>
                  <div className="w-48 h-2 bg-indigo-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-white transition-all duration-500" 
                      style={{ width: `${(processStatus.current / processStatus.total) * 100}%` }}
                    />
                  </div>
                </>
              )}
              <button 
                onClick={handleCancelProcess}
                className="ml-4 px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-sm font-medium transition-colors flex items-center gap-1"
              >
                <X className="w-4 h-4" />
                중단
              </button>
            </div>
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
              gcm={state.gcm}
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

      {/* 오른쪽 사이드바: 도구 및 제안 통합 */}
      {rightSidebarOpen && (
        <div className="w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 h-full flex flex-col shadow-xl z-20 transition-colors duration-200">
          <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/50">
            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 uppercase tracking-tight">
              <Sparkles className="w-4 h-4 text-amber-500" />
              {activeSidebarTab === 'tools' ? '프로젝트 제어 및 분석' : '프로젝트 지식 가이드'}
            </h2>
            <div className="flex items-center gap-1">
              {activeSidebarTab === 'chat' && (state.chatMessages?.length || 0) > 0 && (
                <button 
                  onClick={handleClearChat} 
                  className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md text-slate-500 hover:text-rose-500 transition-colors"
                  title="대화 내역 삭제"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => setRightSidebarOpen(false)} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>
          </div>

          {/* 탭 메뉴 */}
          <div className="flex border-b border-slate-200 dark:border-slate-800">
            <button
              onClick={() => setActiveSidebarTab('tools')}
              className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-colors ${activeSidebarTab === 'tools' ? 'text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900 border-b-2 border-indigo-600 dark:border-indigo-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
            >
              <Layers className="w-3 h-3" />
              도구
            </button>
            <button
              onClick={() => setActiveSidebarTab('chat')}
              className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-colors ${activeSidebarTab === 'chat' ? 'text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900 border-b-2 border-indigo-600 dark:border-indigo-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
            >
              <MessageSquare className="w-3 h-3" />
              챗
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto">
            {activeSidebarTab === 'tools' ? (
              <div className="p-4 space-y-6">
                {/* 섹션 1: 기능 설계 도구 */}
                <div className="space-y-3">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">기능 설계</h3>
                  <div className="flex flex-col gap-2">
                    <input
                      type="text"
                      placeholder="설계할 기능을 입력하세요 (예: 로그인 기능 추가)"
                      value={featureInput}
                      onChange={(e) => setFeatureInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleDecompose(featureInput, setFeatureInput)}
                      className="w-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 rounded-md px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                    />
                    <button
                      onClick={() => handleDecompose(featureInput, setFeatureInput)}
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
                      onChange={(e) => {
                        const val = e.target.value;
                        setState(prev => ({ ...prev, githubRepo: val }));
                        syncProject({ githubRepo: val });
                      }}
                      className="w-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 rounded-md px-3 py-1.5 text-[11px] dark:text-white"
                    />
                    <input
                      type="password"
                      placeholder="Github PAT (선택 사항)"
                      value={state.githubToken}
                      onChange={(e) => {
                        const val = e.target.value;
                        setState(prev => ({ ...prev, githubToken: val }));
                        syncProject({ githubToken: val });
                      }}
                      className="w-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 rounded-md px-3 py-1.5 text-[11px] dark:text-white"
                    />
                    
                    {state.lastSyncedAt && (
                      <div className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-md border border-slate-100 dark:border-slate-800">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[10px] text-slate-400 font-medium uppercase">최근 동기화</span>
                          <span className="text-[10px] text-slate-500">{new Date(state.lastSyncedAt).toLocaleString()}</span>
                        </div>
                        {state.lastSyncedSha && (
                          <div className="text-[9px] text-slate-400 font-mono truncate">
                            SHA: {state.lastSyncedSha}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleSyncGithub()}
                        disabled={isSyncing}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-md text-[11px] font-bold flex items-center justify-center gap-2 transition-all"
                        title="변경된 파일만 분석하여 코드 스냅샷을 업데이트합니다."
                      >
                        {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Github className="w-3 h-3" />}
                        최신 코드 반영
                      </button>
                      <button
                        onClick={() => handleWipeSnapshots()}
                        disabled={isSyncing}
                        className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 py-2 rounded-md text-[11px] font-bold flex items-center justify-center gap-2 transition-all"
                        title="GitHub에서 가져온 모든 코드 스냅샷을 삭제합니다."
                      >
                        <Trash2 className="w-3 h-3" />
                        스냅샷 초기화
                      </button>
                    </div>
                  </div>
                </div>

                {/* 섹션 3: 분석 도구 모음 */}
                <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">설계 최적화 및 분석</h3>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={handleOptimizeBlueprint}
                      disabled={isSyncing || state.notes.length === 0}
                      className="col-span-1 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 py-2.5 rounded-md text-[10px] font-bold border border-indigo-100 dark:border-indigo-800/50 flex items-center justify-center gap-1 shadow-sm"
                    >
                      {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} 설계도 최적화
                    </button>
                    <button
                      onClick={handleCheckConsistency}
                      disabled={isSyncing || state.notes.length === 0}
                      className="col-span-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 py-2.5 rounded-md text-[10px] font-bold border border-emerald-100 dark:border-emerald-800/50 flex items-center justify-center gap-1 shadow-sm"
                    >
                      {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldAlert className="w-3 h-3" />} 일관성 검증
                    </button>
                    <button
                      onClick={() => handleEnforceHierarchy()}
                      disabled={isSyncing || state.notes.length === 0}
                      className="col-span-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 py-2.5 rounded-md text-[10px] font-bold border border-amber-100 dark:border-amber-800/50 flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Layers className="w-3 h-3" />} 계층 구조 자동 보정 (고아 노트 해결)
                    </button>
                    <button
                      onClick={() => handleSanitizeIntegrity(false)}
                      disabled={isSyncing || state.notes.length === 0}
                      className="col-span-2 bg-slate-50 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300 py-2.5 rounded-md text-[10px] font-bold border border-slate-200 dark:border-slate-800 flex items-center justify-center gap-1.5 shadow-sm"
                    >
                      {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3 text-emerald-500" />} 데이터 무결성 최적화 (관계 복구)
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
                    onChange={(e) => handleTextFileUpload(e, textFileInputRef)}
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
            ) : (
              <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950/20">
                {/* 채팅 메시지 영역 */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {(state.chatMessages?.length || 0) === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 opacity-50">
                      <MessageSquare className="w-12 h-12 text-slate-300 mb-4" />
                      <p className="text-sm font-medium text-slate-500">프로젝트 설계에 대해 궁금한 점을 물어보세요.</p>
                      <p className="text-[10px] text-slate-400 mt-2">예: "현재 구현된 로그인 로직이 보안상 괜찮아?"</p>
                    </div>
                  )}
                  {state.chatMessages?.map((msg, idx) => (
                    <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[90%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                        msg.role === 'user' 
                          ? 'bg-indigo-600 text-white rounded-tr-none' 
                          : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-700 rounded-tl-none'
                      }`}>
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{msg.content}</Markdown>
                        </div>
                        <div className={`text-[9px] mt-1 opacity-50 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                          {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  ))}
                  {isChatting && (
                    <div className="flex justify-start">
                      <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm">
                        <div className="flex gap-1">
                          <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                          <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                          <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* 채팅 입력 영역 */}
                <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
                  <div className="relative">
                    <textarea
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleChat();
                        }
                      }}
                      placeholder="메시지를 입력하세요..."
                      className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 pr-12 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none dark:text-white min-h-[80px] max-h-[200px]"
                    />
                    <button
                      onClick={handleChat}
                      disabled={isChatting || !chatInput.trim()}
                      className="absolute right-3 bottom-3 p-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}
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
