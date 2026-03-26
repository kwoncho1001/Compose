import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache,
  persistentSingleTabManager,
  getDocs,
  getDoc,
  getDocsFromCache,
  getDocFromCache,
  DocumentReference,
  Query,
  DocumentSnapshot,
  QuerySnapshot
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// 오프라인 지속성(캐시) 설정 적용 - 할당량 절약을 위해 영구 캐시 사용
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({})
}, firebaseConfig.firestoreDatabaseId);

/**
 * 할당량 초과 시 캐시에서 데이터를 가져오는 래퍼 함수 (Query용)
 */
export async function getDocsWithCacheFallback(query: Query): Promise<QuerySnapshot> {
  try {
    return await getDocs(query);
  } catch (error: any) {
    if (error.code === 'resource-exhausted' || error.message?.includes('Quota')) {
      console.warn('Firestore Quota exceeded, falling back to cache.');
      return await getDocsFromCache(query);
    }
    throw error;
  }
}

/**
 * 할당량 초과 시 캐시에서 데이터를 가져오는 래퍼 함수 (Document용)
 */
export async function getDocWithCacheFallback(docRef: DocumentReference): Promise<DocumentSnapshot> {
  try {
    return await getDoc(docRef);
  } catch (error: any) {
    if (error.code === 'resource-exhausted' || error.message?.includes('Quota')) {
      console.warn('Firestore Quota exceeded, falling back to cache.');
      return await getDocFromCache(docRef);
    }
    throw error;
  }
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
