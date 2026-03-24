import React from 'react';
import { AlertTriangle, Merge, X } from 'lucide-react';
import { Button } from '../common/Button';

interface ConflictBannerProps {
  conflict: {
    type: 'content' | 'metadata' | 'hierarchy';
    message: string;
    details?: string;
  };
  isResolving: boolean;
  onResolve: () => void;
  onDismiss: () => void;
}

export const ConflictBanner: React.FC<ConflictBannerProps> = ({
  conflict,
  isResolving,
  onResolve,
  onDismiss
}) => {
  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 p-4 animate-in slide-in-from-top">
      <div className="flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-amber-900 dark:text-amber-400">
            충돌 감지됨: {conflict.type}
          </h4>
          <p className="text-sm text-amber-800 dark:text-amber-300 mt-1">
            {conflict.message}
          </p>
          {conflict.details && (
            <div className="mt-2 p-2 bg-amber-100/50 dark:bg-amber-900/30 rounded text-xs font-mono text-amber-900 dark:text-amber-400 whitespace-pre-wrap">
              {conflict.details}
            </div>
          )}
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="bg-white dark:bg-neutral-800 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/50"
              onClick={onResolve}
              disabled={isResolving}
            >
              {isResolving ? (
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  병합 중...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Merge className="w-3 h-3" />
                  자동 병합 시도
                </span>
              )}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/50"
              onClick={onDismiss}
            >
              <X className="w-3 h-3 mr-1" />
              무시
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
