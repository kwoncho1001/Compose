import React from 'react';
import { GCM } from '../types';
import { Database, Link, Hash } from 'lucide-react';

interface GCMViewerProps {
  gcm: GCM;
}

export const GCMViewer: React.FC<GCMViewerProps> = ({ gcm }) => {
  if (!gcm) return null;

  const entities = gcm.entities || {};
  const variables = gcm.variables || {};

  return (
    <div className="w-80 bg-slate-50 dark:bg-slate-950 border-l border-slate-200 dark:border-slate-800 h-full overflow-y-auto flex flex-col transition-colors duration-200">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 z-10">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-2">
          <Database className="w-5 h-5 text-emerald-500" />
          글로벌 컨텍스트 맵
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          모든 노트와 코드 간의 일관성을 보장합니다.
        </p>
      </div>

      <div className="p-4 space-y-6">
        {/* Entities */}
        <div>
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Link className="w-4 h-4" />
            엔티티
          </h3>
          {Object.keys(entities).length === 0 ? (
            <p className="text-sm text-slate-400 italic">정의된 엔티티가 없습니다.</p>
          ) : (
            <div className="space-y-4">
              {Object.values(entities).map((entity) => (
                <div key={entity.name} className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-slate-800 dark:text-slate-200">{entity.name}</span>
                    <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-400 px-2 py-0.5 rounded-full font-mono">
                      {entity.type}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{entity.description}</p>
                  <div className="space-y-1">
                    {Object.entries(entity.properties || {}).map(([propName, propType]) => (
                      <div key={propName} className="flex items-center justify-between text-xs">
                        <span className="text-slate-600 dark:text-slate-400 font-mono">{propName}</span>
                        <span className="text-slate-400 dark:text-slate-500 font-mono">{propType}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Global Variables */}
        <div>
          <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Hash className="w-4 h-4" />
            전역 변수
          </h3>
          {Object.keys(variables).length === 0 ? (
            <p className="text-sm text-slate-400 italic">정의된 변수가 없습니다.</p>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
              {Object.entries(variables).map(([key, value], index) => (
                <div
                  key={key}
                  className={`flex items-center justify-between p-3 text-xs ${
                    index !== Object.keys(variables).length - 1 ? 'border-b border-slate-100 dark:border-slate-800' : ''
                  }`}
                >
                  <span className="font-mono text-slate-700 dark:text-slate-300">{key}</span>
                  <span className="font-mono text-indigo-600 dark:text-indigo-400">{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
