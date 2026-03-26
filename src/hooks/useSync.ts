import { useState, useCallback } from 'react';
import { db, type LocalNote } from '../lib/db';
import { generateSHA256 } from '../lib/crypto';
import { 
  doc, 
  getDoc, 
  writeBatch,
} from 'firebase/firestore';
import { auth, firestore } from '../lib/firebase';
import { debounce } from 'lodash';
import LZString from 'lz-string';

export function useSync(projectId: string) {
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  const getRegistryPath = useCallback(() => {
    const user = auth.currentUser;
    if (!user) return null;
    return `users/${user.uid}/projects/${projectId}/sync/registry`;
  }, [projectId]);

  const getNotePath = useCallback((noteId: string) => {
    const user = auth.currentUser;
    if (!user) return null;
    return `users/${user.uid}/projects/${projectId}/notes/${noteId}`;
  }, [projectId]);

  // Step 1: Initialization (New Device) - Fetch Registry and populate metadata
  const initializeFromRegistry = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || !projectId) return;

    setIsSyncing(true);
    try {
      const registryRef = doc(firestore, getRegistryPath()!);
      const registrySnap = await getDoc(registryRef);
      
      if (registrySnap.exists()) {
        const { notesMetadata } = registrySnap.data();
        const localNotes = await db.notes.toArray();
        const localIds = new Set(localNotes.map(n => n.id));

        const batchUpdates: LocalNote[] = [];
        
        for (const [id, metadata] of Object.entries(notesMetadata) as [string, any][]) {
          if (!localIds.has(id)) {
            // New note from server (Lazy loading - metadata only)
            batchUpdates.push({
              id,
              title: metadata.title,
              folder: metadata.folder,
              noteType: metadata.noteType,
              status: metadata.status,
              lastUpdated: metadata.lastUpdated,
              remoteLastUpdated: metadata.lastUpdated,
              sha: metadata.sha,
              content: '', // No content yet
              summary: '',
              yamlMetadata: '',
              isDirty: false,
              hasContent: false // Mark for lazy loading
            });
          } else {
            // Existing note - check for updates (Incremental Update Stage)
            const local = localNotes.find(n => n.id === id)!;
            if (local.sha !== metadata.sha) {
              // SHA mismatch - compare timestamps
              const remoteTime = new Date(metadata.lastUpdated).getTime();
              const localTime = new Date(local.lastUpdated).getTime();

              if (remoteTime > localTime) {
                // Server is newer - mark for re-download
                await db.notes.update(id, {
                  ...metadata,
                  remoteLastUpdated: metadata.lastUpdated,
                  hasContent: false // Will need to re-fetch content
                });
              }
              // If local is newer, it will be handled by the 'sync' upload logic
            }
          }
        }

        if (batchUpdates.length > 0) {
          await db.notes.bulkAdd(batchUpdates);
        }

        // Handle deletions (ID in local but not in registry)
        const remoteIds = new Set(Object.keys(notesMetadata));
        const toDelete = localNotes.filter(n => !remoteIds.has(n.id) && !n.isDirty);
        if (toDelete.length > 0) {
          await db.notes.bulkDelete(toDelete.map(n => n.id));
        }
      }
      setLastSyncTime(new Date());
    } catch (error) {
      console.error('Initialization failed:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [projectId, getRegistryPath]);

  // Step 2: Lazy Loading - Fetch full content on demand
  const fetchNoteContent = useCallback(async (noteId: string) => {
    const note = await db.notes.get(noteId);
    if (!note || note.hasContent) return note;

    setIsSyncing(true);
    try {
      const noteRef = doc(firestore, getNotePath(noteId)!);
      const snap = await getDoc(noteRef);
      
      if (snap.exists()) {
        const data = snap.data();
        const content = LZString.decompressFromUTF16(data.content) || data.content;
        
        await db.notes.update(noteId, {
          ...data,
          content,
          hasContent: true,
          isDirty: false
        });
        
        return await db.notes.get(noteId);
      }
    } catch (error) {
      console.error('Failed to fetch note content:', error);
    } finally {
      setIsSyncing(false);
    }
    return note;
  }, [getNotePath]);

  // Step 3: Incremental Sync (Upload & Registry Update)
  const sync = useCallback(async () => {
    const user = auth.currentUser;
    if (!user || !projectId) return;

    setIsSyncing(true);
    try {
      const registryRef = doc(firestore, getRegistryPath()!);
      const registrySnap = await getDoc(registryRef);
      const remoteMetadata = registrySnap.exists() ? registrySnap.data().notesMetadata : {};

      const localNotes = await db.notes.toArray();
      const dirtyNotes = localNotes.filter(n => n.isDirty);

      if (dirtyNotes.length === 0) {
        setIsSyncing(false);
        return;
      }

      const batch = writeBatch(firestore);
      const updatedMetadata = { ...remoteMetadata };
      let uploadCount = 0;

      for (const note of dirtyNotes) {
        // Double check if local is actually newer or if we should resolve conflict
        const remote = remoteMetadata[note.id];
        if (remote) {
          const remoteTime = new Date(remote.lastUpdated).getTime();
          const localTime = new Date(note.lastUpdated).getTime();
          
          if (remoteTime > localTime) {
            console.warn(`Conflict detected for ${note.id}. Server is newer. Skipping upload.`);
            continue;
          }
        }

        const noteRef = doc(firestore, getNotePath(note.id)!);
        const compressedContent = LZString.compressToUTF16(note.content);
        
        const { isDirty, sha, hasContent, remoteLastUpdated, ...firestoreData } = note;
        batch.set(noteRef, {
          ...firestoreData,
          content: compressedContent,
        });

        updatedMetadata[note.id] = {
          sha: note.sha,
          title: note.title,
          folder: note.folder,
          lastUpdated: note.lastUpdated,
          noteType: note.noteType,
          status: note.status
        };
        uploadCount++;
      }

      if (uploadCount > 0) {
        batch.set(registryRef, {
          notesMetadata: updatedMetadata,
          lastUpdated: new Date().toISOString()
        });

        await batch.commit();

        await db.notes.bulkUpdate(dirtyNotes.map(n => ({
          key: n.id,
          changes: { isDirty: false, hasContent: true }
        })));
      }

      setLastSyncTime(new Date());
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      setIsSyncing(false);
    }
  }, [projectId, getRegistryPath, getNotePath]);

  const debouncedSync = useCallback(
    debounce(() => {
      sync();
    }, 10000),
    [sync]
  );

  const updateNoteLocally = useCallback(async (note: Partial<LocalNote> & { id: string }) => {
    const existing = await db.notes.get(note.id);
    if (!existing) return;

    const updatedNote = { ...existing, ...note };
    const metadata = {
      title: updatedNote.title,
      folder: updatedNote.folder,
      noteType: updatedNote.noteType,
      status: updatedNote.status,
    };
    
    const newSha = await generateSHA256(updatedNote.content, metadata);
    
    await db.notes.update(note.id, {
      ...note,
      sha: newSha,
      isDirty: true,
      hasContent: true, // If we're updating it locally, we definitely have the content
      lastUpdated: new Date().toISOString()
    });

    debouncedSync();
  }, [debouncedSync]);

  return {
    isSyncing,
    lastSyncTime,
    sync,
    initializeFromRegistry,
    fetchNoteContent,
    updateNoteLocally
  };
}
