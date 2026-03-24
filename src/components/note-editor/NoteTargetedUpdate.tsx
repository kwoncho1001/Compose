import React from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { Button } from '../common/Button';
import { Input } from '../common/Input';
import { NoteTargetedUpdateProps } from '../../types/noteEditor';

export const NoteTargetedUpdate: React.FC<NoteTargetedUpdateProps> = ({
  command,
  setCommand,
  onUpdate,
  isLoading
}) => {
  return (
    <div className="max-w-3xl mx-auto w-full mt-auto pt-6 border-t border-slate-200 dark:border-slate-800 sticky bottom-0 bg-white dark:bg-slate-950 pb-4">
      <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-indigo-500" />
        집중 업데이트 (이 노트만 집중 업데이트)
      </label>
      <div className="flex gap-2">
        <Input
          placeholder="e.g., '이 로직에 에러 핸들링 추가해줘'"
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onUpdate()}
          disabled={isLoading}
          className="flex-1"
        />
        <Button
          onClick={onUpdate}
          disabled={!command.trim()}
          isLoading={isLoading}
          icon={<Send className="w-4 h-4" />}
        >
          업데이트
        </Button>
      </div>
    </div>
  );
};
