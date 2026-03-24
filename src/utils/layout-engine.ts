import { Note } from '../types';
import { MindMapNode, MindMapLink, MindMapDimensions } from '../types/mindmap';
import { parseNotesToGraph } from '../services/mindmap-parser';

/**
 * Calculates node positions for a hierarchical mind map.
 * Uses a simple radial or tree-based layout to avoid AI token costs.
 */
export const calculateLayout = (
  notes: Note[],
  dimensions: MindMapDimensions,
  viewMode: 'TOTAL' | 'DOMAIN',
  selectedDomain?: string
): { nodes: MindMapNode[]; links: MindMapLink[] } => {
  const { width, height } = dimensions;
  const { nodes, links } = parseNotesToGraph(notes, viewMode, selectedDomain);

  if (viewMode === 'DOMAIN' && !selectedDomain) {
    // Domain-centric view: Radial layout
    const domainCount = nodes.length;
    const radius = Math.min(width, height) / 3;

    nodes.forEach((node, i) => {
      const angle = (i / domainCount) * 2 * Math.PI;
      node.x = width / 2 + radius * Math.cos(angle);
      node.y = height / 2 + radius * Math.sin(angle);
    });
  } else {
    // Total view - hierarchical layout (simple implementation)
    const rootNodes = nodes.filter((n) => !nodes.some(p => p.children.includes(n.id)));
    const centerX = width / 2;
    const centerY = height / 2;

    // Simple radial layout for roots
    rootNodes.forEach((root, i) => {
      const angle = (i / rootNodes.length) * 2 * Math.PI;
      root.x = centerX + 200 * Math.cos(angle);
      root.y = centerY + 200 * Math.sin(angle);
    });

    // Add all other nodes (simple grid or random for now)
    nodes.forEach(node => {
      if (node.x === 0 && node.y === 0) {
        node.x = Math.random() * width;
        node.y = Math.random() * height;
      }
    });
  }

  return { nodes, links };
};
