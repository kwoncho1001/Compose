import React from 'react';
import { Menu, X, CheckSquare, Square, Trash2 } from 'lucide-react';

interface SidebarLayoutProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  children: React.ReactNode;
}

export const SidebarLayout: React.FC<SidebarLayoutProps> = ({
  isOpen,
  setIsOpen,
  children
}) => {
  return (
    <>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="md:hidden fixed top-4 left-4 z-50 p-2 bg-slate-800 text-slate-200 rounded-md shadow-lg"
      >
        {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      <div
        className={`fixed inset-y-0 left-0 z-40 w-72 bg-slate-900 border-r border-slate-800 transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } md:relative md:translate-x-0`}
      >
        {children}
      </div>
    </>
  );
};
