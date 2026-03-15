import React, { useState, useEffect } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Note } from '../types';
import { FileText, Code, Activity, AlertTriangle, Loader2, MessageSquare, Send, Edit3, Save, X, Layers, Trash2 } from 'lucide-react';
import { updateSpecFromCode, generateFixGuide } from '../services/gemini';

interface NoteEditorProps {
  note: Note | null;
  onUpdateNote: (note: Note) => void;
  onTargetedUpdate: (noteId: string, command: string) => Promise<void>;
  onGenerateSubModules: (mainNote: Note) => Promise<void>;
  onDeleteNote: (noteId: string) => void;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({ note, onUpdateNote, onTargetedUpdate, onGenerateSubModules, onDeleteNote }) => {
  const [isResolving, setIsResolving] = useState(false);
  const [command, setCommand] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isGeneratingSub, setIsGeneratingSub] = useState(false);
  
  // Local state for manual editing
  const [editData, setEditData] = useState({
    title: '',
    folder: '',
    userView: '',
    aiSpec: '',
    yamlMetadata: ''
  });

  useEffect(() => {
    if (note) {
      setEditData({
        title: note.title,
        folder: note.folder,
        userView: note.userView,
        aiSpec: note.aiSpec,
        yamlMetadata: note.yamlMetadata
      });
      setIsEditMode(false);
    }
  }, [note?.id]);

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

  const handleSaveManual = () => {
    onUpdateNote({
      ...note,
      ...editData
    });
    setIsEditMode(false);
  };

  const handleCodeWins = async () => {
    if (!note.conflictInfo) return;
    setIsResolving(true);
    try {
      const newSpec = await updateSpecFromCode(note.aiSpec, note.conflictInfo.fileContent);
      onUpdateNote({ ...note, aiSpec: newSpec, status: 'Done', conflictInfo: undefined });
    } catch (e) {
      alert('Failed to update spec.');
    } finally {
      setIsResolving(false);
    }
  };

  const handleDesignWins = async () => {
    if (!note.conflictInfo) return;
    setIsResolving(true);
    try {
      const guide = await generateFixGuide(note.aiSpec, note.conflictInfo.fileContent);
      onUpdateNote({ ...note, conflictInfo: { ...note.conflictInfo, guide } });
    } catch (e) {
      alert('Failed to generate guide.');
    } finally {
      setIsResolving(false);
    }
  };

