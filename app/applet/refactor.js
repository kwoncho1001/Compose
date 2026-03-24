const fs = require('fs');

const dashboardPath = 'src/components/Dashboard.tsx';
let content = fs.readFileSync(dashboardPath, 'utf8');

// 1. Replace imports
const importReplacement = `import React, { useState, useEffect, useRef } from 'react';
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

import { Auth } from './Auth';`;

content = content.replace(/import React[\s\S]*?import { Auth } from '\.\/Auth';/, importReplacement);

// 2. Replace component body
const startMarker = `export const Dashboard: React.FC = () => {`;
const endMarker = `  return (
    <div className="flex h-screen bg-slate-100 dark:bg-slate-950 font-sans overflow-hidden transition-colors duration-200">`;

const newBody = `export const Dashboard: React.FC = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [githubFiles, setGithubFiles] = useState<{ path: string; sha: string }[]>([]);
  const [githubReadme, setGithubReadme] = useState<string>('');
  
  const [activeSidebarTab, setActiveSidebarTab] = useState<'tools' | 'chat'>('tools');
  const chatEndRef = useRef<HTMLDivElement>(null);
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

  // Chat state
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);

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
    handleSyncGithub,
    handleWipeSnapshots,
    reconcileNoteRelationships
  } = useGithubIntegration(
    userId,
    currentProjectId,
    state,
    setState,
    setProcessStatus,
    showAlert,
    setDialogConfig,
    syncProject,
    saveNotesToFirestore,
    deleteNotesFromFirestore,
    abortControllerRef,
    setIsSyncing
  );

  const {
    handleDecompose,
    handleOptimizeBlueprint,
    handleCheckConsistency,
    handleEnforceHierarchy,
    handleGenerateSubModules,
    handleAnalyzeNextSteps
  } = useAIAnalysis(
    state,
    setState,
    setProcessStatus,
    showAlert,
    setDialogConfig,
    syncProject,
    saveNotesToFirestore,
    abortControllerRef,
    setIsDecomposing,
    setIsRefactoring,
    setIsCheckingConsistency,
    setNextStepSuggestion
  );

  const {
    handleChat
  } = useChatSession(
    userId,
    currentProjectId,
    state,
    setState,
    chatInput,
    setChatInput,
    isChatting,
    setIsChatting,
    chatEndRef,
    cleanObject
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

`;

const startIndex = content.indexOf(startMarker);
const endIndex = content.indexOf(endMarker);

if (startIndex !== -1 && endIndex !== -1) {
  content = content.substring(0, startIndex) + newBody + content.substring(endIndex);
  fs.writeFileSync(dashboardPath, content, 'utf8');
  console.log('Successfully refactored Dashboard.tsx');
} else {
  console.error('Could not find markers in Dashboard.tsx');
}
