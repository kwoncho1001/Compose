import React, { useState, useEffect, useCallback } from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  type User 
} from 'firebase/auth';
import { 
  collection, 
  getDocs, 
} from 'firebase/firestore';
import { auth, firestore } from './lib/firebase';
import { db, type LocalNote } from './lib/db';
import { useSync } from './hooks/useSync';
import { 
  Plus, 
  Save, 
  RefreshCw, 
  FileText, 
  Folder, 
  CheckCircle2, 
  AlertCircle,
  LogOut,
  ChevronRight,
  Search,
  CloudDownload,
  Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import LZString from 'lz-string';

const googleProvider = new GoogleAuthProvider();

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [projectId, setProjectId] = useState<string>('default-project');
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isNoteLoading, setIsNoteLoading] = useState(false);
  
  const { 
    isSyncing, 
    lastSyncTime, 
    sync, 
    initializeFromRegistry, 
    fetchNoteContent, 
    updateNoteLocally 
  } = useSync(projectId);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        // Step 1: Initialization (New Device / Re-execution)
        // Instead of fetching all notes, we fetch the registry first
        handleInitialization();
      }
    });
    return unsubscribe;
  }, [projectId]);

  const handleInitialization = async () => {
    await initializeFromRegistry();
    loadLocalNotes();
  };

  const loadLocalNotes = async () => {
    const allNotes = await db.notes.toArray();
    setNotes(allNotes);
  };

  const handleSelectNote = async (id: string) => {
    setActiveNoteId(id);
    const note = notes.find(n => n.id === id);
    if (note && !note.hasContent) {
      // Step 2: Lazy Loading - Fetch content on demand
      setIsNoteLoading(true);
      await fetchNoteContent(id);
      await loadLocalNotes();
      setIsNoteLoading(false);
    }
  };

  const handleCreateNote = async () => {
    const id = crypto.randomUUID();
    const newNote: LocalNote = {
      id,
      title: 'Untitled Note',
      folder: 'General',
      content: '',
      summary: '',
      noteType: 'Task',
      status: 'Draft',
      lastUpdated: new Date().toISOString(),
      yamlMetadata: '',
      sha: '',
      isDirty: true,
      hasContent: true // New notes have content locally
    };
    await db.notes.add(newNote);
    await loadLocalNotes();
    setActiveNoteId(id);
  };

  const handleUpdateNote = async (id: string, updates: Partial<LocalNote>) => {
    await updateNoteLocally({ id, ...updates });
    await loadLocalNotes();
  };

  const login = () => {
    signInWithPopup(auth, googleProvider);
  };

  const logout = () => {
    auth.signOut();
  };

  const activeNote = notes.find(n => n.id === activeNoteId);
  const filteredNotes = notes.filter(n => 
    n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    n.content.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-[#141414] border border-[#222] rounded-2xl p-8 text-center"
        >
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <FileText className="text-white w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-white mb-2">SHA-Sync Notes</h1>
          <p className="text-gray-400 mb-8">Efficient, secure, and fast synchronization for your design notes.</p>
          <button 
            onClick={login}
            className="w-full bg-white text-black font-semibold py-3 rounded-xl hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
          >
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-gray-300 font-sans overflow-hidden">
      {/* Sidebar */}
      <div className="w-72 border-r border-[#222] flex flex-col bg-[#0f0f0f]">
        <div className="p-4 border-bottom border-[#222] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <FileText className="text-white w-4 h-4" />
            </div>
            <span className="font-bold text-white">SHA-Sync</span>
          </div>
          <button onClick={logout} className="p-2 hover:bg-[#222] rounded-lg text-gray-500 hover:text-white transition-colors">
            <LogOut size={18} />
          </button>
        </div>

        <div className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
            <input 
              type="text"
              placeholder="Search notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#1a1a1a] border border-[#222] rounded-lg py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 space-y-1">
          <button 
            onClick={handleCreateNote}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors mb-4"
          >
            <Plus size={16} />
            <span>New Note</span>
          </button>

          {filteredNotes.map(note => (
            <button
              key={note.id}
              onClick={() => handleSelectNote(note.id)}
              className={`w-full text-left px-3 py-2 rounded-lg transition-all group ${
                activeNoteId === note.id ? 'bg-[#222] text-white' : 'hover:bg-[#1a1a1a]'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium truncate flex-1">{note.title || 'Untitled'}</span>
                <div className="flex items-center gap-1">
                  {note.isDirty && (
                    <div className="w-2 h-2 bg-blue-500 rounded-full" title="Sync pending" />
                  )}
                  {!note.hasContent && (
                    <div title="Content not downloaded">
                      <CloudDownload size={10} className="text-gray-600" />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between text-[10px] text-gray-500 uppercase tracking-wider">
                <div className="flex items-center gap-2">
                  <Folder size={10} />
                  <span>{note.folder}</span>
                </div>
                {note.lastUpdated && (
                  <div className="flex items-center gap-1">
                    <Clock size={10} />
                    <span>{new Date(note.lastUpdated).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-[#222] bg-[#0a0a0a]">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-2">
              {isSyncing ? (
                <RefreshCw size={12} className="animate-spin text-blue-500" />
              ) : (
                <CheckCircle2 size={12} className="text-green-500" />
              )}
              <span>{isSyncing ? 'Syncing...' : 'Synced'}</span>
            </div>
            {lastSyncTime && (
              <span>{lastSyncTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            )}
          </div>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col bg-[#0a0a0a]">
        {activeNote ? (
          <>
            <div className="h-16 border-b border-[#222] flex items-center justify-between px-6 bg-[#0f0f0f]">
              <div className="flex items-center gap-4">
                <input 
                  type="text"
                  value={activeNote.title}
                  onChange={(e) => handleUpdateNote(activeNote.id, { title: e.target.value })}
                  className="bg-transparent text-xl font-bold text-white focus:outline-none border-none p-0"
                  placeholder="Note Title"
                />
                <div className="h-4 w-[1px] bg-[#222]" />
                <select 
                  value={activeNote.folder}
                  onChange={(e) => handleUpdateNote(activeNote.id, { folder: e.target.value })}
                  className="bg-transparent text-xs text-gray-500 uppercase tracking-widest focus:outline-none cursor-pointer hover:text-white transition-colors"
                >
                  <option value="General">General</option>
                  <option value="Features">Features</option>
                  <option value="Bugs">Bugs</option>
                  <option value="Ideas">Ideas</option>
                </select>
              </div>
              <div className="flex items-center gap-3">
                <button 
                  onClick={sync}
                  disabled={isSyncing}
                  className="p-2 text-gray-500 hover:text-white hover:bg-[#222] rounded-lg transition-all"
                  title="Manual Sync"
                >
                  <RefreshCw size={20} className={isSyncing ? 'animate-spin' : ''} />
                </button>
                <button 
                  onClick={() => handleUpdateNote(activeNote.id, {})}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors flex items-center gap-2"
                >
                  <Save size={16} />
                  <span>Save</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 max-w-4xl mx-auto w-full relative">
              <AnimatePresence>
                {isNoteLoading && (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 bg-[#0a0a0a]/80 z-10 flex flex-col items-center justify-center gap-4"
                  >
                    <RefreshCw size={32} className="animate-spin text-blue-500" />
                    <p className="text-gray-400 font-medium">Downloading content...</p>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="grid grid-cols-3 gap-6 mb-8">
                <div className="bg-[#141414] border border-[#222] p-4 rounded-xl">
                  <span className="text-[10px] uppercase tracking-widest text-gray-500 block mb-2">Type</span>
                  <select 
                    value={activeNote.noteType}
                    onChange={(e) => handleUpdateNote(activeNote.id, { noteType: e.target.value as any })}
                    className="w-full bg-transparent text-sm font-medium focus:outline-none"
                  >
                    <option value="Epic">Epic</option>
                    <option value="Feature">Feature</option>
                    <option value="Task">Task</option>
                    <option value="Reference">Reference</option>
                  </select>
                </div>
                <div className="bg-[#141414] border border-[#222] p-4 rounded-xl">
                  <span className="text-[10px] uppercase tracking-widest text-gray-500 block mb-2">Status</span>
                  <select 
                    value={activeNote.status}
                    onChange={(e) => handleUpdateNote(activeNote.id, { status: e.target.value })}
                    className="w-full bg-transparent text-sm font-medium focus:outline-none"
                  >
                    <option value="Draft">Draft</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Review">Review</option>
                    <option value="Completed">Completed</option>
                  </select>
                </div>
                <div className="bg-[#141414] border border-[#222] p-4 rounded-xl">
                  <span className="text-[10px] uppercase tracking-widest text-gray-500 block mb-2">SHA Fingerprint</span>
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-blue-500" />
                    <span className="text-[10px] font-mono text-gray-500 truncate">{activeNote.sha || 'Generating...'}</span>
                  </div>
                </div>
              </div>

              <textarea 
                value={activeNote.content}
                onChange={(e) => handleUpdateNote(activeNote.id, { content: e.target.value })}
                placeholder="Start writing your note..."
                className="w-full h-[calc(100vh-400px)] bg-transparent text-gray-200 resize-none focus:outline-none text-lg leading-relaxed placeholder:text-gray-700"
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <div className="w-24 h-24 bg-[#141414] border border-[#222] rounded-3xl flex items-center justify-center mb-6">
              <FileText className="text-gray-700 w-10 h-10" />
            </div>
            <h2 className="text-xl font-bold text-white mb-2">Select a note to edit</h2>
            <p className="text-gray-500 max-w-xs">Choose a note from the sidebar or create a new one to get started with SHA-Sync.</p>
          </div>
        )}
      </div>
    </div>
  );
}
