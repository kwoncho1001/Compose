import { Note } from '../types';
import { MindMapNode, MindMapLink } from '../types/mindmap';

/**
 * Transforms a flat list of Notes into a structured Graph (Nodes & Links)
 */
export const parseNotesToGraph = (
  notes: Note[],
  viewMode: 'TOTAL' | 'DOMAIN',
  selectedDomain?: string
): { nodes: MindMapNode[]; links: MindMapLink[] } => {
  const nodes: MindMapNode[] = [];
  const links: MindMapLink[] = [];

  if (viewMode === 'DOMAIN' && !selectedDomain) {
    // Domain-centric view: Group by folder
    const domainMap = new Map<string, Note[]>();
    notes.forEach(note => {
      const folder = note.folder || 'root';
      if (!domainMap.has(folder)) domainMap.set(folder, []);
      domainMap.get(folder)!.push(note);
    });

    domainMap.forEach((domainNotes, folder) => {
      nodes.push({
        id: `domain-${folder}`,
        text: folder,
        x: 0, // Layout engine will handle coordinates
        y: 0,
        val: 20,
        type: 'domain',
        status: 'Done',
        summary: `${domainNotes.length} notes`,
        children: domainNotes.map(n => n.id),
      });
    });
  } else {
    // Total view or selected domain view
    const filteredNotes = selectedDomain 
      ? notes.filter(n => (n.folder || 'root') === selectedDomain)
      : notes;

    filteredNotes.forEach(note => {
      nodes.push({
        id: note.id,
        noteId: note.id,
        text: note.title,
        x: 0,
        y: 0,
        val: note.noteType === 'Epic' ? 15 : note.noteType === 'Feature' ? 10 : 5,
        type: 'note',
        status: note.status,
        summary: note.summary,
        domain: note.folder,
        noteType: note.noteType,
        consistencyConflict: !!note.consistencyConflict,
        children: note.childNoteIds,
      });

      // Hierarchy links
      note.childNoteIds.forEach(childId => {
        if (filteredNotes.some(n => n.id === childId)) {
          links.push({ source: note.id, target: childId, type: 'hierarchy' });
        }
      });

      // Related links
      note.relatedNoteIds.forEach(relId => {
        if (filteredNotes.some(n => n.id === relId)) {
          links.push({ source: note.id, target: relId, type: 'related', isReferenceLink: true });
        }
      });
    });
  }

  return { nodes, links };
};
