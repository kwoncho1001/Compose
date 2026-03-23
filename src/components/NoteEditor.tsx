import React, { useState, useEffect, useCallback } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Note, NoteType, GCM, NoteStatus, NotePriority } from '../types';
import { FileText, Code, Activity, AlertTriangle, Loader2, MessageSquare, Send, Edit3, Trash2, FolderTree, Lightbulb, Eye, EyeOff, Merge, ExternalLink, Hash, Clock, Star, Tag, Link2, ChevronRight, Info, Layers, X } from 'lucide-react';
import { updateSpecFromCode, generateFixGuide, validateYamlMetadata, partialMerge, generateImpactAnalysis } from '../services/gemini';
import { incrementVersion } from '../utils/noteMirroring';
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
  gcm: GCM;
  onUpdateNote: (note: Note) => void;
  onTargetedUpdate: (noteId: string, command: string) => Promise<void>;
  onGenerateSubModules: (mainNote: Note) => Promise<void>;
  onDeleteNote: (noteId: string) => void;
  darkMode: boolean;
}

const MetadataRow: React.FC<{ label: string; icon: React.ReactNode; children: React.ReactNode }> = ({ label, icon, children }) => (
  <div className="flex items-center px-4 py-2 border-b border-slate-200 dark:border-slate-800 last:border-b-0">
    <div className="w-24 flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
      {icon}
      {label}
    </div>
    <div className="flex-1">
      {children}
    </div>
  </div>
);

