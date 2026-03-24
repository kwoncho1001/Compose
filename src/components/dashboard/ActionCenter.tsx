import React, { useState } from 'react';
import { Sparkles, RefreshCw, CheckCircle2, Layers, Search, FileText } from 'lucide-react';

interface ActionCenterProps {
  isSyncing: boolean;
  onDecompose: (request: string) => void;
  onOptimize: () => void;
  onConsistencyCheck: () => void;
  onSuggestNextSteps: () => void;
  onAutoFixHierarchy: () => void;
}

export const ActionCenter: React.FC<ActionCenterProps> = ({
  isSyncing,
  onDecompose,
  onOptimize,
  onConsistencyCheck,
  onSuggestNextSteps,
  onAutoFixHierarchy
}) => {
  const [featureRequest, setFeatureRequest] = useState('');

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6">
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">AI 설계 도우미</h3>
        <div className="bg-neutral-50 dark:bg-neutral-900 rounded-lg p-3 border border-neutral-200 dark:border-neutral-700">
          <textarea
            value={featureRequest}
            onChange={(e) => setFeatureRequest(e.target.value)}
            placeholder="예: 사용자 로그인 및 비밀번호 찾기 기능을 추가해주세요."
            className="w-full h-24 bg-transparent border-none resize-none focus:ring-0 text-sm p-0 mb-2 placeholder-neutral-400"
            disabled={isSyncing}
          />
          <button
            onClick={() => onDecompose(featureRequest)}
            disabled={isSyncing || !featureRequest.trim()}
            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2 rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {isSyncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            요구사항 분해 및 설계
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider">아키텍처 관리</h3>
        <div className="space-y-2">
          <button
            onClick={onOptimize}
            disabled={isSyncing}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors text-left group"
          >
            <div className="p-2 rounded-md bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-medium">설계도 최적화</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">중복 제거 및 구조 개선</div>
            </div>
          </button>

          <button
            onClick={onConsistencyCheck}
            disabled={isSyncing}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors text-left group"
          >
            <div className="p-2 rounded-md bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 group-hover:scale-110 transition-transform">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-medium">일관성 검사</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">설계와 코드 간의 차이 분석</div>
            </div>
          </button>

          <button
            onClick={onSuggestNextSteps}
            disabled={isSyncing}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors text-left group"
          >
            <div className="p-2 rounded-md bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 group-hover:scale-110 transition-transform">
              <Search className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-medium">다음 작업 추천</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">우선순위 기반 작업 제안</div>
            </div>
          </button>

          <button
            onClick={onAutoFixHierarchy}
            disabled={isSyncing}
            className="w-full flex items-center gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-700 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors text-left group"
          >
            <div className="p-2 rounded-md bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 group-hover:scale-110 transition-transform">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-medium">계층 구조 자동 복구</div>
              <div className="text-xs text-neutral-500 dark:text-neutral-400">고립된 노트의 부모 자동 연결</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
};
