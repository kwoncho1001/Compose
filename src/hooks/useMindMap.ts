import { useState, useMemo, useCallback, useEffect } from 'react';
import { Note } from '../types';
import { ViewMode } from '../types/mindmap';

export const useMindMap = (notes: Note[], onSelectNote: (id: string) => void) => {
  const [viewMode, setViewMode] = useState<ViewMode>('DOMAIN');
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: window.innerWidth, height: window.innerHeight });

  useEffect(() => {
    const handleResize = () => setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const graphData = useMemo(() => {
    const nodes: any[] = [];
    const links: any[] = [];
    
    // 1. 도메인(폴더) 노드 생성
    const domains = Array.from(new Set(notes.map(n => n.folder || '미분류')));
    domains.forEach(d => {
      nodes.push({ id: `domain-${d}`, name: d, type: 'domain', val: 15 });
    });

    // 2. 노트 노드 및 관계 생성
    notes.forEach(note => {
      nodes.push({
        id: note.id,
        name: note.title,
        type: 'note',
        noteType: note.noteType,
        status: note.status,
        val: note.noteType === 'Epic' ? 12 : note.noteType === 'Feature' ? 8 : 5
      });

      // 도메인 연결
      links.push({ source: `domain-${note.folder || '미분류'}`, target: note.id, type: 'hierarchy' });

      // 부모-자식 관계
      (note.childNoteIds || []).forEach(childId => {
        links.push({ source: note.id, target: childId, type: 'hierarchy' });
      });

      // 연관 관계
      (note.relatedNoteIds || []).forEach(relId => {
        links.push({ source: note.id, target: relId, type: 'related' });
      });
    });

    // 3. 유효한 링크만 필터링 (존재하는 노드 간의 연결만 유지)
    const nodeIds = new Set(nodes.map(n => n.id));
    const validLinks = links.filter(l => nodeIds.has(l.source) && nodeIds.has(l.target));

    return { nodes, links: validLinks };
  }, [notes]);

  const toggleViewMode = useCallback(() => {
    setViewMode(prev => prev === 'TOTAL' ? 'DOMAIN' : 'TOTAL');
  }, []);

  const handleNodeClick = useCallback((node: any) => {
    if (node.type === 'domain') {
      setSelectedDomain(node.name);
      setViewMode('TOTAL');
    } else {
      onSelectNote(node.id);
    }
  }, [onSelectNote]);

  return { viewMode, dimensions, graphData, toggleViewMode, handleNodeClick, setSelectedDomain };
};
