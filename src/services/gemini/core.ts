import { Note } from "../../types";
import { ai } from "./config";

export const parseMetadata = (yaml: string): Record<string, string> => {
  const result: Record<string, string> = {};
  if (!yaml) return result;
  yaml.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length > 0) {
      result[key.trim()] = valueParts.join(':').trim();
    }
  });
  return result;
};

export const safeJsonParse = (text: string) => {
  if (!text) return null;
  try {
    // Remove markdown code blocks if present
    const cleaned = text.replace(/```json\s?([\s\S]*?)\s?```/g, '$1')
                        .replace(/^```json\n?/, '')
                        .replace(/\n?```$/, '')
                        .trim();
    return JSON.parse(cleaned);
  } catch (e) {
    // If parsing fails, try to find the first '{' and last '}'
    try {
      const firstBrace = text.indexOf('{');
      const lastBrace = text.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1) {
        const potentialJson = text.substring(firstBrace, lastBrace + 1);
        return JSON.parse(potentialJson);
      }
    } catch (innerE) {
      // Ignore inner error
    }
    console.error("Failed to parse JSON response from AI:", text);
    throw new Error(`AI returned invalid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
};

export const generateContentWithRetry = async (params: any, retries = 3, delay = 1000) => {
  for (let i = 0; i < retries; i++) {
    try {
      return await ai.models.generateContent(params);
    } catch (error: any) {
      if (error?.message === "Operation cancelled" || error === "Operation cancelled") {
        throw error;
      }
      console.error(`Gemini API Error (Attempt ${i + 1}/${retries}):`, error);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, delay * (i + 1)));
    }
  }
};

export const sanitizeNotes = (updatedNotes: any[], allNotes: Note[]): Note[] => {
  const allNotesMap = new Map(allNotes.map(n => [n.id, n]));
  const titleToIdMap = new Map(allNotes.map(n => [n.title, n.id]));
  
  return updatedNotes.map(note => {
    const existingNote = note.id ? allNotesMap.get(note.id) : null;
    
    // Ensure arrays
    const rawParentIds = Array.isArray(note.parentNoteIds) 
      ? note.parentNoteIds 
      : (note.parentNoteId ? [note.parentNoteId] : (existingNote?.parentNoteIds || []));
    
    const sanitizedParentIds = rawParentIds.map((idOrTitle: any) => {
      if (typeof idOrTitle !== 'string') return null;
      if (allNotesMap.has(idOrTitle)) return idOrTitle;
      if (titleToIdMap.has(idOrTitle)) return titleToIdMap.get(idOrTitle)!;
      return idOrTitle;
    }).filter((id: any): id is string => !!id && typeof id === 'string');

    const rawRelatedIds = Array.isArray(note.relatedNoteIds) 
      ? note.relatedNoteIds 
      : (existingNote?.relatedNoteIds || []);
    
    const sanitizedRelatedIds = rawRelatedIds.map((idOrTitle: any) => {
      if (typeof idOrTitle !== 'string') return null;
      if (allNotesMap.has(idOrTitle)) return idOrTitle;
      if (titleToIdMap.has(idOrTitle)) return titleToIdMap.get(idOrTitle)!;
      return idOrTitle;
    }).filter((id: any): id is string => !!id && typeof id === 'string');
    
    const sanitizedTags = Array.isArray(note.tags) ? note.tags : (existingNote?.tags || []);
    const sanitizedChildIds = Array.isArray(note.childNoteIds) ? note.childNoteIds : (existingNote?.childNoteIds || []);

    return { 
      ...existingNote,
      ...note, 
      id: note.id || existingNote?.id || Math.random().toString(36).substr(2, 9),
      parentNoteIds: Array.from(new Set(sanitizedParentIds)), 
      relatedNoteIds: Array.from(new Set(sanitizedRelatedIds)),
      childNoteIds: Array.from(new Set(sanitizedChildIds)),
      tags: Array.from(new Set(sanitizedTags.filter((t: any) => typeof t === 'string'))),
      priority: note.priority || existingNote?.priority || 'C',
      status: note.status || existingNote?.status || 'Planned',
      version: note.version || existingNote?.version || '1.0.0',
      lastUpdated: new Date().toISOString(),
      importance: note.importance || existingNote?.importance || 3,
      noteType: note.noteType || existingNote?.noteType || 'Task',
      folder: note.folder || existingNote?.folder || 'Uncategorized',
    } as Note;
  });
};
