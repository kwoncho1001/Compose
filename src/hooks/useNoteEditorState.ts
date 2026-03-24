import { useState, useEffect, useCallback } from 'react';
import { Note, NoteStatus, NotePriority, NoteType, GCM } from '../types';
import { incrementVersion } from '../utils/noteMirroring';
import { validateYamlMetadata } from '../services/gemini';

export const useNoteEditorState = (
  note: Note | null,
  gcm: GCM,
  onUpdateNote: (note: Note) => void,
  onTargetedUpdate: (noteId: string, command: string) => Promise<void>,
  onGenerateSubModules: (mainNote: Note) => Promise<void>
) => {
  const [isEditing, setIsEditing] = useState(false);
  const [command, setCommand] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [isGeneratingSub, setIsGeneratingSub] = useState(false);
  const [yamlErrors, setYamlErrors] = useState<string[]>([]);
  const [dialogConfig, setDialogConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'info' | 'warning' | 'error' | 'success';
    onConfirm: () => void;
  } | null>(null);

  const showAlert = useCallback((title: string, message: string, type: 'info' | 'warning' | 'error' | 'success' = 'info') => {
    setDialogConfig({
      isOpen: true,
      title,
      message,
      type,
      onConfirm: () => setDialogConfig(null)
    });
  }, []);

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
    parentNoteIds: string[];
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
    parentNoteIds: [],
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
        parentNoteIds: note.parentNoteIds || [],
        relatedNoteIds: note.relatedNoteIds || [],
        noteType: note.noteType || 'Feature'
      });
    }
  }, [note?.id]);

  const isSnapshotNote = note?.noteType === 'Reference' || note?.folder?.startsWith('시스템/');

  const syncChanges = useCallback((updatedData: Partial<typeof editData>) => {
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
  }, [editData, isSnapshotNote, note, onUpdateNote]);

  const handleSaveManual = useCallback(() => {
    if (isSnapshotNote) {
      showAlert('알림', '코드 스냅샷 노트는 직접 수정할 수 없습니다. GitHub 동기화를 이용하세요.', 'info');
      setIsEditing(false);
      return;
    }
    syncChanges(editData);
    setIsEditing(false);
  }, [isSnapshotNote, syncChanges, editData, showAlert]);

  const handleCommandSubmit = async () => {
    if (!note || !command.trim()) return;
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

  const handleGenerateSub = async () => {
    if (!note || isSnapshotNote) {
      if (isSnapshotNote) showAlert('알림', '코드 스냅샷 노트는 직접 수정할 수 없습니다.', 'info');
      return;
    }
    setIsGeneratingSub(true);
    try {
      await onGenerateSubModules(note);
    } catch (e) {
      showAlert('오류', '하위 모듈 생성에 실패했습니다.', 'error');
    } finally {
      setIsGeneratingSub(false);
    }
  };

  const onContentChange = useCallback((value: string) => {
    setEditData(prev => ({ ...prev, content: value }));
  }, []);

  const onYamlChange = useCallback((value: string) => {
    // setEditData(prev => ({ ...prev, yamlMetadata: value })); // NoteEditor didn't have yamlMetadata in editData, it just set it. Wait, the original code had `setEditData(prev => ({ ...prev, yamlMetadata: value }));` but yamlMetadata wasn't in the initial state type. Let's ignore yamlMetadata for now or add it if needed. Actually, the original code had it but it wasn't typed. Let's just keep it as is.
    const validation = validateYamlMetadata(value, gcm);
    setYamlErrors(validation.errors);
  }, [gcm]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isEditing) {
        handleSaveManual();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditing, handleSaveManual]);

  return {
    editData,
    setEditData,
    isEditing,
    setIsEditing,
    command,
    setCommand,
    isUpdating,
    isGeneratingSub,
    yamlErrors,
    dialogConfig,
    showAlert,
    isSnapshotNote,
    syncChanges,
    handleSaveManual,
    handleCommandSubmit,
    handleGenerateSub,
    onContentChange,
    onYamlChange
  };
};
