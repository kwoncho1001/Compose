import React from 'react';
import { FolderTree, Activity, Star, Hash, Clock } from 'lucide-react';
import { MetadataRow } from './MetadataRow';
import { NoteStatus, NotePriority } from '../../../types';
import { MetadataFieldGroupProps } from '../../../types/noteEditor';

export const MetadataFieldGroup: React.FC<MetadataFieldGroupProps> = ({
  editData,
  setEditData,
  syncChanges,
  isSnapshotNote,
  note
}) => {
  const handleStatusChange = (status: NoteStatus) => {
    if (isSnapshotNote) return;
    setEditData((prev: any) => ({ ...prev, status }));
    syncChanges({ status });
  };

  return (
    <div className="border-r border-slate-200 dark:border-slate-800">
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
    </div>
  );
};
