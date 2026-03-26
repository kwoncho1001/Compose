import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc, setDoc, writeBatch, collection, getDocs, deleteDoc } from 'firebase/firestore';
import { Note, SyncRegistry, SyncEntry } from '../types';

const SYNC_REGISTRY_ID = 'sync_index';

export const getSyncRegistry = async (userId: string, projectId: string): Promise<SyncRegistry | null> => {
  const registryRef = doc(db, 'users', userId, 'projects', projectId, 'sync', SYNC_REGISTRY_ID);
  try {
    const snap = await getDoc(registryRef);
    if (snap.exists()) {
      return snap.data() as SyncRegistry;
    }
    return null;
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, registryRef.path);
    return null;
  }
};

export const updateSyncRegistry = async (userId: string, projectId: string, registry: SyncRegistry) => {
  const registryRef = doc(db, 'users', userId, 'projects', projectId, 'sync', SYNC_REGISTRY_ID);
  try {
    await setDoc(registryRef, registry);
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, registryRef.path);
  }
};

export const getNote = async (userId: string, projectId: string, noteId: string): Promise<Note | null> => {
  const noteRef = doc(db, 'users', userId, 'projects', projectId, 'notes', noteId);
  try {
    const snap = await getDoc(noteRef);
    if (snap.exists()) {
      return snap.data() as Note;
    }
    return null;
  } catch (e) {
    handleFirestoreError(e, OperationType.GET, noteRef.path);
    return null;
  }
};

export const saveNoteWithRegistry = async (
  userId: string, 
  projectId: string, 
  note: Note, 
  entry: SyncEntry,
  cleanObject: (obj: any) => any
) => {
  const batch = writeBatch(db);
  const noteRef = doc(db, 'users', userId, 'projects', projectId, 'notes', note.id);
  const registryRef = doc(db, 'users', userId, 'projects', projectId, 'sync', SYNC_REGISTRY_ID);

  batch.set(noteRef, cleanObject(note));
  
  // We need to update the registry as well.
  // Since we don't have the full registry here, we'll use a field update if possible,
  // but for simplicity in this implementation, we'll assume the registry is managed at a higher level
  // or we'll fetch and update.
  // Actually, using `setDoc` with `merge: true` on the registry might be better for individual updates.
  batch.set(registryRef, {
    entries: {
      [note.id]: entry
    },
    lastSyncedAt: new Date().toISOString()
  }, { merge: true });

  try {
    await batch.commit();
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, 'save-note-with-registry');
  }
};

export const saveNotesBatchWithRegistry = async (
  userId: string,
  projectId: string,
  notes: Note[],
  entries: Record<string, SyncEntry>,
  cleanObject: (obj: any) => any
) => {
  const batch = writeBatch(db);
  const registryRef = doc(db, 'users', userId, 'projects', projectId, 'sync', SYNC_REGISTRY_ID);

  notes.forEach(note => {
    const noteRef = doc(db, 'users', userId, 'projects', projectId, 'notes', note.id);
    batch.set(noteRef, cleanObject(note));
  });

  batch.set(registryRef, {
    entries: entries,
    lastSyncedAt: new Date().toISOString()
  }, { merge: true });

  try {
    await batch.commit();
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, 'save-notes-batch-with-registry');
  }
};

export const deleteNotesWithRegistry = async (
  userId: string,
  projectId: string,
  noteIds: string[],
  registry: SyncRegistry
) => {
  const batch = writeBatch(db);
  const registryRef = doc(db, 'users', userId, 'projects', projectId, 'sync', SYNC_REGISTRY_ID);

  noteIds.forEach(id => {
    const noteRef = doc(db, 'users', userId, 'projects', projectId, 'notes', id);
    batch.delete(noteRef);
    delete registry.entries[id];
  });

  batch.set(registryRef, registry);

  try {
    await batch.commit();
  } catch (e) {
    handleFirestoreError(e, OperationType.DELETE, 'delete-notes-with-registry');
  }
};
