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

export const MindMap: React.FC<MindMapProps> = ({ notes, onSelectNote, selectedNoteId, darkMode }) => {
  const fgRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [featureOnly, setFeatureOnly] = useState(false);
  const [currentView, setCurrentView] = useState<ViewMode>('DOMAIN');
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect;
        setDimensions({ width, height });
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const graphData = useMemo(() => {
    // Helper to calculate links between notes
    const calculateLinks = (filteredNotes: Note[]) => {
      const links: any[] = [];
      const nodeMap = new Map(filteredNotes.map(n => [n.id, n]));

      filteredNotes.forEach(note => {
        (note.parentNoteIds || []).forEach(parentId => {
          if (nodeMap.has(parentId)) {
            const parentNote = nodeMap.get(parentId);
            links.push({
              source: parentId,
              target: note.id,
              type: 'parent',
              isReferenceLink: note.noteType === 'Reference' || parentNote?.noteType === 'Reference'
            });
          }
        });
        if (note.relatedNoteIds) {
          note.relatedNoteIds.forEach(relId => {
            if (nodeMap.has(relId)) {
              const relNote = nodeMap.get(relId);
              links.push({
                source: relId,
                target: note.id,
                type: 'related',
                isReferenceLink: note.noteType === 'Reference' || relNote?.noteType === 'Reference'
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
          ...(note.parentNoteIds || []),
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
      const nodes: any[] = [];
      const links: any[] = [];
      const processedPaths = new Set<string>();

      // 1. 선택된 도메인 노드 추가
      nodes.push({
        id: `domain-${selectedDomain}`,
        name: selectedDomain,
        val: 18,
        type: 'domain',
        status: 'none',
        summary: ''
      });

      // 2. 재귀적으로 노트 추가 (가상 ID 사용)
      const addNoteRecursive = (noteId: string, parentPath: string = '', depth: number = 0) => {
        const note = notes.find(n => n.id === noteId);
        if (!note || depth > 5) return;

        const currentPath = parentPath ? `${parentPath}/${noteId}` : noteId;
        if (processedPaths.has(currentPath)) return;
        processedPaths.add(currentPath);

        const virtualId = `note-${currentPath}`;
        
        nodes.push({
          id: virtualId,
          noteId: note.id,
          name: note.title,
          val: (note.folder || '미분류') === selectedDomain ? 10 : 6,
          type: 'note',
          status: note.status,
          summary: note.summary,
          domain: note.folder || '미분류',
          noteType: note.noteType,
          sourceFiles: note.githubLink || '',
          consistencyConflict: note.consistencyConflict
        });

        // 도메인과 연결 (루트 레벨인 경우)
        if (!parentPath) {
          links.push({
            source: virtualId,
            target: `domain-${note.folder || '미분류'}`,
            type: 'hierarchy'
          });
        }

        // 자식 노드 추가
        (note.childNoteIds || []).forEach(childId => {
          const childVirtualId = `note-${currentPath}/${childId}`;
          links.push({ source: virtualId, target: childVirtualId, type: 'hierarchy' });
          addNoteRecursive(childId, currentPath, depth + 1);
        });
      };

      // 선택된 도메인의 '루트' 노트들부터 시작
      const primaryNotes = notes.filter(n => (n.folder || '미분류') === selectedDomain);
      primaryNotes.forEach(note => {
        // 부모가 없거나 부모가 다른 도메인에 있는 경우 루트로 간주
        const hasParentInSameDomain = (note.parentNoteIds || []).some(pid => {
          const p = notes.find(n => n.id === pid);
          return p && (p.folder || '미분류') === selectedDomain;
        });
        if (!hasParentInSameDomain) {
          addNoteRecursive(note.id);
        }
      });

      return { nodes, links };
    }

    // 3. Total View
    const nodes: any[] = [];
    const links: any[] = [];
    const processedPaths = new Set<string>();

    let filteredNotes = notes;
    if (featureOnly) {
      const significantIds = new Set(
        notes
          .filter(n => n.isMainFeature || n.noteType === 'Epic' || n.noteType === 'Feature')
          .map(n => n.id)
      );
      const neighborIds = new Set<string>();
      notes.forEach(n => {
        if (significantIds.has(n.id)) {
          (n.parentNoteIds || []).forEach(id => neighborIds.add(id));
          if (n.relatedNoteIds) n.relatedNoteIds.forEach(id => neighborIds.add(id));
        } else {
          if ((n.parentNoteIds || []).some(id => significantIds.has(id))) neighborIds.add(n.id);
          if (n.relatedNoteIds && n.relatedNoteIds.some(id => significantIds.has(id))) neighborIds.add(n.id);
        }
      });
      filteredNotes = notes.filter(n => significantIds.has(n.id) || neighborIds.has(n.id));
    }

    const domains = Array.from(new Set(filteredNotes.map(n => n.folder || '미분류')));
    domains.forEach(domain => {
      nodes.push({
        id: `domain-${domain}`,
        name: domain,
        val: 15,
        type: 'domain',
        status: 'none',
        summary: ''
      });
    });

    const addNoteRecursiveTotal = (noteId: string, parentPath: string = '', depth: number = 0) => {
      const note = filteredNotes.find(n => n.id === noteId);
      if (!note || depth > 5) return;

      const currentPath = parentPath ? `${parentPath}/${noteId}` : noteId;
      if (processedPaths.has(currentPath)) return;
      processedPaths.add(currentPath);

      const virtualId = `note-${currentPath}`;
      
      nodes.push({
        id: virtualId,
        noteId: note.id,
        name: note.title,
        val: note.isMainFeature ? 10 : 6,
        type: 'note',
        status: note.status,
        summary: note.summary,
        domain: note.folder || '미분류',
        noteType: note.noteType,
        sourceFiles: note.githubLink || '',
        consistencyConflict: note.consistencyConflict
      });

      if (!parentPath) {
        links.push({
          source: virtualId,
          target: `domain-${note.folder || '미분류'}`,
          type: 'hierarchy'
        });
      }

      (note.childNoteIds || []).forEach(childId => {
        const childVirtualId = `note-${currentPath}/${childId}`;
        links.push({ source: virtualId, target: childVirtualId, type: 'hierarchy' });
        addNoteRecursiveTotal(childId, currentPath, depth + 1);
      });

      // Related notes (only in TOTAL view, and we use flat IDs for simplicity in related links)
      (note.relatedNoteIds || []).forEach(relId => {
        // Related links are tricky with virtual IDs. 
        // For now, let's just link to the first instance found or the flat ID if it exists.
        // A better way would be to link all instances, but that's messy.
        // Let's just link to the base note ID for related links in TOTAL view.
        links.push({ source: virtualId, target: `note-${relId}`, type: 'related' });
      });
    };

    // Start from root notes in filtered set
    filteredNotes.forEach(note => {
      const hasParentInFiltered = (note.parentNoteIds || []).some(pid => filteredNotes.some(fn => fn.id === pid));
      if (!hasParentInFiltered) {
        addNoteRecursiveTotal(note.id);
      }
    });

    return { nodes, links };
  }, [notes, featureOnly, currentView, selectedDomain]);

  useEffect(() => {
    if (fgRef.current) {
      fgRef.current.d3Force('link').distance((link: any) => {
        if (link.isReferenceLink) return 30;
        if (link.type === 'hierarchy') return 150;
        return 100;
      });
      fgRef.current.d3Force('charge').strength(-300);
    }
  }, [graphData]);

  const nodeColor = (node: any) => {
    if (node.type === 'domain') return darkMode ? '#3b82f6' : '#2563eb'; // Blue
    const noteId = node.noteId || node.id;
    if (noteId === selectedNoteId) return '#6366f1'; // Indigo-500
    if (node.status === 'Conflict') return '#ef4444'; // Red-500
    if (node.status === 'Done') return '#10b981'; // Emerald-500
    if (node.status === 'Planned') return '#eab308'; // Yellow-500
    
    return darkMode ? '#475569' : '#94a3b8';
  };

  const handleNodeClick = (node: any) => {
    if (node.type === 'domain') {
      setSelectedDomain(node.name);
    } else {
      onSelectNote(node.noteId || node.id);
    }
  };

  return (
    <div ref={containerRef} className="w-full h-full bg-slate-50 dark:bg-slate-950 relative overflow-hidden">
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

      {dimensions.width > 0 && dimensions.height > 0 && (
        <ForceGraph2D
          ref={fgRef}
          width={dimensions.width}
          height={dimensions.height}
          graphData={graphData}
          nodeLabel={(node: any) => {
            let label = `${node.name}\n${node.summary}`;
            if (node.sourceFiles) {
              label += `\n\n[구현 파일]\n${node.sourceFiles}`;
            }
            return label;
          }}
          nodeColor={nodeColor}
          nodeRelSize={6}
          linkDirectionalArrowLength={(link: any) => link.type === 'hierarchy' ? 0 : 3}
          linkDirectionalArrowRelPos={1}
          linkCurvature={0.1}
          linkColor={(link: any) => {
            if (link.type === 'hierarchy') return darkMode ? 'rgba(99, 102, 241, 0.3)' : 'rgba(79, 70, 229, 0.3)';
            if (link.type === 'related' || link.type === 'domain-link') return darkMode ? '#475569' : '#94a3b8';
            return darkMode ? '#334155' : '#cbd5e1';
          }}
          linkLineDash={(link: any) => link.type === 'hierarchy' ? [2, 2] : null}
          onNodeClick={handleNodeClick}
          nodeCanvasObject={(node: any, ctx, globalScale) => {
            const label = node.name || '';
            const fontSize = (node.type === 'domain' ? 14 : 10) / globalScale;
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

              ctx.textAlign = 'center';
              ctx.textBaseline = 'middle';
              ctx.fillStyle = nodeColor(node);
              ctx.fillText(label, node.x, node.y);

              node.__bckgDimensions = bckgDimensions;
            } else {
              // Draw shape based on noteType
              const noteType = node.noteType || 'Task';
              let r = 5;
              if (noteType === 'Epic') r = 12;
              else if (noteType === 'Feature') r = 8;
              else if (noteType === 'Task') r = 5;
              else if (noteType === 'Reference') r = 4;

              ctx.beginPath();
              if (noteType === 'Reference') {
                // Diamond
                ctx.moveTo(node.x, node.y - r - 2);
                ctx.lineTo(node.x + r + 2, node.y);
                ctx.lineTo(node.x, node.y + r + 2);
                ctx.lineTo(node.x - r - 2, node.y);
                ctx.closePath();
                ctx.fillStyle = darkMode ? '#334155' : '#cbd5e1';
                ctx.fill();
                ctx.strokeStyle = darkMode ? '#475569' : '#94a3b8';
                ctx.setLineDash([2, 2]);
                ctx.stroke();
                ctx.setLineDash([]);
              } else {
                // Circle
                ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
                ctx.fillStyle = nodeColor(node);
                ctx.fill();
                
                // Add a subtle border
                ctx.strokeStyle = darkMode ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.1)';
                ctx.lineWidth = 1 / globalScale;
                ctx.stroke();
              }

              // Draw text below the node
              ctx.textAlign = 'center';
              ctx.textBaseline = 'top';
              ctx.fillStyle = darkMode ? '#cbd5e1' : '#475569';
              ctx.fillText(label, node.x, node.y + r + 2);

              // Update bckgDimensions for pointer interaction (roughly the shape + text)
              node.__bckgDimensions = [Math.max(r * 2, textWidth), r * 2 + fontSize + 2];
              node.__shapeRadius = r;
            }
          }}
          nodePointerAreaPaint={(node: any, color, ctx) => {
            ctx.fillStyle = color;
            const bckgDimensions = node.__bckgDimensions;
            if (bckgDimensions) {
              if (node.type === 'domain') {
                ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - bckgDimensions[1] / 2, bckgDimensions[0], bckgDimensions[1]);
              } else {
                const r = node.__shapeRadius || 5;
                ctx.fillRect(node.x - bckgDimensions[0] / 2, node.y - r, bckgDimensions[0], bckgDimensions[1]);
              }
            }
          }}
        />
      )}
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
              <div className="w-2 h-2 rounded-full bg-[#eab308]"></div>
              <span>Planned (계획중)</span>
            </div>
            <div className="mt-1 pt-1 border-t border-slate-200 dark:border-slate-700 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full border border-slate-400 dark:border-slate-500"></div>
                <span>Epic (대목표)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full border border-slate-400 dark:border-slate-500"></div>
                <span>Feature (기능)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full border border-slate-400 dark:border-slate-500"></div>
                <span>Task (작업)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rotate-45 border border-dashed border-slate-400 dark:border-slate-500"></div>
                <span>Reference (참조)</span>
              </div>
            </div>
          </>
        )}
        <div className="mt-1 pt-1 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 border-t border-dashed border-indigo-400"></div>
            <span>도메인 소속</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-0.5 bg-slate-400"></div>
            <span>연관 관계</span>
          </div>
        </div>
      </div>
    </div>
  );
};
