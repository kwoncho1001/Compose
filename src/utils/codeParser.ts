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
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) return false;

    // 1. 모든 선언부 포착 (export 무관)
    const declPattern = /^(export\s+)?(class|function|const|let|var|interface|type)\s+([a-zA-Z0-9_]+)/;
    if (declPattern.test(trimmed)) return true;
    
    // 2. 내부 핵심 로직 (Hook 등)
    if (!isTopLevel) {
      const hookPattern = /^(useEffect|useMemo|useCallback|useLayoutEffect|use[A-Z][a-zA-Z0-9_]+)\s*\(/;
      if (hookPattern.test(trimmed)) return true;
    }
    return false;
  };

  const getUnitTitle = (line: string) => {
    const trimmed = line.trim();
    const match = trimmed.match(/(?:class|function|const|let|var|interface|type)\s+([a-zA-Z0-9_]+)/);
    if (match && match[1]) return match[1];
    const hookMatch = trimmed.match(/^(useEffect|useMemo|useCallback|use[A-Z][a-zA-Z0-9_]+)/);
    if (hookMatch) return hookMatch[1];
    return 'Anonymous_Logic';
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTopLevel = braceCount === 0;
    
    if (!currentUnit && isStartOfUnit(line, isTopLevel)) {
      currentUnit = { title: getUnitTitle(line), lines: [line], startLine: i };
      braceCount = (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      if (braceCount <= 0 && line.includes(';')) {
        pushUnit(currentUnit);
        currentUnit = null;
      }
    } else if (currentUnit) {
      currentUnit.lines.push(line);
      braceCount += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      if (braceCount <= 0) {
        pushUnit(currentUnit);
        currentUnit = null;
        braceCount = 0;
      }
    }
  }

  function pushUnit(unit: { title: string; lines: string[] }) {
    const snippet = unit.lines.join('\n');
    if (snippet.trim().length > 0) {
      units.push({
        title: unit.title,
        codeSnippet: snippet,
        logicHash: generateHash(snippet)
      });
    }
  }
  return units;
};

const generateHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
};
