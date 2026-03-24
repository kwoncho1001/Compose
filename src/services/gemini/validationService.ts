import { Note, GCM } from "../../types";

export const validateYamlMetadata = (content: string, gcm?: GCM): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];
  const yamlMatch = content.match(/^---\n([\s\S]*?)\n---/);
  
  if (!yamlMatch) {
    return { isValid: true, errors: [] };
  }

  const yamlStr = yamlMatch[1];
  const lines = yamlStr.split('\n');
  const meta: Record<string, string> = {};
  
  lines.forEach((line, index) => {
    if (!line) return;
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.includes(':')) {
      errors.push(`Line ${index + 1}: 올바른 YAML 형식이 아닙니다 (키: 값 형식이 필요함)`);
    } else if (trimmedLine.includes(':')) {
      const [key, ...val] = trimmedLine.split(':');
      meta[key.trim()] = val.join(':').trim();
    }
  });

  if (yamlStr && !yamlStr.includes('relatedNoteIds:')) {
    errors.push("마인드맵 연결을 위한 'relatedNoteIds' 필드가 메타데이터에 필요합니다.");
  }
  if (yamlStr && !yamlStr.includes('noteId:')) {
    errors.push("노트 식별을 위한 'noteId' 필드가 메타데이터에 필요합니다.");
  }

  // GCM Consistency Check
  if (gcm) {
    // Check entities
    if (meta.entities) {
      const usedEntities = meta.entities.replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean);
      usedEntities.forEach(entity => {
        if (!gcm.entities[entity]) {
          errors.push(`GCM 경고: 정의되지 않은 엔티티 '${entity}'가 사용되었습니다.`);
        }
      });
    }

    // Check variables
    if (meta.variables) {
      const usedVars = meta.variables.replace(/[\[\]]/g, '').split(',').map(s => s.trim()).filter(Boolean);
      usedVars.forEach(v => {
        if (!gcm.variables[v]) {
          errors.push(`GCM 경고: 정의되지 않은 변수 '${v}'가 사용되었습니다.`);
        }
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};
