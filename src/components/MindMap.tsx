import React, { useMemo, useRef, useEffect, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Note } from '../types';
import * as d3 from 'd3-force';
import { Filter, Eye } from 'lucide-react';

interface MindMapProps {
  notes: Note[];
  onSelectNote: (id: string) => void;
  selectedNoteId: string | null;
  darkMode: boolean;
}

const parseMetadata = (yaml: string) => {
  const meta: Record<string, string> = {};
  if (!yaml) return meta;
  yaml.split('\n').forEach(line => {
    const [key, ...val] = line.split(':');
    if (key && val.length > 0) {
      meta[key.trim()] = val.join(':').trim();
    }
  });
  return meta;
};

export const MindMap: React.FC<MindMapProps> = ({ notes, onSelectNote, selectedNoteId, darkMode }) => {
  const fgRef = useRef<any>(null);
  const [featureOnly, setFeatureOnly] = useState(true);

  const graphData = useMemo(() => {
    let filteredNotes = notes;
    
    if (featureOnly) {
      // Significant nodes: MainFeature, Feature type, or high importance
      const significantIds = new Set(
        notes
          .filter(n => {
            const meta = parseMetadata(n.yamlMetadata);
            return n.isMainFeature || meta.componentType === 'Feature' || meta.componentType === 'Core' || parseInt(meta.importance || '0') >= 4;
          })
          .map(n => n.id)
      );

      // Also include nodes directly connected to significant nodes
      const neighborIds = new Set<string>();
      notes.forEach(n => {
        if (significantIds.has(n.id)) {
          if (n.parentNoteId) neighborIds.add(n.parentNoteId);
          if (n.relatedNoteIds) n.relatedNoteIds.forEach(id => neighborIds.add(id));
        } else {
          // If this node points TO a significant node
          if (n.parentNoteId && significantIds.has(n.parentNoteId)) neighborIds.add(n.id);
          if (n.relatedNoteIds && n.relatedNoteIds.some(id => significantIds.has(id))) neighborIds.add(n.id);
        }
      });

      filteredNotes = notes.filter(n => significantIds.has(n.id) || neighborIds.has(n.id));
    }

    const nodes = filteredNotes.map(note => {
      const meta = parseMetadata(note.yamlMetadata);
      const importance = parseInt(meta.importance || '3');
      const componentType = meta.componentType || 'Feature';

      return {
        id: note.id,
        name: note.title,
        val: (importance * 2) + (note.isMainFeature ? 5 : 0),
        folder: note.folder,
        status: note.status,
        summary: note.summary,
        componentType,
        importance
      };
    });

    const links: any[] = [];
    const nodeIds = new Set(nodes.map(n => n.id));

    filteredNotes.forEach(note => {
      if (note.parentNoteId && nodeIds.has(note.parentNoteId) && nodeIds.has(note.id)) {
        links.push({
          source: note.parentNoteId,
          target: note.id,
          type: 'parent'
        });
      }
      if (note.relatedNoteIds) {
        note.relatedNoteIds.forEach(relId => {
          if (nodeIds.has(relId) && nodeIds.has(note.id)) {
            links.push({
              source: relId,
              target: note.id,
              type: 'related'
            });
          }
        });
      }
    });

    return { nodes, links };
  }, [notes, featureOnly]);

  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.d3Force('link').distance(100);
      fgRef.current.d3Force('charge').strength(-300);
    }
  }, []);

  const nodeColor = (node: any) => {
    if (node.id === selectedNoteId) return '#6366f1'; // Indigo-500
    if (node.status === 'Conflict') return '#ef4444'; // Red-500
    if (node.status === 'Done') return '#10b981'; // Emerald-500
    
    // Default color for 'Planned' (not Done/Conflict)
    return darkMode ? '#475569' : '#94a3b8';
  };

  return (
    <div className="w-full h-full bg-slate-50 dark:bg-slate-950 relative overflow-hidden">
      <div className="absolute top-4 right-4 flex gap-2">
        <button
          onClick={() => setFeatureOnly(!featureOnly)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all shadow-sm border ${
            featureOnly 
              ? 'bg-indigo-600 border-indigo-500 text-white' 
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
          }`}
        >
          {featureOnly ? <Filter className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
          {featureOnly ? '기능 중심 보기' : '전체 보기'}
        </button>
      </div>

      <ForceGraph2D
        ref={fgRef}
        graphData={graphData}
        nodeLabel={(node: any) => `${node.name}\n${node.summary}`}
        nodeColor={nodeColor}
        nodeRelSize={6}
        linkDirectionalArrowLength={3}
        linkDirectionalArrowRelPos={1}
        linkCurvature={0.1}
        linkColor={(link: any) => {
          if (link.type === 'related') return darkMode ? '#475569' : '#94a3b8';
          return darkMode ? '#334155' : '#cbd5e1';
        }}
        onNodeClick={(node: any) => onSelectNote(node.id)}
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          const label = node.name;
          const fontSize = 12 / globalScale;
          ctx.font = `${fontSize}px Inter, sans-serif`;
          const textWidth = ctx.measureText(label).width;
          const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.2);

          ctx.fillStyle = darkMode ? 'rgba(15, 23, 42, 0.8)' : 'rgba(255, 255, 255, 0.8)';
          ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);

          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = nodeColor(node);
          ctx.fillText(label, node.x, node.y);

          node.__bckgDimensions = bckgDimensions; // to use in nodePointerAreaPaint
        }}
        nodePointerAreaPaint={(node: any, color, ctx) => {
          ctx.fillStyle = color;
          const bckgDimensions = node.__bckgDimensions;
          bckgDimensions && ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);
        }}
      />
      <div className="absolute bottom-4 left-4 flex flex-col gap-2 text-[10px] text-slate-500 dark:text-slate-400 bg-white/80 dark:bg-slate-900/80 p-3 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="font-semibold mb-1 border-b border-slate-200 dark:border-slate-700 pb-1">범례</div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#10b981]"></div>
          <span>Done (완료)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#ef4444]"></div>
          <span>Conflict (충돌)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#94a3b8]"></div>
          <span>Planned (계획중)</span>
        </div>
        <div className="mt-1 pt-1 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-slate-400"></div>
            <span>계층 관계</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 border-t border-dashed border-slate-400"></div>
            <span>연관 관계</span>
          </div>
        </div>
      </div>
    </div>
  );
};
