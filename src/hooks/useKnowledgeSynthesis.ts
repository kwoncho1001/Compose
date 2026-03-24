import { useState, useCallback } from 'react';
import { AppState, ChatMessage, Note } from '../types';
import { 
  refineSearchGoal, 
  translateQueryForGithub, 
  summarizeReposShort, 
  extractRepoFeatures, 
  transpileExternalLogic 
} from '../services/gemini';
import { searchGithubRepos, getRepoReadme } from '../services/github';

export const useKnowledgeSynthesis = (
  currentProjectId: string,
  state: AppState,
  setState: React.Dispatch<React.SetStateAction<AppState>>,
  addChatMessage: (msg: Omit<ChatMessage, 'id' | 'createdAt' | 'expiresAt'>) => Promise<void>,
  updateChatMessage: (id: string, updates: Partial<ChatMessage>) => Promise<void>,
  saveNotesToFirestore: (notes: Note[]) => Promise<void>,
  setProcessStatus: (status: { message: string } | null) => void,
  showAlert: (title: string, message: string, type: 'success' | 'error' | 'info') => void
) => {
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [currentGoal, setCurrentGoal] = useState<string>('');

  const startSynthesis = useCallback(async (intent: string) => {
    setIsSynthesizing(true);
    setProcessStatus({ message: '의도 분석 및 구현 목표 생성 중...' });

    try {
      const goals = await refineSearchGoal(intent);
      
      await addChatMessage({
        role: 'model',
        content: `입력하신 의도를 바탕으로 다음의 구현 목표들을 도출했습니다. 가장 적합한 목표들을 선택해 주세요.`,
        interactive: {
          type: 'goals',
          options: goals,
          selected: []
        }
      });
    } catch (error) {
      console.error('Failed to start synthesis:', error);
      showAlert('오류', '구현 목표 생성에 실패했습니다.', 'error');
    } finally {
      setIsSynthesizing(false);
      setProcessStatus(null);
    }
  }, [addChatMessage, setProcessStatus, showAlert]);

  const handleGoalSelection = useCallback(async (messageId: string, selectedGoals: string[]) => {
    setIsSynthesizing(true);
    setProcessStatus({ message: 'GitHub 검색 전략 수립 중...' });

    try {
      // Mark previous message as completed
      await updateChatMessage(messageId, { 
        interactive: { type: 'goals', options: [], selected: selectedGoals, completed: true } 
      });

      const goalText = selectedGoals.join(', ');
      setCurrentGoal(goalText);
      const strategy = await translateQueryForGithub(goalText);
      
      setProcessStatus({ message: 'GitHub 레포지토리 검색 중...' });
      
      const allFoundRepos: any[] = [];
      for (const query of strategy.queries) {
        const results = await searchGithubRepos(query);
        allFoundRepos.push(...results);
      }

      // Deduplicate
      const uniqueRepos = Array.from(new Map(allFoundRepos.map(r => [r.full_name, r])).values());

      await addChatMessage({
        role: 'model',
        content: `선택하신 목표를 위해 다음 레포지토리들을 찾았습니다. 분석에 사용할 "골든 레포"를 선택해 주세요.\n\n**검색 전략:** ${strategy.rationale}`,
        interactive: {
          type: 'repos',
          options: uniqueRepos.map(r => ({
            full_name: r.full_name,
            nickname: r.full_name.split('/')[1],
            summary: r.description,
            url: r.html_url
          })),
          selected: []
        }
      });
    } catch (error) {
      console.error('Failed to process goals:', error);
      showAlert('오류', '레포지토리 검색에 실패했습니다.', 'error');
    } finally {
      setIsSynthesizing(false);
      setProcessStatus(null);
    }
  }, [addChatMessage, updateChatMessage, setProcessStatus, showAlert]);

  const handleRepoSelection = useCallback(async (messageId: string, selectedRepoNames: string[]) => {
    setIsSynthesizing(true);
    setProcessStatus({ message: '레포지토리 분석 및 지식 추출 중...' });

    try {
      await updateChatMessage(messageId, { 
        interactive: { type: 'repos', options: [], selected: selectedRepoNames, completed: true } 
      });

      const repoContexts: Record<string, string> = {};
      for (const repoName of selectedRepoNames) {
        const readme = await getRepoReadme(repoName);
        repoContexts[repoName] = readme;
      }

      setProcessStatus({ message: '핵심 기능 및 아키텍처 요약 중...' });
      const summaries = await summarizeReposShort(repoContexts, currentGoal);
      
      const allFeatures: string[] = [];
      for (const [repoName, readme] of Object.entries(repoContexts)) {
        const features = await extractRepoFeatures(repoName, readme);
        allFeatures.push(...features);
      }

      const uniqueFeatures = Array.from(new Set(allFeatures));

      await addChatMessage({
        role: 'model',
        content: `선택한 레포지토리들에서 다음 핵심 기능들을 추출했습니다. 우리 프로젝트에 이식할 기능들을 선택해 주세요.`,
        interactive: {
          type: 'features',
          options: uniqueFeatures,
          selected: []
        }
      });

    } catch (error) {
      console.error('Failed to process repos:', error);
      showAlert('오류', '레포지토리 분석에 실패했습니다.', 'error');
    } finally {
      setIsSynthesizing(false);
      setProcessStatus(null);
    }
  }, [addChatMessage, updateChatMessage, setProcessStatus, showAlert, currentGoal]);

  const handleFeatureSelection = useCallback(async (messageId: string, selectedFeatures: string[]) => {
    setIsSynthesizing(true);
    setProcessStatus({ message: '지식 이식 및 설계도 생성 중...' });

    try {
      await updateChatMessage(messageId, { 
        interactive: { type: 'features', options: [], selected: selectedFeatures, completed: true } 
      });

      // In a real scenario, we might fetch actual code snippets for these features.
      // For now, we'll use the feature names as the "logic" to transpile.
      const transpilationResults = await transpileExternalLogic(
        selectedFeatures,
        [], // No actual code snippets for now
        state.gcm,
        state.notes
      );

      const newNotes: Note[] = transpilationResults.newNotes.map(n => ({
        ...n,
        id: Math.random().toString(36).substr(2, 9),
        status: 'Planned',
        priority: 'C',
        lastUpdated: new Date().toISOString(),
        version: '1.0.0'
      }));

      await saveNotesToFirestore(newNotes);
      
      setState(prev => ({
        ...prev,
        notes: [...prev.notes, ...newNotes],
        gcm: transpilationResults.updatedGcm
      }));

      await addChatMessage({
        role: 'model',
        content: `선택하신 기능들이 성공적으로 이식되었습니다. ${newNotes.length}개의 새로운 노드가 생성되었으며, GCM이 업데이트되었습니다.`
      });

      showAlert('성공', '지식 이식 및 설계도 생성이 완료되었습니다.', 'success');
    } catch (error) {
      console.error('Failed to transpile features:', error);
      showAlert('오류', '지식 이식에 실패했습니다.', 'error');
    } finally {
      setIsSynthesizing(false);
      setProcessStatus(null);
    }
  }, [state, setState, addChatMessage, updateChatMessage, saveNotesToFirestore, setProcessStatus, showAlert]);

  return {
    isSynthesizing,
    startSynthesis,
    handleGoalSelection,
    handleRepoSelection,
    handleFeatureSelection
  };
};
