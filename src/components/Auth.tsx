import React from 'react';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { LogOut, User } from 'lucide-react';

export const Auth: React.FC = () => {
  const [user, setUser] = React.useState(auth.currentUser);

  React.useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout failed', error);
    }
  };

  if (!user) return null;

  return (
    <div className="flex items-center gap-3 px-3 py-1.5 bg-white dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm">
      <div className="flex items-center gap-2">
        {user.photoURL ? (
          <img src={user.photoURL} alt={user.displayName || ''} className="w-6 h-6 rounded-full" referrerPolicy="no-referrer" />
        ) : (
          <User className="w-4 h-4 text-slate-500" />
        )}
        <span className="text-xs font-medium text-slate-700 dark:text-slate-200 hidden sm:inline">
          {user.displayName}
        </span>
      </div>
      <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
      <button
        onClick={handleLogout}
        className="text-slate-500 hover:text-red-500 transition-colors"
        title="로그아웃"
      >
        <LogOut className="w-4 h-4" />
      </button>
    </div>
  );
};
