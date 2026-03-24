import React from 'react';
import { MindMapNode } from '../types/mindmap';
import { motion } from 'motion/react';

interface MindMapNodeProps {
  node: MindMapNode;
  onNodeClick: (node: MindMapNode) => void;
  isSelected?: boolean;
  darkMode?: boolean;
}

export const MindMapNodeComponent = React.memo(({ node, onNodeClick, isSelected, darkMode }: MindMapNodeProps) => {
  const isDomain = node.type === 'domain';
  const isConflict = node.consistencyConflict;
  
  const getStatusColor = (status: string) => {
    if (darkMode) {
      switch (status) {
        case 'Done': return 'border-green-600 bg-green-950/30 text-green-400';
        case 'In-Progress': return 'border-blue-600 bg-blue-950/30 text-blue-400';
        case 'Conflict': return 'border-red-600 bg-red-950/30 text-red-400';
        default: return 'border-slate-700 bg-slate-900 text-slate-400';
      }
    }
    switch (status) {
      case 'Done': return 'border-green-500 bg-green-50 text-green-700';
      case 'In-Progress': return 'border-blue-500 bg-blue-50 text-blue-700';
      case 'Conflict': return 'border-red-500 bg-red-50 text-red-700';
      default: return 'border-gray-300 bg-white text-gray-700';
    }
  };

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ 
        scale: isSelected ? 1.1 : 1, 
        opacity: 1, 
        x: node.x, 
        y: node.y,
        borderColor: isSelected ? (darkMode ? '#38bdf8' : '#3b82f6') : undefined
      }}
      whileHover={{ scale: 1.05, zIndex: 10 }}
      onClick={() => onNodeClick(node)}
      className={`
        absolute p-3 rounded-lg border-2 shadow-sm cursor-pointer
        transition-all duration-200 min-w-[120px] text-center
        ${isDomain 
          ? (darkMode ? 'bg-indigo-950/50 border-indigo-700 text-indigo-300' : 'bg-indigo-100 border-indigo-400 font-bold text-indigo-900') 
          : getStatusColor(node.status)}
        ${isConflict ? 'ring-2 ring-red-400 ring-offset-2' : ''}
        ${isSelected ? 'shadow-lg z-10' : ''}
      `}
      style={{ 
        transform: 'translate(-50%, -50%)'
      }}
    >
      <div className="text-[10px] font-mono opacity-50 mb-1 uppercase tracking-wider">
        {isDomain ? 'DOMAIN' : node.noteType}
      </div>
      <div className="text-sm font-medium truncate max-w-[150px]">
        {node.text}
      </div>
      {!isDomain && (
        <div className="text-[10px] mt-1 opacity-70 font-semibold">
          {node.status}
        </div>
      )}
    </motion.div>
  );
});

MindMapNodeComponent.displayName = 'MindMapNodeComponent';
