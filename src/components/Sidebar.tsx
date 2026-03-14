import React from 'react';
import { Folder, FileText, CheckCircle, Circle, Clock } from 'lucide-react';
import { Note, FolderName } from '../types';

interface SidebarProps {
  notes: Note[];
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
}

const folders: FolderName[] = [
  '01_Common',
  '02_Data_Logic',
  '03_Interface',
  '04_User_Experience',
];

const StatusIcon = ({ status }: { status: Note['status'] }) => {
  switch (status) {
    case 'Done':
      return <CheckCircle className="w-4 h-4 text-emerald-500" />;
    case 'In-Progress':
      return <Clock className="w-4 h-4 text-amber-500" />;
    default:
      return <Circle className="w-4 h-4 text-slate-400" />;
  }
};

export const Sidebar: React.FC<SidebarProps> = ({
  notes,
  selectedNoteId,
  onSelectNote,
}) => {
  return (
    <div className="w-64 bg-slate-50 border-r border-slate-200 h-full overflow-y-auto flex flex-col">
      <div className="p-4 border-b border-slate-200">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <Folder className="w-5 h-5 text-indigo-500" />
          Vibe-Architect
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {folders.map((folder) => {
          const folderNotes = notes.filter((n) => n.folder === folder);
          if (folderNotes.length === 0) return null;

          return (
            <div key={folder} className="mb-4">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 px-2 flex items-center gap-2">
                <Folder className="w-3 h-3" />
                {folder.replace('_', ' ')}
              </h3>
              <ul className="space-y-1">
                {folderNotes.map((note) => (
                  <li key={note.id}>
                    <button
                      onClick={() => onSelectNote(note.id)}
                      className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center gap-2 transition-colors ${
                        selectedNoteId === note.id
                          ? 'bg-indigo-50 text-indigo-700 font-medium'
                          : 'text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <StatusIcon status={note.status} />
                      <span className="truncate flex-1">{note.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
        {notes.length === 0 && (
          <div className="text-center p-4 text-slate-500 text-sm">
            No notes yet. Enter a feature idea to begin.
          </div>
        )}
      </div>
    </div>
  );
};
