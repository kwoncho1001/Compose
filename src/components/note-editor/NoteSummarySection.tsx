import React from 'react';
import { Lightbulb } from 'lucide-react';
import { NoteSummarySectionProps } from '../../types/noteEditor';

export const NoteSummarySection: React.FC<NoteSummarySectionProps> = ({
  summary,
  isSnapshotNote,
  onSummaryChange,
  onSummaryBlur
}) => {
  return (
    <div className="mb-8">
      <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
        <Lightbulb className="w-4 h-4" />
        요약
      </h2>
      <textarea
        value={summary}
        onChange={(e) => !isSnapshotNote && onSummaryChange(e.target.value)}
        onBlur={onSummaryBlur}
        readOnly={isSnapshotNote}
        className={`w-full border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 dark:text-white rounded-lg p-3 text-sm focus:outline-none ${isSnapshotNote ? 'cursor-default' : 'focus:ring-2 focus:ring-indigo-500'} h-20 transition-all`}
        placeholder="이 기능에 대한 간단한 요약..."
      />
    </div>
  );
};
