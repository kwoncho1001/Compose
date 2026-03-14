import React from 'react';
import { Folder, FileText, CheckCircle, Circle, Clock, AlertTriangle, Star } from 'lucide-react';
import { Note } from '../types';

interface SidebarProps {
  notes: Note[];
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
}

const StatusIcon = ({ status }: { status: Note['status'] }) => {
  switch (status) {
    case 'Done':
      return <CheckCircle className="w-4 h-4 text-emerald-500" />;
    case 'In-Progress':
      return <Clock className="w-4 h-4 text-amber-500" />;
    case 'Conflict':
      return <AlertTriangle className="w-4 h-4 text-red-500" />;
    default:
      return <Circle className="w-4 h-4 text-slate-400" />;
  }
};

export const Sidebar: React.FC<SidebarProps> = ({ notes, selectedNoteId, onSelectNote }) => {
  // Extract dynamic folders
  const folders = Array.from(new Set(notes.map(n => n.folder || 'Uncategorized'))).sort();

  return (
    <div className="w-64 bg-slate-900 text-slate-300 h-full flex flex-col border-r border-slate-800">
      <div className="p-4 border-b border-slate-800">
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <div className="w-6 h-6 bg-indigo-500 rounded-md flex items-center justify-center">
            <span className="text-white text-xs">VA</span>
          </div>
          Vibe-Architect
        </h1>
      </div>
      
      <div className="flex-1 overflow-y-auto py-4">
        {folders.map((folder) => {
          const folderNotes = notes.filter((n) => (n.folder || 'Uncategorized') === folder);
          if (folderNotes.length === 0) return null;

          return (
            <div key={folder} className="mb-6">
              <div className="px-4 mb-2 flex items-center gap-2 text-slate-400 uppercase text-xs font-semibold tracking-wider">
                <Folder className="w-4 h-4" />
                {folder}
              </div>
              <ul className="space-y-0.5">
                {folderNotes.map((note) => {
                  const hasConsistencyConflict = !!note.consistencyConflict;
                  const isConflict = note.status === 'Conflict' || hasConsistencyConflict;
                  
                  return (
                    <li key={note.id}>
                      <button
                        onClick={() => onSelectNote(note.id)}
                        className={`w-full text-left px-4 py-2 flex items-center gap-3 text-sm transition-colors ${
                          selectedNoteId === note.id
                            ? 'bg-indigo-500/10 text-indigo-400 border-r-2 border-indigo-500'
                            : 'hover:bg-slate-800 hover:text-slate-200'
                        }`}
                      >
                        <StatusIcon status={note.status} />
                        <span className={`truncate flex-1 ${isConflict ? 'text-red-400' : ''}`}>
                          {note.title}
                        </span>
                        {note.isMainFeature && <Star className="w-3 h-3 text-amber-400" />}
                        {hasConsistencyConflict && <AlertTriangle className="w-3 h-3 text-red-500" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
        {notes.length === 0 && (
          <div className="px-4 text-sm text-slate-500 italic">
            No notes generated yet.
          </div>
        )}
      </div>
    </div>
  );
};
