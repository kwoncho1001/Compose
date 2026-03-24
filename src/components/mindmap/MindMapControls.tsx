import React from 'react';
import { LayoutGrid, Layers, RefreshCw, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { ViewportState } from '../../hooks/useViewport';

interface MindMapControlsProps {
  viewMode: 'TOTAL' | 'DOMAIN';
  toggleViewMode: () => void;
  setSelectedDomain: (domain: string | undefined) => void;
  resetViewport: () => void;
  handleWheel: (e: any) => void;
  viewport: ViewportState;
  darkMode: boolean;
}

export const MindMapControls: React.FC<MindMapControlsProps> = ({
  viewMode,
  toggleViewMode,
  setSelectedDomain,
  resetViewport,
  handleWheel,
  viewport,
  darkMode
}) => {
  return (
    <div className="absolute top-4 left-4 z-20 flex flex-col gap-2">
      <div className="flex gap-2">
        <button
          onClick={toggleViewMode}
          className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg shadow-sm transition-colors text-sm font-medium ${
            darkMode 
              ? 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800' 
              : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
          }`}
        >
          {viewMode === 'TOTAL' ? <Layers size={16} /> : <LayoutGrid size={16} />}
          {viewMode === 'TOTAL' ? 'Domain View' : 'Total View'}
        </button>
        <button
          onClick={() => {
            setSelectedDomain(undefined);
            resetViewport();
          }}
          className={`flex items-center gap-2 px-3 py-1.5 border rounded-lg shadow-sm transition-colors text-sm font-medium ${
            darkMode 
              ? 'bg-slate-900 border-slate-700 text-slate-200 hover:bg-slate-800' 
              : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'
          }`}
        >
          <RefreshCw size={16} />
          Reset
        </button>
      </div>
      
      <div className={`flex gap-1 p-1 border rounded-lg shadow-sm w-fit ${
        darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-gray-200'
      }`}>
        <button 
          onClick={() => handleWheel({ deltaY: -100, preventDefault: () => {} } as any)} 
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500"
        >
          <ZoomIn size={14} />
        </button>
        <button 
          onClick={() => handleWheel({ deltaY: 100, preventDefault: () => {} } as any)} 
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500"
        >
          <ZoomOut size={14} />
        </button>
        <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 self-center mx-1" />
        <button onClick={resetViewport} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500">
          <Maximize size={14} />
        </button>
        <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 self-center mx-1" />
        <div className="px-2 py-1 text-[10px] font-mono text-slate-400 self-center">
          {Math.round(viewport.scale * 100)}%
        </div>
      </div>
    </div>
  );
};
