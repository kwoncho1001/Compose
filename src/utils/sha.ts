import { Note } from '../types';

export const generateNoteSHA = async (note: Note): Promise<string> => {
  const data = `${note.title}|${note.folder}|${note.content}|${note.status}|${note.priority}|${note.noteType}|${note.parentNoteIds?.join(',')}|${note.childNoteIds?.join(',')}|${note.relatedNoteIds?.join(',')}`;
  const msgBuffer = new TextEncoder().encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};
