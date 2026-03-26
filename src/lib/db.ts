import Dexie, { type Table } from 'dexie';

export interface LocalNote {
  id: string;
  title: string;
  folder: string;
  content: string;
  summary: string;
  noteType: 'Epic' | 'Feature' | 'Task' | 'Reference';
  parentNoteId?: string;
  parentNoteIds?: string[];
  childNoteIds?: string[];
  relatedNoteIds?: string[];
  status: string;
  githubLink?: string;
  lastUpdated: string;
  yamlMetadata: string;
  isMainFeature?: boolean;
  sha: string;
  isDirty: boolean;
  hasContent: boolean;
  remoteLastUpdated?: string;
}

export class MyDatabase extends Dexie {
  notes!: Table<LocalNote>;

  constructor() {
    super('NotesDatabase');
    this.version(2).stores({
      notes: 'id, title, folder, isDirty, sha, hasContent'
    });
  }
}

export const db = new MyDatabase();
