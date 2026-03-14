import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Note } from '../types';
import { FileText, Code, Activity, CheckCircle, Clock, Circle } from 'lucide-react';

interface NoteEditorProps {
  note: Note | null;
  onUpdateNote: (note: Note) => void;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({ note, onUpdateNote }) => {
  if (!note) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white text-slate-400">
        <div className="text-center">
          <FileText className="w-12 h-12 mx-auto mb-4 text-slate-300" />
          <p>Select a note to view its details</p>
        </div>
      </div>
    );
  }

  const handleStatusChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdateNote({ ...note, status: e.target.value as Note['status'] });
  };

  return (
    <div className="flex-1 bg-white overflow-y-auto p-8 border-r border-slate-200">
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8 pb-6 border-b border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-bold text-slate-900">{note.title}</h1>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-500">Status:</span>
              <select
                value={note.status}
                onChange={handleStatusChange}
                className="bg-slate-50 border border-slate-200 text-slate-700 text-sm rounded-md focus:ring-indigo-500 focus:border-indigo-500 block p-2"
              >
                <option value="Planned">Planned</option>
                <option value="In-Progress">In-Progress</option>
                <option value="Done">Done</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <span className="flex items-center gap-1">
              <FileText className="w-4 h-4" />
              {note.folder}
            </span>
            {note.githubLink && (
              <a
                href={note.githubLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-indigo-600 hover:underline"
              >
                <Code className="w-4 h-4" />
                View Code
              </a>
            )}
          </div>
        </div>

        {/* YAML Metadata */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Metadata (YAML)
          </h2>
          <pre className="bg-slate-900 text-slate-300 p-4 rounded-lg text-sm font-mono overflow-x-auto">
            {note.yamlMetadata}
          </pre>
        </div>

        {/* User View */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-2">
            User View (Non-Technical)
          </h2>
          <div className="prose prose-slate max-w-none">
            <Markdown remarkPlugins={[remarkGfm]}>{note.userView}</Markdown>
          </div>
        </div>

        {/* AI Spec */}
        <div>
          <h2 className="text-xl font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-2">
            AI Spec (Technical)
          </h2>
          <div className="prose prose-slate max-w-none prose-pre:bg-slate-900 prose-pre:text-slate-300">
            <Markdown remarkPlugins={[remarkGfm]}>{note.aiSpec}</Markdown>
          </div>
        </div>
      </div>
    </div>
  );
};
