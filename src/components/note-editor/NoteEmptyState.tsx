import React from 'react';
import { FileText } from 'lucide-react';

export const NoteEmptyState: React.FC = () => {
  return (
    <div className="flex-1 flex items-center justify-center bg-white dark:bg-slate-950 text-slate-400 transition-colors duration-200">
      <div className="text-center">
        <FileText className="w-12 h-12 mx-auto mb-4 text-slate-300" />
        <p>상세 내용을 보려면 노트를 선택하세요</p>
      </div>
    </div>
  );
};
