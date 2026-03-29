import { useState, useEffect } from 'react';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { doc, collection, onSnapshot, setDoc, updateDoc, writeBatch, getDocs } from 'firebase/firestore';
import { AppState } from '../types';

export const useProjectState = (
  setDialogConfig: any,
  setProcessStatus: any,
  showAlert: any
) => {
  const [state, setState] = useState<AppState>({
    notes: [],
    noteMetadata: [],
    syncRegistry: { entries: {}, lastSyncedAt: '' },
    gcm: { entities: {}, variables: {} },
    githubRepo: '',
    githubToken: process.env.Github_Token || '',
    lastSyncedAt: '',
    lastSyncedSha: '',
    fileSyncLogs: {},
    chatMessages: [],
  });

  // Sync noteMetadata whenever notes change
  useEffect(() => {
    const newMetadata = state.notes.map(n => ({
      id: n.id,
      title: n.title,
      folder: n.folder,
      summary: n.summary,
      noteType: n.noteType,
      priority: n.priority,
      status: n.status,
      importance: n.importance,
      parentNoteIds: n.parentNoteIds || [],
      childNoteIds: n.childNoteIds || [],
      consistencyConflict: n.consistencyConflict
    }));

    // Simple comparison to avoid infinite loop
    const currentMetadataStr = JSON.stringify(state.noteMetadata);
    const newMetadataStr = JSON.stringify(newMetadata);

    if (currentMetadataStr !== newMetadataStr) {
      setState(prev => ({ ...prev, noteMetadata: newMetadata }));
    }
  }, [state.notes, state.noteMetadata]);

  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string>('default-project');
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const userId = auth.currentUser?.uid;

  // Fetch projects list
  useEffect(() => {
    if (!userId) return;
    const projectsRef = collection(db, 'users', userId, 'projects');
    const unsubscribe = onSnapshot(projectsRef, (querySnap) => {
      const projectsList: { id: string; name: string }[] = [];
      querySnap.forEach((doc) => {
        projectsList.push({ id: doc.id, name: doc.data().name || doc.id });
      });
      setProjects(projectsList);
    }, (e) => handleFirestoreError(e, OperationType.GET, projectsRef.path));

    return () => unsubscribe();
  }, [userId]);

  // Firebase Sync for current project
  useEffect(() => {
    if (!userId || !currentProjectId) return;

    const projectRef = doc(db, 'users', userId, 'projects', currentProjectId);

    const unsubscribeProject = onSnapshot(projectRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setState(prev => ({
          ...prev,
          gcm: data.gcm || { entities: {}, variables: {} },
          githubRepo: data.githubRepo || '',
          githubToken: data.githubToken || process.env.Github_Token || '',
          lastSyncedAt: data.lastSyncedAt || '',
          lastSyncedSha: data.lastSyncedSha || '',
        }));
      } else {
        if (currentProjectId === 'default-project') {
          setState(prev => ({
            ...prev,
            gcm: { entities: {}, variables: {} },
            githubRepo: '',
            githubToken: process.env.Github_Token || '',
            lastSyncedAt: '',
            lastSyncedSha: '',
          }));
          setDoc(projectRef, {
            id: currentProjectId,
            name: 'Default Project',
            gcm: { entities: {}, variables: {} },
            lastUpdated: new Date().toISOString()
          }).catch(e => handleFirestoreError(e, OperationType.WRITE, projectRef.path));
        }
      }
    }, (e) => handleFirestoreError(e, OperationType.GET, projectRef.path));

    return () => {
      unsubscribeProject();
    };
  }, [userId, currentProjectId]);

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
          const notesSnap = await getDocs(notesRef);
          notesSnap.forEach((doc) => batch.delete(doc.ref));

          // 2. 해당 프로젝트의 모든 채팅 내역 조회 및 삭제 예약
          const chatsRef = collection(db, 'users', userId, 'projects', id, 'chats');
          const chatsSnap = await getDocs(chatsRef);
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
