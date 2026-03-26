import React, { useState } from 'react';
import { Cpu, Zap, Link, RefreshCw } from 'lucide-react';

interface SynthesisSidebarProps {
  onStart: (intent: string) => void;
  isSynthesizing: boolean;
}

export const SynthesisSidebar: React.FC<SynthesisSidebarProps> = ({ onStart, isSynthesizing }) => {
  const [intent, setIntent] = useState('');

  const handleStart = () => {
    if (!intent.trim() || isSynthesizing) return;
    onStart(intent);
    setIntent('');
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <Cpu className="w-5 h-5 text-indigo-500" />
        <h2 className="font-bold text-lg text-neutral-800 dark:text-neutral-100">자율 아키텍처 합성 (AAS)</h2>
      </div>

      <div className="bg-indigo-50/50 dark:bg-indigo-900/20 rounded-xl p-4 border border-indigo-200 dark:border-indigo-500/30">
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4 leading-relaxed">
          아이디어를 입력하면 AI가 전 세계 오픈소스의 정석(Best Practice)을 분석하여 우리 프로젝트용 설계도를 자율 생성합니다.
        </p>
        
        <div className="relative mb-4">
          <textarea 
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            placeholder="예: 실시간 채팅 및 알림 시스템 설계"
            className="w-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg p-3 text-sm outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all min-h-[100px] resize-none"
            disabled={isSynthesizing}
          />
        </div>

        <button 
          onClick={handleStart}
          disabled={!intent.trim() || isSynthesizing}
          className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-400 text-white rounded-lg py-3 text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-500/20"
        >
          {isSynthesizing ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Zap className="w-4 h-4" />
          )}
          {isSynthesizing ? '합성 진행 중...' : '합성 프로세스 시작'}
        </button>
      </div>

      <div className="space-y-4">
        <h3 className="text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">합성 프로세스 안내</h3>
        <div className="space-y-3">
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-[10px] font-bold text-indigo-600 dark:text-indigo-400 shrink-0">1</div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">자연어로 구현하고 싶은 시스템의 의도를 입력합니다.</p>
          </div>
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-[10px] font-bold text-indigo-600 dark:text-indigo-400 shrink-0">2</div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">AI가 제안하는 3~4개의 핵심 구현 경로 중 하나를 선택합니다.</p>
          </div>
          <div className="flex gap-3">
            <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-[10px] font-bold text-indigo-600 dark:text-indigo-400 shrink-0">3</div>
            <p className="text-xs text-neutral-600 dark:text-neutral-400">AI가 자율적으로 GitHub 검색, 코드 추출, 설계도 생성을 수행합니다.</p>
          </div>
        </div>
      </div>


    </div>
  );
};
