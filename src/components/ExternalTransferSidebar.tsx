import React from 'react';
import { Github, Loader2, Search, ChevronRight, X, Sparkles } from 'lucide-react';

interface ExternalTransferSidebarProps {
  externalSearchQuery: string;
  setExternalSearchQuery: (query: string) => void;
  externalRepos: { full_name: string; html_url: string; description: string }[];
  isSearchingExternal: boolean;
  handleSearchExternal: (query?: string) => void;
  selectedExternalRepo: string | null;
  setSelectedExternalRepo: (repo: string | null) => void;
  isAnalyzingRepo: boolean;
  repoFeatures: { id: number; title: string; description: string; relatedFiles: string[] }[];
  handleAnalyzeRepo: (repoUrl: string) => void;
  isTranspiling: boolean;
  handleTranspileFeature: (features: any[]) => void;
  setRepoFeatures: (features: any[]) => void;
  onClose: () => void;
  refinedGoals: string[];
  isRefiningGoals: boolean;
  handleRefineGoals: () => void;
  transferStep: 1 | 2 | 3 | 4;
  setTransferStep: (step: 1 | 2 | 3 | 4) => void;
  repoSummaries: Record<string, { nickname: string; summary: string; features: string }>;
  selectedFeatures: any[];
  setSelectedFeatures: (features: any[]) => void;
}

