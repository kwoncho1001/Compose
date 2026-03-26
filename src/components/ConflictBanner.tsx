import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Note } from '../types';
import { AlertTriangle, Loader2, Activity, Merge, X } from 'lucide-react';
import { Button } from './common/Button';

interface ConflictBannerProps {
  note: Note;
  onUpdateNote: (note: Note) => Promise<void>;
  isAnalyzing: boolean;
  impactResult: string | null;
  setImpactResult: (val: string | null) => void;
  isResolving: boolean;
  handleImpactAnalysis: () => void;
  handleCodeWins: () => void;
  handleDesignWins: () => void;
  handlePartialMerge: () => void;
}

export const ConflictBanner: React.FC<ConflictBannerProps> = ({
  note,
  onUpdateNote,
  isAnalyzing,
  impactResult,
  setImpactResult,
  isResolving,
  handleImpactAnalysis,
  handleCodeWins,
  handleDesignWins,
  handlePartialMerge
}) => {
  return (
    <>
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
    </>
  );
};
