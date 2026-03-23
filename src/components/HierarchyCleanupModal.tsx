import React, { useState, useEffect } from 'react';
import { Note, NoteType } from '../types';
import { suggestOrCreateParent } from '../services/gemini';
import { Modal } from './common/Modal';
import { Button } from './common/Button';
import { Loader2, AlertTriangle, CheckCircle2, Plus, Link as LinkIcon } from 'lucide-react';

interface HierarchyCleanupModalProps {
  isOpen: boolean;
  onClose: () => void;
  invalidNotes: Note[];
  allNotes: Note[];
  onApply: (newNotes: Note[], updatedNotes: Note[]) => void;
}

interface Suggestion {
  orphanNoteId: string;
  action: 'match' | 'create';
  parentId?: string;
  newNote?: Partial<Note>;
  status: 'pending' | 'loading' | 'completed' | 'error';
}

const HierarchyCleanupModal: React.FC<HierarchyCleanupModalProps> = ({
  isOpen,
  onClose,
  invalidNotes,
  allNotes,
  onApply,
}) => {
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion>>({});
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    if (isOpen && invalidNotes.length > 0) {
      const initialSuggestions: Record<string, Suggestion> = {};
      invalidNotes.forEach(note => {
        initialSuggestions[note.id] = {
          orphanNoteId: note.id,
          action: 'match',
          status: 'pending'
        };
      });
      setSuggestions(initialSuggestions);
    }
  }, [isOpen, invalidNotes]);

  const generateSuggestions = async () => {
    setIsProcessing(true);
    const newSuggestions = { ...suggestions };

    for (const note of invalidNotes) {
      if (newSuggestions[note.id].status === 'completed') continue;

      newSuggestions[note.id].status = 'loading';
      setSuggestions({ ...newSuggestions });

      try {
        const candidateType = note.noteType === 'Task' ? 'Feature' : 'Epic';
        const candidateParents = allNotes.filter(n => n.noteType === candidateType);
        
        const result = await suggestOrCreateParent(note, candidateParents);
        
        newSuggestions[note.id] = {
          ...newSuggestions[note.id],
          ...result,
          status: 'completed'
        };
      } catch (error) {
        console.error(`Error generating suggestion for ${note.title}:`, error);
        newSuggestions[note.id].status = 'error';
      }
      setSuggestions({ ...newSuggestions });
    }
    setIsProcessing(false);
  };

  const handleApply = () => {
    const newNotes: Note[] = [];
    const updatedNotes: Note[] = [];
    const tempAllNotes = [...allNotes];

    Object.values(suggestions).forEach(suggestion => {
      if (suggestion.status !== 'completed') return;

      const orphanNote = tempAllNotes.find(n => n.id === suggestion.orphanNoteId);
      if (!orphanNote) return;

      let parentId = suggestion.parentId;

      if (suggestion.action === 'create' && suggestion.newNote) {
        const newParent: Note = {
          id: Math.random().toString(36).substr(2, 9),
          title: suggestion.newNote.title || 'New Parent',
          content: suggestion.newNote.content || '',
          summary: suggestion.newNote.summary || '',
          noteType: suggestion.newNote.noteType as NoteType,
          folder: suggestion.newNote.folder || orphanNote.folder,
          parentNoteIds: [],
          childNoteIds: [orphanNote.id],
          relatedNoteIds: [],
          status: 'Planned',
          priority: 'B',
          version: '1.0.0',
          lastUpdated: new Date().toISOString(),
          importance: 3,
          tags: []
        };
        newNotes.push(newParent);
        tempAllNotes.push(newParent);
        parentId = newParent.id;
      }

      if (parentId) {
        const updatedOrphan = {
          ...orphanNote,
          parentNoteIds: Array.from(new Set([...orphanNote.parentNoteIds, parentId]))
        };
        updatedNotes.push(updatedOrphan);
        
        // Update parent's childNoteIds if it's an existing note
        const existingParent = tempAllNotes.find(n => n.id === parentId);
        if (existingParent && !newNotes.find(n => n.id === parentId)) {
          const updatedParent = {
            ...existingParent,
            childNoteIds: Array.from(new Set([...existingParent.childNoteIds, orphanNote.id]))
          };
          updatedNotes.push(updatedParent);
        }
      }
    });

    onApply(newNotes, updatedNotes);
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="계층 구조 자동 최적화">
      <div className="space-y-4 max-h-[70vh] overflow-y-auto p-1">
        <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-800">
            부모가 없거나 계층 규칙에 어긋나는 {invalidNotes.length}개의 노트를 발견했습니다. 
            AI가 적절한 부모를 찾거나 새로 생성해 드립니다.
          </p>
        </div>

        <div className="space-y-2">
          {invalidNotes.map(note => {
            const suggestion = suggestions[note.id];
            return (
              <div key={note.id} className="border rounded-lg p-3 bg-white shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${
                      note.noteType === 'Epic' ? 'bg-purple-100 text-purple-700' :
                      note.noteType === 'Feature' ? 'bg-blue-100 text-blue-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {note.noteType}
                    </span>
                    <h4 className="font-medium text-sm truncate max-w-[200px]">{note.title}</h4>
                  </div>
                  {suggestion?.status === 'loading' && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                  {suggestion?.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                </div>

                {suggestion?.status === 'completed' && (
                  <div className="mt-2 text-xs bg-slate-50 p-2 rounded border border-dashed border-slate-300">
                    {suggestion.action === 'match' ? (
                      <div className="flex items-center gap-2 text-slate-600">
                        <LinkIcon className="w-3 h-3" />
                        <span>기존 부모 매칭: <strong>{allNotes.find(n => n.id === suggestion.parentId)?.title}</strong></span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-blue-600">
                        <Plus className="w-3 h-3" />
                        <span>새 부모 생성: <strong>{suggestion.newNote?.title}</strong></span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>취소</Button>
        {Object.values(suggestions).some(s => s.status === 'completed') ? (
          <Button onClick={handleApply} disabled={isProcessing}>변경사항 적용</Button>
        ) : (
          <Button onClick={generateSuggestions} disabled={isProcessing}>
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            AI 분석 시작
          </Button>
        )}
      </div>
    </Modal>
  );
};

export default HierarchyCleanupModal;
