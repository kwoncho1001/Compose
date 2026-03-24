import React from 'react';
import { Note, NoteStatus, NoteType, NotePriority } from '../../types';
import { FolderTree, Tag, Link2, Layers, Hash, Star, Clock } from 'lucide-react';

interface NoteMetadataEditorProps {
  editData: {
    folder: string;
    status: NoteStatus;
    priority: NotePriority;
    version: string;
    importance: number;
    tags: string[];
    parentNoteIds: string[];
    relatedNoteIds: string[];
    noteType: NoteType;
  };
  setEditData: React.Dispatch<React.SetStateAction<any>>;
  isSnapshotNote: boolean;
  allNotes: Note[];
  handleStatusChange: (status: NoteStatus) => void;
  handleNoteTypeChange: (type: NoteType) => void;
  handleParentAdd: (id: string) => void;
  handleParentRemove: (id: string) => void;
  handleRelatedAdd: (id: string) => void;
  handleRelatedRemove: (id: string) => void;
}

const MetadataRow: React.FC<{ label: string; icon: React.ReactNode; children: React.ReactNode }> = ({ label, icon, children }) => (
  <div className="flex items-center px-4 py-2 border-b border-neutral-200 dark:border-neutral-800 last:border-b-0">
    <div className="w-24 flex items-center gap-2 text-[10px] font-bold text-neutral-400 uppercase tracking-wider">
      {icon}
      {label}
    </div>
    <div className="flex-1">
      {children}
    </div>
  </div>
);

export const NoteMetadataEditor: React.FC<NoteMetadataEditorProps> = ({
  editData,
  setEditData,
  isSnapshotNote,
  allNotes,
  handleStatusChange,
  handleNoteTypeChange,
  handleParentAdd,
  handleParentRemove,
  handleRelatedAdd,
  handleRelatedRemove
}) => {
  return (
    <div className="bg-neutral-50 dark:bg-neutral-900/50 border-b border-neutral-200 dark:border-neutral-800 text-sm">
      <MetadataRow label="Folder" icon={<FolderTree className="w-3 h-3" />}>
        <input
          type="text"
          value={editData.folder}
          onChange={e => setEditData(prev => ({ ...prev, folder: e.target.value }))}
          className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm text-neutral-700 dark:text-neutral-300 placeholder-neutral-400"
          placeholder="e.g. Frontend/Components"
          disabled={isSnapshotNote}
        />
      </MetadataRow>

      <MetadataRow label="Type" icon={<Layers className="w-3 h-3" />}>
        <select
          value={editData.noteType}
          onChange={e => handleNoteTypeChange(e.target.value as NoteType)}
          className="bg-transparent border-none focus:ring-0 p-0 text-sm text-neutral-700 dark:text-neutral-300 w-auto cursor-pointer"
          disabled={isSnapshotNote}
        >
          <option value="Epic">Epic</option>
          <option value="Feature">Feature</option>
          <option value="Task">Task</option>
          <option value="Reference">Reference</option>
        </select>
      </MetadataRow>

      <MetadataRow label="Status" icon={<Hash className="w-3 h-3" />}>
        <div className="flex gap-2">
          {(['Planned', 'In Progress', 'Completed', 'Blocked'] as NoteStatus[]).map(status => (
            <button
              key={status}
              onClick={() => handleStatusChange(status)}
              disabled={isSnapshotNote}
              className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                editData.status === status
                  ? 'bg-primary/10 text-primary dark:bg-primary/20'
                  : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700'
              } ${isSnapshotNote ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {status}
            </button>
          ))}
        </div>
      </MetadataRow>

      <MetadataRow label="Priority" icon={<Star className="w-3 h-3" />}>
        <div className="flex gap-2">
          {(['S', 'A', 'B', 'C'] as NotePriority[]).map(p => (
            <button
              key={p}
              onClick={() => setEditData(prev => ({ ...prev, priority: p }))}
              disabled={isSnapshotNote}
              className={`px-2 py-0.5 rounded-full text-xs font-bold transition-colors ${
                editData.priority === p
                  ? p === 'S' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                    p === 'A' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' :
                    p === 'B' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400' :
                    'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700'
              } ${isSnapshotNote ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {p}
            </button>
          ))}
        </div>
      </MetadataRow>

      <MetadataRow label="Tags" icon={<Tag className="w-3 h-3" />}>
        <input
          type="text"
          value={editData.tags.join(', ')}
          onChange={e => setEditData(prev => ({ ...prev, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) }))}
          className="w-full bg-transparent border-none focus:ring-0 p-0 text-sm text-neutral-700 dark:text-neutral-300 placeholder-neutral-400"
          placeholder="comma, separated, tags"
          disabled={isSnapshotNote}
        />
      </MetadataRow>

      <MetadataRow label="Parents" icon={<FolderTree className="w-3 h-3" />}>
        <div className="flex flex-wrap gap-2 items-center">
          {editData.parentNoteIds.map(pId => {
            const pNote = allNotes.find(n => n.id === pId);
            return (
              <span key={pId} className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded text-xs">
                {pNote?.title || 'Unknown'}
                {!isSnapshotNote && (
                  <button onClick={() => handleParentRemove(pId)} className="hover:text-red-500 ml-1">&times;</button>
                )}
              </span>
            );
          })}
          {!isSnapshotNote && (
            <select
              onChange={e => {
                if (e.target.value) {
                  handleParentAdd(e.target.value);
                  e.target.value = '';
                }
              }}
              className="bg-transparent border-none focus:ring-0 p-0 text-xs text-neutral-500 dark:text-neutral-400 cursor-pointer"
            >
              <option value="">+ Add Parent</option>
              {allNotes.filter(n => n.id !== editData.id && !editData.parentNoteIds.includes(n.id)).map(n => (
                <option key={n.id} value={n.id}>{n.title}</option>
              ))}
            </select>
          )}
        </div>
      </MetadataRow>

      <MetadataRow label="Related" icon={<Link2 className="w-3 h-3" />}>
        <div className="flex flex-wrap gap-2 items-center">
          {editData.relatedNoteIds.map(rId => {
            const rNote = allNotes.find(n => n.id === rId);
            return (
              <span key={rId} className="inline-flex items-center gap-1 px-2 py-0.5 bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded text-xs">
                {rNote?.title || 'Unknown'}
                {!isSnapshotNote && (
                  <button onClick={() => handleRelatedRemove(rId)} className="hover:text-red-500 ml-1">&times;</button>
                )}
              </span>
            );
          })}
          {!isSnapshotNote && (
            <select
              onChange={e => {
                if (e.target.value) {
                  handleRelatedAdd(e.target.value);
                  e.target.value = '';
                }
              }}
              className="bg-transparent border-none focus:ring-0 p-0 text-xs text-neutral-500 dark:text-neutral-400 cursor-pointer"
            >
              <option value="">+ Add Related</option>
              {allNotes.filter(n => n.id !== editData.id && !editData.relatedNoteIds.includes(n.id)).map(n => (
                <option key={n.id} value={n.id}>{n.title}</option>
              ))}
            </select>
          )}
        </div>
      </MetadataRow>

      <MetadataRow label="Version" icon={<Clock className="w-3 h-3" />}>
        <span className="text-neutral-500 dark:text-neutral-400 text-xs font-mono">v{editData.version}</span>
      </MetadataRow>
    </div>
  );
};
