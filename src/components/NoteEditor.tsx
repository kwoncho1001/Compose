import React, { useState, useEffect, useCallback } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Note } from '../types';
import { FileText, Code, Activity, AlertTriangle, Loader2, MessageSquare, Send, Edit3, Save, X, Layers, Trash2, FolderTree, Lightbulb, Eye, EyeOff, Merge } from 'lucide-react';
import { updateSpecFromCode, generateFixGuide, validateYamlMetadata, partialMerge } from '../services/gemini';
import { Button } from './common/Button';
import { Input } from './common/Input';
import { Dialog } from './common/Dialog';
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

const parseMetadata = (yaml: string) => {
  const meta: Record<string, string> = {};
  if (!yaml) return meta;
  yaml.split('\n').forEach(line => {
    const [key, ...val] = line.split(':');
    if (key && val.length > 0) {
      meta[key.trim()] = val.join(':').trim();
    }
  });
  return meta;
};

export const NoteEditor: React.FC<NoteEditorProps> = ({ note, allNotes, onUpdateNote, onTargetedUpdate, onGenerateSubModules, onDeleteNote, darkMode }) => {
  const [isResolving, setIsResolving] = useState(false);
  const [command, setCommand] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isGeneratingSub, setIsGeneratingSub] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [yamlErrors, setYamlErrors] = useState<string[]>([]);
  const [dialogConfig, setDialogConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'info' | 'warning' | 'error' | 'success';
    onConfirm: () => void;
  } | null>(null);

  const showAlert = (title: string, message: string, type: 'info' | 'warning' | 'error' | 'success' = 'info') => {
    setDialogConfig({
      isOpen: true,
      title,
      message,
      type,
      onConfirm: () => setDialogConfig(null)
    });
  };
  
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
      // Parse relatedNoteIds from YAML if possible
      const meta = parseMetadata(note.yamlMetadata);
      let relatedIdsFromYaml: string[] = [];
      if (meta && typeof meta.relatedNoteIds === 'string') {
        try {
          // Try to parse as array if it looks like one
          if (meta.relatedNoteIds.startsWith('[') && meta.relatedNoteIds.endsWith(']')) {
            relatedIdsFromYaml = meta.relatedNoteIds.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
          } else {
            relatedIdsFromYaml = meta.relatedNoteIds.split(',').map(s => s.trim()).filter(Boolean);
          }
        } catch (e) {
          console.error("Failed to parse relatedNoteIds from YAML", e);
        }
      }

      const combinedRelatedIds = Array.from(new Set([...(note.relatedNoteIds || []), ...relatedIdsFromYaml])).filter(id => 
        allNotes.some(n => n.id === id)
      );
      
      setEditData({
        title: note.title,
        folder: note.folder,
        content: note.content,
        summary: note.summary,
        yamlMetadata: note.yamlMetadata,
        relatedNoteIds: combinedRelatedIds
      });
    }
  }, [note?.id, allNotes]);

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

  const handleParentChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onUpdateNote({ ...note, parentNoteId: e.target.value || undefined });
  };

  const handleSaveManual = () => {
    // Sync relatedNoteIds from YAML before saving
    const meta = parseMetadata(editData.yamlMetadata);
    let relatedIdsFromYaml: string[] = [];
    if (meta && typeof meta.relatedNoteIds === 'string') {
      if (meta.relatedNoteIds.startsWith('[') && meta.relatedNoteIds.endsWith(']')) {
        relatedIdsFromYaml = meta.relatedNoteIds.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean);
      } else {
        relatedIdsFromYaml = meta.relatedNoteIds.split(',').map(s => s.trim()).filter(Boolean);
      }
    }

    onUpdateNote({
      ...note,
      ...editData,
      relatedNoteIds: relatedIdsFromYaml.length > 0 ? relatedIdsFromYaml : editData.relatedNoteIds
    });
    setIsEditing(false);
  };

  const handleCodeWins = async () => {
    if (!note.conflictInfo) return;
    setIsResolving(true);
    try {
      const newContent = await updateSpecFromCode(note.content, note.conflictInfo.fileContent);
      onUpdateNote({ ...note, content: newContent, status: 'Done', conflictInfo: undefined });
    } catch (e) {
      showAlert('오류', '내용 업데이트에 실패했습니다.', 'error');
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
      showAlert('오류', '가이드 생성에 실패했습니다.', 'error');
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
      showAlert('오류', '노트 업데이트에 실패했습니다.', 'error');
    } finally {
      setIsUpdating(false);
    }
  };

  const onContentChange = useCallback((value: string) => {
    setEditData(prev => ({ ...prev, content: value }));
  }, []);

  const onYamlChange = useCallback((value: string) => {
    setEditData(prev => ({ ...prev, yamlMetadata: value }));
    const validation = validateYamlMetadata(value);
    setYamlErrors(validation.errors);
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isEditing) {
        handleSaveManual();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, editData, note]);

  const handlePartialMerge = async () => {
    if (!note.conflictInfo) return;
    setIsResolving(true);
    try {
      const newContent = await partialMerge(note.content, note.conflictInfo.fileContent);
      onUpdateNote({ ...note, content: newContent, status: 'Done', conflictInfo: undefined });
    } catch (e) {
      showAlert('오류', '병합에 실패했습니다.', 'error');
    } finally {
      setIsResolving(false);
    }
  };

  return (
    <div className="flex-1 bg-white dark:bg-slate-950 overflow-y-auto p-8 border-r border-slate-200 dark:border-slate-800 flex flex-col relative">
      {dialogConfig && (
        <Dialog
          isOpen={dialogConfig.isOpen}
          title={dialogConfig.title}
          message={dialogConfig.message}
          type={dialogConfig.type}
          onConfirm={dialogConfig.onConfirm}
        />
      )}
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
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  setIsGeneratingSub(true);
                  await onGenerateSubModules(note);
                  setIsGeneratingSub(false);
                }}
                isLoading={isGeneratingSub}
                icon={<Layers className="w-4 h-4" />}
              >
                하위 모듈 생성
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveManual}
                icon={<Save className="w-4 h-4" />}
              >
                저장
              </Button>
              <button
                onClick={() => onDeleteNote(note.id)}
                className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all"
                title="노트 삭제"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-1" />
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-slate-500 dark:text-slate-400">상위:</span>
                <select
                  value={note.parentNoteId || ''}
                  onChange={handleParentChange}
                  className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm rounded-md focus:ring-indigo-500 focus:border-indigo-500 block p-2 max-w-[150px]"
                >
                  <option value="">없음</option>
                  {allNotes
                    .filter(n => n.id !== note.id)
                    .map(n => (
                      <option key={n.id} value={n.id}>{n.title}</option>
                    ))
                  }
                </select>
              </div>
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
                  <option value="Review-Required">검토 필요</option>
                  <option value="Deprecated">폐기됨</option>
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
                placeholder="폴더명 (예: 대분류/소분류)"
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
                <button
                  onClick={handlePartialMerge}
                  disabled={isResolving}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isResolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Merge className="w-4 h-4" />}
                  지능형 부분 병합 (AI 추천)
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
            {yamlErrors.length > 0 && <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">오류 {yamlErrors.length}</span>}
          </h2>
          <div className={`border rounded-lg overflow-hidden transition-all ${yamlErrors.length > 0 ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-200 dark:border-slate-800 focus-within:ring-2 focus-within:ring-indigo-500'}`}>
            <CodeMirror
              value={editData.yamlMetadata}
              height="150px"
              theme={darkMode ? vscodeDark : vscodeLight}
              extensions={[yaml()]}
              onChange={onYamlChange}
              className="text-xs"
            />
          </div>
          {yamlErrors.map((err, i) => (
            <p key={i} className="text-[10px] text-red-500 mt-1 ml-1">{err}</p>
          ))}
        </div>

        {/* Content (Obsidian-like Live Preview) */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">
              기능 및 기술 명세
            </h2>
            <div className="flex gap-2">
              {isEditing ? (
                <button
                  onClick={handleSaveManual}
                  className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                >
                  <Save className="w-3 h-3" /> 저장 (Esc)
                </button>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                >
                  <Edit3 className="w-3 h-3" /> 편집
                </button>
              )}
            </div>
          </div>
          
          <div className="min-h-[600px] relative group">
            {isEditing ? (
              <div className="border border-indigo-500 dark:border-indigo-400 rounded-xl overflow-hidden shadow-lg transition-all">
                <CodeMirror
                  value={editData.content}
                  height="600px"
                  theme={darkMode ? vscodeDark : vscodeLight}
                  extensions={[markdown({ base: markdownLanguage, codeLanguages: languages }), EditorView.lineWrapping]}
                  onChange={onContentChange}
                  autoFocus
                  className="text-sm"
                />
              </div>
            ) : (
              <div 
                onClick={() => setIsEditing(true)}
                className="border border-transparent hover:border-slate-200 dark:hover:border-slate-800 rounded-xl p-6 bg-slate-50/30 dark:bg-slate-900/30 cursor-text prose prose-indigo dark:prose-invert max-w-none transition-all"
              >
                <Markdown remarkPlugins={[[remarkGfm, { singleTilde: false }], remarkMath]} rehypePlugins={[rehypeKatex]}>
                  {editData.content || '*내용이 없습니다. 클릭하여 편집하세요.*'}
                </Markdown>
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
          <Input
            placeholder="e.g., '이 로직에 에러 핸들링 추가해줘'"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCommandSubmit()}
            disabled={isUpdating}
            className="flex-1"
          />
          <Button
            onClick={handleCommandSubmit}
            disabled={!command.trim()}
            isLoading={isUpdating}
            icon={<Send className="w-4 h-4" />}
          >
            업데이트
          </Button>
        </div>
      </div>
    </div>
  );
};
