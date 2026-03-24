import React from 'react';
import { Note, NoteStatus, NotePriority, NoteType } from '../types';
import { FolderTree, Activity, Star, Hash, Clock, Layers, Tag, Link2, ChevronRight, X } from 'lucide-react';

interface NoteMetadataEditorProps {
  note: Note;
  allNotes: Note[];
  editData: any;
  setEditData: React.Dispatch<React.SetStateAction<any>>;
  syncChanges: (updatedData: any) => void;
  isSnapshotNote: boolean;
}

const MetadataRow: React.FC<{ label: string; icon: React.ReactNode; children: React.ReactNode }> = ({ label, icon, children }) => (
  <div className="flex items-center px-4 py-2 border-b border-slate-200 dark:border-slate-800 last:border-b-0">
    <div className="w-24 flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
      {icon}
      {label}
    </div>
    <div className="flex-1">
      {children}
    </div>
  </div>
);

export const NoteMetadataEditor: React.FC<NoteMetadataEditorProps> = ({
  note,
  allNotes,
  editData,
  setEditData,
  syncChanges,
  isSnapshotNote
}) => {
  const handleStatusChange = (status: NoteStatus) => {
    if (isSnapshotNote) return;
    setEditData((prev: any) => ({ ...prev, status }));
    syncChanges({ status });
  };

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
        {/* Left Column: 폴더 -> 상태 -> 버전 -> 최종수정 */}
        <div className="border-r border-slate-200 dark:border-slate-800">
          <MetadataRow label="폴더" icon={<FolderTree className="w-3 h-3" />}>
            <input
              type="text"
              value={editData.folder}
              onChange={(e) => !isSnapshotNote && setEditData({ ...editData, folder: e.target.value })}
              onBlur={() => syncChanges({ folder: editData.folder })}
              readOnly={isSnapshotNote}
              className="w-full bg-transparent text-xs focus:outline-none text-slate-700 dark:text-slate-300"
              placeholder="도메인/경로"
            />
          </MetadataRow>

          <MetadataRow label="상태" icon={<Activity className="w-3 h-3" />}>
            <select
              value={editData.status}
              onChange={(e) => handleStatusChange(e.target.value as NoteStatus)}
              className="w-full bg-transparent text-xs focus:outline-none text-slate-700 dark:text-slate-300"
            >
              <option value="Planned">Planned</option>
              <option value="In-Progress">In-Progress</option>
              <option value="Done">Done</option>
              <option value="Conflict">Conflict</option>
              <option value="Review-Required">Review-Required</option>
              <option value="Deprecated">Deprecated</option>
            </select>
          </MetadataRow>

          <MetadataRow label="우선순위" icon={<Star className="w-3 h-3" />}>
            <select
              value={editData.priority}
              onChange={(e) => {
                const val = e.target.value as NotePriority;
                setEditData((prev: any) => ({ ...prev, priority: val }));
                syncChanges({ priority: val });
              }}
              className="w-full bg-transparent text-xs font-bold text-indigo-600 dark:text-indigo-400 focus:outline-none"
            >
              <option value="A">A - 즉시 구현</option>
              <option value="B">B - 순차 구현</option>
              <option value="C">C - 추후 구현</option>
              <option value="Done">Done - 완료</option>
            </select>
          </MetadataRow>

          <MetadataRow label="버전" icon={<Hash className="w-3 h-3" />}>
            <input
              type="text"
              value={editData.version}
              readOnly
              className="w-full bg-transparent text-xs text-slate-500"
            />
          </MetadataRow>

          <MetadataRow label="최종 수정" icon={<Clock className="w-3 h-3" />}>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              {new Date(note.lastUpdated).toLocaleString()}
            </span>
          </MetadataRow>
        </div>

        {/* Right Column: 유형 -> 태그 -> 연관 노트 -> 상위 노트 -> 하위 노트 */}
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
      </div>
    </div>
  );
};
