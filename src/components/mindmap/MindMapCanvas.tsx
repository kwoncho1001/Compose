import React, { useRef, useEffect } from 'react';
import ForceGraph2D from 'react-force-graph-2d';

export const MindMapCanvas = ({ nodes, links, handleNodeClick, selectedNoteId, darkMode, dimensions }) => {
  const fgRef = useRef<any>(null);

  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.d3Force('charge').strength(-300);
      fgRef.current.d3Force('link').distance(80);
    }
  }, [nodes]);

  const nodeColor = (node: any) => {
    if (node.type === 'domain') return darkMode ? '#3b82f6' : '#2563eb';
    if (node.id === selectedNoteId) return '#6366f1';
    switch (node.status) {
      case 'Done': return '#10b981';
      case 'Conflict': return '#ef4444';
      case 'Planned': return '#eab308';
      default: return '#94a3b8';
    }
  };

  return (
    <ForceGraph2D
      ref={fgRef}
      width={dimensions.width}
      height={dimensions.height}
      graphData={{ nodes, links }}
      nodeColor={nodeColor}
      nodeRelSize={6}
      linkColor={() => darkMode ? '#475569' : '#94a3b8'}
      linkWidth={2}
      linkDirectionalArrowLength={3.5}
      linkDirectionalArrowRelPos={1}
      linkDirectionalParticles={2}
      linkDirectionalParticleSpeed={0.005}
      linkDirectionalParticleWidth={2}
      linkCanvasObject={(link: any, ctx) => {
        const start = link.source;
        const end = link.target;

        if (typeof start !== 'object' || typeof end !== 'object') return;

        ctx.beginPath();
        ctx.moveTo(start.x, start.y);
        ctx.lineTo(end.x, end.y);

        ctx.strokeStyle = darkMode ? '#475569' : '#94a3b8';
        ctx.lineWidth = 2;
        ctx.stroke();
      }}
      linkCanvasObjectMode={() => 'before'}
      onNodeClick={handleNodeClick}
      nodeCanvasObject={(node: any, ctx, globalScale) => {
        const label = node.name;
        const fontSize = 12 / globalScale;
        ctx.font = `${node.type === 'domain' ? 'bold ' : ''}${fontSize}px Inter`;
        
        // 모양 그리기 (Epic: 큰 원, Feature: 중간, Task: 작은 원, Reference: 다이아몬드)
        const r = node.val || 5;
        ctx.beginPath();
        if (node.noteType === 'Reference') {
          ctx.moveTo(node.x, node.y - r);
          ctx.lineTo(node.x + r, node.y);
          ctx.lineTo(node.x, node.y + r);
          ctx.lineTo(node.x - r, node.y);
        } else {
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
        }
        ctx.fillStyle = nodeColor(node);
        ctx.fill();

        // 텍스트 라벨
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = darkMode ? '#cbd5e1' : '#475569';
        ctx.fillText(label, node.x, node.y + r + 2);
      }}
    />
  );
};
