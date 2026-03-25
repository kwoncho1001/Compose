import React from 'react';

interface MetadataFieldGroupProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

export const MetadataFieldGroup: React.FC<MetadataFieldGroupProps> = ({ title, icon, children }) => (
  <div className="bg-white dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
    <div className="px-4 py-2 bg-slate-50 dark:bg-slate-950/50 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
      {icon}
      {title}
    </div>
    <div className="divide-y divide-slate-200 dark:divide-slate-800">
      {children}
    </div>
  </div>
);
