import { AppState, Note, GCM, NoteStatus, NotePriority, NoteType } from '../types';

export interface DashboardUIState {
  isSidebarOpen: boolean;
  isMobileMenuOpen: boolean;
  activeSidebarTab: 'tools' | 'chat';
  selectedNoteId: string | null;
  darkMode: boolean;
  isDecomposing: boolean;
  isSyncing: boolean;
  isRefactoring: boolean;
  isCheckingConsistency: boolean;
  processStatus: { message: string; current?: number; total?: number } | null;
  nextStepSuggestion: string | null;
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  viewMode: 'editor' | 'mindmap';
  isInitialLoading: boolean;
  chatInput: string;
  isChatting: boolean;
  searchQuery: string;
}

export interface DashboardActions {
  setIsSidebarOpen: (open: boolean) => void;
  setIsMobileMenuOpen: (open: boolean) => void;
  setActiveSidebarTab: (tab: 'tools' | 'chat') => void;
  setSelectedNoteId: (id: string | null) => void;
  setDarkMode: (dark: boolean) => void;
  setViewMode: (mode: 'editor' | 'mindmap') => void;
  setRightSidebarOpen: (open: boolean) => void;
  setChatInput: (input: string) => void;
  setSearchQuery: (query: string) => void;
  
  handleCancelProcess: () => void;
  showAlert: (title: string, message: string, type?: 'info' | 'warning' | 'error' | 'success') => void;
  handleExport: () => void;
  handleImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  
  // Project Actions
  setCurrentProjectId: (id: string) => void;
  handleCreateProject: (name: string) => void;
  handleRenameProject: (id: string, newName: string) => void;
  handleDeleteProject: (id: string) => void;
  
  // Note Actions
  handleUpdateNote: (note: Note) => Promise<void>;
  handleDeleteNote: (id: string) => void;
  handleDeleteFolder: (folder: string) => void;
  handleDeleteMultiple: (ids: string[]) => void;
  handleSanitizeIntegrity: (silent?: boolean) => void;
  handleTargetedUpdate: (noteId: string, instruction: string) => Promise<void>;
  handleAddNote: (type?: NoteType, folder?: string) => Promise<void>;
  handleAddChildNote: (parentId: string, type?: NoteType) => Promise<void>;
  handleTextFileUpload: (e: React.ChangeEvent<HTMLInputElement>, ref: React.RefObject<HTMLInputElement>) => void;
  handleRefreshNotes: () => Promise<void>;
  
  // AI Actions
  handleOptimizeBlueprint: () => Promise<void>;
  handleCheckConsistency: () => Promise<void>;
  handleEnforceHierarchy: () => Promise<void>;
  handleGenerateSubModules: (note: Note) => Promise<void>;
  handleAnalyzeNextSteps: () => Promise<void>;
  
  // Github Actions
  handleSyncGithub: (forceUpdate?: boolean) => Promise<void>;
  handleWipeSnapshots: () => Promise<void>;
  
  // Chat Actions
  handleChat: () => Promise<void>;
  handleClearChat: () => void;
  onInteractiveAction: (messageId: string, selected: string[], isSubmit?: boolean) => Promise<void>;
  startSynthesis: (intent: string) => Promise<void>;
  isSynthesizing: boolean;
  syncProject: (data: Partial<AppState>) => void;
}

export interface DashboardData {
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  projects: { id: string; name: string }[];
  currentProjectId: string;
  userId: string | null;
  selectedNote: Note | undefined;
  dialogConfig: any;
  setDialogConfig: (config: any) => void;
}
