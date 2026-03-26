import { useState, useMemo } from 'react';
import { Note, NoteMetadata } from '../types';

export interface TreeItem {
  id: string;
  noteId?: string;
  type: 'folder' | 'note';
  name: string;
  path: string;
  note?: Note | NoteMetadata;
  children?: TreeItem[];
}

export const useSidebarLogic = (notes: Note[], noteMetadata: NoteMetadata[] = []) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');

  const toggleExpand = (path: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const toggleSelection = (item: TreeItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const newSet = new Set(selectedNotes);
    
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

    if (allNoteIds.length === 0) return;

    const allSelected = allNoteIds.every(id => newSet.has(id));
    if (allSelected) {
      allNoteIds.forEach(id => newSet.delete(id));
    } else {
      allNoteIds.forEach(id => newSet.add(id));
    }
    
    setSelectedNotes(newSet);
  };

  const noteMap = useMemo(() => {
    const map = new Map<string, Note | NoteMetadata>();
    // 메타데이터 우선
    noteMetadata.forEach(m => map.set(m.id, m));
    // 실제 노트 데이터가 있으면 덮어쓰기 (본문 포함)
    notes.forEach(n => map.set(n.id, n));
    return map;
  }, [notes, noteMetadata]);

  const displayData = useMemo(() => {
    // 메타데이터가 있으면 메타데이터 사용, 없으면 notes 사용
    return noteMetadata.length > 0 ? noteMetadata : notes;
  }, [notes, noteMetadata]);

  const filteredNotes = useMemo(() => {
    if (!searchTerm.trim()) return displayData;
    const lowerTerm = searchTerm.toLowerCase();
    return displayData.filter(n => 
      n.title.toLowerCase().includes(lowerTerm)
    );
  }, [displayData, searchTerm]);

  const rootItems = useMemo(() => {
    const roots: TreeItem[] = [];
    const folderMap = new Map<string, TreeItem>();

    filteredNotes.forEach(note => {
      const hasValidParent = (note.parentNoteIds || []).some(pid => noteMap.has(pid));
      if (hasValidParent && !searchTerm) return;

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

    const finalize = (items: TreeItem[]) => {
      items.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      items.forEach(item => {
        if ((item as any).tempChildren) {
          item.children = (item as any).tempChildren;
          delete (item as any).tempChildren;
          finalize(item.children);
        }
      });
    };

    finalize(roots);
    return roots;
  }, [filteredNotes, noteMap, searchTerm]);

  return {
    expanded,
    toggleExpand,
    isSelectMode,
    setIsSelectMode,
    selectedNotes,
    setSelectedNotes,
    toggleSelection,
    searchTerm,
    setSearchTerm,
    rootItems,
    noteMap
  };
};
