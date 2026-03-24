import React from 'react';
import { Note, NoteType } from '../types';
import { Activity } from 'lucide-react';
import { MetadataFieldGroup } from './note-editor/metadata/MetadataFieldGroup';
import { RelationshipFieldGroup } from './note-editor/metadata/RelationshipFieldGroup';

interface NoteMetadataEditorProps {
  note: Note;
  allNotes: Note[];
  editData: any;
  setEditData: React.Dispatch<React.SetStateAction<any>>;
  syncChanges: (updatedData: any) => void;
  isSnapshotNote: boolean;
}

export const NoteMetadataEditor: React.FC<NoteMetadataEditorProps> = ({
  note,
  allNotes,
  editData,
  setEditData,
  syncChanges,
  isSnapshotNote
}) => {
  const handleParentAdd = (pId: string) => {
    if (isSnapshotNote || editData.parentNoteIds.includes(pId)) return;
    const newParentIds = [...editData.parentNoteIds, pId];
    setEditData((prev: any) => ({ ...prev, parentNoteIds: newParentIds }));
    syncChanges({ parentNoteIds: newParentIds });
  };

  const handleParentRemove = (pId: string) => {
    if (isSnapshotNote) return;
    const newParentIds = editData.parentNoteIds.filter((id: string) => id !== pId);
    setEditData((prev: any) => ({ ...prev, parentNoteIds: newParentIds }));
    syncChanges({ parentNoteIds: newParentIds });
  };

  const handleNoteTypeChange = (noteType: NoteType) => {
    if (isSnapshotNote) return;
    setEditData((prev: any) => ({ ...prev, noteType }));
    syncChanges({ noteType });
  };

  const handleRelatedAdd = (relId: string) => {
    if (isSnapshotNote || editData.relatedNoteIds.includes(relId)) return;
    const newRelIds = [...editData.relatedNoteIds, relId];
    setEditData((prev: any) => ({ ...prev, relatedNoteIds: newRelIds }));
    syncChanges({ relatedNoteIds: newRelIds });
  };

  const handleRelatedRemove = (relId: string) => {
    if (isSnapshotNote) return;
    const newRelIds = editData.relatedNoteIds.filter((id: string) => id !== relId);
    setEditData((prev: any) => ({ ...prev, relatedNoteIds: newRelIds }));
    syncChanges({ relatedNoteIds: newRelIds });
  };

  return (
    <div className="mb-8 bg-slate-50/50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Activity className="w-3.5 h-3.5" />
          구조화된 메타데이터
        </h3>
        <span className="text-[10px] text-slate-400 font-mono">ID: {note.id}</span>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2">
        <MetadataFieldGroup 
          editData={editData} 
          setEditData={setEditData} 
          syncChanges={syncChanges} 
          isSnapshotNote={isSnapshotNote} 
          note={note} 
        />
        <RelationshipFieldGroup 
          editData={editData} 
          allNotes={allNotes} 
          note={note} 
          isSnapshotNote={isSnapshotNote} 
          setEditData={setEditData} 
          syncChanges={syncChanges} 
          handleRelatedAdd={handleRelatedAdd} 
          handleRelatedRemove={handleRelatedRemove} 
          handleParentAdd={handleParentAdd} 
          handleParentRemove={handleParentRemove} 
          handleNoteTypeChange={handleNoteTypeChange} 
        />
      </div>
    </div>
  );
};

