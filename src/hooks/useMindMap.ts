import { useState, useMemo, useCallback, useEffect } from 'react';
import { Note } from '../types';
import { MindMapNode, MindMapLink, ViewMode, MindMapDimensions } from '../types/mindmap';
import { calculateLayout } from '../utils/layout-engine';

export const useMindMap = (notes: Note[], onSelectNote: (id: string) => void) => {
  const [viewMode, setViewMode] = useState<ViewMode>('TOTAL');
  const [selectedDomain, setSelectedDomain] = useState<string | undefined>(undefined);
  const [dimensions, setDimensions] = useState<MindMapDimensions>({
    width: window.innerWidth,
    height: window.innerHeight,
    nodeSpacing: 100,
  });

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight,
        nodeSpacing: 100,
      });
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Calculate graph data using the layout engine
  const graphData = useMemo(() => {
    return calculateLayout(notes, dimensions, viewMode, selectedDomain);
  }, [notes, dimensions, viewMode, selectedDomain]);

  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => (prev === 'TOTAL' ? 'DOMAIN' : 'TOTAL'));
  }, []);

  const handleNodeClick = useCallback((node: MindMapNode) => {
    if (node.type === 'domain') {
      setSelectedDomain(node.text);
      setViewMode('TOTAL');
    } else if (node.noteId) {
      onSelectNote(node.noteId);
    }
  }, [onSelectNote]);

  return {
    viewMode,
    selectedDomain,
    dimensions,
    graphData,
    toggleViewMode,
    handleNodeClick,
    setSelectedDomain,
  };
};
