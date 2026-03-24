import { Note } from '../types';

export interface NoteEditorHeaderProps {
  title: string;
  isSnapshotNote: boolean;
  isGeneratingSub: boolean;
  onTitleChange: (title: string) => void;
  onTitleBlur: () => void;
  onGenerateSub: () => void;
  onDelete: () => void;
}

export interface NoteTargetedUpdateProps {
  command: string;
  setCommand: (val: string) => void;
  onUpdate: () => void;
  isLoading: boolean;
}

export interface NoteSummarySectionProps {
  summary: string;
  isSnapshotNote: boolean;
  onSummaryChange: (val: string) => void;
  onSummaryBlur: () => void;
}

export interface MetadataFieldGroupProps {
  editData: any;
  setEditData: React.Dispatch<React.SetStateAction<any>>;
  syncChanges: (updatedData: any) => void;
  isSnapshotNote: boolean;
  note: Note;
}

export interface RelationshipFieldGroupProps {
  editData: any;
  allNotes: Note[];
  note: Note;
  isSnapshotNote: boolean;
  setEditData: React.Dispatch<React.SetStateAction<any>>;
  syncChanges: (updatedData: any) => void;
  handleRelatedAdd: (relId: string) => void;
  handleRelatedRemove: (relId: string) => void;
  handleParentAdd: (pId: string) => void;
  handleParentRemove: (pId: string) => void;
  handleNoteTypeChange: (noteType: any) => void;
}
