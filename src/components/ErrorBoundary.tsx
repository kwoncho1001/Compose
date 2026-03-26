import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      let errorMessage = '알 수 없는 오류가 발생했습니다.';
      let isFirestoreError = false;

      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error && parsed.operationType) {
            isFirestoreError = true;
            if (parsed.error.includes('resource-exhausted') || parsed.error.includes('Quota limit exceeded')) {
              errorMessage = '데이터베이스 사용량이 일일 무료 한도를 초과했습니다. 내일(태평양 표준시 기준 자정) 할당량이 초기화된 후 다시 이용하실 수 있습니다.';
            } else {
              errorMessage = `데이터베이스 오류 (${parsed.operationType}): ${parsed.error}`;
            }
          }
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-slate-200 dark:border-slate-800">
            <div className="w-16 h-16 bg-red-100 dark:bg-red-900/40 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white mb-2">문제가 발생했습니다</h1>
            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl mb-6 text-left border border-slate-100 dark:border-slate-800">
              <p className="text-sm text-slate-600 dark:text-slate-400 font-mono break-words">
                {errorMessage}
              </p>
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-900 text-white font-semibold py-3 px-6 rounded-xl transition-all shadow-lg"
            >
              <RefreshCw className="w-4 h-4" />
              페이지 새로고침
            </button>
            {isFirestoreError && (
              <p className="mt-4 text-xs text-slate-500 dark:text-slate-500">
                권한 부족 오류인 경우, 관리자에게 문의하거나 보안 규칙을 확인하세요.
              </p>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
