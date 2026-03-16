import React, { useMemo, useRef, useEffect, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { Note } from '../types';
import * as d3 from 'd3-force';
import { Filter, Eye, ArrowLeft, LayoutGrid, Network } from 'lucide-react';

interface MindMapProps {
  notes: Note[];
  onSelectNote: (id: string) => void;
  selectedNoteId: string | null;
  darkMode: boolean;
}

type ViewMode = 'TOTAL' | 'DOMAIN';

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
  const [featureOnly, setFeatureOnly] = useState(false);
  const [currentView, setCurrentView] = useState<ViewMode>('DOMAIN');
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  const graphData = useMemo(() => {
    // Helper to calculate links between notes
    const calculateLinks = (filteredNotes: Note[]) => {
      const links: any[] = [];
      const nodeIds = new Set(filteredNotes.map(n => n.id));

      filteredNotes.forEach(note => {
        if (note.parentNoteId && nodeIds.has(note.parentNoteId)) {
          links.push({
            source: note.parentNoteId,
            target: note.id,
            type: 'parent'
          });
        }
        if (note.relatedNoteIds) {
          note.relatedNoteIds.forEach(relId => {
            if (nodeIds.has(relId)) {
              links.push({
                source: relId,
                target: note.id,
                type: 'related'
              });
            }
          });
        }
      });
      return links;
    };

    // 1. Domain Level View (Aggregate folders)
    if (currentView === 'DOMAIN' && !selectedDomain) {
      const domains = Array.from(new Set(notes.map(n => n.folder || '미분류')));
      const nodes = domains.map(d => ({
        id: d,
        name: d,
        val: 15,
        type: 'domain',
        summary: `${notes.filter(n => (n.folder || '미분류') === d).length}개의 노트`
      }));

      const links: any[] = [];
      const domainLinks = new Set<string>();

      notes.forEach(note => {
        const sourceDomain = note.folder || '미분류';
        const targets = [
          ...(note.parentNoteId ? [note.parentNoteId] : []),
          ...(note.relatedNoteIds || [])
        ];

        targets.forEach(targetId => {
          const targetNote = notes.find(n => n.id === targetId);
          if (targetNote) {
            const targetDomain = targetNote.folder || '미분류';
            if (sourceDomain !== targetDomain) {
              const linkKey = [sourceDomain, targetDomain].sort().join('->');
              if (!domainLinks.has(linkKey)) {
                links.push({
                  source: sourceDomain,
                  target: targetDomain,
                  type: 'domain-link'
                });
                domainLinks.add(linkKey);
              }
            }
          }
        });
      });

      return { nodes, links };
    }

    // 2. Drill-down View (Notes within a domain)
    if (selectedDomain) {
      const domainNotes = notes.filter(n => (n.folder || '미분류') === selectedDomain);
      const nodes = domainNotes.map(note => ({
        id: note.id,
        name: note.title,
        val: note.isMainFeature ? 10 : 6,
        type: 'note',
        status: note.status,
        summary: note.summary
      }));

      return { nodes, links: calculateLinks(domainNotes) };
    }

    // 3. Total View (Existing logic with minor cleanup)
    let filteredNotes = notes;
    if (featureOnly) {
      const significantIds = new Set(
        notes
          .filter(n => {
            const meta = parseMetadata(n.yamlMetadata);
            return n.isMainFeature || meta.componentType === 'Feature' || meta.componentType === 'Core';
          })
          .map(n => n.id)
      );

      const neighborIds = new Set<string>();
      notes.forEach(n => {
        if (significantIds.has(n.id)) {
          if (n.parentNoteId) neighborIds.add(n.parentNoteId);
          if (n.relatedNoteIds) n.relatedNoteIds.forEach(id => neighborIds.add(id));
        } else {
          if (n.parentNoteId && significantIds.has(n.parentNoteId)) neighborIds.add(n.id);
          if (n.relatedNoteIds && n.relatedNoteIds.some(id => significantIds.has(id))) neighborIds.add(n.id);
        }
      });

      filteredNotes = notes.filter(n => significantIds.has(n.id) || neighborIds.has(n.id));
    }

    const nodes = filteredNotes.map(note => ({
      id: note.id,
      name: note.title,
      val: note.isMainFeature ? 10 : 6,
      type: 'note',
      status: note.status,
      summary: note.summary
    }));

    return { nodes, links: calculateLinks(filteredNotes) };
  }, [notes, featureOnly, currentView, selectedDomain]);

  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.d3Force('link').distance(100);
      fgRef.current.d3Force('charge').strength(-300);
    }
  }, []);

  const nodeColor = (node: any) => {
    if (node.type === 'domain') return darkMode ? '#3b82f6' : '#2563eb'; // Blue
    if (node.id === selectedNoteId) return '#6366f1'; // Indigo-500
    if (node.status === 'Conflict') return '#ef4444'; // Red-500
    if (node.status === 'Done') return '#10b981'; // Emerald-500
    
    return darkMode ? '#475569' : '#94a3b8';
  };

  const handleNodeClick = (node: any) => {
    if (node.type === 'domain') {
      setSelectedDomain(node.id);
    } else {
      onSelectNote(node.id);
    }
  };

  return (
    <div className="w-full h-full bg-slate-50 dark:bg-slate-950 relative overflow-hidden">
      <div className="absolute top-4 left-4 flex gap-2 z-10">
        {selectedDomain && (
          <button
            onClick={() => setSelectedDomain(null)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm"
          >
            <ArrowLeft className="w-3 h-3" />
            도메인 목록으로
          </button>
        )}
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full p-1 flex gap-1 shadow-sm">
          <button
            onClick={() => {
              setCurrentView('DOMAIN');
              setSelectedDomain(null);
            }}
            className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-medium transition-all ${
              currentView === 'DOMAIN' 
                ? 'bg-indigo-600 text-white' 
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <LayoutGrid className="w-3 h-3" />
            도메인 보기
          </button>
          <button
            onClick={() => setCurrentView('TOTAL')}
            className={`flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-medium transition-all ${
              currentView === 'TOTAL' 
                ? 'bg-indigo-600 text-white' 
                : 'text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Network className="w-3 h-3" />
            전체 보기
          </button>
        </div>
      </div>

      <div className="absolute top-4 right-4 flex gap-2 z-10">
        {currentView === 'TOTAL' && (
          <button
            onClick={() => setFeatureOnly(!featureOnly)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all shadow-sm border ${
              featureOnly 
                ? 'bg-indigo-600 border-indigo-500 text-white' 
                : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
            }`}
          >
            {featureOnly ? <Filter className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
            {featureOnly ? '전체 보기로 전환' : '기능 중심 보기로 전환'}
          </button>
        )}
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
          if (link.type === 'related' || link.type === 'domain-link') return darkMode ? '#475569' : '#94a3b8';
          return darkMode ? '#334155' : '#cbd5e1';
        }}
        onNodeClick={handleNodeClick}
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          const label = node.name;
          const fontSize = (node.type === 'domain' ? 14 : 12) / globalScale;
          ctx.font = `${node.type === 'domain' ? 'bold ' : ''}${fontSize}px Inter, sans-serif`;
          const textWidth = ctx.measureText(label).width;
          const bckgDimensions = [textWidth, fontSize].map(n => n + fontSize * 0.4);

          ctx.fillStyle = darkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(255, 255, 255, 0.9)';
          
          if (node.type === 'domain') {
            // Rounded rect for domains
            const r = 4 / globalScale;
            const x = node.x - bckgDimensions[0] / 2;
            const y = node.y - bckgDimensions[1] / 2;
            const w = bckgDimensions[0];
            const h = bckgDimensions[1];
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = nodeColor(node);
            ctx.lineWidth = 1 / globalScale;
            ctx.stroke();
          } else {
            ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);
          }

          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = nodeColor(node);
          ctx.fillText(label, node.x, node.y);

          node.__bckgDimensions = bckgDimensions;
        }}
        nodePointerAreaPaint={(node: any, color, ctx) => {
          ctx.fillStyle = color;
          const bckgDimensions = node.__bckgDimensions;
          bckgDimensions && ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);
        }}
      />
      <div className="absolute bottom-4 left-4 flex flex-col gap-2 text-[10px] text-slate-500 dark:text-slate-400 bg-white/80 dark:bg-slate-900/80 p-3 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="font-semibold mb-1 border-b border-slate-200 dark:border-slate-700 pb-1">범례</div>
        {currentView === 'DOMAIN' && !selectedDomain ? (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#2563eb]"></div>
            <span>도메인 (폴더)</span>
          </div>
        ) : (
          <>
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
          </>
        )}
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
