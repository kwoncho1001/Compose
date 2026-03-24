import React from 'react';
import { ChatMessage } from '../../types';
import { Send, Trash2, Loader2, MessageSquare } from 'lucide-react';
import Markdown from 'react-markdown';

interface ChatInterfaceProps {
  chatMessages: ChatMessage[];
  chatInput: string;
  setChatInput: (input: string) => void;
  isChatting: boolean;
  onChatSubmit: (e: React.FormEvent) => void;
  onClearChat: () => void;
  chatEndRef: React.RefObject<HTMLDivElement>;
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  chatMessages,
  chatInput,
  setChatInput,
  isChatting,
  onChatSubmit,
  onClearChat,
  chatEndRef
}) => {
  return (
    <div className="flex flex-col h-full bg-white dark:bg-neutral-800">
      <div className="p-4 border-b border-neutral-200 dark:border-neutral-700 flex justify-between items-center">
        <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">AI 어시스턴트</h2>
        <button 
          onClick={onClearChat}
          className="p-1.5 text-neutral-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
          title="채팅 내역 지우기"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {chatMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-neutral-400 dark:text-neutral-500 space-y-2">
            <MessageSquare className="w-8 h-8 opacity-50" />
            <p className="text-sm text-center">프로젝트 설계에 대해<br/>무엇이든 물어보세요.</p>
          </div>
        ) : (
          chatMessages.map((msg) => (
            <div 
              key={msg.id} 
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div 
                className={`max-w-[85%] rounded-2xl px-4 py-2 ${
                  msg.role === 'user' 
                    ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                    : 'bg-neutral-100 dark:bg-neutral-700 text-neutral-900 dark:text-neutral-100 rounded-tl-sm'
                }`}
              >
                {msg.role === 'user' ? (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:bg-neutral-800 prose-pre:text-neutral-100">
                    <Markdown>{msg.content}</Markdown>
                  </div>
                )}
              </div>
              <span className="text-[10px] text-neutral-400 mt-1 px-1">
                {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
          ))
        )}
        {isChatting && (
          <div className="flex items-start">
            <div className="bg-neutral-100 dark:bg-neutral-700 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-neutral-500" />
              <span className="text-sm text-neutral-500">답변을 작성하고 있습니다...</span>
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      <div className="p-4 border-t border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800">
        <form onSubmit={onChatSubmit} className="relative">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="메시지를 입력하세요..."
            className="w-full bg-neutral-100 dark:bg-neutral-900 border-none rounded-full pl-4 pr-12 py-3 text-sm focus:ring-2 focus:ring-primary/50 dark:text-neutral-100 placeholder-neutral-400"
            disabled={isChatting}
          />
          <button
            type="submit"
            disabled={!chatInput.trim() || isChatting}
            className="absolute right-1.5 top-1.5 bottom-1.5 aspect-square flex items-center justify-center bg-primary text-primary-foreground rounded-full hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </button>
        </form>
      </div>
    </div>
  );
};
