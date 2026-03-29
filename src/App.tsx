import React, { useState, useEffect } from 'react';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  type User 
} from 'firebase/auth';
import { auth } from './firebase';
import { Dashboard } from './components/Dashboard';
import { motion } from 'motion/react';
import { FileText, LogIn } from 'lucide-react';

const googleProvider = new GoogleAuthProvider();

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthChecking(false);
    });
    return unsubscribe;
  }, []);

  const login = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Login failed:', error);
    }
  };

  if (isAuthChecking) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-10 text-center shadow-xl"
        >
          <div className="w-20 h-20 bg-indigo-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-lg shadow-indigo-500/20">
            <FileText className="text-white w-10 h-10" />
          </div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white mb-3 tracking-tight">Vibe-Architect</h1>
          <p className="text-slate-500 dark:text-slate-400 mb-10 leading-relaxed">
            AI 기반의 자율 아키텍처 설계 및 코드 분석 도구입니다. <br/>
            프로젝트의 지식을 체계적으로 관리하세요.
          </p>
          <button 
            onClick={login}
            className="w-full bg-indigo-600 text-white font-bold py-4 rounded-2xl hover:bg-indigo-700 transition-all flex items-center justify-center gap-3 shadow-lg shadow-indigo-500/25 active:scale-[0.98]"
          >
            <LogIn size={20} />
            Google 계정으로 시작하기
          </button>
          <p className="mt-8 text-[11px] text-slate-400 uppercase tracking-widest font-medium">
            Powered by Gemini 3.1 Pro
          </p>
        </motion.div>
      </div>
    );
  }

  return <Dashboard />;
}
