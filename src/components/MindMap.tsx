import React, { useRef, useEffect } from 'react';
import { Note } from '../types';
import { useMindMap } from '../hooks/useMindMap';
import { useViewport } from '../hooks/useViewport';
import { MindMapNodeComponent } from './MindMapNode';
import { MindMapEdge } from './MindMapEdge';
import { LayoutGrid, Layers, RefreshCw, ZoomIn, ZoomOut, Maximize } from 'lucide-react';

interface MindMapProps {
  notes: Note[];
  onSelectNote: (id: string) => void;
  selectedNoteId: string | null;
  darkMode: boolean;
}

export const MindMap: React.FC<MindMapProps> = ({ 
  notes, 
  onSelectNote, 
  selectedNoteId, 
  darkMode 
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    viewMode,
    dimensions,
    graphData,
    toggleViewMode,
    handleNodeClick,
    setSelectedDomain,
  } = useMindMap(notes, onSelectNote);

  const {
    viewport,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    resetViewport,
  } = useViewport();

  const { nodes, links } = graphData;

  // Global mouse up to stop dragging even if mouse is outside container
  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

  return (
    <div 
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden rounded-xl border transition-colors duration-200 select-none ${
        darkMode ? 'bg-slate-950 border-slate-800' : 'bg-gray-50/50 border-gray-200'
      }`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
    >
      {/* Controls */}
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
          <button onClick={resetViewport} className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded text-slate-500"><Maximize size={14} /></button>
          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 self-center mx-1" />
          <div className="px-2 py-1 text-[10px] font-mono text-slate-400 self-center">
            {Math.round(viewport.scale * 100)}%
          </div>
        </div>
      </div>

      {/* Transformable Canvas */}
      <div 
        className="absolute inset-0 transition-transform duration-75 ease-out"
        style={{ 
          transform: `translate(${viewport.offset.x}px, ${viewport.offset.y}px) scale(${viewport.scale})`,
          transformOrigin: '0 0'
        }}
      >
        {/* SVG Layer for Links */}
        <svg
          className="absolute inset-0 pointer-events-none overflow-visible"
          width={dimensions.width}
          height={dimensions.height}
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon points="0 0, 10 3.5, 0 7" fill={darkMode ? "#475569" : "#cbd5e1"} />
            </marker>
          </defs>
          {links.map((link, i) => {
            const source = nodes.find((n) => n.id === link.source);
            const target = nodes.find((n) => n.id === link.target);
            if (!source || !target) return null;

            return (
              <MindMapEdge
                key={`${link.source}-${link.target}-${i}`}
                source={source}
                target={target}
                link={link}
                darkMode={darkMode}
              />
            );
          })}
        </svg>

        {/* Nodes Layer */}
        <div className="absolute inset-0 pointer-events-none">
          {nodes.map((node) => (
            <div key={node.id} className="pointer-events-auto">
              <MindMapNodeComponent
                node={node}
                onNodeClick={handleNodeClick}
                isSelected={node.noteId === selectedNoteId}
                darkMode={darkMode}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className={`absolute bottom-4 right-4 z-20 p-3 border rounded-lg shadow-sm text-[10px] space-y-1 transition-colors ${
        darkMode ? 'bg-slate-900/80 border-slate-700 text-slate-400' : 'bg-white/80 border-gray-200 text-gray-600'
      }`}>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500" /> Done
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500" /> In Progress
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-red-500" /> Conflict
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 border border-gray-300" /> Planned
        </div>
      </div>
    </div>
  );
};

export default MindMap;
