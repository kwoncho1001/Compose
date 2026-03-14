import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from './Sidebar';
import { NoteEditor } from './NoteEditor';
import { GCMViewer } from './GCMViewer';
import { Note, GCM, AppState } from '../types';
import { 
  decomposeFeature, 
  suggestNextSteps, 
  checkConflict, 
  refactorFolders,
  updateSingleNote,
  checkConsistency
} from '../services/gemini';
import { fetchGithubFiles, fetchGithubFileContent } from '../services/github';
import { Send, Github, RefreshCw, Lightbulb, Loader2, Download, Upload, FolderTree, ShieldAlert } from 'lucide-react';

export const Dashboard: React.FC = () => {
  const [state, setState] = useState<AppState>({
    notes: [],
    gcm: { entities: {}, variables: {} },
    githubRepo: '',
    githubToken: '',
  });
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [featureInput, setFeatureInput] = useState('');
  
  // Loading states
  const [isDecomposing, setIsDecomposing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefactoring, setIsRefactoring] = useState(false);
  const [isCheckingConsistency, setIsCheckingConsistency] = useState(false);
  
  const [nextStepSuggestion, setNextStepSuggestion] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('vibe-architect-state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.notes) setState(parsed);
      } catch (e) {
        console.error('Failed to load state from localStorage', e);
      }
    }
  }, []);

  // Save to localStorage on change
  useEffect(() => {
    localStorage.setItem('vibe-architect-state', JSON.stringify(state));
  }, [state]);

  const handleExport = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vibe-architect-export.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const importedState = JSON.parse(event.target?.result as string);
        if (importedState.notes) {
          setState(importedState);
          alert('Project imported successfully!');
        }
      } catch (err) {
        alert('Invalid JSON file');
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

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
      const updatedNotes = [...state.notes];
      let conflictCount = 0;

      for (let i = 0; i < updatedNotes.length; i++) {
        const note = updatedNotes[i];
        if (note.status === 'Done') continue;

        const keywords = note.title.toLowerCase().split(' ');
        const matchedFile = files.find((file) => 
          keywords.some(kw => kw.length > 3 && file.toLowerCase().includes(kw)) && !file.includes('node_modules')
        );

        if (matchedFile) {
          try {
            const content = await fetchGithubFileContent(state.githubRepo, matchedFile, state.githubToken);
            const { isMatch, reason } = await checkConflict(note.aiSpec, content);

            if (isMatch) {
              updatedNotes[i] = { ...note, status: 'Done', conflictInfo: undefined };
            } else {
              updatedNotes[i] = {
                ...note,
                status: 'Conflict',
                conflictInfo: { filePath: matchedFile, fileContent: content, reason }
              };
              conflictCount++;
            }
          } catch (e) {
            console.error('Failed to check conflict for', note.title, e);
          }
        }
      }

      setState((prev) => ({ ...prev, notes: updatedNotes }));
      
      const { suggestion } = await suggestNextSteps(updatedNotes, files);
      setNextStepSuggestion(suggestion);

      if (conflictCount > 0) {
        alert(`Sync complete. Found ${conflictCount} conflict(s) between design and code.`);
      } else {
        alert('Sync complete. No conflicts found.');
      }

    } catch (error) {
      console.error('Failed to sync with GitHub:', error);
      alert('Failed to sync with GitHub. Check console for details.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleRefactorFolders = async () => {
    if (state.notes.length === 0) return;
    setIsRefactoring(true);
    try {
      const mapping = await refactorFolders(state.notes);
      setState(prev => ({
        ...prev,
        notes: prev.notes.map(n => ({
          ...n,
          folder: mapping[n.id] || n.folder
        }))
      }));
    } catch (e) {
      alert('Failed to refactor folders.');
    } finally {
      setIsRefactoring(false);
    }
  };

  const handleCheckConsistency = async () => {
    if (state.notes.length === 0) return;
    setIsCheckingConsistency(true);
    try {
      const conflicts = await checkConsistency(state.notes, state.gcm);
      setState(prev => ({
        ...prev,
        notes: prev.notes.map(n => {
          if (conflicts[n.id]) {
            return { ...n, consistencyConflict: conflicts[n.id] };
          }
          return { ...n, consistencyConflict: undefined };
        })
      }));
      
      const conflictCount = Object.keys(conflicts).length;
      if (conflictCount > 0) {
        alert(`Found ${conflictCount} consistency conflict(s). Check the red highlighted notes.`);
      } else {
        alert('No consistency conflicts found! Everything looks good.');
      }
    } catch (e) {
      alert('Failed to check consistency.');
    } finally {
      setIsCheckingConsistency(false);
    }
  };

  const handleUpdateNote = (updatedNote: Note) => {
    setState((prev) => ({
      ...prev,
      notes: prev.notes.map((n) => (n.id === updatedNote.id ? updatedNote : n)),
    }));
  };

  const handleTargetedUpdate = async (noteId: string, command: string) => {
    const targetNote = state.notes.find(n => n.id === noteId);
    if (!targetNote) return;

    try {
      const { updatedNote, updatedGcm, affectedNoteIds } = await updateSingleNote(
        targetNote,
        command,
        state.gcm,
        state.notes
      );

      setState(prev => ({
        ...prev,
        gcm: updatedGcm,
        notes: prev.notes.map(n => {
          if (n.id === noteId) return updatedNote;
          if (affectedNoteIds.includes(n.id)) {
            // Flag affected notes for user review
            return {
              ...n,
              consistencyConflict: {
                description: `This note might be affected by recent changes to "${updatedNote.title}".`,
                suggestion: "Please review this note to ensure it aligns with the updated GCM and logic."
              }
            };
          }
          return n;
        })
      }));
    } catch (e) {
      console.error(e);
      throw e;
    }
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
        <header className="bg-white border-b border-slate-200 p-4 shadow-sm z-10 flex flex-col gap-4">
          
          {/* Top Row: Input & Global Actions */}
          <div className="flex items-center justify-between">
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
              <div className="flex items-center gap-2 border-r border-slate-200 pr-4">
                <button
                  onClick={handleExport}
                  className="text-slate-600 hover:text-slate-900 p-2 rounded-md hover:bg-slate-100 transition-colors"
                  title="Export Project"
                >
                  <Download className="w-4 h-4" />
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-slate-600 hover:text-slate-900 p-2 rounded-md hover:bg-slate-100 transition-colors"
                  title="Import Project"
                >
                  <Upload className="w-4 h-4" />
                </button>
                <input
                  type="file"
                  accept=".json"
                  ref={fileInputRef}
                  onChange={handleImport}
                  className="hidden"
                />
              </div>
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
          </div>

          {/* Bottom Row: Tools */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleRefactorFolders}
              disabled={isRefactoring || state.notes.length === 0}
              className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {isRefactoring ? <Loader2 className="w-3 h-3 animate-spin" /> : <FolderTree className="w-3 h-3" />}
              Refactor Folders
            </button>
            <button
              onClick={handleCheckConsistency}
              disabled={isCheckingConsistency || state.notes.length === 0}
              className="bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
            >
              {isCheckingConsistency ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldAlert className="w-3 h-3" />}
              Check Consistency
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
            <NoteEditor 
              note={selectedNote} 
              onUpdateNote={handleUpdateNote} 
              onTargetedUpdate={handleTargetedUpdate}
            />
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
