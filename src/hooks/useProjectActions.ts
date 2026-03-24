import { useState } from 'react';

export const useProjectActions = (
  currentProjectId: string,
  onCreateProject: (name: string) => void,
  onRenameProject?: (id: string, newName: string) => void
) => {
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [isRenamingProject, setIsRenamingProject] = useState(false);
  const [renameProjectName, setRenameProjectName] = useState('');

  const handleCreateProject = () => {
    if (newProjectName) {
      onCreateProject(newProjectName);
      setNewProjectName('');
      setIsCreatingProject(false);
    }
  };

  const handleRenameProject = () => {
    if (renameProjectName && onRenameProject) {
      onRenameProject(currentProjectId, renameProjectName);
      setIsRenamingProject(false);
    }
  };

  return {
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
  };
};
