import React from 'react';
import { MindMapNode, MindMapLink } from '../types/mindmap';

interface MindMapEdgeProps {
  source: MindMapNode;
  target: MindMapNode;
  link: MindMapLink;
  darkMode?: boolean;
}

export const MindMapEdge = React.memo(({ source, target, link, darkMode }: MindMapEdgeProps) => {
  const isHierarchy = link.type === 'hierarchy';
  const isReference = link.isReferenceLink;
  
  // Simple Bézier curve calculation
  const dx = target.x - source.x;
  const dy = target.y - source.y;
  const midX = source.x + dx / 2;
  const midY = source.y + dy / 2;
  
  // Path string for a smooth curve
  const path = `M ${source.x} ${source.y} Q ${midX} ${source.y} ${midX} ${midY} T ${target.x} ${target.y}`;
  
  const strokeColor = darkMode 
    ? (isHierarchy ? 'rgba(99, 102, 241, 0.4)' : 'rgba(71, 85, 105, 0.4)')
    : (isHierarchy ? 'rgba(79, 70, 229, 0.4)' : 'rgba(203, 213, 225, 0.4)');

  return (
    <path
      d={path}
      fill="none"
      stroke={strokeColor}
      strokeWidth={isHierarchy ? 2 : 1}
      strokeDasharray={isReference ? '5,5' : '0'}
      markerEnd="url(#arrowhead)"
      className="transition-all duration-300"
    />
  );
});

MindMapEdge.displayName = 'MindMapEdge';
