import React from 'react';
import { Note, GCM } from '../types';
import { Dialog } from './common/Dialog';
import { useNoteEditorState } from '../hooks/useNoteEditorState';
import { useConflictResolver } from '../hooks/useConflictResolver';
import { NoteMetadataEditor } from './NoteMetadataEditor';
import { NoteContentEditor } from './NoteContentEditor';
import { ConflictBanner } from './ConflictBanner';
import { NoteHeader } from './note-editor/NoteHeader';
import { NoteTargetedUpdate } from './note-editor/NoteTargetedUpdate';
import { NoteSummarySection } from './note-editor/NoteSummarySection';
import { NoteEmptyState } from './note-editor/NoteEmptyState';

interface NoteEditorProps {
  note: Note | null;
  allNotes: Note[];
  gcm: GCM;
  onUpdateNote: (note: Note) => void;
  onTargetedUpdate: (noteId: string, command: string) => Promise<void>;
  onGenerateSubModules: (mainNote: Note) => Promise<void>;
  onDeleteNote: (noteId: string) => void;
  darkMode: boolean;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({
  note,
  allNotes,
  gcm,
  onUpdateNote,
  onTargetedUpdate,
  onGenerateSubModules,
  onDeleteNote,
  darkMode
}) => {
  const {
    editData, setEditData, isEditing, setIsEditing, command, setCommand,
    isUpdating, isGeneratingSub, dialogConfig, showAlert, isSnapshotNote,
    syncChanges, handleSaveManual, handleCommandSubmit, handleGenerateSub, onContentChange
  } = useNoteEditorState(note, gcm, onUpdateNote, onTargetedUpdate, onGenerateSubModules);

  const conflictState = useConflictResolver(note, allNotes, onUpdateNote, showAlert);

  if (!note) return <NoteEmptyState />;

  return (
    <div className="flex-1 bg-white dark:bg-slate-950 overflow-y-auto p-8 border-r border-slate-200 dark:border-slate-800 flex flex-col relative">
      {dialogConfig && (
        <Dialog
          isOpen={dialogConfig.isOpen} title={dialogConfig.title} message={dialogConfig.message}
          type={dialogConfig.type} onConfirm={dialogConfig.onConfirm}
        />
      )}
      <div className="max-w-3xl mx-auto w-full flex-1">
        <NoteHeader 
          title={editData.title} isSnapshotNote={isSnapshotNote} isGeneratingSub={isGeneratingSub}
          onTitleChange={(val) => setEditData({ ...editData, title: val })}
          onTitleBlur={() => syncChanges({ title: editData.title })}
          onGenerateSub={handleGenerateSub} onDelete={() => onDeleteNote(note.id)}
        />

        <ConflictBanner
          note={note} onUpdateNote={onUpdateNote} isAnalyzing={conflictState.isAnalyzing}
          impactResult={conflictState.impactResult} setImpactResult={conflictState.setImpactResult}
          isResolving={conflictState.isResolving} handleImpactAnalysis={conflictState.handleImpactAnalysis}
          handleCodeWins={conflictState.handleCodeWins} handleDesignWins={conflictState.handleDesignWins}
          handlePartialMerge={conflictState.handlePartialMerge}
        />

        <NoteSummarySection 
          summary={editData.summary} isSnapshotNote={isSnapshotNote}
          onSummaryChange={(val) => setEditData({ ...editData, summary: val })}
          onSummaryBlur={() => syncChanges({ summary: editData.summary })}
        />

        <NoteMetadataEditor
          note={note} allNotes={allNotes} editData={editData}
          setEditData={setEditData} syncChanges={syncChanges} isSnapshotNote={isSnapshotNote}
        />

        <NoteContentEditor
          editData={editData} isEditing={isEditing} setIsEditing={setIsEditing}
          isSnapshotNote={isSnapshotNote} darkMode={darkMode}
          onContentChange={onContentChange} handleSaveManual={handleSaveManual} showAlert={showAlert}
        />
      </div>

      <NoteTargetedUpdate 
        command={command} setCommand={setCommand} 
        onUpdate={handleCommandSubmit} isLoading={isUpdating} 
      />
    </div>
  );
};