export const NoteEditor: React.FC<NoteEditorProps> = ({ note, allNotes, gcm, onUpdateNote, onTargetedUpdate, onGenerateSubModules, onDeleteNote, darkMode }) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [impactResult, setImpactResult] = useState<string | null>(null);
  const [isResolving, setIsResolving] = useState(false);

  const handleImpactAnalysis = async () => {
    if (!note) return;
    setIsAnalyzing(true);
    try {
      const result = await generateImpactAnalysis(note, allNotes);
      setImpactResult(result);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };
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
    status: NoteStatus;
    priority: NotePriority;
    version: string;
    importance: number;
    tags: string[];
    parentNoteId?: string;
    relatedNoteIds: string[];
    noteType: NoteType;
  }>({
    title: '',
    folder: '',
    content: '',
    summary: '',
    status: 'Planned',
    priority: 'C',
    version: '1.0.0',
    importance: 3,
    tags: [],
    relatedNoteIds: [],
    noteType: 'Feature'
  });

  useEffect(() => {
    if (note) {
      setEditData({
        title: note.title,
        folder: note.folder,
        content: note.content,
        summary: note.summary,
        status: note.status,
        priority: note.priority || 'C',
        version: note.version,
        importance: note.importance,
        tags: note.tags || [],
        parentNoteId: note.parentNoteId,
        relatedNoteIds: note.relatedNoteIds || [],
        noteType: note.noteType || 'Feature'
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

  const isSnapshotNote = note.noteType === 'Reference' || note.folder?.startsWith('시스템/');

  const handleStatusChange = (status: NoteStatus) => {
    if (isSnapshotNote) return;
    setEditData(prev => ({ ...prev, status }));
    syncChanges({ status });
  };

  const handleParentChange = (parentNoteId: string | undefined) => {
    if (isSnapshotNote) return;
    setEditData(prev => ({ ...prev, parentNoteId }));
    syncChanges({ parentNoteId });
  };

  const handleNoteTypeChange = (noteType: NoteType) => {
    if (isSnapshotNote) return;
    setEditData(prev => ({ ...prev, noteType }));
    syncChanges({ noteType });
  };

  const handleRelatedAdd = (relId: string) => {
    if (isSnapshotNote || editData.relatedNoteIds.includes(relId)) return;
    const newRelIds = [...editData.relatedNoteIds, relId];
    setEditData(prev => ({ ...prev, relatedNoteIds: newRelIds }));
    syncChanges({ relatedNoteIds: newRelIds });
  };

  const handleRelatedRemove = (relId: string) => {
    if (isSnapshotNote) return;
    const newRelIds = editData.relatedNoteIds.filter(id => id !== relId);
    setEditData(prev => ({ ...prev, relatedNoteIds: newRelIds }));
    syncChanges({ relatedNoteIds: newRelIds });
  };

  const syncChanges = (updatedData: Partial<typeof editData>) => {
    if (isSnapshotNote || !note) return;
    
    const finalData = { ...editData, ...updatedData };
    const newVersion = incrementVersion(note.version);
    const now = new Date().toISOString();
    
    onUpdateNote({
      ...note,
      ...finalData,
      version: newVersion,
      lastUpdated: now
    });
  };

  const handleSaveManual = () => {
    if (isSnapshotNote) {
      showAlert('알림', '코드 스냅샷 노트는 직접 수정할 수 없습니다. GitHub 동기화를 이용하세요.', 'info');
      setIsEditing(false);
      return;
    }
    syncChanges(editData);
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
    const validation = validateYamlMetadata(value, gcm);
    setYamlErrors(validation.errors);
    
    // If GCM errors exist, suggest conflict status
    if (validation.errors.some(e => e.includes('GCM 경고'))) {
      // We don't automatically set to Conflict here to avoid flickering, 
      // but we show the errors in the UI.
    }
  }, [gcm]);

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
        {/* --- Header: Title Only --- */}
        <div className="mb-4">
          <input
            type="text"
            value={editData.title}
            onChange={(e) => !isSnapshotNote && setEditData({ ...editData, title: e.target.value })}
            onBlur={() => syncChanges({ title: editData.title })}
            readOnly={isSnapshotNote}
            className={`text-4xl font-extrabold text-slate-900 dark:text-white border-b-2 border-transparent ${isSnapshotNote ? 'cursor-default' : 'hover:border-slate-100 focus:border-indigo-500'} bg-transparent focus:outline-none w-full transition-all py-2`}
            placeholder="노트 제목"
          />
        </div>

        {/* --- Action Menu Bar: Below Title --- */}
        <div className="mb-8 pb-6 border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (isSnapshotNote) {
                  showAlert('알림', '코드 스냅샷 노트는 직접 수정할 수 없습니다.', 'info');
                  return;
                }
                setIsGeneratingSub(true);
                await onGenerateSubModules(note);
                setIsGeneratingSub(false);
              }}
              disabled={isSnapshotNote}
              isLoading={isGeneratingSub}
              icon={<Layers className="w-4 h-4" />}
            >
              하위 모듈 생성
            </Button>

            <div className="h-6 w-px bg-slate-200 dark:bg-slate-800 mx-1" />

            {isSnapshotNote && (
              <span className="px-2 py-1 text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 rounded border border-slate-200 dark:border-slate-700 tracking-wider">
                READ ONLY
              </span>
            )}

            <button
              onClick={() => onDeleteNote(note.id)}
              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-all ml-auto"
              title="노트 삭제"
            >
              <Trash2 className="w-4 h-4" />
            </button>
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
        {note.status === 'Conflict' && (
          <div className="mb-8 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-lg p-5">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-semibold mb-2">
              <AlertTriangle className="w-5 h-5" />
              {note.conflictInfo ? `구현 충돌: ${note.conflictInfo.filePath}` : '설계 충돌 감지됨'}
            </div>
            <p className="text-sm text-red-600 dark:text-red-300 mb-4">
              {note.conflictInfo ? note.conflictInfo.reason : '이 설계 노트는 현재 프로젝트의 다른 부분 또는 실제 코드와 정합성이 맞지 않습니다.'}
            </p>
            
            <div className="flex flex-wrap gap-2 mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={handleImpactAnalysis}
                disabled={isAnalyzing}
                className="border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40"
              >
                {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Activity className="w-4 h-4 mr-2" />}
                수정 필요 파일 분석
              </Button>
              {note.conflictInfo && !note.conflictInfo.guide && (
                <>
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
                </>
              )}
            </div>

            {impactResult && (
              <div className="mt-4 p-4 bg-white dark:bg-slate-900 rounded-lg border border-red-100 dark:border-red-800/30 shadow-inner relative">
                <button 
                  onClick={() => setImpactResult(null)} 
                  className="absolute top-2 right-2 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
                <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">AI 분석: 수정 필요 파일 및 로직</h4>
                <div className="prose prose-sm dark:prose-invert max-w-none text-xs">
                  <Markdown remarkPlugins={[remarkGfm]}>{impactResult}</Markdown>
                </div>
              </div>
            )}
            
            {note.conflictInfo?.guide && (
              <div className="bg-white dark:bg-slate-900 border border-red-100 dark:border-red-900/30 rounded p-4 mt-4">
                <h4 className="font-semibold text-slate-800 dark:text-slate-200 mb-2">구현 보정 가이드:</h4>
                <div className="prose prose-sm dark:prose-invert max-w-none">
                  <Markdown remarkPlugins={[[remarkGfm, { singleTilde: false }], remarkMath]} rehypePlugins={[rehypeKatex]}>{note.conflictInfo.guide}</Markdown>
                </div>
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
            onChange={(e) => !isSnapshotNote && setEditData({ ...editData, summary: e.target.value })}
            onBlur={() => syncChanges({ summary: editData.summary })}
            readOnly={isSnapshotNote}
            className={`w-full border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 dark:text-white rounded-lg p-3 text-sm focus:outline-none ${isSnapshotNote ? 'cursor-default' : 'focus:ring-2 focus:ring-indigo-500'} h-20 transition-all`}
            placeholder="이 기능에 대한 간단한 요약..."
          />
        </div>

        {/* Structured Metadata Table */}
        <div className="mb-8 bg-slate-50/50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Activity className="w-3.5 h-3.5" />
              구조화된 메타데이터
            </h3>
            <span className="text-[10px] text-slate-400 font-mono">ID: {note.id}</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2">
            {/* Left Column: 폴더 -> 상태 -> 버전 -> 최종수정 */}
            <div className="border-r border-slate-200 dark:border-slate-800">
              <MetadataRow label="폴더" icon={<FolderTree className="w-3 h-3" />}>
                <input
                  type="text"
                  value={editData.folder}
                  onChange={(e) => !isSnapshotNote && setEditData({ ...editData, folder: e.target.value })}
                  onBlur={() => syncChanges({ folder: editData.folder })}
                  readOnly={isSnapshotNote}
                  className="w-full bg-transparent text-xs focus:outline-none text-slate-700 dark:text-slate-300"
                  placeholder="도메인/경로"
                />
              </MetadataRow>

              <MetadataRow label="상태" icon={<Activity className="w-3 h-3" />}>
                <select
                  value={editData.status}
                  onChange={(e) => handleStatusChange(e.target.value as NoteStatus)}
                  className="w-full bg-transparent text-xs focus:outline-none text-slate-700 dark:text-slate-300"
                >
                  <option value="Planned">Planned</option>
                  <option value="In-Progress">In-Progress</option>
                  <option value="Done">Done</option>
                  <option value="Conflict">Conflict</option>
                  <option value="Review-Required">Review-Required</option>
                  <option value="Deprecated">Deprecated</option>
                </select>
              </MetadataRow>

              <MetadataRow label="우선순위" icon={<Star className="w-3 h-3" />}>
                <select
                  value={editData.priority}
                  onChange={(e) => {
                    const val = e.target.value as NotePriority;
                    setEditData(prev => ({ ...prev, priority: val }));
                    syncChanges({ priority: val });
                  }}
                  className="w-full bg-transparent text-xs font-bold text-indigo-600 dark:text-indigo-400 focus:outline-none"
                >
                  <option value="A">A - 즉시 구현 (라면 끓이기)</option>
                  <option value="B">B - 순차 구현</option>
                  <option value="C">C - 추후 구현 (라면 먹기)</option>
                  <option value="Done">Done - 완료</option>
                </select>
              </MetadataRow>

              <MetadataRow label="버전" icon={<Hash className="w-3 h-3" />}>
                <input
                  type="text"
                  value={editData.version}
                  readOnly
                  className="w-full bg-transparent text-xs text-slate-500"
                />
              </MetadataRow>

              <MetadataRow label="최종 수정" icon={<Clock className="w-3 h-3" />}>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {new Date(note.lastUpdated).toLocaleString()}
                </span>
              </MetadataRow>
            </div>

            {/* Right Column: 유형 -> 태그 -> 연관 노트 -> 상위 노트 -> 하위 노트 */}
            <div>
              <MetadataRow label="유형" icon={<Layers className="w-3 h-3" />}>
                <select
                  value={editData.noteType}
                  onChange={(e) => handleNoteTypeChange(e.target.value as NoteType)}
                  disabled={isSnapshotNote}
                  className="w-full bg-transparent text-xs focus:outline-none text-slate-700 dark:text-slate-300 disabled:opacity-50"
                >
                  <option value="Epic">Epic</option>
                  <option value="Feature">Feature</option>
                  <option value="Task">Task</option>
                  <option value="Reference">Reference</option>
                </select>
              </MetadataRow>

              <MetadataRow label="태그" icon={<Tag className="w-3 h-3" />}>
                <input
                  type="text"
                  value={editData.tags.join(', ')}
                  onChange={(e) => {
                    const tags = e.target.value.split(',').map(t => t.trim()).filter(Boolean);
                    setEditData(prev => ({ ...prev, tags }));
                  }}
                  onBlur={() => syncChanges({ tags: editData.tags })}
                  readOnly={isSnapshotNote}
                  className="w-full bg-transparent text-xs focus:outline-none text-slate-700 dark:text-slate-300"
                  placeholder="UI, Login, Firebase..."
                />
              </MetadataRow>

              <MetadataRow label="연관 노트" icon={<Link2 className="w-3 h-3" />}>
                <div className="flex flex-wrap gap-1 mb-1">
                  {editData.relatedNoteIds.map(relId => {
                    const rel = allNotes.find(n => n.id === relId);
                    return (
                      <span key={relId} className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-900/30 text-[10px] rounded flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                        {rel?.title || '...'}
                        <X className="w-2 h-2 cursor-pointer" onClick={() => handleRelatedRemove(relId)} />
                      </span>
                    );
                  })}
                </div>
                <select 
                  onChange={(e) => e.target.value && handleRelatedAdd(e.target.value)}
                  className="w-full bg-transparent text-[10px] text-slate-400 focus:outline-none"
                >
                  <option value="">+ 연관 노트 추가</option>
                  {allNotes.filter(n => n.id !== note.id && !editData.relatedNoteIds.includes(n.id)).map(n => (
                    <option key={n.id} value={n.id}>{n.title}</option>
                  ))}
                </select>
              </MetadataRow>

              <MetadataRow label="상위 노트" icon={<ChevronRight className="w-3 h-3" />}>
                <select
                  value={editData.parentNoteId || ''}
                  onChange={(e) => handleParentChange(e.target.value || undefined)}
                  className="w-full bg-transparent text-xs focus:outline-none text-slate-700 dark:text-slate-300"
                >
                  <option value="">없음</option>
                  {allNotes.filter(n => n.id !== note.id).map(n => (
                    <option key={n.id} value={n.id}>{n.title}</option>
                  ))}
                </select>
              </MetadataRow>

              <MetadataRow label="하위 노트" icon={<Layers className="w-3 h-3" />}>
                <div className="flex flex-wrap gap-1">
                  {note.childNoteIds.length > 0 ? (
                    note.childNoteIds.map(childId => {
                      const child = allNotes.find(n => n.id === childId);
                      return (
                        <span key={childId} className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 text-[10px] rounded text-slate-600 dark:text-slate-400">
                          {child?.title || '...'}
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-[10px] text-slate-400 italic">없음</span>
                  )}
                </div>
              </MetadataRow>
            </div>
          </div>
        </div>

        {/* Content (Obsidian-like Live Preview) */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">
            <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">
              기능 및 기술 명세
            </h2>
            <div className="flex gap-2">
              {isEditing ? (
                <div className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-medium">
                  <Edit3 className="w-3 h-3" /> 편집 중... (Esc로 완료)
                </div>
              ) : (
                <button
                  onClick={() => {
                    if (isSnapshotNote) {
                      showAlert('알림', '코드 스냅샷 노트는 직접 수정할 수 없습니다.', 'info');
                      return;
                    }
                    setIsEditing(true);
                  }}
                  className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors ${isSnapshotNote ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Edit3 className="w-3 h-3" /> 편집
                </button>
              )}
            </div>
          </div>
          
          <div className="min-h-[600px] relative group">
            {isEditing ? (
              <div 
                className="border border-indigo-500 dark:border-indigo-400 rounded-xl overflow-hidden shadow-lg transition-all"
                onBlur={() => handleSaveManual()}
              >
                <CodeMirror
                  value={editData.content}
                  height="600px"
                  theme={darkMode ? vscodeDark : vscodeLight}
                  extensions={[markdown({ base: markdownLanguage, codeLanguages: languages }), EditorView.lineWrapping]}
                  onChange={(val) => !isSnapshotNote && onContentChange(val)}
                  readOnly={isSnapshotNote}
                  autoFocus
                  className="text-sm"
                />
              </div>
            ) : (
              <div 
                onClick={() => {
                  if (isSnapshotNote) {
                    showAlert('알림', '코드 스냅샷 노트는 직접 수정할 수 없습니다.', 'info');
                    return;
                  }
                  setIsEditing(true);
                }}
                className={`border border-transparent ${isSnapshotNote ? 'cursor-default' : 'hover:border-slate-200 dark:hover:border-slate-800 cursor-text'} rounded-xl p-6 bg-slate-50/30 dark:bg-slate-900/30 prose prose-indigo dark:prose-invert max-w-none transition-all`}
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
