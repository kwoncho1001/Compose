import React, { useState, useEffect, useCallback } from 'react';
import { Sidebar } from './Sidebar';
import { NoteEditor } from './NoteEditor';
import { GCMViewer } from './GCMViewer';
import { Note, GCM, AppState } from '../types';
import { decomposeFeature, suggestNextSteps } from '../services/gemini';
import { fetchGithubFiles } from '../services/github';
import { Send, Github, RefreshCw, Lightbulb, Loader2 } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const [state, setState] = useState<AppState>({
    notes: [],
    gcm: { entities: {}, variables: {} },
    githubRepo: '',
    githubToken: '',
  });
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [featureInput, setFeatureInput] = useState('');
  const [isDecomposing, setIsDecomposing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [nextStepSuggestion, setNextStepSuggestion] = useState<string | null>(null);

  const handleDecompose = async () => {
    if (!featureInput.trim()) return;

    setIsDecomposing(true);
    try {
      const { newNotes, updatedGcm } = await decomposeFeature(featureInput, state.gcm);
      
      const notesWithIds = newNotes.map((n) => ({
        ...n,
        id: Math.random().toString(36).substr(2, 9),
        status: 'Planned' as const,
      }));

      setState((prev) => ({
        ...prev,
        notes: [...prev.notes, ...notesWithIds],
        gcm: updatedGcm,
      }));
      setFeatureInput('');
      
      if (notesWithIds.length > 0) {
        setSelectedNoteId(notesWithIds[0].id);
      }
    } catch (error) {
      console.error('Failed to decompose feature:', error);
      alert('Failed to decompose feature. Check console for details.');
    } finally {
      setIsDecomposing(false);
    }
  };

  const handleSyncGithub = async () => {
    if (!state.githubRepo) {
      alert('Please enter a GitHub repository URL.');
      return;
    }

    setIsSyncing(true);
    try {
      const files = await fetchGithubFiles(state.githubRepo, state.githubToken);
      
      // Get next step suggestion and updated statuses from LLM
      const { suggestion, updatedStatuses } = await suggestNextSteps(state.notes, files);
      
      const updatedNotes = state.notes.map((note) => {
        if (updatedStatuses[note.id]) {
          return { ...note, status: updatedStatuses[note.id] };
        }
        return note;
      });

      setState((prev) => ({ ...prev, notes: updatedNotes }));
      setNextStepSuggestion(suggestion);

    } catch (error) {
      console.error('Failed to sync with GitHub:', error);
      alert('Failed to sync with GitHub. Check console for details.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleUpdateNote = (updatedNote: Note) => {
    setState((prev) => ({
      ...prev,
      notes: prev.notes.map((n) => (n.id === updatedNote.id ? updatedNote : n)),
    }));
  };

  const selectedNote = state.notes.find((n) => n.id === selectedNoteId) || null;

  return (
    <div className="flex h-screen bg-slate-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <Sidebar
        notes={state.notes}
        selectedNoteId={selectedNoteId}
        onSelectNote={setSelectedNoteId}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Navigation / Input Area */}
        <header className="bg-white border-b border-slate-200 p-4 flex items-center justify-between shadow-sm z-10">
          <div className="flex-1 max-w-2xl flex items-center gap-2">
            <input
              type="text"
              placeholder="Enter a feature you want to build (e.g., 'Login system')"
              value={featureInput}
              onChange={(e) => setFeatureInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleDecompose()}
              className="flex-1 border border-slate-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              disabled={isDecomposing}
            />
            <button
              onClick={handleDecompose}
              disabled={isDecomposing || !featureInput.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isDecomposing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Decompose
            </button>
          </div>

          <div className="flex items-center gap-4 ml-8">
            <div className="flex items-center gap-2">
              <input
                type="text"
                placeholder="GitHub Repo URL"
                value={state.githubRepo}
                onChange={(e) => setState({ ...state, githubRepo: e.target.value })}
                className="w-48 border border-slate-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
              <input
                type="password"
                placeholder="PAT (Optional)"
                value={state.githubToken}
                onChange={(e) => setState({ ...state, githubToken: e.target.value })}
                className="w-32 border border-slate-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-500"
              />
            </div>
            <button
              onClick={handleSyncGithub}
              disabled={isSyncing}
              className="bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {isSyncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Github className="w-4 h-4" />}
              Sync with GitHub
            </button>
          </div>
        </header>

        {/* Next Step Suggestion Banner */}
        {nextStepSuggestion && (
          <div className="bg-amber-50 border-b border-amber-200 p-3 flex items-start gap-3">
            <Lightbulb className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <strong className="block font-semibold mb-1">Next Step Suggestion</strong>
              {nextStepSuggestion}
            </div>
          </div>
        )}

        {/* Note Editor */}
        <div className="flex-1 overflow-hidden flex">
          {selectedNote ? (
            <NoteEditor note={selectedNote} onUpdateNote={handleUpdateNote} />
          ) : (
            <div className="flex-1 flex items-center justify-center bg-slate-50 text-slate-400">
              <div className="text-center max-w-md p-6">
                <div className="w-16 h-16 bg-indigo-100 text-indigo-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <RefreshCw className="w-8 h-8" />
                </div>
                <h2 className="text-xl font-semibold text-slate-700 mb-2">Welcome to Vibe-Architect</h2>
                <p className="text-sm text-slate-500">
                  Enter a feature idea in the top bar to automatically decompose it into modular notes, update the Global Context Map, and sync with your GitHub repository.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* GCM Viewer */}
      <GCMViewer gcm={state.gcm} />
    </div>
  );
};
