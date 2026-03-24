import React from 'react';
import { Loader2, X } from 'lucide-react';

interface ProcessBannerProps {
  processStatus: { message: string; current?: number; total?: number } | null;
  handleCancelProcess: () => void;
}

export const ProcessBanner: React.FC<ProcessBannerProps> = ({
  processStatus,
  handleCancelProcess
}) => {
  if (!processStatus) return null;

  return (
    <div className="bg-indigo-600 text-white px-4 py-3 flex items-center justify-between shadow-lg animate-in slide-in-from-top duration-300">
      <div className="flex items-center gap-3">
        <Loader2 className="w-5 h-5 animate-spin" />
        <span className="font-medium">{processStatus.message}</span>
      </div>
      <div className="flex items-center gap-4">
        {processStatus.current !== undefined && processStatus.total !== undefined && (
          <>
            <div className="text-xs font-mono bg-indigo-500 px-2 py-1 rounded">
              {processStatus.current} / {processStatus.total} 파일
            </div>
            <div className="w-48 h-2 bg-indigo-800 rounded-full overflow-hidden">
              <div 
                className="h-full bg-white transition-all duration-500" 
                style={{ width: `${(processStatus.current / processStatus.total) * 100}%` }}
              />
            </div>
          </>
        )}
        <button 
          onClick={handleCancelProcess}
          className="ml-4 px-3 py-1 bg-white/20 hover:bg-white/30 rounded text-sm font-medium transition-colors flex items-center gap-1"
        >
          <X className="w-4 h-4" />
          중단
        </button>
      </div>
    </div>
  );
};
