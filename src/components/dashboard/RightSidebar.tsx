import React from 'react';
import { Sparkles, Trash2, X, Layers, MessageSquare, Send, Loader2, Github, Lightbulb, FileUp, CheckCircle2, ShieldAlert } from 'lucide-react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { AppState } from '../../types';

interface RightSidebarProps {
  activeSidebarTab: 'tools' | 'chat';
  setActiveSidebarTab: (tab: 'tools' | 'chat') => void;
  handleClearChat: () => void;
  setRightSidebarOpen: (open: boolean) => void;
  featureInput: string;
  setFeatureInput: (input: string) => void;
  handleDecompose: (input: string, setInput: React.Dispatch<React.SetStateAction<string>>) => Promise<void>;
  isDecomposing: boolean;
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  syncProject: (data: Partial<AppState>) => void;
  handleSyncGithub: () => void;
  isSyncing: boolean;
  handleWipeSnapshots: () => void;
  handleOptimizeBlueprint: () => void;
  handleCheckConsistency: () => void;
  handleEnforceHierarchy: () => void;
  handleSanitizeIntegrity: (silent?: boolean) => void;
  handleAnalyzeNextSteps: () => void;
  textFileInputRef: React.RefObject<HTMLInputElement>;
  handleTextFileUpload: (e: React.ChangeEvent<HTMLInputElement>, ref: React.RefObject<HTMLInputElement>) => void;
  nextStepSuggestion: string | null;
  chatInput: string;
  setChatInput: (input: string) => void;
  handleChat: () => void;
  isChatting: boolean;
  chatEndRef: React.RefObject<HTMLDivElement>;
  onInteractiveAction?: (messageId: string, selected: string[]) => void;
}

