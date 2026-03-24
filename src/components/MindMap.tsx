import React, { useRef } from 'react';
import { Note } from '../types';
import { useMindMap } from '../hooks/useMindMap';
import { useViewport } from '../hooks/useViewport';
import { MindMapControls } from './mindmap/MindMapControls';
import { MindMapLegend } from './mindmap/MindMapLegend';
import { MindMapCanvas } from './mindmap/MindMapCanvas';

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
    resetViewport,
  } = useViewport();

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
      <MindMapControls 
        viewMode={viewMode}
        toggleViewMode={toggleViewMode}
        setSelectedDomain={setSelectedDomain}
        resetViewport={resetViewport}
        handleWheel={handleWheel}
        viewport={viewport}
        darkMode={darkMode}
      />

      <MindMapCanvas 
        viewport={viewport}
        dimensions={dimensions}
        nodes={graphData.nodes}
        links={graphData.links}
        handleNodeClick={handleNodeClick}
        selectedNoteId={selectedNoteId}
        darkMode={darkMode}
      />

      <MindMapLegend darkMode={darkMode} />
    </div>
  );
};

export default MindMap;
