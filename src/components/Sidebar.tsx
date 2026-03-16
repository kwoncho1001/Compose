import React, { useState, useMemo } from 'react';
import { Folder, FileText, CheckCircle, Circle, Clock, AlertTriangle, Star, Plus, ShieldAlert, X, PanelLeft, PanelRight, Trash2, ChevronRight, ChevronDown } from 'lucide-react';
import { Note } from '../types';

interface SidebarProps {
  notes: Note[];
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  onAddNote: () => void;
  onAddChildNote: (parentId: string) => void;
  onDeleteNote: (id: string) => void;
}

interface TreeItem {
  id: string;
  type: 'folder' | 'note';
  name: string;
  children: TreeItem[];
  note?: Note;
  path: string;
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
    default:
      return <Circle className="w-3.5 h-3.5 text-slate-400" />;
  }
};

export const Sidebar: React.FC<SidebarProps> = ({ notes = [], selectedNoteId, onSelectNote, onAddNote, onAddChildNote, onDeleteNote }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const tree = useMemo(() => {
    const root: TreeItem[] = [];
    const noteMap = new Map<string, TreeItem>();

    // 1. Create items for all notes
    notes.forEach(note => {
      noteMap.set(note.id, {
        id: note.id,
        type: 'note',
        name: note.title,
        children: [],
        note,
        path: note.id
      });
    });

    // 2. Build folder structure and place top-level notes
    notes.forEach(note => {
      const item = noteMap.get(note.id)!;
      
      // If it has a parent note, it will be handled in step 3
      if (note.parentNoteId && noteMap.has(note.parentNoteId)) return;

      const folderPath = note.folder || '미분류';
      const folderParts = folderPath.split('/').filter(Boolean);
      
      let currentLevel = root;
      let currentPath = '';

      folderParts.forEach((part) => {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        const folderId = `folder-${currentPath}`;
        let folderItem = currentLevel.find(i => i.type === 'folder' && i.name === part);
        if (!folderItem) {
          folderItem = {
            id: folderId,
            type: 'folder',
            name: part,
            children: [],
            path: currentPath
          };
          currentLevel.push(folderItem);
        }
        currentLevel = folderItem.children;
      });

      currentLevel.push(item);
    });

    // 3. Handle note hierarchy (children of notes)
    notes.forEach(note => {
      if (note.parentNoteId && noteMap.has(note.parentNoteId)) {
        const parentItem = noteMap.get(note.parentNoteId)!;
        const childItem = noteMap.get(note.id)!;
        // Avoid duplicate additions if any
        if (!parentItem.children.find(c => c.id === childItem.id)) {
          parentItem.children.push(childItem);
        }
      }
    });

    // Sort: Folders first, then notes alphabetically
    const sortTree = (items: TreeItem[]) => {
      items.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      items.forEach(item => {
        if (item.children.length > 0) sortTree(item.children);
      });
    };

    sortTree(root);
    return root;
  }, [notes]);

  const renderTreeItem = (item: TreeItem, level: number = 0) => {
    const isExpanded = expanded[item.id];
    const isSelected = selectedNoteId === item.id;
    const hasChildren = item.children.length > 0;
    
    const note = item.note;
    const hasConsistencyConflict = !!note?.consistencyConflict;
    const isConflict = note?.status === 'Conflict' || hasConsistencyConflict;

    const getFolderStatus = (treeItem: TreeItem): 'Conflict' | 'Planned' | 'Done' | 'Other' => {
      const allNotes: Note[] = [];
      const collectNotes = (ti: TreeItem) => {
        if (ti.note) allNotes.push(ti.note);
        ti.children.forEach(collectNotes);
      };
      collectNotes(treeItem);
      
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

    return (
      <div key={item.id} className="select-none">
        <div 
          className={`group flex items-center py-1.5 px-2 cursor-pointer transition-colors rounded-md mx-2 mb-0.5 ${
            isSelected 
              ? 'bg-indigo-500/20 text-indigo-400' 
              : 'hover:bg-slate-800/50 text-slate-400 hover:text-slate-200'
          }`}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={() => item.type === 'note' ? onSelectNote(item.id) : toggleExpand(item.id, { stopPropagation: () => {} } as any)}
        >
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            {hasChildren ? (
              <button 
                onClick={(e) => toggleExpand(item.id, e)}
                className="p-0.5 hover:bg-slate-700 rounded transition-colors"
              >
                {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>
            ) : (
              <div className="w-4.5" /> // Spacer
            )}
            
            {item.type === 'folder' ? (
              <Folder className={`w-4 h-4 ${folderColorClass}`} />
            ) : (
              <StatusIcon status={note?.status || 'Planned'} />
            )}
            
            <div className="flex flex-col flex-1 min-w-0">
              <span className={`text-sm truncate ${item.type === 'folder' && folderStatus !== 'Other' ? folderColorClass : ''} ${isConflict ? 'text-red-400' : ''} ${isSelected ? 'font-medium' : ''}`}>
                {item.name}
              </span>
            </div>
            
            {hasConsistencyConflict && <AlertTriangle className="w-3 h-3 text-red-500 shrink-0" />}
            
            {item.type === 'note' && (
              <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddChildNote(item.id);
                  }}
                  className="p-1 text-slate-500 hover:text-indigo-400 transition-colors"
                  title="하위 노트 추가"
                >
                  <Plus className="w-3 h-3" />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteNote(item.id);
                  }}
                  className="p-1 text-slate-500 hover:text-red-500 transition-colors"
                  title="노트 삭제"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>
        </div>
        
        {hasChildren && isExpanded && (
          <div className="mt-0.5">
            {item.children.map(child => renderTreeItem(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-72 bg-slate-900 dark:bg-slate-950 text-slate-300 h-full flex flex-col border-r border-slate-800 transition-colors duration-200">
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <h1 className="text-lg font-bold text-white flex items-center gap-2">
          <div className="w-6 h-6 bg-indigo-500 rounded-md flex items-center justify-center">
            <span className="text-white text-xs font-bold">VA</span>
          </div>
          Vibe-Architect
        </h1>
        <button 
          onClick={onAddNote}
          className="p-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors"
          title="새 노트 추가"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto py-4 custom-scrollbar">
        {tree.length > 0 ? (
          tree.map(item => renderTreeItem(item))
        ) : (
          <div className="px-6 text-sm text-slate-500 italic">
            생성된 노트가 없습니다.
          </div>
        )}
      </div>
    </div>
  );
};

