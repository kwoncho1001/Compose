import React from 'react';
import { FileText, Layers, Sun, Moon } from 'lucide-react';

interface NavigationRailProps {
  viewMode: 'editor' | 'mindmap';
  setViewMode: (mode: 'editor' | 'mindmap') => void;
  darkMode: boolean;
  setDarkMode: (dark: boolean) => void;
}

export const NavigationRail: React.FC<NavigationRailProps> = ({
  viewMode,
  setViewMode,
  darkMode,
  setDarkMode
}) => {
  return (
    <div className="hidden lg:flex w-16 bg-slate-900 border-r border-slate-800 flex-col items-center py-4 gap-4 z-30">
      <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center mb-4 shadow-lg shadow-indigo-500/20">
        <span className="text-white font-bold text-lg">VA</span>
      </div>
      
      <button
        onClick={() => setViewMode('editor')}
        className={`p-3 rounded-xl transition-all duration-200 ${viewMode === 'editor' ? 'bg-indigo-500/20 text-indigo-400 shadow-inner' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
        title="에디터 뷰"
      >
        <FileText className="w-6 h-6" />
      </button>
      
      <button
        onClick={() => setViewMode('mindmap')}
        className={`p-3 rounded-xl transition-all duration-200 ${viewMode === 'mindmap' ? 'bg-indigo-500/20 text-indigo-400 shadow-inner' : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'}`}
        title="마인드맵 뷰"
      >
        <Layers className="w-6 h-6" />
      </button>
      
      <div className="mt-auto flex flex-col gap-4">
        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-3 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-xl transition-all"
        >
          {darkMode ? <Sun className="w-6 h-6" /> : <Moon className="w-6 h-6" />}
        </button>
      </div>
    </div>
  );
};
