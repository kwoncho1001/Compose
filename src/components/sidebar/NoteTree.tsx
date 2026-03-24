import React from 'react';
import { Folder, CheckCircle, Circle, Clock, AlertTriangle, ShieldAlert, X, Merge, ChevronRight, ChevronDown, Check, Plus, Trash2 } from 'lucide-react';
import { Note } from '../../types';
import { TreeItem } from '../../hooks/useSidebarLogic';

interface NoteTreeProps {
  items: TreeItem[];
  level?: number;
  parentPath?: string;
  expanded: Record<string, boolean>;
  toggleExpand: (path: string, e: React.MouseEvent) => void;
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  isSelectMode: boolean;
  selectedNotes: Set<string>;
  toggleSelection: (item: TreeItem, e: React.MouseEvent) => void;
  onAddChildNote: (parentId: string) => void;
  onDeleteNote: (id: string) => void;
  onDeleteFolder?: (folderPath: string) => void;
  noteMap: Map<string, Note>;
}

const StatusIcon = ({ status }: { status: Note['status'] }) => {
  switch (status) {
    case 'Done': return <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />;
    case 'In-Progress': return <Clock className="w-3.5 h-3.5 text-amber-500" />;
    case 'Conflict': return <AlertTriangle className="w-3.5 h-3.5 text-red-500" />;
    case 'Review-Required': return <ShieldAlert className="w-3.5 h-3.5 text-indigo-500" />;
    case 'Deprecated': return <X className="w-3.5 h-3.5 text-slate-500" />;
    case 'Temporary Merge': return <Merge className="w-3.5 h-3.5 text-pink-500" />;
    default: return <Circle className="w-3.5 h-3.5 text-slate-400" />;
  }
};