  const handleCommandSubmit = async () => {
    if (!command.trim()) return;
    setIsUpdating(true);
    try {
      await onTargetedUpdate(note.id, command);
      setCommand('');
    } catch (e) {
      alert('Failed to update note.');
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="flex-1 bg-white overflow-y-auto p-8 border-r border-slate-200 flex flex-col">
      <div className="max-w-3xl mx-auto w-full flex-1">
        {/* Header */}
        <div className="mb-8 pb-6 border-b border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1">
              {isEditMode ? (
                <input
                  type="text"
                  value={editData.title}
                  onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                  className="text-3xl font-bold text-slate-900 border-b border-indigo-300 focus:outline-none w-full"
                />
              ) : (
                <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
                  {note.title}
                  {note.isMainFeature && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs bg-amber-100 text-amber-800 px-2 py-1 rounded-full font-medium">
                        Main Feature
                      </span>
                      <button
                        onClick={async () => {
                          setIsGeneratingSub(true);
                          await onGenerateSubModules(note);
                          setIsGeneratingSub(false);
                        }}
                        disabled={isGeneratingSub}
                        className="flex items-center gap-1 text-[10px] bg-indigo-50 text-indigo-600 px-2 py-1 rounded-full font-bold hover:bg-indigo-100 transition-colors disabled:opacity-50"
                        title="하위 모듈 자동 생성 (Step 2)"
                      >
                        {isGeneratingSub ? <Loader2 className="w-3 h-3 animate-spin" /> : <Layers className="w-3 h-3" />}
                        GENERATE SUB-MODULES
                      </button>
                    </div>
                  )}
                </h1>
              )}
            </div>
            <div className="flex items-center gap-3">
              {isEditMode ? (
                <>
                  <button
                    onClick={handleSaveManual}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                  >
                    <Save className="w-4 h-4" /> Save
                  </button>
                  <button
                    onClick={() => setIsEditMode(false)}
                    className="flex items-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                  >
                    <X className="w-4 h-4" /> Cancel
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => onDeleteNote(note.id)}
                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all"
                    title="Delete Note"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setIsEditMode(true)}
                    className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
                  >
                    <Edit3 className="w-4 h-4" /> Edit
                  </button>
                </>
              )}
              <div className="h-6 w-px bg-slate-200 mx-1" />
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
                  <option value="Conflict">Conflict</option>
                </select>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-500">
            <span className="flex items-center gap-1">
              <FileText className="w-4 h-4" />
              {isEditMode ? (
                <input
                  type="text"
                  value={editData.folder}
                  onChange={(e) => setEditData({ ...editData, folder: e.target.value })}
                  className="border-b border-slate-300 focus:outline-none"
                />
              ) : (
                note.folder
              )}
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

        {/* Consistency Conflict Banner */}
        {note.consistencyConflict && (
          <div className="mb-8 bg-orange-50 border border-orange-200 rounded-lg p-5">
            <div className="flex items-center gap-2 text-orange-700 font-semibold mb-2">
              <AlertTriangle className="w-5 h-5" />
              정합성 충돌 (Consistency Conflict)
            </div>
            <p className="text-sm text-orange-800 mb-2 font-medium">{note.consistencyConflict.description}</p>
            <div className="bg-white border border-orange-100 rounded p-3 text-sm text-orange-700">
              <strong>해결 제안:</strong> {note.consistencyConflict.suggestion}
            </div>
            <button
              onClick={() => onUpdateNote({ ...note, consistencyConflict: undefined })}
              className="mt-3 text-xs text-orange-600 hover:text-orange-800 underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Implementation Conflict Banner */}
        {note.status === 'Conflict' && note.conflictInfo && (
          <div className="mb-8 bg-red-50 border border-red-200 rounded-lg p-5">
            <div className="flex items-center gap-2 text-red-700 font-semibold mb-2">
              <AlertTriangle className="w-5 h-5" />
              구현 충돌 (Implementation Conflict): {note.conflictInfo.filePath}
            </div>
            <p className="text-sm text-red-600 mb-4">{note.conflictInfo.reason}</p>
            
            {note.conflictInfo.guide ? (
              <div className="bg-white border border-red-100 rounded p-4 mb-4">
                <h4 className="font-semibold text-slate-800 mb-2">구현 보정 가이드 (Implementation Guide):</h4>
                <div className="prose prose-sm max-w-none">
                  <Markdown remarkPlugins={[remarkGfm]}>{note.conflictInfo.guide}</Markdown>
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={handleCodeWins}
                  disabled={isResolving}
                  className="bg-white border border-red-200 hover:bg-red-50 text-red-700 px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isResolving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  코드가 맞습니다 (설계 업데이트)
                </button>
                <button
                  onClick={handleDesignWins}
                  disabled={isResolving}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isResolving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  설계가 맞습니다 (수정 가이드 생성)
                </button>
              </div>
            )}
          </div>
        )}

        {/* YAML Metadata */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Metadata (YAML)
          </h2>
          {isEditMode ? (
            <textarea
              value={editData.yamlMetadata}
              onChange={(e) => setEditData({ ...editData, yamlMetadata: e.target.value })}
              className="w-full bg-slate-900 text-slate-300 p-4 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 h-32"
            />
          ) : (
            <pre className="bg-slate-900 text-slate-300 p-4 rounded-lg text-sm font-mono overflow-x-auto">
              {note.yamlMetadata}
            </pre>
          )}
        </div>

        {/* User View */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-2">
            친절한 기능 설명 (User View)
          </h2>
          {isEditMode ? (
            <textarea
              value={editData.userView}
              onChange={(e) => setEditData({ ...editData, userView: e.target.value })}
              className="w-full border border-slate-300 rounded-lg p-4 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 h-64"
            />
          ) : (
            <div className="prose prose-slate max-w-none">
              <Markdown remarkPlugins={[remarkGfm]}>{note.userView}</Markdown>
            </div>
          )}
        </div>

        {/* AI Spec */}
        <div className="mb-12">
          <h2 className="text-xl font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-2">
            수석 아키텍트 기술 명세 (AI Spec)
          </h2>
          {isEditMode ? (
            <textarea
              value={editData.aiSpec}
              onChange={(e) => setEditData({ ...editData, aiSpec: e.target.value })}
              className="w-full border border-slate-300 rounded-lg p-4 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 h-96"
            />
          ) : (
            <div className="prose prose-slate max-w-none prose-pre:bg-slate-900 prose-pre:text-slate-300">
              <Markdown remarkPlugins={[remarkGfm]}>{note.aiSpec}</Markdown>
            </div>
          )}
        </div>
      </div>

      {/* Targeted Command Input */}
      <div className="max-w-3xl mx-auto w-full mt-auto pt-6 border-t border-slate-200 sticky bottom-0 bg-white pb-4">
        <label className="block text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-indigo-500" />
          Targeted Command (이 노트만 집중 업데이트)
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g., '이 로직에 에러 핸들링 추가해줘'"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCommandSubmit()}
            disabled={isUpdating}
            className="flex-1 border border-slate-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={handleCommandSubmit}
            disabled={isUpdating || !command.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
          >
            {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Update
          </button>
        </div>
      </div>
    </div>
  );
};
