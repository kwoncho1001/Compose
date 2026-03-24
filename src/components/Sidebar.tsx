import React from 'react';
import { Note } from '../types';
import { useSidebarLogic } from '../hooks/useSidebarLogic';
import { useProjectActions } from '../hooks/useProjectActions';
import { SidebarHeader } from './sidebar/SidebarHeader';
import { ProjectSection } from './sidebar/ProjectSection';
import { SidebarSearch } from './sidebar/SidebarSearch';
import { NoteTree } from './sidebar/NoteTree';
import { SidebarLayout } from './sidebar/SidebarLayout';
import { Plus } from 'lucide-react';

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
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
}

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
  onClose,
  isOpen,
  setIsOpen
}) => {
  const {
    expanded,
    toggleExpand,
    isSelectMode,
    setIsSelectMode,
    selectedNotes,
    toggleSelection,
    searchTerm,
    setSearchTerm,
    rootItems,
    noteMap
  } = useSidebarLogic(notes);

  const {
    isCreatingProject,
    setIsCreatingProject,
    newProjectName,
    setNewProjectName,
    isRenamingProject,
    setIsRenamingProject,
    renameProjectName,
    setRenameProjectName,
    handleCreateProject,
    handleRenameProject
  } = useProjectActions(currentProjectId, onCreateProject, onRenameProject);

  const handleDeleteSelected = () => {
    if (onDeleteMultiple) {
      onDeleteMultiple(Array.from(selectedNotes));
    } else {
      selectedNotes.forEach(id => onDeleteNote(id));
    }
    selectedNotes.clear();
    setIsSelectMode(false);
  };

  return (
    <SidebarLayout
      isOpen={isOpen}
      setIsOpen={setIsOpen}
    >
      <SidebarHeader
        title={title}
        isSelectMode={isSelectMode}
        setIsSelectMode={setIsSelectMode}
        selectedNotesCount={selectedNotes.size}
        onAddNote={onAddNote}
        onDeleteSelected={handleDeleteSelected}
        onClose={onClose}
        showMultiSelect={!!onDeleteMultiple}
        clearSelection={() => selectedNotes.clear()}
      />

      <ProjectSection
        projects={projects}
        currentProjectId={currentProjectId}
        onSelectProject={onSelectProject}
        onDeleteProject={onDeleteProject}
        isCreatingProject={isCreatingProject}
        setIsCreatingProject={setIsCreatingProject}
        newProjectName={newProjectName}
        setNewProjectName={setNewProjectName}
        handleCreateProject={handleCreateProject}
        isRenamingProject={isRenamingProject}
        setIsRenamingProject={setIsRenamingProject}
        renameProjectName={renameProjectName}
        setRenameProjectName={setRenameProjectName}
        handleRenameProject={handleRenameProject}
        onRenameProject={onRenameProject}
      />

      <SidebarSearch searchTerm={searchTerm} setSearchTerm={setSearchTerm} />

      <div className="flex-1 overflow-y-auto py-2 custom-scrollbar">
        <div className="px-4 mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">노트 목록</span>
          <button
            onClick={onAddNote}
            className="p-1 text-slate-400 hover:text-indigo-400 hover:bg-slate-800 rounded transition-colors"
            title="새 노트 추가"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        
        {rootItems.length > 0 ? (
          <NoteTree
            items={rootItems}
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
        ) : (
          <div className="px-6 text-sm text-slate-500 italic">
            생성된 노트가 없습니다.
          </div>
        )}
      </div>
    </SidebarLayout>
  );
};

