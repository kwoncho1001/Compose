import React, { useState, useMemo } from 'react';
import { Folder, FileText, CheckCircle, Circle, Clock, AlertTriangle, Star, Plus, ShieldAlert, X, PanelLeft, PanelRight, Trash2, ChevronRight, ChevronDown, Merge, Database, FolderTree, CheckSquare, Check } from 'lucide-react';
import { Note } from '../types';

interface SidebarProps {
  notes: Note[];
  title?: string;
  projects: { id: string; name: string }[];
  currentProjectId: string;
  onSelectProject: (id: string) => void;
  onCreateProject: (name: string) => void;
  onRenameProject?: (id: string, newName: string) => void;
  onDeleteProject?: (id: string) => void;
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  onAddNote: () => void;
  onAddChildNote: (parentId: string) => void;
  onDeleteNote: (id: string) => void;
  onDeleteFolder?: (folderPath: string) => void;
  onDeleteMultiple?: (noteIds: string[]) => void;
  onClose?: () => void;
}

interface TreeItem {
  id: string; // Unique path-based ID (e.g., "folder-path/noteId" or "parentPath/noteId")
  noteId?: string; // Original note ID if it's a note
  type: 'folder' | 'note';
  name: string;
  path: string; // Breadcrumb-like path for UI state
  note?: Note;
}

const StatusIcon = ({ status }: { status: Note['status'] }) => {
  switch (status) {
    case 'Done':
      return <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />;
    case 'In-Progress':
      return <Clock className="w-3.5 h-3.5 text-amber-500" />;
    case 'Conflict':
      return <AlertTriangle className="w-3.5 h-3.5 text-red-500" />;
    case 'Review-Required':
      return <ShieldAlert className="w-3.5 h-3.5 text-indigo-500" />;
    case 'Deprecated':
      return <X className="w-3.5 h-3.5 text-slate-500" />;
    case 'Temporary Merge':
      return <Merge className="w-3.5 h-3.5 text-pink-500" />;
    default:
      return <Circle className="w-3.5 h-3.5 text-slate-400" />;
  }
};

