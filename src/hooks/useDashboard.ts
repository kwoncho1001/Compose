import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Note, AppState, NoteType, NoteStatus } from '../types';
import { DashboardUIState, DashboardActions, DashboardData } from '../types/dashboard';

import { useProjectState } from './useProjectState';
import { useNoteSync } from './useNoteSync';
import { useGithubIntegration } from './useGithubIntegration';
import { useAIAnalysis } from './useAIAnalysis';
import { useChatSession } from './useChatSession';
import { useKnowledgeSynthesis } from './useKnowledgeSynthesis';

export const useDashboard = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [githubFiles, setGithubFiles] = useState<{ path: string; sha: string }[]>([]);
  const [githubReadme, setGithubReadme] = useState<string>('');
  
  const [activeSidebarTab, setActiveSidebarTab] = useState<'tools' | 'chat'>('tools');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textFileInputRef = useRef<HTMLInputElement>(null);

  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
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

  const handleCancelProcess = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsDecomposing(false);
    setIsSyncing(false);
    setIsRefactoring(false);
    setIsCheckingConsistency(false);
    setProcessStatus(null);
  }, []);

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

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('vibe-architect-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('vibe-architect-theme', 'light');
    }
  }, [darkMode]);

  const showAlert = useCallback((title: string, message: string, type: 'info' | 'warning' | 'error' | 'success' = 'info') => {
    setDialogConfig({
      isOpen: true,
      title,
      message,
      type,
      confirmText: '확인',
      onConfirm: () => setDialogConfig(null)
    });
  }, []);

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

  useEffect(() => {
    if (!isInitialLoading && state.notes.length > 0) {
      const timer = setTimeout(() => {
        handleSanitizeIntegrity(true);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isInitialLoading, state.notes.length, handleSanitizeIntegrity]);

  const {
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
    isSyncing,
    setIsSyncing,
    handleEnforceHierarchy
  );

  const chatSession = useChatSession(
    userId,
    currentProjectId,
    state,
    setState,
    showAlert,
    abortControllerRef
  );

  const knowledgeSynthesis = useKnowledgeSynthesis(
    currentProjectId,
    state,
    setState,
    chatSession.addChatMessage,
    chatSession.updateChatMessage,
    saveNotesToFirestore,
    setProcessStatus,
    showAlert,
    setActiveSidebarTab
  );

  const handleInteractiveAction = useCallback(async (messageId: string, selected: string[], isSubmit?: boolean) => {
    const msg = state.chatMessages?.find(m => m.id === messageId);
    if (!msg || !msg.interactive) return;

    if (isSubmit) {
      if (msg.interactive.type === 'goals') {
        await knowledgeSynthesis.handleGoalSelection(messageId, selected);
      }
    } else {
      // Just update selection state in Firestore
      await chatSession.updateChatMessage(messageId, {
        interactive: { ...msg.interactive, selected }
      });
    }
  }, [state.chatMessages, knowledgeSynthesis, chatSession]);

  const handleChatSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    const input = chatSession.chatInput.trim();
    if (!input) return;

    // Heuristic for synthesis request
    const synthesisKeywords = ['설계', '구현', '분석', '만들어줘', '어떻게', '방법', '프로젝트'];
    const isSynthesisRequest = synthesisKeywords.some(k => input.includes(k));

    if (isSynthesisRequest && state.notes.length === 0) {
      chatSession.setChatInput('');
      await knowledgeSynthesis.startSynthesis(input);
    } else {
      await chatSession.handleChat();
    }
  }, [chatSession, state.notes.length, knowledgeSynthesis]);

  const handleExport = useCallback(() => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vibe-architect-export.json';
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
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
  }, [saveNotesToFirestore, syncProject, setState, showAlert]);

  const selectedNote = useMemo(() => state.notes.find(n => n.id === selectedNoteId), [state.notes, selectedNoteId]);

  const uiState: DashboardUIState = useMemo(() => ({
    isSidebarOpen,
    isMobileMenuOpen,
    activeSidebarTab,
    selectedNoteId,
    darkMode,
    isDecomposing,
    isSyncing,
    isRefactoring,
    isCheckingConsistency,
    processStatus,
    nextStepSuggestion,
    leftSidebarOpen,
    rightSidebarOpen,
    viewMode,
    isInitialLoading,
    chatInput: chatSession.chatInput,
    isChatting: chatSession.isChatting
  }), [
    isSidebarOpen, isMobileMenuOpen, activeSidebarTab, selectedNoteId, darkMode,
    isDecomposing, isSyncing, isRefactoring, isCheckingConsistency, processStatus,
    nextStepSuggestion, leftSidebarOpen, rightSidebarOpen, viewMode, isInitialLoading,
    chatSession.chatInput, chatSession.isChatting
  ]);

  const actions: DashboardActions = useMemo(() => ({
    setIsSidebarOpen,
    setIsMobileMenuOpen,
    setActiveSidebarTab,
    setSelectedNoteId,
    setDarkMode,
    setViewMode,
    setRightSidebarOpen,
    setChatInput: chatSession.setChatInput,
    handleCancelProcess,
    showAlert,
    handleExport,
    handleImport,
    setCurrentProjectId,
    handleCreateProject,
    handleRenameProject,
    handleDeleteProject,
    handleUpdateNote,
    handleDeleteNote,
    handleDeleteFolder,
    handleDeleteMultiple,
    handleSanitizeIntegrity,
    handleTargetedUpdate,
    handleAddNote,
    handleAddChildNote,
    handleTextFileUpload,
    handleOptimizeBlueprint,
    handleCheckConsistency,
    handleEnforceHierarchy,
    handleGenerateSubModules,
    handleAnalyzeNextSteps,
    handleSyncGithub,
    handleWipeSnapshots,
    handleChat: (e?: React.FormEvent) => handleChatSubmit(e || { preventDefault: () => {} } as React.FormEvent),
    handleClearChat: chatSession.handleClearChat,
    onInteractiveAction: handleInteractiveAction,
    startSynthesis: knowledgeSynthesis.startSynthesis,
    isSynthesizing: knowledgeSynthesis.isSynthesizing,
    syncProject
  }), [
    setIsSidebarOpen, setIsMobileMenuOpen, setActiveSidebarTab, setSelectedNoteId,
    setDarkMode, setViewMode, setRightSidebarOpen, chatSession.setChatInput,
    handleCancelProcess, showAlert, handleExport, handleImport, setCurrentProjectId,
    handleCreateProject, handleRenameProject, handleDeleteProject, handleUpdateNote,
    handleDeleteNote, handleDeleteFolder, handleDeleteMultiple, handleSanitizeIntegrity,
    handleTargetedUpdate, handleAddNote, handleAddChildNote, handleTextFileUpload,
    handleOptimizeBlueprint, handleCheckConsistency, handleEnforceHierarchy,
    handleGenerateSubModules, handleAnalyzeNextSteps, handleSyncGithub, handleWipeSnapshots,
    handleChatSubmit, chatSession.handleClearChat, handleInteractiveAction,
    knowledgeSynthesis.startSynthesis, knowledgeSynthesis.isSynthesizing, syncProject
  ]);

  const data: DashboardData = useMemo(() => ({
    state,
    setState,
    projects,
    currentProjectId,
    userId: userId || null,
    selectedNote,
    dialogConfig,
    setDialogConfig
  }), [state, setState, projects, currentProjectId, userId, selectedNote, dialogConfig, setDialogConfig]);

  const refs = useMemo(() => ({
    fileInputRef,
    textFileInputRef,
    chatEndRef: chatSession.chatEndRef
  }), [fileInputRef, textFileInputRef, chatSession.chatEndRef]);

  return {
    uiState,
    actions,
    data,
    refs
  };
};
