import React from 'react';

interface MetadataRowProps {
  label: string;
  icon: React.ReactNode;
  children?: React.ReactNode;
  value?: string;
  copyable?: boolean;
}

export const MetadataRow: React.FC<MetadataRowProps> = ({ label, icon, children, value, copyable }) => {
  const handleCopy = () => {
    if (value) {
      navigator.clipboard.writeText(value);
    }
  };

  return (
    <div className="flex items-center px-4 py-2 border-b border-slate-200 dark:border-slate-800 last:border-b-0 group">
      <div className="w-24 flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <div className="flex-1 flex items-center justify-between overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {children || (
            <span className="text-xs text-slate-700 dark:text-slate-300 truncate block font-mono" title={value}>
              {value || 'N/A'}
            </span>
          )}
        </div>
        {copyable && value && (
          <button 
            onClick={handleCopy}
            className="ml-2 p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded opacity-0 group-hover:opacity-100 transition-opacity"
            title="복사"
          >
            <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};
