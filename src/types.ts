export type NoteStatus = 'Planned' | 'In-Progress' | 'Done' | 'Conflict' | 'Deprecated' | 'Review-Required' | 'Temporary Merge';
export type NoteType = 'Epic' | 'Feature' | 'Task' | 'Reference';
export type NotePriority = 'S' | 'A' | 'B' | 'C' | 'Done'; // S(최고), A, B, C, Done

export interface NoteMetadata {
  id: string;
  title: string;
  folder: string;
  summary: string;
  noteType: NoteType;
  priority: NotePriority;
  status: NoteStatus;
  importance: number;
  parentNoteIds: string[];
  childNoteIds: string[];
  consistencyConflict?: {
    description: string;
    suggestion: string;
  };
}

export interface Note {
  // --- 구획 1: 요약 ---
  id: string; // 시스템 자동 생성
  title: string;
  summary: string;

  // --- 구획 2: 메타데이터 (열 형태의 필드) ---
  version: string;      // 수정 시 시스템 자동 증가 (예: 1.0.1)
  lastUpdated: string;  // 저장 시 시스템 자동 기록
  folder: string;
  status: NoteStatus;
  priority: NotePriority; // 우선순위 필드 추가
  importance: number;   // 1~5점 척도
  noteType: NoteType;
  
  // 계층 관계 (양방향 자동 동기화 대상)
  parentNoteIds: string[];
  childNoteIds: string[]; 
  
  // 연관 관계 (양방향 자동 동기화 대상)
  relatedNoteIds: string[];
  
  // 분류
  tags: string[];       // AI가 본문에서 추출

  // --- 구획 3: 본문 ---
  content: string;
  
  // (기존 충돌 정보 등은 필요에 따라 유지)
  githubLink?: string;
  originPath?: string; // 소스 파일의 물리적 경로 (예: src/services/gemini.ts)
  fileName?: string;   // 원본 코드 파일의 이름 (예: App.tsx)
  filePath?: string;   // 원본 코드 파일의 전체 경로 (예: src/components/App.tsx)
  sourceUrl?: string;  // GitHub 원본 파일 링크
  logicHash?: string;  // 로직 단위의 지문 (코드 조각의 해시값)
  sha?: string;        // 동기화 시점의 커밋 SHA
  isMainFeature?: boolean;
  conflictInfo?: {
    filePath: string;
    fileContent: string;
    reason: string;
    guide?: string;
  };
  consistencyConflict?: {
    description: string;
    suggestion: string;
  };
}

export interface GCMEntity {
  name: string;
  type: string;
  description: string;
  properties: Record<string, string>;
}

export interface GCM {
  entities: Record<string, GCMEntity>;
  variables: Record<string, string>;
}

export interface SyncEntry {
  id: string;
  sha: string;
  lastUpdated: string;
  title: string;
  folder: string;
  status: NoteStatus;
  priority: NotePriority;
  noteType: NoteType;
}

export interface SyncRegistry {
  entries: Record<string, SyncEntry>;
  lastSyncedAt: string;
}

export interface AppState {
  notes: Note[];
  noteMetadata: NoteMetadata[];
  syncRegistry: SyncRegistry;
  gcm: GCM;
  githubRepo: string;
  githubToken: string;
  lastSyncedAt?: string;
  lastSyncedSha?: string;
  fileSyncLogs?: Record<string, string>;
  chatMessages?: ChatMessage[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  createdAt: string;
  expiresAt: any; // Firebase Timestamp
  interactive?: {
    type: 'goals' | 'repos' | 'features';
    options: string[] | any[];
    selected: string[];
    completed?: boolean;
  };
}

export interface SearchStrategy {
  queries: string[];
  suggestedRepos: { full_name: string; description: string }[];
  rationale?: string;
}

export interface RepoSummary {
  nickname: string;
  summary: string;
  features: string;
}

export type RepoSummaries = Record<string, RepoSummary>;

export interface TranspilationResult {
  newNotes: Note[];
  updatedGcm: GCM;
}

export interface ParentSuggestion {
  action: 'match' | 'create';
  parentId?: string;
  newNote?: Partial<Note>;
}
