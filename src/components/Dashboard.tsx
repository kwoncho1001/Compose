import React from 'react';
import { Sidebar } from './Sidebar';
import { Dialog } from './common/Dialog';
import { useDashboard } from '../hooks/useDashboard';
import { NavigationRail } from './dashboard/NavigationRail';
import { DashboardHeader } from './dashboard/DashboardHeader';
import { ProcessBanner } from './dashboard/ProcessBanner';
import { DashboardMain } from './dashboard/DashboardMain';
import { RightSidebar } from './dashboard/RightSidebar';

export const Dashboard: React.FC = () => {
  const { uiState, actions, data, refs } = useDashboard();
  const {
    isSidebarOpen, isMobileMenuOpen, activeSidebarTab, selectedNoteId,
    darkMode, isDecomposing, isSyncing, processStatus, nextStepSuggestion,
    rightSidebarOpen, viewMode, isInitialLoading, chatInput, isChatting
  } = uiState;

  const {
    setIsSidebarOpen, setIsMobileMenuOpen, setActiveSidebarTab, setSelectedNoteId,
    setDarkMode, setViewMode, setRightSidebarOpen, setChatInput,
    handleCancelProcess, showAlert, handleExport, handleImport, setCurrentProjectId,
    handleCreateProject, handleRenameProject, handleDeleteProject, handleUpdateNote,
    handleDeleteNote, handleDeleteFolder, handleDeleteMultiple, handleSanitizeIntegrity,
    handleTargetedUpdate, handleAddNote, handleAddChildNote, handleTextFileUpload,
    handleOptimizeBlueprint, handleCheckConsistency, handleEnforceHierarchy,
    handleGenerateSubModules, handleAnalyzeNextSteps, handleSyncGithub, handleWipeSnapshots,
    handleChat, handleClearChat, syncProject
  } = actions;

  const { state, setState, projects, currentProjectId, selectedNote, dialogConfig } = data;
  const { fileInputRef, textFileInputRef, chatEndRef } = refs;

  if (isInitialLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 dark:text-slate-400 font-medium animate-pulse">프로젝트 데이터를 불러오는 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`h-screen flex overflow-hidden font-sans selection:bg-indigo-100 selection:text-indigo-900 transition-colors duration-300 ${darkMode ? 'dark' : ''}`}>
      <NavigationRail viewMode={viewMode} setViewMode={setViewMode} darkMode={darkMode} setDarkMode={setDarkMode} />

      <Sidebar
        notes={state.notes}
        noteMetadata={state.noteMetadata}
        projects={projects}
        currentProjectId={currentProjectId}
        onSelectProject={setCurrentProjectId}
        onCreateProject={handleCreateProject}
        onRenameProject={handleRenameProject}
        onDeleteProject={handleDeleteProject}
        onSelectNote={setSelectedNoteId}
        selectedNoteId={selectedNoteId}
        onAddNote={() => handleAddNote()}
        onAddChildNote={(parentId) => handleAddChildNote(parentId)}
        onDeleteNote={handleDeleteNote}
        onDeleteFolder={handleDeleteFolder}
        onDeleteMultiple={handleDeleteMultiple}
        isOpen={isSidebarOpen}
        setIsOpen={setIsSidebarOpen}
      />

      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900 transition-colors duration-200">
        <DashboardHeader 
          isSidebarOpen={isSidebarOpen} setIsSidebarOpen={setIsSidebarOpen}
          setIsMobileMenuOpen={setIsMobileMenuOpen} rightSidebarOpen={rightSidebarOpen}
          setRightSidebarOpen={setRightSidebarOpen} handleExport={handleExport}
          fileInputRef={fileInputRef} handleImport={handleImport}
          handleRefreshNotes={actions.handleRefreshNotes}
        />

        <ProcessBanner processStatus={processStatus} handleCancelProcess={handleCancelProcess} />

        <DashboardMain 
          viewMode={viewMode} notes={state.notes} selectedNoteId={selectedNoteId}
          setSelectedNoteId={setSelectedNoteId} setViewMode={setViewMode}
          darkMode={darkMode} selectedNote={selectedNote} gcm={state.gcm}
          handleUpdateNote={handleUpdateNote} handleTargetedUpdate={handleTargetedUpdate}
          handleGenerateSubModules={handleGenerateSubModules} handleDeleteNote={handleDeleteNote}
        />
      </div>

      {rightSidebarOpen && (
        <RightSidebar 
          activeSidebarTab={activeSidebarTab} setActiveSidebarTab={setActiveSidebarTab}
          handleClearChat={handleClearChat} setRightSidebarOpen={setRightSidebarOpen}
          state={state} setState={setState} syncProject={syncProject}
          handleSyncGithub={handleSyncGithub} isSyncing={isSyncing}
          handleWipeSnapshots={handleWipeSnapshots} handleOptimizeBlueprint={handleOptimizeBlueprint}
          handleCheckConsistency={handleCheckConsistency} handleEnforceHierarchy={handleEnforceHierarchy}
          handleSanitizeIntegrity={handleSanitizeIntegrity} handleAnalyzeNextSteps={handleAnalyzeNextSteps}
          textFileInputRef={textFileInputRef} handleTextFileUpload={handleTextFileUpload}
          nextStepSuggestion={nextStepSuggestion} chatInput={chatInput}
          setChatInput={setChatInput} handleChat={handleChat}
          isChatting={isChatting} chatEndRef={chatEndRef}
          onInteractiveAction={actions.onInteractiveAction}
          onStartSynthesis={actions.startSynthesis}
          isSynthesizing={actions.isSynthesizing}
        />
      )}

      {dialogConfig && (
        <Dialog
          isOpen={dialogConfig.isOpen} title={dialogConfig.title} message={dialogConfig.message}
          type={dialogConfig.type} onConfirm={dialogConfig.onConfirm} onCancel={dialogConfig.onCancel}
          confirmText={dialogConfig.confirmText} cancelText={dialogConfig.cancelText}
        />
      )}
    </div>
  );
};
