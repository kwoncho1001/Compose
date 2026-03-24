import { useState, useCallback } from 'react';
import { AppState, ChatMessage, Note } from '../types';
import { 
  refineSearchGoal, 
  translateQueryForGithub, 
  transpileExternalLogic 
} from '../services/gemini';
import { searchGithubRepos, fetchGithubFileContent } from '../services/github';

export const useKnowledgeSynthesis = (
  currentProjectId: string,
  state: AppState,
  setState: React.Dispatch<React.SetStateAction<AppState>>,
  addChatMessage: (msg: Omit<ChatMessage, 'id' | 'createdAt' | 'expiresAt'>) => Promise<void>,
  updateChatMessage: (id: string, updates: Partial<ChatMessage>) => Promise<void>,
  saveNotesToFirestore: (notes: Note[]) => Promise<void>,
  setProcessStatus: (status: { message: string } | null) => void,
  showAlert: (title: string, message: string, type: 'success' | 'error' | 'info') => void,
  setActiveSidebarTab: (tab: 'tools' | 'chat') => void
) => {
  console.log('useKnowledgeSynthesis initialized with project:', currentProjectId);
  const [isSynthesizing, setIsSynthesizing] = useState(false);

  // 1. [의도 파악] 사용자의 입력을 전문적 목표로 분기 (체크박스 제안)
  const startSynthesis = useCallback(async (intent: string) => {
    console.log('Starting synthesis with intent:', intent);
    setIsSynthesizing(true);
    setProcessStatus({ message: '사용자 의도 정밀 분석 중...' });
    try {
      const goals = await refineSearchGoal(intent);
      console.log('Refined goals:', goals);
      
      // 채팅 탭으로 자동 전환하여 진행 상황 노출
      setActiveSidebarTab('chat');
      
      await addChatMessage({
        role: 'model',
        content: `설계를 위해 다음 중 가장 핵심적인 구현 목표를 선택해 주세요.`,
        interactive: { type: 'goals', options: goals, selected: [] }
      });
    } catch (error) {
      console.error('Failed to start synthesis:', error);
      showAlert('오류', '의도 분석에 실패했습니다.', 'error');
    } finally {
      setIsSynthesizing(false);
      setProcessStatus(null);
    }
  }, [addChatMessage, setProcessStatus, showAlert, setActiveSidebarTab]);

  // 2. [자율 체인 실행] 선택 이후부터는 AI가 전권을 가짐
  const handleGoalSelection = useCallback(async (messageId: string, selectedGoals: string[]) => {
    setIsSynthesizing(true);
    try {
      // Mark previous message as completed
      await updateChatMessage(messageId, { 
        interactive: { type: 'goals', options: [], selected: selectedGoals, completed: true } 
      });

      // Step A: 검색 전략 수립 및 자율 레포 선별
      setProcessStatus({ message: '최적의 오픈소스 DNA 탐색 및 자율 선별 중...' });
      const strategy = await translateQueryForGithub(selectedGoals.join(', '));
      
      const repoResults = await searchGithubRepos(strategy.queries[0]);
      const goldenRepos = repoResults.slice(0, 2); // 상위 2개 자율 확정

      // Step B: 실질적 소스 코드 DNA 추출 (결함 해결)
      setProcessStatus({ message: '레포지토리 역공학 및 소스 코드 추출 중...' });
      const externalCodes: { path: string; content: string }[] = [];
      for (const repo of goldenRepos) {
        try {
          // 주요 파일들 시도
          const mainFiles = ['src/App.tsx', 'src/main.ts', 'src/index.ts', 'index.js', 'README.md'];
          for (const file of mainFiles) {
            try {
              const content = await fetchGithubFileContent(repo.html_url, file);
              if (content && content.length > 100) { // 최소 길이 체크
                externalCodes.push({ path: `${repo.full_name}/${file}`, content });
                if (file !== 'README.md') break; 
              }
            } catch (e) { /* ignore */ }
          }
        } catch (e) {
          console.error(`Failed to fetch content for ${repo.full_name}:`, e);
        }
      }

      // Step C: GCM 기반 정문화 이식 (실제 코드 주입)
      setProcessStatus({ message: 'GCM 변수 정문화 및 원자적 설계도 생성 중...' });
      const transpilationResults = await transpileExternalLogic(
        selectedGoals,
        externalCodes, // 실제 추출된 소스 코드 주입
        state.gcm,
        state.notes
      );

      // Step D: 계층 구조 무결성 즉시 반영 (Reference 노출 결함 해결)
      const newNotes: Note[] = transpilationResults.newNotes.map(n => ({
        ...n,
        id: Math.random().toString(36).substr(2, 9),
        status: 'Done', // 이미 구현된 코드이므로 Done으로 설정
        priority: 'C',
        lastUpdated: new Date().toISOString(),
        version: '1.0.0'
      }));

      // [Surgical Fix] Reference 노드 생성 시 부모 Task와 즉시 양방향 링크 연결
      const updatedExistingNotes = [...state.notes];
      newNotes.forEach(newNote => {
        const parentId = newNote.parentNoteIds?.[0];
        if (newNote.noteType === 'Reference' && parentId) {
          const parentIndex = updatedExistingNotes.findIndex(n => n.id === parentId);
          if (parentIndex !== -1) {
            const parent = updatedExistingNotes[parentIndex];
            if (!parent.childNoteIds?.includes(newNote.id)) {
              updatedExistingNotes[parentIndex] = {
                ...parent,
                childNoteIds: [...(parent.childNoteIds || []), newNote.id]
              };
            }
          } else {
            // 새로 생성된 노트들 중에서도 부모를 찾을 수 있음
            const newParentIndex = newNotes.findIndex(n => n.id === parentId);
            if (newParentIndex !== -1) {
              const newParent = newNotes[newParentIndex];
              if (!newParent.childNoteIds?.includes(newNote.id)) {
                newNotes[newParentIndex] = {
                  ...newParent,
                  childNoteIds: [...(newParent.childNoteIds || []), newNote.id]
                };
              }
            }
          }
        }
      });

      const finalNotes = [...updatedExistingNotes, ...newNotes];
      
      // 모든 변경된 노트 저장
      const notesToSave = [...newNotes];
      updatedExistingNotes.forEach((n, i) => {
        if (n !== state.notes[i]) notesToSave.push(n);
      });
      
      await saveNotesToFirestore(notesToSave);

      setState(prev => ({
        ...prev,
        notes: finalNotes,
        gcm: transpilationResults.updatedGcm
      }));

      await addChatMessage({
        role: 'model',
        content: `자율 아키텍처 합성이 완료되었습니다. ${newNotes.length}개의 새로운 설계 노드가 생성되었으며, 프로젝트 DNA(GCM)가 업데이트되었습니다.`
      });

      showAlert('성공', '자율 아키텍처 합성이 완료되었습니다.', 'success');

    } catch (error) {
      console.error('Synthesis chain failed:', error);
      showAlert('오류', '자율 합성에 실패했습니다.', 'error');
    } finally {
      setIsSynthesizing(false);
      setProcessStatus(null);
    }
  }, [state, setState, addChatMessage, updateChatMessage, saveNotesToFirestore, setProcessStatus, showAlert]);

  return { isSynthesizing, startSynthesis, handleGoalSelection };
};
