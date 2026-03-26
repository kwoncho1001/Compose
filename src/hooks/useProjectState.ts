import { useState, useEffect, useMemo, useCallback } from 'react';
import { db, auth, handleFirestoreError, OperationType, getDocsWithCacheFallback, getDocWithCacheFallback } from '../firebase';
import { doc, collection, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { AppState, Note, GCM, ChatMessage, NoteMetadata } from '../types';

export const useProjectState = (
  setDialogConfig: any,
  setProcessStatus: any,
  showAlert: any
) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteMetadata, setNoteMetadata] = useState<NoteMetadata[]>([]);
  const [gcm, setGcm] = useState<GCM>({ entities: {}, variables: {} });
  const [githubConfig, setGithubConfig] = useState({
    repo: '',
    token: process.env.Github_Token || '',
    lastSyncedAt: '',
    lastSyncedSha: '',
    fileSyncLogs: {} as Record<string, string>
  });
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);

  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string>('default-project');
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const userId = auth.currentUser?.uid;

  // Combined state for backward compatibility where needed, but hooks should prefer granular access
  const state: AppState = useMemo(() => ({
    notes,
    noteMetadata,
    gcm,
    githubRepo: githubConfig.repo,
    githubToken: githubConfig.token,
    lastSyncedAt: githubConfig.lastSyncedAt,
    lastSyncedSha: githubConfig.lastSyncedSha,
    fileSyncLogs: githubConfig.fileSyncLogs,
    chatMessages
  }), [notes, gcm, githubConfig, chatMessages]);

  const setState: React.Dispatch<React.SetStateAction<AppState>> = (update) => {
    if (typeof update === 'function') {
      const next = update(state);
      if (next.notes !== notes) setNotes(next.notes);
      if (next.noteMetadata !== noteMetadata) setNoteMetadata(next.noteMetadata || []);
      if (next.gcm !== gcm) setGcm(next.gcm);
      if (next.githubRepo !== githubConfig.repo || 
          next.githubToken !== githubConfig.token || 
          next.lastSyncedAt !== githubConfig.lastSyncedAt || 
          next.lastSyncedSha !== githubConfig.lastSyncedSha ||
          next.fileSyncLogs !== githubConfig.fileSyncLogs) {
        setGithubConfig({
          repo: next.githubRepo,
          token: next.githubToken,
          lastSyncedAt: next.lastSyncedAt || '',
          lastSyncedSha: next.lastSyncedSha || '',
          fileSyncLogs: next.fileSyncLogs || {}
        });
      }
      if (next.chatMessages !== chatMessages) setChatMessages(next.chatMessages || []);
    } else {
      if (update.notes !== notes) setNotes(update.notes);
      if (update.noteMetadata !== noteMetadata) setNoteMetadata(update.noteMetadata || []);
      if (update.gcm !== gcm) setGcm(update.gcm);
      setGithubConfig({
        repo: update.githubRepo,
        token: update.githubToken,
        lastSyncedAt: update.lastSyncedAt || '',
        lastSyncedSha: update.lastSyncedSha || '',
        fileSyncLogs: update.fileSyncLogs || {}
      });
      if (update.chatMessages !== chatMessages) setChatMessages(update.chatMessages || []);
    }
  };

  // Fetch projects list
  const fetchProjects = useCallback(async () => {
    if (!userId) return;
    const projectsRef = collection(db, 'users', userId, 'projects');
    try {
      const querySnap = await getDocsWithCacheFallback(projectsRef);
      const projectsList: { id: string; name: string }[] = [];
      querySnap.forEach((doc) => {
        projectsList.push({ id: doc.id, name: doc.data().name || doc.id });
      });
      setProjects(projectsList);
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, projectsRef.path);
    }
  }, [userId]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Firebase Sync for current project
  const fetchCurrentProject = useCallback(async () => {
    if (!userId || !currentProjectId) return;

    const projectRef = doc(db, 'users', userId, 'projects', currentProjectId);
    
    try {
      const docSnap = await getDocWithCacheFallback(projectRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setGcm(data.gcm || { entities: {}, variables: {} });
        setGithubConfig(prev => ({
          ...prev,
          repo: data.githubRepo || '',
          token: data.githubToken || process.env.Github_Token || '',
          lastSyncedAt: data.lastSyncedAt || '',
          lastSyncedSha: data.lastSyncedSha || '',
          fileSyncLogs: data.fileSyncLogs || {}
        }));
      } else {
        if (currentProjectId === 'default-project') {
          setGcm({ entities: {}, variables: {} });
          setGithubConfig({
            repo: '',
            token: process.env.Github_Token || '',
            lastSyncedAt: '',
            lastSyncedSha: '',
            fileSyncLogs: {}
          });
          await setDoc(projectRef, {
            id: currentProjectId,
            name: 'Default Project',
            gcm: { entities: {}, variables: {} },
            lastUpdated: new Date().toISOString()
          });
        }
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.GET, projectRef.path);
    }
  }, [userId, currentProjectId]);

  useEffect(() => {
    fetchCurrentProject();
  }, [fetchCurrentProject]);

  const cleanObject = (obj: any) => {
    const newObj = { ...obj };
    Object.keys(newObj).forEach(key => {
      if (newObj[key] === undefined) {
        delete newObj[key];
      }
    });
    return newObj;
  };

  const syncProject = async (updates: Partial<AppState>) => {
    if (!userId || !currentProjectId) return;
    const projectRef = doc(db, 'users', userId, 'projects', currentProjectId);
    try {
      await setDoc(projectRef, cleanObject({
        ...updates,
        lastUpdated: new Date().toISOString()
      }), { merge: true });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, projectRef.path);
    }
  };

  const handleCreateProject = async (name: string) => {
    if (!userId) return;
    const projectRef = doc(collection(db, 'users', userId, 'projects'));
    try {
      await setDoc(projectRef, {
        id: projectRef.id,
        name,
        gcm: { entities: {}, variables: {} },
        lastUpdated: new Date().toISOString()
      });
      setCurrentProjectId(projectRef.id);
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, projectRef.path);
    }
  };

  const handleRenameProject = async (id: string, newName: string) => {
    if (!userId) return;
    const projectRef = doc(db, 'users', userId, 'projects', id);
    try {
      await updateDoc(projectRef, {
        name: newName,
        lastUpdated: new Date().toISOString()
      });
    } catch (e) {
      handleFirestoreError(e, OperationType.WRITE, projectRef.path);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!userId) return;

    const projectName = projects.find(p => p.id === id)?.name || id;
    
    setDialogConfig({
      isOpen: true,
      title: '프로젝트 삭제',
      message: `'${projectName}'의 모든 데이터(노트, 채팅 포함)를 영구적으로 삭제하시겠습니까? 이 작업은 복구할 수 없습니다.`,
      type: 'warning',
      confirmText: '영구 삭제',
      cancelText: '취소',
      onConfirm: async () => {
        setDialogConfig(null);
        setProcessStatus({ message: '프로젝트 데이터 삭제 중...' });
        try {
          const batch = writeBatch(db);
          
          // 1. 해당 프로젝트의 모든 노트 조회 및 삭제 예약
          const notesRef = collection(db, 'users', userId, 'projects', id, 'notes');
          const notesSnap = await getDocsWithCacheFallback(notesRef);
          notesSnap.forEach((doc) => batch.delete(doc.ref));

          // 2. 해당 프로젝트의 모든 채팅 내역 조회 및 삭제 예약
          const chatsRef = collection(db, 'users', userId, 'projects', id, 'chats');
          const chatsSnap = await getDocsWithCacheFallback(chatsRef);
          chatsSnap.forEach((doc) => batch.delete(doc.ref));

          // 3. 프로젝트 문서 자체 삭제 예약
          const projectRef = doc(db, 'users', userId, 'projects', id);
          batch.delete(projectRef);

          // 원자적으로 한 번에 실행 (최대 500개 제한이 있으나 보통 프로젝트당 500개 미만으로 가정)
          await batch.commit();
          
          // If we deleted the current project, switch to another one
          if (id === currentProjectId) {
            const otherProject = projects.find(p => p.id !== id);
            setCurrentProjectId(otherProject ? otherProject.id : 'default-project');
          }
          
          showAlert('성공', '프로젝트와 모든 하위 데이터가 삭제되었습니다.', 'success');
        } catch (e) {
          handleFirestoreError(e, OperationType.DELETE, `project-${id}`);
        } finally {
          setProcessStatus(null);
        }
      },
      onCancel: () => setDialogConfig(null)
    });
  };

  return {
    state,
    setState,
    projects,
    currentProjectId,
    setCurrentProjectId,
    isInitialLoading,
    setIsInitialLoading,
    userId,
    syncProject,
    cleanObject,
    handleCreateProject,
    handleRenameProject,
    handleDeleteProject
  };
};
