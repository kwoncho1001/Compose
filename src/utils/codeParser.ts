export interface LogicUnit {
  title: string;
  codeSnippet: string;
  logicHash: string;
}

export const extractLogicUnits = (code: string, filePath: string): LogicUnit[] => {
  const units: LogicUnit[] = [];
  const lines = code.split('\n');
  
  interface ActiveUnit {
    title: string;
    lines: string[];
    startLine: number;
    braceCount: number;
    isInner: boolean;
  }
  
  const stack: ActiveUnit[] = [];
  
  const isStartOfUnit = (line: string, isTopLevel: boolean) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*')) return false;

    // 1. Top-level declarations
    if (isTopLevel) {
      const declPattern = /^(export\s+)?(class|function|const|let|var|interface|type)\s+([a-zA-Z0-9_]+)/;
      if (declPattern.test(trimmed)) return true;
    }
    
    // 2. Inner logic (Hooks, handlers)
    if (!isTopLevel) {
      const hookPattern = /^(const|let|var)?\s*([a-zA-Z0-9_]+)?\s*=?\s*(useEffect|useMemo|useCallback|useLayoutEffect|use[A-Z][a-zA-Z0-9_]+)\s*\(/;
      if (hookPattern.test(trimmed)) return true;
      
      const handlerPattern = /^(const|let|var)\s+(handle[A-Z][a-zA-Z0-9_]+)\s*=\s*(async\s+)?(\([^)]*\)|[a-zA-Z0-9_]+)\s*=>/;
      if (handlerPattern.test(trimmed)) return true;
    }
    return false;
  };

  const getUnitTitle = (line: string, isTopLevel: boolean) => {
    const trimmed = line.trim();
    if (isTopLevel) {
      const match = trimmed.match(/(?:class|function|const|let|var|interface|type)\s+([a-zA-Z0-9_]+)/);
      if (match && match[1]) return match[1];
    } else {
      const hookMatch = trimmed.match(/(?:const|let|var)?\s*([a-zA-Z0-9_]+)?\s*=?\s*(useEffect|useMemo|useCallback|use[A-Z][a-zA-Z0-9_]+)/);
      if (hookMatch && hookMatch[2]) {
        return hookMatch[1] ? `${hookMatch[1]}_${hookMatch[2]}` : hookMatch[2];
      }
      const handlerMatch = trimmed.match(/(?:const|let|var)\s+(handle[A-Z][a-zA-Z0-9_]+)/);
      if (handlerMatch && handlerMatch[1]) return handlerMatch[1];
    }
    return 'Anonymous_Logic';
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isTopLevel = stack.length === 0;
    
    if (isStartOfUnit(line, isTopLevel)) {
      const title = getUnitTitle(line, isTopLevel);
      const newUnit: ActiveUnit = {
        title,
        lines: [line],
        startLine: i,
        braceCount: (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length,
        isInner: !isTopLevel
      };
      
      if (newUnit.braceCount <= 0 && line.includes(';')) {
        pushUnit(newUnit);
        if (stack.length > 0) {
          stack[stack.length - 1].lines.push(line);
        }
      } else {
        stack.push(newUnit);
      }
    } else if (stack.length > 0) {
      for (const unit of stack) {
        unit.lines.push(line);
      }
      
      const topUnit = stack[stack.length - 1];
      topUnit.braceCount += (line.match(/\{/g) || []).length - (line.match(/\}/g) || []).length;
      
      if (topUnit.braceCount <= 0) {
        pushUnit(topUnit);
        stack.pop();
      }
    }
  }

  while (stack.length > 0) {
    pushUnit(stack.pop()!);
  }

  function pushUnit(unit: ActiveUnit) {
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

export const generateHash = (str: string): string => {
  // Normalize: remove comments, collapse whitespace, and remove non-essential characters
  // to ensure that only actual logic changes affect the hash.
  const normalized = str
    .replace(/\/\/.*$/gm, '') // remove single line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // remove multi-line comments
    .replace(/\s+/g, '') // remove ALL whitespace for maximum stability against formatting
    .replace(/['"`]/g, '"') // normalize all quotes to double quotes
    .replace(/;+$/g, '') // remove trailing semicolons
    .trim();
  
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  const hexHash = Math.abs(hash).toString(16).padStart(8, '0');
  return `LOGIC_${hexHash}`; 
};
