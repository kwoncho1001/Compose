import React, { useRef } from 'react';
import { Note } from '../types';
import { useMindMap } from '../hooks/useMindMap';
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

  return (
    <div 
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden rounded-xl border transition-colors duration-200 select-none ${
        darkMode ? 'bg-slate-950 border-slate-800' : 'bg-gray-50/50 border-gray-200'
      }`}
    >
      <MindMapControls 
        viewMode={viewMode}
        toggleViewMode={toggleViewMode}
        setSelectedDomain={setSelectedDomain}
        resetViewport={() => {}}
        handleWheel={() => {}}
        viewport={{ offset: { x: 0, y: 0 }, scale: 1 }}
        darkMode={darkMode}
      />

      <MindMapCanvas 
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
