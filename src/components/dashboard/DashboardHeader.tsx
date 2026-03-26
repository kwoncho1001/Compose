import React from 'react';
import { PanelLeft, PanelRight, Download, Upload, RefreshCw } from 'lucide-react';
import { Auth } from '../Auth';

interface DashboardHeaderProps {
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  setIsMobileMenuOpen: (open: boolean) => void;
  rightSidebarOpen: boolean;
  setRightSidebarOpen: (open: boolean) => void;
  handleExport: () => void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  handleImport: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleRefreshNotes: () => void;
}

export const DashboardHeader: React.FC<DashboardHeaderProps> = ({
  isSidebarOpen,
  setIsSidebarOpen,
  setIsMobileMenuOpen,
  rightSidebarOpen,
  setRightSidebarOpen,
  handleExport,
  fileInputRef,
  handleImport,
  handleRefreshNotes
}) => {
  return (
    <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-3 shadow-sm z-10 flex items-center justify-between transition-colors duration-200">
      <div className="flex items-center gap-2">
        {/* Mobile Menu Toggle */}
        <button
          onClick={() => setIsMobileMenuOpen(true)}
          className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors lg:hidden"
        >
          <PanelLeft className="w-5 h-5" />
        </button>
        
        {/* Desktop Sidebar Toggle */}
        <button
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          className="hidden lg:block p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-md transition-colors"
          title={isSidebarOpen ? "사이드바 접기" : "사이드바 펴기"}
        >
          <PanelLeft className={`w-5 h-5 ${isSidebarOpen ? 'text-indigo-500' : ''}`} />
        </button>
        
        <h1 className="text-lg font-bold text-slate-800 dark:text-white ml-2 hidden sm:block">Vibe-Architect</h1>
      </div>

      <div className="flex items-center gap-3">
        <Auth />
        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1" />
        <button
          onClick={() => {
            setRightSidebarOpen(!rightSidebarOpen);
          }}
          className={`p-2 rounded-full transition-colors ${rightSidebarOpen ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
          title="도구함 열기"
        >
          <PanelRight className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 ml-2">
          <button
            onClick={handleRefreshNotes}
            className="text-slate-500 hover:text-indigo-600 p-2 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            title="새로고침"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleExport}
            className="text-slate-500 hover:text-slate-900 p-2 rounded-md hover:bg-slate-100 transition-colors"
            title="프로젝트 내보내기"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="text-slate-500 hover:text-slate-900 p-2 rounded-md hover:bg-slate-100 transition-colors"
            title="프로젝트 가져오기"
          >
            <Upload className="w-4 h-4" />
          </button>
          <input
            type="file"
            accept=".json"
            ref={fileInputRef}
            onChange={handleImport}
            className="hidden"
          />
        </div>
      </div>
    </header>
  );
};
