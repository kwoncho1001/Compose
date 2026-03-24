import React from 'react';
import { Plus, X as XIcon, Trash2, CheckSquare } from 'lucide-react';

interface SidebarHeaderProps {
  title: string;
  isSelectMode: boolean;
  setIsSelectMode: (mode: boolean) => void;
  selectedNotesCount: number;
  onAddNote: () => void;
  onDeleteSelected: () => void;
  onClose?: () => void;
  showMultiSelect: boolean;
  clearSelection: () => void;
}

export const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  title,
  isSelectMode,
  setIsSelectMode,
  selectedNotesCount,
  onAddNote,
  onDeleteSelected,
  onClose,
  showMultiSelect,
  clearSelection
}) => {
  return (
    <div className="p-4 border-b border-slate-800 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/10">
          <span className="text-white text-sm font-bold">VA</span>
        </div>
        <h1 className="text-base font-bold text-white tracking-tight">
          {title}
        </h1>
      </div>
      <div className="flex items-center gap-1">
        {showMultiSelect && (
          <>
            {isSelectMode && selectedNotesCount > 0 && (
              <button 
                onClick={onDeleteSelected}
                className="p-1.5 mr-1 bg-red-600 hover:bg-red-500 text-white rounded-md transition-colors flex items-center gap-1"
                title="선택된 항목 삭제"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="text-xs font-bold leading-none">{selectedNotesCount}</span>
              </button>
            )}
            <button 
              onClick={() => {
                setIsSelectMode(!isSelectMode);
                clearSelection();
              }}
              className={`p-1.5 mr-1 rounded-md transition-colors ${isSelectMode ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'}`}
              title="다중 선택 모드"
            >
              <CheckSquare className="w-4 h-4" />
            </button>
          </>
        )}
        <button 
          onClick={onAddNote}
          className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors"
          title="새 노트 추가"
        >
          <Plus className="w-4 h-4" />
        </button>
        {onClose && (
          <button 
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white lg:hidden"
          >
            <XIcon className="w-5 h-5" />
          </button>
        )}
      </div>
    </div>
  );
};
