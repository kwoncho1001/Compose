import React from 'react';
import { Search, X } from 'lucide-react';

interface SidebarSearchProps {
  searchTerm: string;
  setSearchTerm: (term: string) => void;
}

export const SidebarSearch: React.FC<SidebarSearchProps> = ({ searchTerm, setSearchTerm }) => {
  return (
    <div className="p-3 border-b border-slate-800">
      <div className="relative">
        <Search className="absolute left-2.5 top-2 w-4 h-4 text-slate-500" />
        <input
          type="text"
          placeholder="노트 검색..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full bg-slate-800/50 border border-slate-700 rounded-md pl-9 pr-8 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
        />
        {searchTerm && (
          <button
            onClick={() => setSearchTerm('')}
            className="absolute right-2 top-2 text-slate-500 hover:text-slate-300"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
};