export const ExternalTransferSidebar: React.FC<ExternalTransferSidebarProps> = ({
  externalSearchQuery,
  setExternalSearchQuery,
  externalRepos,
  isSearchingExternal,
  handleSearchExternal,
  selectedExternalRepo,
  setSelectedExternalRepo,
  isAnalyzingRepo,
  repoFeatures,
  handleAnalyzeRepo,
  isTranspiling,
  handleTranspileFeature,
  setRepoFeatures,
  onClose,
  refinedGoals,
  isRefiningGoals,
  handleRefineGoals,
  transferStep,
  setTransferStep,
  repoSummaries,
  selectedFeatures,
  setSelectedFeatures
}) => {
  const toggleFeatureSelection = (feature: any) => {
    if (selectedFeatures.find(f => f.title === feature.title)) {
      setSelectedFeatures(selectedFeatures.filter(f => f.title !== feature.title));
    } else {
      setSelectedFeatures([...selectedFeatures, feature]);
    }
  };

  return (
    <div className="w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 h-full flex flex-col shadow-xl z-20 transition-colors duration-200">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/50">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 uppercase tracking-tight">
          <Github className="w-4 h-4 text-indigo-500" />
          외부 레퍼런스 선별 이식
        </h2>
        <button onClick={onClose} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md">
          <X className="w-4 h-4 text-slate-500" />
        </button>
      </div>

      {/* Step Indicator */}
      <div className="px-4 py-2 bg-slate-100 dark:bg-slate-800/50 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
        {[1, 2, 3, 4].map((step) => (
          <div key={step} className="flex items-center">
            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
              transferStep === step 
                ? 'bg-indigo-600 text-white' 
                : transferStep > step 
                  ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600' 
                  : 'bg-slate-200 dark:bg-slate-800 text-slate-400'
            }`}>
              {step}
            </div>
            {step < 4 && <div className={`w-8 h-[1px] mx-1 ${transferStep > step ? 'bg-indigo-200 dark:bg-indigo-900' : 'bg-slate-200 dark:bg-slate-800'}`} />}
          </div>
        ))}
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* STEP 1: Keyword & Refined Goals */}
        {transferStep === 1 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">1단계: 키워드 입력 및 목표 정제</label>
              <div className="flex gap-1">
                <input
                  type="text"
                  placeholder="예: '태블릿용 필기 공간'"
                  value={externalSearchQuery}
                  onChange={(e) => setExternalSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleRefineGoals()}
                  className="flex-1 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 rounded-md px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                />
                <button
                  onClick={handleRefineGoals}
                  disabled={isRefiningGoals || !externalSearchQuery.trim()}
                  className="p-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                  title="키워드 정제"
                >
                  {isRefiningGoals ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-400">입력한 키워드를 AI가 구체적인 검색 목표로 정제해줍니다.</p>
            </div>

            {refinedGoals.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">정제된 목표 중 하나를 선택하세요</div>
                <div className="space-y-1.5">
                  {refinedGoals.map((goal, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSearchExternal(goal)}
                      disabled={isSearchingExternal}
                      className="w-full text-left p-3 text-[11px] rounded-lg border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/30 dark:bg-indigo-900/10 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 transition-all flex items-start gap-2 group"
                    >
                      <div className="mt-0.5 flex-shrink-0">
                        {isSearchingExternal ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />}
                      </div>
                      <span>{goal}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* STEP 2: Repository Selection */}
        {transferStep === 2 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">2단계: 레포지토리 탐색</label>
              <button 
                onClick={() => setTransferStep(1)}
                className="text-[10px] text-indigo-500 hover:underline"
              >
                이전으로
              </button>
            </div>
            
            <div className="space-y-3">
              {externalRepos.map((repo, idx) => {
                const summaryData = repoSummaries[repo.full_name];
                return (
                  <button
                    key={repo.full_name}
                    onClick={() => handleAnalyzeRepo(`https://github.com/${repo.full_name}`)}
                    disabled={isAnalyzingRepo}
                    className="w-full text-left p-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-300 dark:hover:border-indigo-900 bg-white dark:bg-slate-900 hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10 transition-all group shadow-sm"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-indigo-600">
                        {idx + 1}. {repo.full_name} {summaryData?.nickname ? `(${summaryData.nickname})` : ''}
                      </div>
                      <Github className="w-3 h-3 text-slate-300 group-hover:text-indigo-400" />
                    </div>
                    <div className="p-2 rounded bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                      {summaryData ? (
                        <div className="space-y-1.5 text-[10px] text-indigo-600 dark:text-indigo-400 font-medium leading-relaxed">
                          <p><span className="font-bold text-indigo-700 dark:text-indigo-300">요약:</span> {summaryData.summary}</p>
                          <p><span className="font-bold text-indigo-700 dark:text-indigo-300">특징:</span> {summaryData.features}</p>
                        </div>
                      ) : (
                        <p className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium leading-relaxed">
                          분석 중...
                        </p>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 3: Feature Selection */}
        {transferStep === 3 && (
          <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">3단계: 핵심 기능 선별</label>
              <button 
                onClick={() => setTransferStep(2)}
                className="text-[10px] text-indigo-500 hover:underline"
              >
                이전으로
              </button>
            </div>

            {isAnalyzingRepo ? (
              <div className="flex flex-col items-center py-12 gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                <div className="text-center">
                  <p className="text-xs font-bold text-slate-600 dark:text-slate-300">레포지토리 분석 중...</p>
                  <p className="text-[10px] text-slate-400 mt-1">README 및 파일 구조를 파악하고 있습니다.</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-[10px] text-slate-500 mb-2">이식하고 싶은 기능을 선택하세요 (복수 선택 가능)</div>
                {repoFeatures.map(feature => {
                  const isSelected = selectedFeatures.find(f => f.title === feature.title);
                  return (
                    <div 
                      key={feature.title} 
                      onClick={() => toggleFeatureSelection(feature)}
                      className={`p-3 border rounded-xl cursor-pointer transition-all shadow-sm ${
                        isSelected 
                          ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20' 
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-300'
                      }`}
                    >
                      <div className="flex items-start gap-2">
                        <div className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                          isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 dark:border-slate-700'
                        }`}>
                          {isSelected && <ChevronRight className="w-3 h-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold text-slate-800 dark:text-slate-200 mb-1">{feature.title}</div>
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">{feature.description}</div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <button
                  onClick={() => handleTranspileFeature(selectedFeatures)}
                  disabled={selectedFeatures.length === 0 || isTranspiling}
                  className="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isTranspiling ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>선별 이식 진행 중...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>{selectedFeatures.length}개 기능 이식하기</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* STEP 4: Transpilation / Success */}
        {transferStep === 4 && (
          <div className="space-y-6 animate-in fade-in zoom-in duration-500 flex flex-col items-center justify-center py-12">
            <div className="relative">
              <div className="absolute inset-0 bg-indigo-500/20 blur-2xl rounded-full animate-pulse" />
              <div className="relative w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center shadow-2xl">
                {isTranspiling ? (
                  <Loader2 className="w-10 h-10 text-white animate-spin" />
                ) : (
                  <Sparkles className="w-10 h-10 text-white" />
                )}
              </div>
            </div>
            
            <div className="text-center space-y-2">
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                {isTranspiling ? '도메인 맞춤형 이식 진행 중' : '이식 완료!'}
              </h3>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 max-w-[200px] mx-auto leading-relaxed">
                {isTranspiling 
                  ? '선택한 기능의 로직을 분석하여 현재 프로젝트의 GCM 및 도메인 구조에 맞게 변환하고 있습니다.' 
                  : '선택한 기능들이 새로운 노트로 성공적으로 생성되었습니다. GCM 변수들도 함께 업데이트되었습니다.'}
              </p>
            </div>

            {!isTranspiling && (
              <button
                onClick={() => setTransferStep(1)}
                className="px-6 py-2 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-full text-[11px] font-bold hover:bg-slate-200 transition-colors"
              >
                처음으로 돌아가기
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