export const Sidebar: React.FC<SidebarProps> = ({ 
  notes = [], 
  title = 'Vibe-Architect',
  projects = [],
  currentProjectId,
  onSelectProject,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
  selectedNoteId, 
  onSelectNote, 
  onAddNote, 
  onAddChildNote, 
  onDeleteNote,
  onDeleteFolder,
  onDeleteMultiple,
  onClose
}) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isRenamingProject, setIsRenamingProject] = useState(false);
  const [renameProjectName, setRenameProjectName] = useState('');
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());

  const toggleExpand = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const noteMap = useMemo(() => new Map(notes.map(n => [n.id, n])), [notes]);

  // Root folders and notes (notes with no parents)
  const rootItems = useMemo(() => {
    const roots: TreeItem[] = [];
    const folderMap = new Map<string, TreeItem>();

    notes.forEach(note => {
      // Check if it's a root note (no parents or parents don't exist in current project)
      const hasValidParent = (note.parentNoteIds || []).some(pid => noteMap.has(pid));
      if (hasValidParent) return;

      const folderPath = note.folder || '미분류';
      const folderParts = folderPath.split('/').filter(Boolean);
      
      let currentLevel = roots;
      let currentPath = 'root';

      folderParts.forEach((part) => {
        currentPath = `${currentPath}/${part}`;
        let folderItem = folderMap.get(currentPath);
        if (!folderItem) {
          folderItem = {
            id: `folder-${currentPath}`,
            type: 'folder',
            name: part,
            path: currentPath
          };
          folderMap.set(currentPath, folderItem);
          currentLevel.push(folderItem);
        }
        // This is a bit tricky with the flat rootItems array, 
        // but since we are building a folder tree for roots, we need to manage children for folders.
        // We'll add a temporary children array for folders during construction.
        if (!(folderItem as any).tempChildren) (folderItem as any).tempChildren = [];
        currentLevel = (folderItem as any).tempChildren;
      });

      currentLevel.push({
        id: `note-root-${note.id}`,
        noteId: note.id,
        type: 'note',
        name: note.title,
        path: `root/${note.id}`,
        note
      });
    });

    // Recursive helper to clean up tempChildren and sort
    const finalize = (items: TreeItem[]) => {
      items.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      items.forEach(item => {
        if ((item as any).tempChildren) {
          (item as any).children = (item as any).tempChildren;
          delete (item as any).tempChildren;
          finalize((item as any).children);
        }
      });
    };

    finalize(roots);
    return roots;
  }, [notes, noteMap]);

  const renderTreeItem = (item: TreeItem, level: number = 0, parentPath: string = '') => {
    const itemPath = item.path;
    const isExpanded = expanded[itemPath];
    const isSelected = selectedNoteId === item.noteId;
    
    const note = item.note;
    const hasConsistencyConflict = !!note?.consistencyConflict;
    const isConflict = note?.status === 'Conflict' || hasConsistencyConflict;

    // For folders, we use the pre-calculated children
    // For notes, we calculate children dynamically from noteMap
    const children = item.type === 'folder' 
      ? (item as any).children || [] 
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
        // For notes, we don't recursively collect here to avoid infinite loops in status calculation
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

    // Selection logic for path-based items
    const toggleSelection = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!item.noteId) return;
      const newSet = new Set(selectedNotes);
      if (newSet.has(item.noteId)) {
        newSet.delete(item.noteId);
      } else {
        newSet.add(item.noteId);
      }
      setSelectedNotes(newSet);
    };

    const isNoteSelected = item.noteId ? selectedNotes.has(item.noteId) : false;

    // Cycle detection: check if noteId already exists in parentPath
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
          onClick={() => {
            if (isSelectMode) {
              toggleSelection({ stopPropagation: () => {} } as any);
            } else {
              item.type === 'note' ? onSelectNote(item.noteId!) : toggleExpand(itemPath, { stopPropagation: () => {} } as any);
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
              <div className="w-4.5" /> // Spacer
            )}
            
            {isSelectMode && item.type === 'note' && (
              <div 
                className="cursor-pointer shrink-0 mr-1" 
                onClick={toggleSelection}
              >
                {isNoteSelected ? (
                  <div className="w-3.5 h-3.5 bg-indigo-500 rounded flex items-center justify-center"><Check className="w-2.5 h-2.5 text-white" /></div>
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
            {children.map(child => renderTreeItem(child, level + 1, itemPath))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-72 bg-slate-900 dark:bg-slate-950 text-slate-300 h-full flex flex-col border-r border-slate-800 transition-colors duration-200">
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
          {onDeleteMultiple && (
            <>
              {isSelectMode && selectedNotes.size > 0 && (
                <button 
                  onClick={() => {
                    onDeleteMultiple(Array.from(selectedNotes));
                    setSelectedNotes(new Set());
                    setIsSelectMode(false);
                  }}
                  className="p-1.5 mr-1 bg-red-600 hover:bg-red-500 text-white rounded-md transition-colors flex items-center gap-1"
                  title="선택된 항목 삭제"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="text-xs font-bold leading-none">{selectedNotes.size}</span>
                </button>
              )}
              <button 
                onClick={() => {
                  setIsSelectMode(!isSelectMode);
                  setSelectedNotes(new Set());
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
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Vault Switcher */}
      <div className="p-4 border-b border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Database className="w-3 h-3" />
              Vaults (Projects)
            </label>
            <div className="flex gap-2">
              {onRenameProject && !isCreatingProject && !isRenamingProject && (
                <button 
                  onClick={() => {
                    const currentProject = projects.find(p => p.id === currentProjectId);
                    if (currentProject) {
                      setRenameProjectName(currentProject.name);
                      setIsRenamingProject(true);
                    }
                  }}
                  className="text-xs text-slate-400 hover:text-slate-300 transition-colors"
                >
                  Rename
                </button>
              )}
              {onDeleteProject && !isCreatingProject && !isRenamingProject && (
                <button 
                  onClick={() => onDeleteProject(currentProjectId)}
                  className="text-xs text-red-500 hover:text-red-400 transition-colors"
                >
                  Discard
                </button>
              )}
              <button 
                onClick={() => {
                  setIsCreatingProject(true);
                  setIsRenamingProject(false);
                }}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                New
              </button>
            </div>
          </div>
          
          {isCreatingProject ? (
            <div className="flex gap-1">
              <input 
                autoFocus
                className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                placeholder="Vault name..."
                value={newProjectName}
                onChange={e => setNewProjectName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newProjectName) {
                    onCreateProject(newProjectName);
                    setNewProjectName('');
                    setIsCreatingProject(false);
                  } else if (e.key === 'Escape') {
                    setIsCreatingProject(false);
                  }
                }}
              />
            </div>
          ) : isRenamingProject ? (
            <div className="flex gap-1">
              <input 
                autoFocus
                className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-indigo-500"
                placeholder="Rename vault..."
                value={renameProjectName}
                onChange={e => setRenameProjectName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && renameProjectName && onRenameProject) {
                    onRenameProject(currentProjectId, renameProjectName);
                    setIsRenamingProject(false);
                  } else if (e.key === 'Escape') {
                    setIsRenamingProject(false);
                  }
                }}
              />
            </div>
          ) : (
            <select 
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer"
              value={currentProjectId}
              onChange={e => onSelectProject(e.target.value)}
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>
        
        <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
        {rootItems.length > 0 ? (
          rootItems.map(item => renderTreeItem(item))
        ) : (
          <div className="px-6 text-sm text-slate-500 italic">
            생성된 노트가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
};

