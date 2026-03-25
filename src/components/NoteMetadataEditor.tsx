import React from 'react';
import { Note, NoteStatus, NotePriority } from '../types';
import { 
  Activity, 
  Settings, 
  GitBranch, 
  FileCode, 
  Hash, 
  Clock, 
  FolderTree, 
  Star,
  Layers
} from 'lucide-react';
import { MetadataFieldGroup } from './note-editor/metadata/MetadataFieldGroup';
import { RelationshipFieldGroup } from './note-editor/metadata/RelationshipFieldGroup';
import { MetadataRow } from './note-editor/metadata/MetadataRow';

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
    if (isSnapshotNote || (editData.parentNoteIds || []).includes(pId)) return;
    const newParentIds = [...(editData.parentNoteIds || []), pId];
    setEditData((prev: any) => ({ ...prev, parentNoteIds: newParentIds }));
    syncChanges({ parentNoteIds: newParentIds });
  };

  const handleParentRemove = (pId: string) => {
    if (isSnapshotNote) return;
    const newParentIds = (editData.parentNoteIds || []).filter((id: string) => id !== pId);
    setEditData((prev: any) => ({ ...prev, parentNoteIds: newParentIds }));
    syncChanges({ parentNoteIds: newParentIds });
  };

  const handleNoteTypeChange = (noteType: any) => {
    if (isSnapshotNote) return;
    setEditData((prev: any) => ({ ...prev, noteType }));
    syncChanges({ noteType });
  };

  const handleRelatedAdd = (relId: string) => {
    if (isSnapshotNote || (editData.relatedNoteIds || []).includes(relId)) return;
    const newRelIds = [...(editData.relatedNoteIds || []), relId];
    setEditData((prev: any) => ({ ...prev, relatedNoteIds: newRelIds }));
    syncChanges({ relatedNoteIds: newRelIds });
  };

  const handleRelatedRemove = (relId: string) => {
    if (isSnapshotNote) return;
    const newRelIds = (editData.relatedNoteIds || []).filter((id: string) => id !== relId);
    setEditData((prev: any) => ({ ...prev, relatedNoteIds: newRelIds }));
    syncChanges({ relatedNoteIds: newRelIds });
  };

  const handleStatusChange = (status: NoteStatus) => {
    if (isSnapshotNote) return;
    setEditData((prev: any) => ({ ...prev, status }));
    syncChanges({ status });
  };

  return (
    <div className="mb-8 bg-slate-50/50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-950/50">
        <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Activity className="w-3.5 h-3.5" />
          구조화된 메타데이터
        </h3>
        <span className="text-[10px] text-slate-400 font-mono">ID: {note.id}</span>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
        {/* 왼쪽 열: 기본 속성 및 버전 정보 */}
        <div className="space-y-4">
          {note.noteType === 'Reference' && (
            <MetadataFieldGroup title="버전 관리 정보" icon={<GitBranch className="w-4 h-4" />}>
              <MetadataRow
                label="소스 파일"
                value={note.originPath || note.githubLink || 'N/A'}
                icon={<FileCode className="w-3.5 h-3.5" />}
                copyable
              />
              <MetadataRow
                label="커밋 SHA"
                value={note.sha || 'N/A'}
                icon={<Hash className="w-3.5 h-3.5" />}
                copyable
              />
              <MetadataRow
                label="로직 해시"
                value={note.logicHash || 'N/A'}
                icon={<Activity className="w-3.5 h-3.5" />}
                copyable
              />
              <MetadataRow
                label="동기화 일시"
                value={note.lastUpdated ? new Date(note.lastUpdated).toLocaleString() : 'N/A'}
                icon={<Clock className="w-3.5 h-3.5" />}
              />
            </MetadataFieldGroup>
          )}

          <MetadataFieldGroup title="기본 속성" icon={<Settings className="w-4 h-4" />}>
            <MetadataRow label="폴더" icon={<FolderTree className="w-3 h-3" />}>
              <input
                type="text"
                value={editData.folder || ''}
                onChange={(e) => !isSnapshotNote && setEditData({ ...editData, folder: e.target.value })}
                onBlur={() => syncChanges({ folder: editData.folder })}
                readOnly={isSnapshotNote}
                className="w-full bg-transparent text-xs focus:outline-none text-slate-700 dark:text-slate-300"
                placeholder="도메인/경로"
              />
            </MetadataRow>

            <MetadataRow label="상태" icon={<Activity className="w-3 h-3" />}>
              <select
                value={editData.status || 'Planned'}
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
                value={editData.priority || 'C'}
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
                value={editData.version || '1.0.0'}
                readOnly
                className="w-full bg-transparent text-xs text-slate-500"
              />
            </MetadataRow>

            <MetadataRow label="최종 수정" icon={<Clock className="w-3 h-3" />}>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {new Date(note.lastUpdated).toLocaleString()}
              </span>
            </MetadataRow>
          </MetadataFieldGroup>
        </div>

        {/* 오른쪽 열: 관계 정보 */}
        <div className="space-y-4">
          <MetadataFieldGroup title="관계 및 계층" icon={<Layers className="w-4 h-4" />}>
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
          </MetadataFieldGroup>
        </div>
      </div>
    </div>
  );
};

