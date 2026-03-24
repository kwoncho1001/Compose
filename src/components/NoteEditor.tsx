import React from 'react';
import { Note, GCM } from '../types';
import { FileText, Trash2, Layers, Lightbulb, MessageSquare, Send } from 'lucide-react';
import { Button } from './common/Button';
import { Input } from './common/Input';
import { Dialog } from './common/Dialog';
import { useNoteEditorState } from '../hooks/useNoteEditorState';
import { useConflictResolver } from '../hooks/useConflictResolver';
import { NoteMetadataEditor } from './NoteMetadataEditor';
import { NoteContentEditor } from './NoteContentEditor';
import { ConflictBanner } from './ConflictBanner';

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
    editData,
    setEditData,
    isEditing,
    setIsEditing,
    command,
    setCommand,
    isUpdating,
    isGeneratingSub,
    dialogConfig,
    showAlert,
    isSnapshotNote,
    syncChanges,
    handleSaveManual,
    handleCommandSubmit,
    handleGenerateSub,
    onContentChange
  } = useNoteEditorState(note, gcm, onUpdateNote, onTargetedUpdate, onGenerateSubModules);

  const {
    isAnalyzing,
    impactResult,
    setImpactResult,
    isResolving,
    handleImpactAnalysis,
    handleCodeWins,
    handleDesignWins,
    handlePartialMerge
  } = useConflictResolver(note, allNotes, onUpdateNote, showAlert);

  if (!note) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white dark:bg-slate-950 text-slate-400 transition-colors duration-200">
        <div className="text-center">
          <FileText className="w-12 h-12 mx-auto mb-4 text-slate-300" />
          <p>상세 내용을 보려면 노트를 선택하세요</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-white dark:bg-slate-950 overflow-y-auto p-8 border-r border-slate-200 dark:border-slate-800 flex flex-col relative">
      {dialogConfig && (
        <Dialog
          isOpen={dialogConfig.isOpen}
          title={dialogConfig.title}
          message={dialogConfig.message}
          type={dialogConfig.type}
          onConfirm={dialogConfig.onConfirm}
        />
      )}
      <div className="max-w-3xl mx-auto w-full flex-1">
        {/* --- Header: Title Only --- */}
        <div className="mb-4">
          <input
            type="text"
            value={editData.title}
            onChange={(e) => !isSnapshotNote && setEditData({ ...editData, title: e.target.value })}
            onBlur={() => syncChanges({ title: editData.title })}
            readOnly={isSnapshotNote}
            className={`text-4xl font-extrabold text-slate-900 dark:text-white border-b-2 border-transparent ${isSnapshotNote ? 'cursor-default' : 'hover:border-slate-100 focus:border-indigo-500'} bg-transparent focus:outline-none w-full transition-all py-2`}
            placeholder="노트 제목"
          />
        </div>

        {/* --- Action Menu Bar: Below Title --- */}
        <div className="mb-8 pb-6 border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={handleGenerateSub}
              disabled={isSnapshotNote}
              isLoading={isGeneratingSub}
              icon={<Layers className="w-4 h-4" />}
            >
              하위 모듈 생성
            </Button>

            <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

            {isSnapshotNote && (
              <span className="px-2 py-1 text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded border border-slate-200 dark:border-slate-700 tracking-wider">
                READ ONLY
              </span>
            )}

            <button
              onClick={() => onDeleteNote(note.id)}
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all ml-auto"
              title="노트 삭제"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        <ConflictBanner
          note={note}
          onUpdateNote={onUpdateNote}
          isAnalyzing={isAnalyzing}
          impactResult={impactResult}
          setImpactResult={setImpactResult}
          isResolving={isResolving}
          handleImpactAnalysis={handleImpactAnalysis}
          handleCodeWins={handleCodeWins}
          handleDesignWins={handleDesignWins}
          handlePartialMerge={handlePartialMerge}
        />

        {/* Summary */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
            <Lightbulb className="w-4 h-4" />
            요약
          </h2>
          <textarea
            value={editData.summary}
            onChange={(e) => !isSnapshotNote && setEditData({ ...editData, summary: e.target.value })}
            onBlur={() => syncChanges({ summary: editData.summary })}
            readOnly={isSnapshotNote}
            className={`w-full border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 dark:text-white rounded-lg p-3 text-sm focus:outline-none ${isSnapshotNote ? 'cursor-default' : 'focus:ring-2 focus:ring-indigo-500'} h-20 transition-all`}
            placeholder="이 기능에 대한 간단한 요약..."
          />
        </div>

        <NoteMetadataEditor
          note={note}
          allNotes={allNotes}
          editData={editData}
          setEditData={setEditData}
          syncChanges={syncChanges}
          isSnapshotNote={isSnapshotNote}
        />

        <NoteContentEditor
          editData={editData}
          isEditing={isEditing}
          setIsEditing={setIsEditing}
          isSnapshotNote={isSnapshotNote}
          darkMode={darkMode}
          onContentChange={onContentChange}
          handleSaveManual={handleSaveManual}
          showAlert={showAlert}
        />
      </div>

      {/* Targeted Command Input */}
      <div className="max-w-3xl mx-auto w-full mt-auto pt-6 border-t border-slate-200 dark:border-slate-800 sticky bottom-0 bg-white dark:bg-slate-950 pb-4">
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-indigo-500" />
          집중 업데이트 (이 노트만 집중 업데이트)
        </label>
        <div className="flex gap-2">
          <Input
            placeholder="e.g., '이 로직에 에러 핸들링 추가해줘'"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCommandSubmit()}
            disabled={isUpdating}
            className="flex-1"
          />
          <Button
            onClick={handleCommandSubmit}
            disabled={!command.trim()}
            isLoading={isUpdating}
            icon={<Send className="w-4 h-4" />}
          >
            업데이트
          </Button>
        </div>
      </div>
    </div>
  );
};
