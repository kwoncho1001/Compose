import React from 'react';
import { ViewportState } from '../../hooks/useViewport';
import { MindMapNode } from '../../types/mindmap';
import { MindMapNodeComponent } from '../MindMapNode';
import { MindMapEdge } from '../MindMapEdge';

interface MindMapCanvasProps {
  viewport: ViewportState;
  dimensions: { width: number; height: number };
  nodes: MindMapNode[];
  links: any[];
  handleNodeClick: (node: MindMapNode) => void;
  selectedNoteId: string | null;
  darkMode: boolean;
}

export const MindMapCanvas: React.FC<MindMapCanvasProps> = ({
  viewport,
  dimensions,
  nodes,
  links,
  handleNodeClick,
  selectedNoteId,
  darkMode
}) => {
  return (
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
  );
};
