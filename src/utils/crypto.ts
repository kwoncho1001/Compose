/**
 * Generates a SHA-256 hash of the given string.
 */
export async function generateSHA256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Generates a fingerprint for a note based on its content and key metadata.
 */
export async function generateNoteFingerprint(note: {
  title: string;
  content: string;
  folder: string;
  status: string;
  priority: string;
  parentNoteIds: string[];
  childNoteIds: string[];
  relatedNoteIds: string[];
}): Promise<string> {
  const dataToHash = JSON.stringify({
    title: note.title,
    content: note.content,
    folder: note.folder,
    status: note.status,
    priority: note.priority,
    parents: note.parentNoteIds.sort(),
    children: note.childNoteIds.sort(),
    related: note.relatedNoteIds.sort(),
  });
  return generateSHA256(dataToHash);
}
