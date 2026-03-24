import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import CodeMirror from '@uiw/react-codemirror';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { vscodeDark, vscodeLight } from '@uiw/codemirror-theme-vscode';
import { EditorView } from '@codemirror/view';
import { Edit3 } from 'lucide-react';

interface NoteContentEditorProps {
  editData: any;
  isEditing: boolean;
  setIsEditing: (val: boolean) => void;
  isSnapshotNote: boolean;
  darkMode: boolean;
  onContentChange: (val: string) => void;
  handleSaveManual: () => void;
  showAlert: (title: string, message: string, type: 'info' | 'warning' | 'error' | 'success') => void;
}

export const NoteContentEditor: React.FC<NoteContentEditorProps> = ({
  editData,
  isEditing,
  setIsEditing,
  isSnapshotNote,
  darkMode,
  onContentChange,
  handleSaveManual,
  showAlert
}) => {
  return (
    <div className="mb-12">
      <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">
        <h2 className="text-xl font-semibold text-slate-800 dark:text-slate-200">
          기능 및 기술 명세
        </h2>
        <div className="flex gap-2">
          {isEditing ? (
            <div className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 font-medium">
              <Edit3 className="w-3 h-3" /> 편집 중... (Esc로 완료)
            </div>
          ) : (
            <button
              onClick={() => {
                if (isSnapshotNote) {
                  showAlert('알림', '코드 스냅샷 노트는 직접 수정할 수 없습니다.', 'info');
                  return;
                }
                setIsEditing(true);
              }}
              className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors ${isSnapshotNote ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Edit3 className="w-3 h-3" /> 편집
            </button>
          )}
        </div>
      </div>
      
      <div className="min-h-[600px] relative group">
        {isEditing ? (
          <div 
            className="border border-indigo-500 dark:border-indigo-400 rounded-xl overflow-hidden shadow-lg transition-all"
            onBlur={() => handleSaveManual()}
          >
            <CodeMirror
              value={editData.content}
              height="600px"
              theme={darkMode ? vscodeDark : vscodeLight}
              extensions={[markdown({ base: markdownLanguage, codeLanguages: languages }), EditorView.lineWrapping]}
              onChange={(val) => !isSnapshotNote && onContentChange(val)}
              readOnly={isSnapshotNote}
              autoFocus
              className="text-sm"
            />
          </div>
        ) : (
          <div 
            onClick={() => {
              if (isSnapshotNote) {
                showAlert('알림', '코드 스냅샷 노트는 직접 수정할 수 없습니다.', 'info');
                return;
              }
              setIsEditing(true);
            }}
            className={`border border-transparent ${isSnapshotNote ? 'cursor-default' : 'hover:border-slate-200 dark:hover:border-slate-800 cursor-text'} rounded-xl p-6 bg-slate-50/30 dark:bg-slate-900/30 prose prose-indigo dark:prose-invert max-w-none transition-all`}
          >
            <Markdown remarkPlugins={[[remarkGfm, { singleTilde: false }], remarkMath]} rehypePlugins={[rehypeKatex]}>
              {editData.content || '*내용이 없습니다. 클릭하여 편집하세요.*'}
            </Markdown>
          </div>
        )}
      </div>
    </div>
  );
};
