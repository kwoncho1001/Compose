import { useState, useCallback, useRef, useEffect } from 'react';

export interface ViewportState {
  scale: number;
  offset: { x: number; y: number };
}

export const useViewport = (initialScale = 1) => {
  const [viewport, setViewport] = useState<ViewportState>({
    scale: initialScale,
    offset: { x: 0, y: 0 },
  });
  
  const isDragging = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = 0.1;
    const delta = e.deltaY > 0 ? -zoomFactor : zoomFactor;
    
    setViewport(prev => ({
      ...prev,
      scale: Math.max(0.1, Math.min(5, prev.scale + delta)),
    }));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return; // Only left click
    isDragging.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    
    setViewport(prev => ({
      ...prev,
      offset: {
        x: prev.offset.x + dx,
        y: prev.offset.y + dy,
      },
    }));
    
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
  }, []);

  useEffect(() => {
    window.addEventListener('mouseup', handleMouseUp);
    return () => window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseUp]);

  const resetViewport = useCallback(() => {
    setViewport({ scale: initialScale, offset: { x: 0, y: 0 } });
  }, [initialScale]);

  return {
    viewport,
    handleWheel,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    resetViewport,
  };
};
