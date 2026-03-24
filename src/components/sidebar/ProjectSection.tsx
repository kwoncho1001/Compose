import React from 'react';
import { Database } from 'lucide-react';

interface ProjectSectionProps {
  projects: { id: string; name: string }[];
  currentProjectId: string;
  onSelectProject: (id: string) => void;
  onDeleteProject?: (id: string) => void;
  isCreatingProject: boolean;
  setIsCreatingProject: (val: boolean) => void;
  newProjectName: string;
  setNewProjectName: (val: string) => void;
  handleCreateProject: () => void;
  isRenamingProject: boolean;
  setIsRenamingProject: (val: boolean) => void;
  renameProjectName: string;
  setRenameProjectName: (val: string) => void;
  handleRenameProject: () => void;
  onRenameProject?: (id: string, newName: string) => void;
}

export const ProjectSection: React.FC<ProjectSectionProps> = ({
  projects,
  currentProjectId,
  onSelectProject,
  onDeleteProject,
  isCreatingProject,
  setIsCreatingProject,
  newProjectName,
  setNewProjectName,
  handleCreateProject,
  isRenamingProject,
  setIsRenamingProject,
  renameProjectName,
  setRenameProjectName,
  handleRenameProject,
  onRenameProject
}) => {
  return (
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
              if (e.key === 'Enter') handleCreateProject();
              else if (e.key === 'Escape') setIsCreatingProject(false);
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
              if (e.key === 'Enter') handleRenameProject();
              else if (e.key === 'Escape') setIsRenamingProject(false);
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
  );
};
