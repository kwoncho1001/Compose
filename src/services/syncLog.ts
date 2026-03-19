import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export interface SyncLog {
  [path: string]: string; // path -> sha
}

export const getSyncLog = async (userId: string, projectId: string): Promise<SyncLog> => {
  try {
    const logRef = doc(db, 'users', userId, 'projects', projectId, 'syncLogs', 'main');
    const logSnap = await getDoc(logRef);
    if (logSnap.exists()) {
      return logSnap.data().logs || {};
    }
  } catch (error) {
    console.error('Error fetching sync log:', error);
  }
  return {};
};

export const saveSyncLog = async (userId: string, projectId: string, logs: SyncLog): Promise<void> => {
  try {
    const logRef = doc(db, 'users', userId, 'projects', projectId, 'syncLogs', 'main');
    await setDoc(logRef, { logs }, { merge: true });
  } catch (error) {
    console.error('Error saving sync log:', error);
  }
};

export const subscribeSyncLog = (userId: string, projectId: string, callback: (logs: SyncLog) => void) => {
  const logRef = doc(db, 'users', userId, 'projects', projectId, 'syncLogs', 'main');
  return onSnapshot(logRef, (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data().logs || {});
    } else {
      callback({});
    }
  });
};
