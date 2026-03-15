import React, { useState, useEffect, useCallback } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Note } from '../types';
import { FileText, Code, Activity, AlertTriangle, Loader2, MessageSquare, Send, Edit3, Save, X, Layers, Trash2, FolderTree, Lightbulb, Eye, EyeOff } from 'lucide-react';
import { updateSpecFromCode, generateFixGuide } from '../services/gemini';
import CodeMirror from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode';
import { yaml } from '@codemirror/lang-yaml';
import { EditorView } from '@codemirror/view';

interface NoteEditorProps {
  note: Note | null;
  allNotes: Note[];
  onUpdateNote: (note: Note) => void;
  onTargetedUpdate: (noteId: string, command: string) => Promise<void>;
  onGenerateSubModules: (mainNote: Note) => Promise<void>;
  onDeleteNote: (noteId: string) => void;
  darkMode: boolean;
}

export const NoteEditor: React.FC<NoteEditorProps> = ({ note, allNotes, onUpdateNote, onTargetedUpdate, onGenerateSubModules, onDeleteNote, darkMode }) => {
  const [isResolving, setIsResolving] = useState(false);
  const [command, setCommand] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isGeneratingSub, setIsGeneratingSub] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  
  // Local state for manual editing
  const [editData, setEditData] = useState<{
    title: string;
    folder: string;
    content: string;
    summary: string;
    yamlMetadata: string;
    relatedNoteIds: string[];
  }>({
    title: '',
    folder: '',
    content: '',
    summary: '',
    yamlMetadata: '',
    relatedNoteIds: []
  });

  useEffect(() => {
    if (note) {
      setEditData({
        title: note.title,
        folder: note.folder,
        content: note.content,
        summary: note.summary,
        yamlMetadata: note.yamlMetadata,
        relatedNoteIds: note.relatedNoteIds || []
      });
    }
  }, [note?.id]);

  if (!note) {
    return (
      <div className="flex-1 flex items-center justify-center bg-white dark:bg-slate-950 text-slate-400 transition-colors duration-200">
        <div className="text-center">
          <FileText className="w-12 h-12 mx-auto mb-4 text-slate-300" />
          <p>상세 내용을 보려면 노트를 선택하세요</p>
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
  };

  const handleCodeWins = async () => {
    if (!note.conflictInfo) return;
    setIsResolving(true);
    try {
      const newContent = await updateSpecFromCode(note.content, note.conflictInfo.fileContent);
      onUpdateNote({ ...note, content: newContent, status: 'Done', conflictInfo: undefined });
    } catch (e) {
      alert('내용 업데이트에 실패했습니다.');
    } finally {
      setIsResolving(false);
    }
  };

  const handleDesignWins = async () => {
    if (!note.conflictInfo) return;
    setIsResolving(true);
    try {
      const guide = await generateFixGuide(note.content, note.conflictInfo.fileContent);
      onUpdateNote({ ...note, conflictInfo: { ...note.conflictInfo, guide } });
    } catch (e) {
      alert('가이드 생성에 실패했습니다.');
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
      alert('노트 업데이트에 실패했습니다.');
    } finally {
      setIsUpdating(false);
    }
  };

  const onContentChange = useCallback((value: string) => {
    setEditData(prev => ({ ...prev, content: value }));
  }, []);

  const onYamlChange = useCallback((value: string) => {
    setEditData(prev => ({ ...prev, yamlMetadata: value }));
  }, []);

  return (
    <div className="flex-1 bg-white dark:bg-slate-950 overflow-y-auto p-8 border-r border-slate-200 dark:border-slate-800 flex flex-col">
      <div className="max-w-3xl mx-auto w-full flex-1">
        {/* Header */}
        <div className="mb-8 pb-6 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1">
              <input
                type="text"
                value={editData.title}
                onChange={(e) => setEditData({ ...editData, title: e.target.value })}
                className="text-3xl font-bold text-slate-900 dark:text-white border-b border-transparent hover:border-slate-200 focus:border-indigo-500 bg-transparent focus:outline-none w-full transition-colors"
                placeholder="노트 제목"
              />
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  setIsGeneratingSub(true);
                  await onGenerateSubModules(note);
                  setIsGeneratingSub(false);
                }}
                disabled={isGeneratingSub}
                className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 px-3 py-1.5 rounded-md text-sm font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors disabled:opacity-50"
              >
                {isGeneratingSub ? <Loader2 className="w-4 h-4 animate-spin" /> : <Layers className="w-4 h-4" />}
                하위 모듈 생성
              </button>
              <button
                onClick={handleSaveManual}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors"
              >
                <Save className="w-4 h-4" /> 저장
              </button>
              <button
                onClick={() => onDeleteNote(note.id)}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all"
                title="노트 삭제"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-1" />
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">상태:</span>
                <select
                  value={note.status}
                  onChange={handleStatusChange}
                  className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm rounded-md focus:ring-indigo-500 focus:border-indigo-500 block p-2"
                >
                  <option value="Planned">계획됨</option>
                  <option value="In-Progress">진행 중</option>
                  <option value="Done">완료</option>
                  <option value="Conflict">충돌</option>
                </select>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-sm text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1">
              <FolderTree className="w-4 h-4" />
              <input
                type="text"
                value={editData.folder}
                onChange={(e) => setEditData({ ...editData, folder: e.target.value })}
                className="border-b border-transparent hover:border-slate-200 focus:border-indigo-500 bg-transparent focus:outline-none transition-colors"
                placeholder="폴더명"
              />
            </span>
            {note.parentNoteId && (
              <span className="flex items-center gap-1">
                <Layers className="w-4 h-4" />
                상위: {allNotes.find(n => n.id === note.parentNoteId)?.title || '알 수 없음'}
              </span>
            )}
            {note.githubLink && (
              <a
                href={note.githubLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                <Code className="w-4 h-4" />
                코드 보기
              </a>
            )}
          </div>
        </div>

        {/* Consistency Conflict Banner */}
        {note.consistencyConflict && (
          <div className="mb-8 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800/50 rounded-lg p-5">
            <div className="flex items-center gap-2 text-orange-700 dark:text-orange-400 font-semibold mb-2">
              <AlertTriangle className="w-5 h-5" />
              정합성 충돌
            </div>
            <p className="text-sm text-orange-800 dark:text-orange-300 mb-2 font-medium">{note.consistencyConflict.description}</p>
            <div className="bg-white dark:bg-slate-900 border border-orange-100 dark:border-orange-900/30 rounded p-3 text-sm text-orange-700 dark:text-orange-400">
              <strong>해결 제안:</strong> {note.consistencyConflict.suggestion}
            </div>
            <button
              onClick={() => onUpdateNote({ ...note, consistencyConflict: undefined })}
              className="mt-3 text-xs text-orange-600 dark:text-orange-500 hover:text-orange-800 dark:hover:text-orange-400 underline"
            >
              닫기
            </button>
          </div>
        )}

        {/* Implementation Conflict Banner */}
        {note.status === 'Conflict' && note.conflictInfo && (
          <div className="mb-8 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg p-5">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-semibold mb-2">
              <AlertTriangle className="w-5 h-5" />
              구현 충돌: {note.conflictInfo.filePath}
            </div>
            <p className="text-sm text-red-600 dark:text-red-300 mb-4">{note.conflictInfo.reason}</p>
            
            {note.conflictInfo.guide ? (
              <div className="bg-white dark:bg-slate-900 border border-red-100 dark:border-red-900/30 rounded p-4 mb-4">
                <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">구현 보정 가이드:</h4>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <Markdown remarkPlugins={[[remarkGfm, { singleTilde: false }], remarkMath]} rehypePlugins={[rehypeKatex]}>{note.conflictInfo.guide}</Markdown>
                </div>
              </div>
            ) : (
              <div className="flex gap-3">
                <button
                  onClick={handleCodeWins}
                  disabled={isResolving}
                  className="bg-white dark:bg-slate-800 border border-red-200 dark:border-red-800/50 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-700 dark:text-red-400 px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
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

        {/* Summary */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
            <Lightbulb className="w-4 h-4" />
            요약
          </h2>
          <textarea
            value={editData.summary}
            onChange={(e) => setEditData({ ...editData, summary: e.target.value })}
            className="w-full border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 dark:text-white rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 h-20 transition-all"
            placeholder="이 기능에 대한 간단한 요약..."
          />
        </div>

        {/* YAML Metadata */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            메타데이터 (YAML)
          </h2>
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 transition-all">
            <CodeMirror
              value={editData.yamlMetadata}
              height="150px"
              theme={darkMode ? vscodeDark : vscodeLight}
              extensions={[yaml()]}
              onChange={onYamlChange}
              className="text-xs"
            />
          </div>
        </div>

        {/* Related Notes (Graph Connections) */}
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
            <Layers className="w-4 h-4" />
            연관 노트 (마인드맵 연결)
          </h2>
          <div className="flex flex-wrap gap-2 mb-3">
            {editData.relatedNoteIds.map(id => {
              const relNote = allNotes.find(n => n.id === id);
              return (
                <div key={id} className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800 px-3 py-1.5 rounded-full text-xs text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  <span>{relNote?.title || '알 수 없음'}</span>
                  <button 
                    onClick={() => setEditData(prev => ({ ...prev, relatedNoteIds: prev.relatedNoteIds.filter(rid => rid !== id) }))}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
          </div>
          <select
            onChange={(e) => {
              const id = e.target.value;
              if (id && !editData.relatedNoteIds.includes(id)) {
                setEditData(prev => ({ ...prev, relatedNoteIds: [...prev.relatedNoteIds, id] }));
              }
              e.target.value = "";
            }}
            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 text-sm rounded-lg p-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">연관 노트 추가...</option>
            {allNotes
              .filter(n => n.id !== note.id && !editData.relatedNoteIds.includes(n.id))
              .map(n => (
                <option key={n.id} value={n.id}>{n.title} ({n.folder})</option>
              ))
            }
          </select>
        </div>

        {/* Content (Merged User View & AI Spec) */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">
              기능 및 기술 명세
            </h2>
            <button
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center gap-2 text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-3 py-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              {showPreview ? (
                <>
                  <Edit3 className="w-3 h-3" /> 편집 모드
                </>
              ) : (
                <>
                  <Eye className="w-3 h-3" /> 미리보기
                </>
              )}
            </button>
          </div>
          
          <div className="relative group">
            {showPreview ? (
              <div className="prose prose-slate dark:prose-invert max-w-none prose-pre:bg-slate-900 prose-pre:text-slate-300 min-h-[500px] p-6 bg-slate-50/30 dark:bg-slate-900/30 rounded-xl border border-slate-100 dark:border-slate-800/50">
                <Markdown remarkPlugins={[[remarkGfm, { singleTilde: false }], remarkMath]} rehypePlugins={[rehypeKatex]}>{editData.content}</Markdown>
              </div>
            ) : (
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 transition-all">
                <CodeMirror
                  value={editData.content}
                  height="600px"
                  theme={darkMode ? vscodeDark : vscodeLight}
                  extensions={[
                    markdown({ base: markdownLanguage, codeLanguages: languages }),
                    EditorView.lineWrapping
                  ]}
                  onChange={onContentChange}
                  className="text-sm"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Targeted Command Input */}
      <div className="max-w-3xl mx-auto w-full mt-auto pt-6 border-t border-slate-200 dark:border-slate-800 sticky bottom-0 bg-white dark:bg-slate-950 pb-4">
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-indigo-500" />
          집중 업데이트 (이 노트만 집중 업데이트)
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g., '이 로직에 에러 핸들링 추가해줘'"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCommandSubmit()}
            disabled={isUpdating}
            className="flex-1 border border-slate-300 dark:border-slate-700 bg-transparent dark:text-white rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            onClick={handleCommandSubmit}
            disabled={isUpdating || !command.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 disabled:opacity-50 transition-colors"
          >
            {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            업데이트
          </button>
        </div>
      </div>
    </div>
  );
};
