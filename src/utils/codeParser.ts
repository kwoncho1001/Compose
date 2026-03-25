export interface LogicUnit {
  title: string;
  codeSnippet: string;
  logicHash: string;
}

export const extractLogicUnits = (code: string, filePath: string): LogicUnit[] => {
  const units: LogicUnit[] = [];
  const lines = code.split('\n');
  
  let currentUnit: { title: string; lines: string[]; startLine: number } | null = null;
  let braceCount = 0;

  const isStartOfUnit = (line: string, isTopLevel: boolean) => {
    const trimmed = line.trim();
    
    // 1. 최상위 선언 (Class, Function, Interface 등)
    if (isTopLevel && /^(export\s+)?(class|function|const|let|var|interface|type)\s+([a-zA-Z0-9_]+)/.test(trimmed)) return true;
    
    // 2. 내부 핵심 로직 유닛 (강화됨)
    // - React Hooks: useEffect, useMemo, useCallback 등
    if (/^(useEffect|useMemo|useCallback|useLayoutEffect|useImperativeHandle|useInsertionEffect)\s*\(/.test(trimmed)) return true;
    
    // - API 호출/비즈니스 로직 핸들러: handleXxx, syncXxx, fetchXxx 등
    if (/^(const|let|var|async\s+function|function)\s+(handle|sync|fetch|on|compute|validate|process|submit|update|delete|create|get|set)[a-zA-Z0-9_]*\s*(=|\()/.test(trimmed)) return true;
    
    // - 복잡한 조건부 렌더링 또는 변환 로직 (선택적)
    if (trimmed.startsWith('const') && (trimmed.includes('render') || trimmed.includes('Component')) && trimmed.includes('=')) return true;

    return false;
  };

  const getUnitTitle = (line: string) => {
    const trimmed = line.trim();
    // Try to match standard declarations
    const declMatch = trimmed.match(/^(?:export\s+)?(?:class|function|const|let|var|interface|type)\s+([a-zA-Z0-9_]+)/);
    if (declMatch) return declMatch[1];
    
    // Try to match hooks
    const hookMatch = trimmed.match(/^(useEffect|useLayoutEffect|useMemo|useCallback|use[A-Z][a-zA-Z0-9_]+)/);
    if (hookMatch) return hookMatch[1];
    
    return 'Internal Logic';
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTopLevel = braceCount === 0;
    
    if (!currentUnit && isStartOfUnit(line, isTopLevel)) {
      currentUnit = {
        title: getUnitTitle(line),
        lines: [line],
        startLine: i
      };
      braceCount = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
    } else if (currentUnit) {
      currentUnit.lines.push(line);
      braceCount += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      
      if (braceCount <= 0) {
        // End of unit
        const snippet = currentUnit.lines.join('\n');
        units.push({
          title: currentUnit.title,
          codeSnippet: snippet,
          logicHash: generateHash(snippet)
        });
        currentUnit = null;
        braceCount = 0;
      }
    }
  }

  // If the whole file is just one big script without clear blocks, or if no units were found
  if (units.length === 0 && code.trim().length > 0) {
    units.push({
      title: filePath.split('/').pop() || 'File Content',
      codeSnippet: code,
      logicHash: generateHash(code)
    });
  }

  return units;
};

const generateHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
};