export const NoteTree: React.FC<NoteTreeProps> = ({
  items,
  level = 0,
  parentPath = '',
  expanded,
  toggleExpand,
  selectedNoteId,
  onSelectNote,
  isSelectMode,
  selectedNotes,
  toggleSelection,
  onAddChildNote,
  onDeleteNote,
  onDeleteFolder,
  noteMap
}) => {
  return (
    <>
      {items.map(item => {
        const itemPath = item.path;
        const isExpanded = expanded[itemPath];
        const isSelected = selectedNoteId === item.noteId;
        
        const note = item.note;
        const hasConsistencyConflict = !!note?.consistencyConflict;
        const isConflict = note?.status === 'Conflict' || hasConsistencyConflict;

        const children = item.type === 'folder' 
          ? item.children || [] 
          : (note?.childNoteIds || [])
              .map(cid => noteMap.get(cid))
              .filter(Boolean)
              .map(childNote => ({
                id: `note-${itemPath}-${childNote!.id}`,
                noteId: childNote!.id,
                type: 'note' as const,
                name: childNote!.title,
                path: `${itemPath}/${childNote!.id}`,
                note: childNote!
              }));

        const hasChildren = children.length > 0;

        const getFolderStatus = (ti: TreeItem): 'Conflict' | 'Planned' | 'Done' | 'Other' => {
          const allNotes: Note[] = [];
          const collectNotes = (target: any) => {
            if (target.note) allNotes.push(target.note);
            if (target.children) target.children.forEach(collectNotes);
          };
          collectNotes(ti);
          
          if (allNotes.length === 0) return 'Other';
          if (allNotes.some(n => n.status === 'Conflict' || !!n.consistencyConflict)) return 'Conflict';
          if (allNotes.some(n => n.status === 'Planned')) return 'Planned';
          if (allNotes.every(n => n.status === 'Done')) return 'Done';
          return 'Other';
        };

        const folderStatus = item.type === 'folder' ? getFolderStatus(item) : 'Other';
        const folderColorClass = {
          'Conflict': 'text-red-500',
          'Planned': 'text-yellow-500',
          'Done': 'text-emerald-500',
          'Other': isExpanded ? 'text-indigo-400' : 'text-slate-500'
        }[folderStatus];

        const isTemporaryMerge = note?.status === 'Temporary Merge';
        const isNoteSelected = item.noteId ? selectedNotes.has(item.noteId) : false;
        
        const itemSelectionState = (() => {
          const allNoteIds: string[] = [];
          const collectIds = (target: any) => {
            if (target.noteId) {
              const collectNoteChildren = (id: string) => {
                if (allNoteIds.includes(id)) return;
                allNoteIds.push(id);
                const n = noteMap.get(id);
                if (n && n.childNoteIds) {
                  n.childNoteIds.forEach(collectNoteChildren);
                }
              };
              collectNoteChildren(target.noteId);
            }
            if (target.children) target.children.forEach(collectIds);
          };
          collectIds(item);
          
          if (allNoteIds.length === 0) return 'none';
          const selectedCount = allNoteIds.filter(id => selectedNotes.has(id)).length;
          if (selectedCount === 0) return 'none';
          if (selectedCount === allNoteIds.length) return 'all';
          return 'partial';
        })();

        const pathParts = itemPath.split('/');
        const isCycle = item.noteId && pathParts.slice(0, -1).includes(item.noteId);

        if (isCycle) {
          return (
            <div key={item.id} className="pl-4 py-1 text-[10px] text-red-500 italic flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> 순환 참조 감지됨
            </div>
          );
        }

        return (
          <div key={item.id} className="select-none">
            <div 
              className={`group flex items-center py-1.5 px-2 cursor-pointer transition-colors rounded-md mx-2 mb-0.5 ${
                isSelected 
                  ? 'bg-indigo-500/20 text-indigo-400' 
                  : 'hover:bg-slate-800/50 text-slate-400 hover:text-slate-200'
              }`}
              style={{ paddingLeft: `${level * 12 + 8}px` }}
              onClick={(e) => {
                if (isSelectMode) {
                  toggleSelection(item, e);
                } else {
                  item.type === 'note' ? onSelectNote(item.noteId!) : toggleExpand(itemPath, e);
                }
              }}
            >
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                {hasChildren ? (
                  <button 
                    onClick={(e) => toggleExpand(itemPath, e)}
                    className="p-0.5 hover:bg-slate-700 rounded transition-colors"
                  >
                    {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                  </button>
                ) : (
                  <div className="w-4.5" />
                )}
                
                {isSelectMode && (
                  <div 
                    className="cursor-pointer shrink-0 mr-1" 
                    onClick={(e) => toggleSelection(item, e)}
                  >
                    {itemSelectionState === 'all' ? (
                      <div className="w-3.5 h-3.5 bg-indigo-500 rounded flex items-center justify-center"><Check className="w-2.5 h-2.5 text-white" /></div>
                    ) : itemSelectionState === 'partial' ? (
                      <div className="w-3.5 h-3.5 bg-indigo-500 rounded flex items-center justify-center"><div className="w-2 h-0.5 bg-white rounded-full" /></div>
                    ) : (
                      <div className="w-3.5 h-3.5 border border-slate-500 hover:border-indigo-400 rounded transition-colors" />
                    )}
                  </div>
                )}
                
                {item.type === 'folder' ? (
                  <Folder className={`w-4 h-4 shrink-0 ${folderColorClass}`} />
                ) : (
                  item.type === 'note' && note?.noteType ? (
                    <span className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded text-[10px] font-bold shadow-sm ${
                      note.noteType === 'Epic' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300' :
                      note.noteType === 'Feature' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' :
                      note.noteType === 'Task' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' :
                      note.noteType === 'Reference' ? 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-dashed border-slate-400 dark:border-slate-600' :
                      'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                    }`}>
                      {note.noteType.charAt(0)}
                    </span>
                  ) : (
                    <StatusIcon status={note?.status || 'Planned'} />
                  )
                )}
                
                <div className="flex flex-col flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className={`text-sm truncate ${item.type === 'folder' && folderStatus !== 'Other' ? folderColorClass : ''} ${isConflict ? 'text-red-400' : ''} ${isTemporaryMerge ? 'text-pink-400' : ''} ${isSelected ? 'font-medium' : ''}`}>
                      {item.name}
                    </span>
                  </div>
                </div>
                
                {hasConsistencyConflict && <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />}
                
                {item.type === 'note' && (
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onAddChildNote(item.noteId!);
                      }}
                      className="p-1 text-slate-500 hover:text-indigo-400 transition-colors"
                      title="하위 노트 추가"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteNote(item.noteId!);
                      }}
                      className="p-1 text-slate-500 hover:text-red-500 transition-colors"
                      title="노트 삭제"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
                {item.type === 'folder' && onDeleteFolder && (
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity ml-auto pl-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteFolder(item.path);
                      }}
                      className="p-1 text-slate-500 hover:text-red-500 transition-colors"
                      title="이 폴더와 하위 노트 모두 삭제"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                )}
              </div>
            </div>
            
            {hasChildren && isExpanded && (
              <div className="mt-0.5">
                <NoteTree
                  items={children}
                  level={level + 1}
                  parentPath={itemPath}
                  expanded={expanded}
                  toggleExpand={toggleExpand}
                  selectedNoteId={selectedNoteId}
                  onSelectNote={onSelectNote}
                  isSelectMode={isSelectMode}
                  selectedNotes={selectedNotes}
                  toggleSelection={toggleSelection}
                  onAddChildNote={onAddChildNote}
                  onDeleteNote={onDeleteNote}
                  onDeleteFolder={onDeleteFolder}
                  noteMap={noteMap}
                />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
};
