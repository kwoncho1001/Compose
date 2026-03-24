import React from 'react';

interface MindMapLegendProps {
  darkMode: boolean;
}

export const MindMapLegend: React.FC<MindMapLegendProps> = ({ darkMode }) => {
  return (
    <div className={`absolute bottom-4 right-4 z-20 p-3 border rounded-lg shadow-sm text-[10px] space-y-1 transition-colors ${
      darkMode ? 'bg-slate-900/80 border-slate-700 text-slate-400' : 'bg-white/80 border-gray-200 text-gray-600'
    }`}>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-green-500" /> Done
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-blue-500" /> In Progress
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-red-500" /> Conflict
      </div>
      <div className="flex items-center gap-2">
        <div className="w-2 h-2 border border-gray-300" /> Planned
      </div>
    </div>
  );
};
