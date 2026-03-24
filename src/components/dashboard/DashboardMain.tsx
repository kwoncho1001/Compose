import React from 'react';
import { RefreshCw } from 'lucide-react';
import { Note, GCM } from '../../types';
import { MindMap } from '../MindMap';
import { NoteEditor } from '../NoteEditor';

interface DashboardMainProps {
  viewMode: 'editor' | 'mindmap';
  notes: Note[];
  selectedNoteId: string | null;
  setSelectedNoteId: (id: string | null) => void;
  setViewMode: (mode: 'editor' | 'mindmap') => void;
  darkMode: boolean;
  selectedNote: Note | undefined;
  gcm: GCM;
  handleUpdateNote: (note: Note) => void;
  handleTargetedUpdate: (noteId: string, instruction: string) => Promise<void>;
  handleGenerateSubModules: (note: Note) => Promise<void>;
  handleDeleteNote: (id: string) => void;
}

export const DashboardMain: React.FC<DashboardMainProps> = ({
  viewMode,
  notes,
  selectedNoteId,
  setSelectedNoteId,
  setViewMode,
  darkMode,
  selectedNote,
  gcm,
  handleUpdateNote,
  handleTargetedUpdate,
  handleGenerateSubModules,
  handleDeleteNote
}) => {
  return (
    <div className="flex-1 overflow-hidden flex">
      {viewMode === 'mindmap' ? (
        <MindMap 
          notes={notes} 
          onSelectNote={(id) => {
            setSelectedNoteId(id);
            setViewMode('editor');
          }}
          selectedNoteId={selectedNoteId}
          darkMode={darkMode}
        />
      ) : selectedNote ? (
        <NoteEditor 
          note={selectedNote} 
          allNotes={notes}
          gcm={gcm}
          onUpdateNote={handleUpdateNote} 
          onTargetedUpdate={handleTargetedUpdate}
          onGenerateSubModules={handleGenerateSubModules}
          onDeleteNote={handleDeleteNote}
          darkMode={darkMode}
        />
      ) : (
        <div className="flex-1 flex items-center justify-center bg-slate-50 dark:bg-slate-950 text-slate-400 transition-colors duration-200">
          <div className="text-center max-w-md p-6">
            <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-500 dark:text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
              <RefreshCw className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">Vibe-Architect에 오신 것을 환영합니다</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              상단 바에 기능 아이디어를 입력하면 자동으로 모듈형 노트로 분해하고, 글로벌 컨텍스트 맵을 업데이트하며, Github 저장소와 코드 대조 및 통합을 수행합니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
