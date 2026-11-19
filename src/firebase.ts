import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  doc,
  getDoc,
  getDocFromServer,
  getFirestore,
  runTransaction,
  serverTimestamp,
} from 'firebase/firestore';
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from 'firebase/storage';
import firebaseConfig from '../firebase-applet-config.json';
import {
  MAX_FILE_SIZE_BYTES,
  MAX_MONTHLY_UPLOADS,
  MAX_TOTAL_STORAGE_BYTES,
  StorageUsage,
  StoredFileRef,
} from './types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const storage = getStorage(app);

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
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function getCurrentMonthKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export function validateFileSize(file: File): void {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `File "${file.name}" (${formatFileSize(file.size)}) exceeds the 10 MB upload limit.`
    );
  }
}

async function compressImageIfNeeded(file: File): Promise<File> {
  const compressibleTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!compressibleTypes.includes(file.type) || file.size <= 250 * 1024) {
    return file;
  }

  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const maxDim = 1600;
      let { width, height } = img;
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(file);
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (!blob || blob.size >= file.size) {
            resolve(file);
            return;
          }
          const extName = file.name.replace(/\.[^.]+$/, '.jpg');
          resolve(new File([blob], extName, { type: 'image/jpeg' }));
        },
        'image/jpeg',
        0.82
      );
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(file);
    };
    img.src = objectUrl;
  });
}

async function checkStorageQuotaBeforeUpload(fileSizeBytes: number): Promise<void> {
  const usageRef = doc(db, 'storageMeta', 'usage');
  const snap = await getDoc(usageRef);
  const currentMonth = getCurrentMonthKey();

  if (!snap.exists()) return;
  const data = snap.data() as StorageUsage;
  const monthlyCount =
    data.monthKey === currentMonth ? data.monthlyUploadsCount || 0 : 0;

  if (data.totalBytesUsed + fileSizeBytes > MAX_TOTAL_STORAGE_BYTES) {
    throw new Error(
      `Upload blocked to prevent Blaze charges: team storage (${formatFileSize(
        data.totalBytesUsed
      )}) would exceed the 4.00 GB safety cap.`
    );
  }
  if (monthlyCount >= MAX_MONTHLY_UPLOADS) {
    throw new Error(
      `Upload blocked to prevent Blaze charges: monthly upload limit (${MAX_MONTHLY_UPLOADS} files) reached for ${currentMonth}.`
    );
  }
}

async function recordStorageUpload(fileSizeBytes: number): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const usageRef = doc(db, 'storageMeta', 'usage');
  const currentMonth = getCurrentMonthKey();

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(usageRef);
    if (!snap.exists()) {
      tx.set(usageRef, {
        teamCode: 'FRC451',
        totalBytesUsed: Math.min(fileSizeBytes, MAX_TOTAL_STORAGE_BYTES),
        fileCount: 1,
        monthlyUploadsCount: 1,
        monthKey: currentMonth,
        updatedBy: uid,
        updatedAt: serverTimestamp(),
      });
      return;
    }

    const prev = snap.data() as StorageUsage;
    const prevMonthCount =
      prev.monthKey === currentMonth ? prev.monthlyUploadsCount || 0 : 0;

    tx.update(usageRef, {
      totalBytesUsed: Math.min(
        (prev.totalBytesUsed || 0) + fileSizeBytes,
        MAX_TOTAL_STORAGE_BYTES
      ),
      fileCount: (prev.fileCount || 0) + 1,
      monthlyUploadsCount: Math.min(prevMonthCount + 1, 4500),
      monthKey: currentMonth,
      updatedBy: uid,
      updatedAt: serverTimestamp(),
    });
  });
}

async function recordStorageDeletion(fileSizeBytes: number): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  const usageRef = doc(db, 'storageMeta', 'usage');
  const currentMonth = getCurrentMonthKey();

  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(usageRef);
      if (!snap.exists()) return;
      const prev = snap.data() as StorageUsage;
      tx.update(usageRef, {
        totalBytesUsed: Math.max(0, (prev.totalBytesUsed || 0) - fileSizeBytes),
        fileCount: Math.max(0, (prev.fileCount || 0) - 1),
        monthlyUploadsCount:
          prev.monthKey === currentMonth ? prev.monthlyUploadsCount || 0 : 0,
        monthKey: currentMonth,
        updatedBy: uid,
        updatedAt: serverTimestamp(),
      });
    });
  } catch {
    // Non-fatal if ledger update races during batch delete
  }
}

export async function uploadTeamFile(
  file: File,
  storagePath: string
): Promise<StoredFileRef> {
  validateFileSize(file);
  const processedFile = await compressImageIfNeeded(file);
  validateFileSize(processedFile);
  await checkStorageQuotaBeforeUpload(processedFile.size);

  try {
    const fileRef = ref(storage, storagePath);
    const snapshot = await uploadBytes(fileRef, processedFile, {
      contentType: processedFile.type || 'application/octet-stream',
    });
    const url = await getDownloadURL(snapshot.ref);
    await recordStorageUpload(processedFile.size);
    return {
      name: processedFile.name,
      size: processedFile.size,
      url,
      storagePath,
      contentType: processedFile.type || 'application/octet-stream',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `File upload failed for "${file.name}". Ensure Firebase Storage is enabled in your Firebase Console (${msg}).`
    );
  }
}

export async function deleteTeamFile(
  storagePath: string,
  sizeBytes = 0
): Promise<void> {
  if (!storagePath) return;
  try {
    await deleteObject(ref(storage, storagePath));
  } catch (err) {
    const code = (err as { code?: string })?.code;
    if (code !== 'storage/object-not-found') {
      console.warn('Storage delete warning:', err);
    }
  }
  if (sizeBytes > 0) {
    await recordStorageDeletion(sizeBytes);
  }
}

export async function deleteTeamFileByUrl(url: string): Promise<void> {
  if (!url || !url.includes('firebasestorage')) return;
  try {
    await deleteObject(ref(storage, url));
  } catch {
    // Ignore if already deleted or external URL
  }
}
