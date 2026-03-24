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

  const isStartOfUnit = (line: string) => {
    return /^(export\s+)?(class|function|const|let|var|interface|type)\s+([a-zA-Z0-9_]+)/.test(line.trim());
  };

  const getUnitTitle = (line: string) => {
    const match = line.trim().match(/^(?:export\s+)?(?:class|function|const|let|var|interface|type)\s+([a-zA-Z0-9_]+)/);
    return match ? match[1] : 'Unknown';
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (!currentUnit && isStartOfUnit(line)) {
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
