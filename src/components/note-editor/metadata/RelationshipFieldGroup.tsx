import React from 'react';
import { Layers, Tag, Link2, ChevronRight, X } from 'lucide-react';
import { MetadataRow } from './MetadataRow';
import { NoteType } from '../../../types';
import { RelationshipFieldGroupProps } from '../../../types/noteEditor';

export const RelationshipFieldGroup: React.FC<RelationshipFieldGroupProps> = ({
  editData,
  allNotes,
  note,
  isSnapshotNote,
  setEditData,
  syncChanges,
  handleRelatedAdd,
  handleRelatedRemove,
  handleParentAdd,
  handleParentRemove,
  handleNoteTypeChange
}) => {
  return (
    <div>
      <MetadataRow label="유형" icon={<Layers className="w-3 h-3" />}>
        <select
          value={editData.noteType}
          onChange={(e) => handleNoteTypeChange(e.target.value as NoteType)}
          disabled={isSnapshotNote}
          className="w-full bg-transparent text-xs focus:outline-none text-slate-700 dark:text-slate-300 disabled:opacity-50"
        >
          <option value="Epic">Epic</option>
          <option value="Feature">Feature</option>
          <option value="Task">Task</option>
          <option value="Reference">Reference</option>
        </select>
      </MetadataRow>

      <MetadataRow label="태그" icon={<Tag className="w-3 h-3" />}>
        <input
          type="text"
          value={(editData.tags || []).join(', ')}
          onChange={(e) => {
            const tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
            setEditData((prev: any) => ({ ...prev, tags }));
          }}
          onBlur={() => syncChanges({ tags: editData.tags })}
          readOnly={isSnapshotNote}
          className="w-full bg-transparent text-xs focus:outline-none text-slate-700 dark:text-slate-300"
          placeholder="UI, Login, Firebase..."
        />
      </MetadataRow>

      <MetadataRow label="연관 노트" icon={<Link2 className="w-3 h-3" />}>
        <div className="flex flex-wrap gap-1 mb-1">
          {(editData.relatedNoteIds || []).map((relId: string) => {
            const rel = allNotes.find(n => n.id === relId);
            return (
              <span key={relId} className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-[10px] rounded flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                {rel?.title || '...'}
                <X className="w-2 h-2 cursor-pointer" onClick={() => handleRelatedRemove(relId)} />
              </span>
            );
          })}
        </div>
        <select 
          onChange={(e) => e.target.value && handleRelatedAdd(e.target.value)}
          className="w-full bg-transparent text-[10px] text-slate-400 focus:outline-none"
        >
          <option value="">+ 연관 노트 추가</option>
          {allNotes.filter(n => n.id !== note.id && !(editData.relatedNoteIds || []).includes(n.id)).map(n => (
            <option key={n.id} value={n.id}>{n.title}</option>
          ))}
        </select>
      </MetadataRow>

      <MetadataRow label="상위 노트" icon={<ChevronRight className="w-3 h-3" />}>
        <div className="flex flex-wrap gap-1 mb-1">
          {(editData.parentNoteIds || []).map((pId: string) => {
            const pNote = allNotes.find(n => n.id === pId);
            return (
              <span key={pId} className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-[10px] rounded flex items-center gap-1 text-slate-600 dark:text-slate-400">
                {pNote?.title || '...'}
                {!isSnapshotNote && <X className="w-2 h-2 cursor-pointer" onClick={() => handleParentRemove(pId)} />}
              </span>
            );
          })}
        </div>
        {!isSnapshotNote && (
          <select 
            onChange={(e) => e.target.value && handleParentAdd(e.target.value)}
            className="w-full bg-transparent text-[10px] text-slate-400 focus:outline-none"
          >
            <option value="">+ 상위 계층 추가</option>
            {allNotes.filter(n => n.id !== note.id && !(editData.parentNoteIds || []).includes(n.id)).map(n => (
              <option key={n.id} value={n.id}>{n.title}</option>
            ))}
          </select>
        )}
      </MetadataRow>

      <MetadataRow label="하위 노트" icon={<Layers className="w-3 h-3" />}>
        <div className="flex flex-wrap gap-1">
          {(note.childNoteIds?.length || 0) > 0 ? (
            note.childNoteIds?.map(childId => {
              const child = allNotes.find(n => n.id === childId);
              return (
                <span key={childId} className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-[10px] rounded text-slate-600 dark:text-slate-400">
                  {child?.title || '...'}
                </span>
              );
            })
          ) : (
            <span className="text-[10px] text-slate-400 italic">없음</span>
          )}
        </div>
      </MetadataRow>
    </div>
  );
};
