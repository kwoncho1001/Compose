import React from 'react';
import { Loader2, XCircle } from 'lucide-react';

interface ProcessBannerProps {
  status: { message: string; current?: number; total?: number } | null;
  onCancel: () => void;
}

export const ProcessBanner: React.FC<ProcessBannerProps> = ({ status, onCancel }) => {
  if (!status) return null;

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-900/50 p-4 flex items-center justify-between animate-in slide-in-from-top">
      <div className="flex items-center gap-3">
        <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />
        <div className="flex flex-col">
          <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
            {status.message}
          </span>
          {status.total && status.current !== undefined && (
            <span className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
              진행률: {status.current} / {status.total} ({Math.round((status.current / status.total) * 100)}%)
            </span>
          )}
        </div>
      </div>
      <button
        onClick={onCancel}
        className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-md transition-colors flex items-center gap-1.5 text-sm font-medium"
      >
        <XCircle className="w-4 h-4" />
        취소
      </button>
    </div>
  );
};
