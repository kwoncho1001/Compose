export type NoteStatus = 'Planned' | 'In-Progress' | 'Done' | 'Conflict' | 'Deprecated' | 'Review-Required' | 'Temporary Merge';

export interface Note {
  id: string;
  title: string;
  folder: string;
  content: string;
  summary: string;
  parentNoteId?: string;
  relatedNoteIds?: string[];
  status: NoteStatus;
  githubLink?: string;
  lastUpdated?: string;
  yamlMetadata: string;
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

export interface AppState {
  notes: Note[];
  gcm: GCM;
  githubRepo: string;
  githubToken: string;
  lastSyncedAt?: string;
  lastSyncedSha?: string;
  fileSyncLogs?: Record<string, string>;
}