export const RightSidebar: React.FC<RightSidebarProps> = ({
  activeSidebarTab,
  setActiveSidebarTab,
  handleClearChat,
  setRightSidebarOpen,
  featureInput,
  setFeatureInput,
  handleDecompose,
  isDecomposing,
  state,
  setState,
  syncProject,
  handleSyncGithub,
  isSyncing,
  handleWipeSnapshots,
  handleOptimizeBlueprint,
  handleCheckConsistency,
  handleEnforceHierarchy,
  handleSanitizeIntegrity,
  handleAnalyzeNextSteps,
  textFileInputRef,
  handleTextFileUpload,
  nextStepSuggestion,
  chatInput,
  setChatInput,
  handleChat,
  isChatting,
  chatEndRef,
  onInteractiveAction
}) => {
  return (
    <div className="w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 h-full flex flex-col shadow-xl z-20 transition-colors duration-200">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950/50">
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2 uppercase tracking-tight">
          <Sparkles className="w-4 h-4 text-amber-500" />
          {activeSidebarTab === 'tools' ? '프로젝트 제어 및 분석' : '프로젝트 지식 가이드'}
        </h2>
        <div className="flex items-center gap-1">
          {activeSidebarTab === 'chat' && (state.chatMessages?.length || 0) > 0 && (
            <button 
              onClick={handleClearChat} 
              className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md text-slate-500 hover:text-rose-500 transition-colors"
              title="대화 내역 삭제"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={() => setRightSidebarOpen(false)} className="p-1 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-md">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
      </div>

      {/* 탭 메뉴 */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setActiveSidebarTab('tools')}
          className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-colors ${activeSidebarTab === 'tools' ? 'text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900 border-b-2 border-indigo-600 dark:border-indigo-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
        >
          <Layers className="w-3 h-3" />
          도구
        </button>
        <button
          onClick={() => setActiveSidebarTab('chat')}
          className={`flex-1 py-2 text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-colors ${activeSidebarTab === 'chat' ? 'text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-900 border-b-2 border-indigo-600 dark:border-indigo-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
        >
          <MessageSquare className="w-3 h-3" />
          챗
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto">
        {activeSidebarTab === 'tools' ? (
          <div className="p-4 space-y-6">
            {/* 섹션 1: 기능 설계 도구 */}
            <div className="space-y-3">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">기능 설계</h3>
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="설계할 기능을 입력하세요 (예: 로그인 기능 추가)"
                  value={featureInput}
                  onChange={(e) => setFeatureInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleDecompose(featureInput, setFeatureInput)}
                  className="w-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 rounded-md px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                />
                <button
                  onClick={() => handleDecompose(featureInput, setFeatureInput)}
                  disabled={isDecomposing || !featureInput.trim()}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-md text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm"
                >
                  {isDecomposing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                  기능 분해 실행
                </button>
              </div>
            </div>

            {/* 섹션 2: Github 코드 대조 및 통합 */}
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Github 코드 대조 및 통합</h3>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Github Repo URL"
                  value={state.githubRepo}
                  onChange={(e) => {
                    const val = e.target.value;
                    setState(prev => ({ ...prev, githubRepo: val }));
                    syncProject({ githubRepo: val });
                  }}
                  className="w-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 rounded-md px-3 py-1.5 text-[11px] dark:text-white"
                />
                <input
                  type="password"
                  placeholder="Github PAT (선택 사항)"
                  value={state.githubToken}
                  onChange={(e) => {
                    const val = e.target.value;
                    setState(prev => ({ ...prev, githubToken: val }));
                    syncProject({ githubToken: val });
                  }}
                  className="w-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 rounded-md px-3 py-1.5 text-[11px] dark:text-white"
                />
                
                {state.lastSyncedAt && (
                  <div className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded-md border border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] text-slate-400 font-medium uppercase">최근 동기화</span>
                      <span className="text-[10px] text-slate-500">{new Date(state.lastSyncedAt).toLocaleString()}</span>
                    </div>
                    {state.lastSyncedSha && (
                      <div className="text-[9px] text-slate-400 font-mono truncate">
                        SHA: {state.lastSyncedSha}
                      </div>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleSyncGithub()}
                    disabled={isSyncing}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-md text-[11px] font-bold flex items-center justify-center gap-2 transition-all"
                    title="변경된 파일만 분석하여 코드 스냅샷을 업데이트합니다."
                  >
                    {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Github className="w-3 h-3" />}
                    최신 코드 반영
                  </button>
                  <button
                    onClick={() => handleWipeSnapshots()}
                    disabled={isSyncing}
                    className="bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 py-2 rounded-md text-[11px] font-bold flex items-center justify-center gap-2 transition-all"
                    title="GitHub에서 가져온 모든 코드 스냅샷을 삭제합니다."
                  >
                    <Trash2 className="w-3 h-3" />
                    스냅샷 초기화
                  </button>
                </div>
              </div>
            </div>

            {/* 섹션 3: 분석 도구 모음 */}
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">설계 최적화 및 분석</h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={handleOptimizeBlueprint}
                  disabled={isSyncing || state.notes.length === 0}
                  className="col-span-1 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 py-2.5 rounded-md text-[10px] font-bold border border-indigo-100 dark:border-indigo-800/50 flex items-center justify-center gap-1 shadow-sm"
                >
                  {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} 설계도 최적화
                </button>
                <button
                  onClick={handleCheckConsistency}
                  disabled={isSyncing || state.notes.length === 0}
                  className="col-span-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 py-2.5 rounded-md text-[10px] font-bold border border-emerald-100 dark:border-emerald-800/50 flex items-center justify-center gap-1 shadow-sm"
                >
                  {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldAlert className="w-3 h-3" />} 일관성 검증
                </button>
                <button
                  onClick={() => handleEnforceHierarchy()}
                  disabled={isSyncing || state.notes.length === 0}
                  className="col-span-2 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 py-2.5 rounded-md text-[10px] font-bold border border-amber-100 dark:border-amber-800/50 flex items-center justify-center gap-1.5 shadow-sm"
                >
                  {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Layers className="w-3 h-3" />} 계층 구조 자동 보정 (고아 노트 해결)
                </button>
                <button
                  onClick={() => handleSanitizeIntegrity(false)}
                  disabled={isSyncing || state.notes.length === 0}
                  className="col-span-2 bg-slate-50 dark:bg-slate-900/40 text-slate-700 dark:text-slate-300 py-2.5 rounded-md text-[10px] font-bold border border-slate-200 dark:border-slate-800 flex items-center justify-center gap-1.5 shadow-sm"
                >
                  {isSyncing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3 text-emerald-500" />} 데이터 무결성 최적화 (관계 복구)
                </button>
                <button
                  onClick={handleAnalyzeNextSteps}
                  disabled={state.notes.length === 0}
                  className="col-span-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 py-2 rounded-md text-[10px] font-medium hover:bg-slate-50 flex items-center justify-center gap-1.5"
                >
                  <Lightbulb className="w-3 h-3 text-amber-500" /> 다음 단계 분석 (5개 추천)
                </button>
              </div>
              <button
                onClick={() => textFileInputRef.current?.click()}
                className="w-full bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-3 py-2 rounded-md text-[10px] font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <FileUp className="w-3 h-3" />
                텍스트 파일 업로드 (.md, .txt)
              </button>
              <input
                type="file"
                multiple
                accept=".md,.txt,.yaml"
                ref={textFileInputRef}
                onChange={(e) => handleTextFileUpload(e, textFileInputRef)}
                className="hidden"
              />
            </div>

            {/* AI 제안 및 분석 결과 */}
            <div className="pt-2 space-y-6 border-t border-slate-100 dark:border-slate-800">
              <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">AI 분석 및 제안</h3>
              
              {/* Next Step Suggestion */}
              {nextStepSuggestion && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-slate-500 uppercase flex items-center gap-2">
                    <Lightbulb className="w-3 h-3 text-amber-500" />
                    다음 단계 제안
                  </h3>
                  <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/50 p-3 rounded-lg text-sm text-amber-900 dark:text-amber-200 prose prose-sm prose-amber dark:prose-invert max-w-none">
                    <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{nextStepSuggestion}</Markdown>
                  </div>
                </div>
              )}

              {!nextStepSuggestion && (
                <div className="text-center py-12">
                  <Sparkles className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                  <p className="text-xs text-slate-400">현재 분석된 제안이 없습니다.<br/>상단 도구를 사용하여 분석을 시작하세요.</p>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950/20">
            {/* 채팅 메시지 영역 */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {(state.chatMessages?.length || 0) === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 opacity-50">
                  <MessageSquare className="w-12 h-12 text-slate-300 mb-4" />
                  <p className="text-sm font-medium text-slate-500">프로젝트 설계에 대해 궁금한 점을 물어보세요.</p>
                  <p className="text-[10px] text-slate-400 mt-2">예: "현재 구현된 로그인 로직이 보안상 괜찮아?"</p>
                </div>
              )}
              {state.chatMessages?.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[90%] rounded-2xl px-4 py-2 text-sm shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-indigo-600 text-white rounded-tr-none' 
                      : 'bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-700 rounded-tl-none'
                  }`}>
                    <div className="prose prose-sm dark:prose-invert max-w-none">
                      <Markdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{msg.content}</Markdown>
                      
                      {msg.interactive && !msg.interactive.completed && (
                        <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700 space-y-3 not-prose">
                          <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                            {msg.interactive.type === 'goals' ? '구현 목표 선택' : 
                             msg.interactive.type === 'repos' ? '레포지토리 선택' : '기능 선택'}
                          </p>
                          <div className="space-y-2">
                            {msg.interactive.options.map((opt: any, idx: number) => {
                              const value = typeof opt === 'string' ? opt : opt.repoName || opt.full_name || opt.title;
                              const label = typeof opt === 'string' ? opt : opt.nickname || opt.title || opt.full_name;
                              const isSelected = msg.interactive?.selected.includes(value);

                              return (
                                <label key={idx} className="flex items-start gap-3 p-2 rounded-md hover:bg-white dark:hover:bg-slate-800 cursor-pointer transition-colors group border border-transparent hover:border-slate-200 dark:hover:border-slate-700">
                                  <input 
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      const newSelected = e.target.checked 
                                        ? [...(msg.interactive?.selected || []), value]
                                        : (msg.interactive?.selected || []).filter(v => v !== value);
                                      onInteractiveAction?.(msg.id, newSelected);
                                    }}
                                    className="mt-1 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                  />
                                  <div className="flex-1">
                                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200 group-hover:text-indigo-600 transition-colors">{label}</p>
                                    {opt.summary && <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{opt.summary}</p>}
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                          <button
                            onClick={() => onInteractiveAction?.(msg.id, msg.interactive?.selected || [])}
                            disabled={!msg.interactive.selected.length}
                            className="w-full py-2 bg-indigo-600 text-white rounded-md text-xs font-bold hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-sm"
                          >
                            선택 완료 및 다음 단계 진행
                          </button>
                        </div>
                      )}
                    </div>
                    <div className={`text-[9px] mt-1 opacity-50 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                      {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
              {isChatting && (
                <div className="flex justify-start">
                  <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-2xl rounded-tl-none px-4 py-3 shadow-sm">
                    <div className="flex gap-1">
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                      <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* 채팅 입력 영역 */}
            <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
              <div className="relative">
                <textarea
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleChat();
                    }
                  }}
                  placeholder="메시지를 입력하세요..."
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 pr-12 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none dark:text-white min-h-[80px] max-h-[200px]"
                />
                <button
                  onClick={handleChat}
                  disabled={isChatting || !chatInput.trim()}
                  className="absolute right-3 bottom-3 p-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
