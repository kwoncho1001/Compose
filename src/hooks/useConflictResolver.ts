import { useState } from 'react';
import { Note } from '../types';
import { updateSpecFromCode, generateFixGuide, partialMerge, generateImpactAnalysis } from '../services/gemini';

export const useConflictResolver = (
  note: Note | null,
  allNotes: Note[],
  onUpdateNote: (note: Note) => void,
  showAlert: (title: string, message: string, type: 'info' | 'warning' | 'error' | 'success') => void
) => {
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
      showAlert('오류', '분석에 실패했습니다.', 'error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleCodeWins = async () => {
    if (!note?.conflictInfo) return;
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
    if (!note?.conflictInfo) return;
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

  const handlePartialMerge = async () => {
    if (!note?.conflictInfo) return;
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

  return {
    isAnalyzing,
    impactResult,
    setImpactResult,
    isResolving,
    handleImpactAnalysis,
    handleCodeWins,
    handleDesignWins,
    handlePartialMerge
  };
};
