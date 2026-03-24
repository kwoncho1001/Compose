import React from 'react';
import { Layers, Trash2 } from 'lucide-react';
import { Button } from '../common/Button';
import { NoteEditorHeaderProps } from '../../types/noteEditor';

export const NoteHeader: React.FC<NoteEditorHeaderProps> = ({
  title,
  isSnapshotNote,
  isGeneratingSub,
  onTitleChange,
  onTitleBlur,
  onGenerateSub,
  onDelete
}) => {
  return (
    <>
      <div className="mb-4">
        <input
          type="text"
          value={title || ''}
          onChange={(e) => !isSnapshotNote && onTitleChange(e.target.value)}
          onBlur={onTitleBlur}
          readOnly={isSnapshotNote}
          className={`text-4xl font-extrabold text-slate-900 dark:text-white border-b-2 border-transparent ${isSnapshotNote ? 'cursor-default' : 'hover:border-slate-100 focus:border-indigo-500'} bg-transparent focus:outline-none w-full transition-all py-2`}
          placeholder="노트 제목"
        />
      </div>

      <div className="mb-8 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={onGenerateSub}
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
            onClick={onDelete}
            className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all ml-auto"
            title="노트 삭제"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );
};
