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
  handleTranspileFeature: (feature: any) => void;
  setRepoFeatures: (features: any[]) => void;
  onClose: () => void;
  refinedGoals: string[];
  isRefiningGoals: boolean;
  handleRefineGoals: () => void;
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
  handleRefineGoals
}) => {
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
      
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="space-y-4">
          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            GitHub에서 관련 레퍼런스를 찾아 필요한 핵심 로직만 선택적으로 현재 프로젝트에 이식합니다.
          </p>
          
          {!selectedExternalRepo ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex gap-1">
                  <input
                    type="text"
                    placeholder="레퍼런스 검색 (예: 'tablet drawing')"
                    value={externalSearchQuery}
                    onChange={(e) => setExternalSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRefineGoals()}
                    className="flex-1 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 rounded-md px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-indigo-500 dark:text-white"
                  />
                  <button
                    onClick={handleRefineGoals}
                    disabled={isRefiningGoals || !externalSearchQuery.trim()}
                    className="p-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
                    title="키워드 정제 및 검색 목표 생성"
                  >
                    {isRefiningGoals ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400">키워드를 입력하고 반짝이 아이콘을 눌러 검색 목표를 정제해보세요.</p>
              </div>

              {/* Refined Goals Selection */}
              {refinedGoals.length > 0 && (
                <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">정제된 검색 목표 선택</div>
                  <div className="space-y-1.5">
                    {refinedGoals.map((goal, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleSearchExternal(goal)}
                        className="w-full text-left p-2.5 text-[11px] rounded-lg border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/30 dark:bg-indigo-900/10 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 transition-all flex items-start gap-2 group"
                      >
                        <ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <span>{goal}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              {isSearchingExternal && (
                <div className="flex flex-col items-center py-8 gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                  <p className="text-[10px] text-slate-400">GitHub 레포지토리 탐색 중...</p>
                </div>
              )}

              {externalRepos.length > 0 && !isSearchingExternal && (
                <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1 animate-in fade-in duration-300">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">검색 결과</div>
                  {externalRepos.map(repo => (
                    <button
                      key={repo.full_name}
                      onClick={() => handleAnalyzeRepo(`https://github.com/${repo.full_name}`)}
                      className="w-full text-left p-3 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 group transition-all hover:border-indigo-200 dark:hover:border-indigo-900"
                    >
                      <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300 group-hover:text-indigo-600 truncate mb-1">{repo.full_name}</div>
                      <div className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">{repo.description || '설명이 없습니다.'}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-indigo-50 dark:bg-indigo-900/20 p-3 rounded-lg border border-indigo-100 dark:border-indigo-800/50">
                <div className="flex flex-col min-w-0">
                  <div className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">선택된 레포지토리</div>
                  <div className="text-xs font-bold text-indigo-700 dark:text-indigo-300 truncate">
                    {selectedExternalRepo.replace('https://github.com/', '')}
                  </div>
                </div>
                <button 
                  onClick={() => { setSelectedExternalRepo(null); setRepoFeatures([]); }} 
                  className="p-1.5 text-indigo-400 hover:text-indigo-600 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-md transition-colors"
                  title="다른 레포지토리 선택"
                >
                  <X className="w-4 h-4" />
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
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">추출된 핵심 기능</div>
                  {repoFeatures.length > 0 ? (
                    repoFeatures.map(feature => (
                      <div key={feature.id} className="p-3 border border-slate-100 dark:border-slate-800 rounded-lg bg-white dark:bg-slate-900/50 hover:border-indigo-200 dark:hover:border-indigo-800 transition-all shadow-sm">
                        <div className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-1">{feature.title}</div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-3 leading-relaxed">{feature.description}</div>
                        <button
                          onClick={() => handleTranspileFeature(feature)}
                          disabled={isTranspiling}
                          className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-md text-[11px] font-bold flex items-center justify-center gap-2 transition-all shadow-sm disabled:opacity-50"
                        >
                          {isTranspiling ? <Loader2 className="w-3 h-3 animate-spin" /> : <ChevronRight className="w-3 h-3" />}
                          선별 이식 실행
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 bg-slate-50 dark:bg-slate-950 rounded-lg border border-slate-100 dark:border-slate-800">
                      <Sparkles className="w-6 h-6 text-slate-200 dark:text-slate-800 mx-auto mb-2" />
                      <p className="text-[10px] text-slate-400">분석된 기능이 없습니다.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
