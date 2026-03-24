import React from 'react';

interface MetadataRowProps {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}

export const MetadataRow: React.FC<MetadataRowProps> = ({ label, icon, children }) => (
  <div className="flex items-center px-4 py-2 border-b border-slate-200 dark:border-slate-800 last:border-b-0">
    <div className="w-24 flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
      {icon}
      {label}
    </div>
    <div className="flex-1">
      {children}
    </div>
  </div>
);
