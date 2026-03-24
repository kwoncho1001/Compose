import { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, collection, onSnapshot, setDoc, query, orderBy, writeBatch } from 'firebase/firestore';
import { AppState, ChatMessage } from '../types';
import { chatWithNotes } from '../services/gemini';

export const useChatSession = (
  userId: string | undefined,
  currentProjectId: string,
  state: AppState,
  setState: React.Dispatch<React.SetStateAction<AppState>>,
  showAlert: any,
  abortControllerRef: React.MutableRefObject<AbortController | null>
) => {
  const [chatInput, setChatInput] = useState('');
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.chatMessages]);

  useEffect(() => {
    if (!userId || !currentProjectId) return;

    const chatsRef = collection(db, 'users', userId, 'projects', currentProjectId, 'chats');
    const chatsQuery = query(chatsRef, orderBy('createdAt', 'asc'));

    const unsubscribeChats = onSnapshot(chatsQuery, (querySnap) => {
      const chatsList: ChatMessage[] = [];
      querySnap.forEach((doc) => {
        chatsList.push(doc.data() as ChatMessage);
      });
      setState(prev => ({ ...prev, chatMessages: chatsList }));
    }, (e) => handleFirestoreError(e, OperationType.GET, chatsRef.path));

    return () => {
      unsubscribeChats();
    };
  }, [userId, currentProjectId, setState]);

  const handleChat = async () => {
    if (!chatInput.trim() || isChatting) return;
    
    const now = new Date();
    const expiryDate = new Date();
    expiryDate.setDate(now.getDate() + 30);

    const userMsg: ChatMessage = { 
      id: Math.random().toString(36).substring(2, 11),
      role: 'user', 
      content: chatInput, 
      createdAt: now.toISOString(),
      expiresAt: expiryDate
    };
    
    setChatInput('');
    setIsChatting(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    try {
      if (!userId || !currentProjectId) return;
      const chatsRef = collection(db, 'users', userId, 'projects', currentProjectId, 'chats');
      await setDoc(doc(chatsRef, userMsg.id), userMsg);

      const history = (state.chatMessages || []).map(m => ({
        role: m.role,
        parts: m.content
      }));
      
      const response = await chatWithNotes(chatInput, state.notes, history, signal);
      
      if (signal.aborted) return;

      const aiMsg: ChatMessage = { 
        id: Math.random().toString(36).substring(2, 11),
        role: 'model', 
        content: response, 
        createdAt: new Date().toISOString(),
        expiresAt: expiryDate
      };
      
      await setDoc(doc(chatsRef, aiMsg.id), aiMsg);
    } catch (error) {
      if ((error as any)?.message === "Operation cancelled" || error === "Operation cancelled") {
        console.log('Chat cancelled');
      } else {
        console.error('Chat error:', error);
        showAlert('오류', '대화 중 오류가 발생했습니다.', 'error');
      }
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setIsChatting(false);
    }
  };

  const handleClearChat = async () => {
    if (!userId || !currentProjectId) return;
    const chatsRef = collection(db, 'users', userId, 'projects', currentProjectId, 'chats');
    const batch = writeBatch(db);
    state.chatMessages?.forEach(msg => {
      batch.delete(doc(chatsRef, msg.id));
    });
    try {
      await batch.commit();
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, 'batch-chats');
    }
  };

  return {
    chatInput,
    setChatInput,
    isChatting,
    handleChat,
    handleClearChat,
    chatEndRef
  };
};
