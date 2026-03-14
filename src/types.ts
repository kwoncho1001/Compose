export type NoteStatus = 'Planned' | 'In-Progress' | 'Done';

export type FolderName =
  | '01_Common'
  | '02_Data_Logic'
  | '03_Interface'
  | '04_User_Experience';

export interface Note {
  id: string;
  title: string;
  folder: FolderName;
  userView: string;
  aiSpec: string;
  status: NoteStatus;
  githubLink?: string;
  yamlMetadata: string;
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
}
