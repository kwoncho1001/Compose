import React from 'react';
import { PanelLeft, PanelRight, Download, Upload, RefreshCw, Search, X } from 'lucide-react';
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
  currentProjectName?: string;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
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
  handleRefreshNotes,
  currentProjectName,
  searchQuery,
  setSearchQuery
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
        
        <div className="flex flex-col ml-2 hidden sm:flex">
          <h1 className="text-sm font-bold text-slate-800 dark:text-white leading-tight">Vibe-Architect</h1>
          {currentProjectName && (
            <span className="text-[10px] text-indigo-500 dark:text-indigo-400 font-bold uppercase tracking-wider">
              {currentProjectName}
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative group hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
          <input 
            type="text"
            placeholder="노트 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-slate-100 dark:bg-slate-800 border-none rounded-full pl-10 pr-4 py-2 text-sm text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/50 w-64 transition-all"
          />
          {searchQuery && (
            <button 
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
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
