import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  ADMIN_PASSKEY,
  DEFAULT_MACHINES,
  MAX_TOTAL_STORAGE_BYTES,
  Part,
  Project,
  SPENDING_PASSKEY,
  StorageUsage,
  Subassembly,
  TEAM_PASSKEY,
} from '../types';
import {
  OperationType,
  auth,
  db,
  deleteTeamFile,
  deleteTeamFileByUrl,
  getCurrentMonthKey,
  googleProvider,
  handleFirestoreError,
  uploadTeamFile,
} from '../firebase';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface AppContextValue {
  user: User | null;
  authReady: boolean;
  teamUnlocked: boolean;
  adminUnlocked: boolean;
  spendingUnlocked: boolean;
  unlockedProjectIds: Record<string, boolean>;
  darkMode: boolean;
  projects: Project[];
  projectsLoading: boolean;
  machines: string[];
  storageUsage: StorageUsage | null;
  toasts: ToastMessage[];
  signInGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  unlockTeam: (passkey: string) => boolean;
  unlockAdmin: (passkey: string) => boolean;
  unlockSpending: (passkey: string) => boolean;
  unlockProjectEditor: (projectId: string, password: string) => boolean;
  toggleDarkMode: () => void;
  pushToast: (type: ToastMessage['type'], text: string) => void;
  dismissToast: (id: string) => void;
  createProject: (input: {
    name: string;
    description?: string;
    editorPassword: string;
    coverImageFile?: File | null;
  }) => Promise<string>;
  updateProject: (
    projectId: string,
    input: {
      name: string;
      description?: string;
      editorPassword: string;
      coverImageFile?: File | null;
      removeCoverImage?: boolean;
    }
  ) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  createSubassembly: (
    projectId: string,
    input: { name: string; assemblyNumber: string }
  ) => Promise<string>;
  updateSubassembly: (
    projectId: string,
    subassemblyId: string,
    input: { name: string; assemblyNumber: string }
  ) => Promise<void>;
  deleteSubassembly: (projectId: string, subassemblyId: string) => Promise<void>;
  createPart: (
    projectId: string,
    subassemblyId: string,
    partData: Omit<
      Part,
      | 'id'
      | 'projectId'
      | 'subassemblyId'
      | 'teamCode'
      | 'createdBy'
      | 'createdByName'
      | 'updatedBy'
      | 'updatedByName'
      | 'requestedBy'
      | 'requestedByName'
      | 'requestedAt'
      | 'createdAt'
      | 'updatedAt'
    >
  ) => Promise<string>;
  updatePart: (
    projectId: string,
    subassemblyId: string,
    partId: string,
    updates: Partial<Part>
  ) => Promise<void>;
  deletePart: (
    projectId: string,
    subassemblyId: string,
    partId: string
  ) => Promise<void>;
  saveMachinesRoster: (nextMachines: string[]) => Promise<void>;
  recalculateStorageUsage: () => Promise<void>;
}

const AppContext = createContext<AppContextValue | null>(null);

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

function getUserActorLabel(u: User | null): string {
  if (!u) return 'Team Member';
  const displayName = u.displayName?.trim();
  const email = u.email?.trim();
  if (displayName && email) return `${displayName} (${email})`.slice(0, 120);
  if (displayName) return displayName.slice(0, 120);
  if (email) return email.slice(0, 120);
  return u.uid.slice(0, 120);
}

function safeSessionGet(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key: string, value: string): void {
  try {
    sessionStorage.setItem(key, value);
  } catch {
    // Ignore storage restriction errors
  }
}

function safeSessionRemove(key: string): void {
  try {
    sessionStorage.removeItem(key);
  } catch {
    // Ignore storage restriction errors
  }
}

function safeLocalGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage restriction errors
  }
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);

  const [teamUnlocked, setTeamUnlocked] = useState<boolean>(
    () => safeSessionGet('ca451_team_unlocked') === 'true'
  );
  const [adminUnlocked, setAdminUnlocked] = useState<boolean>(
    () => safeSessionGet('ca451_admin_unlocked') === 'true'
  );
  const [spendingUnlocked, setSpendingUnlocked] = useState<boolean>(
    () => safeSessionGet('ca451_spending_unlocked') === 'true'
  );
  const [unlockedProjectIds, setUnlockedProjectIds] = useState<
    Record<string, boolean>
  >(() => {
    try {
      const raw = safeSessionGet('ca451_unlocked_projects');
      return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    } catch {
      return {};
    }
  });

  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = safeLocalGet('ca451_theme');
    return saved ? saved === 'dark' : true;
  });

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState<boolean>(true);
  const [machines, setMachines] = useState<string[]>(DEFAULT_MACHINES);
  const [storageUsage, setStorageUsage] = useState<StorageUsage | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const pushToast = useCallback(
    (type: ToastMessage['type'], text: string) => {
      const id = makeId('toast');
      setToasts((prev) => [...prev, { id, type, text }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 4500);
    },
    []
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Sync dark mode class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    safeLocalSet('ca451_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const toggleDarkMode = useCallback(() => {
    setDarkMode((prev) => !prev);
  }, []);

  // Firebase Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

  // Live Firestore subscriptions when signed in & verified
  useEffect(() => {
    if (!authReady) return;
    if (!user || !user.emailVerified) {
      setProjects([]);
      setProjectsLoading(false);
      return;
    }

    setProjectsLoading(true);
    const projectsQ = query(
      collection(db, 'projects'),
      where('teamCode', '==', 'FRC451')
    );

    const unsubProjects = onSnapshot(
      projectsQ,
      (snap) => {
        const list: Project[] = snap.docs.map((d) => ({
          ...(d.data() as Omit<Project, 'id'>),
          id: d.id,
        }));
        list.sort((a, b) => a.name.localeCompare(b.name));
        setProjects(list);
        setProjectsLoading(false);
      },
      (err) => {
        setProjectsLoading(false);
        handleFirestoreError(err, OperationType.LIST, 'projects');
      }
    );

    const machinesRef = doc(db, 'settings', 'machines');
    const unsubMachines = onSnapshot(
      machinesRef,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as { machines?: string[] };
          if (Array.isArray(data.machines)) {
            setMachines(data.machines);
          }
        } else {
          void setDoc(machinesRef, {
            teamCode: 'FRC451',
            machines: DEFAULT_MACHINES,
            updatedBy: user.uid,
            updatedAt: serverTimestamp(),
          }).catch(() => {
            // Non-blocking fallback if concurrent create
          });
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'settings/machines');
      }
    );

    const usageRef = doc(db, 'storageMeta', 'usage');
    const unsubUsage = onSnapshot(
      usageRef,
      (snap) => {
        if (snap.exists()) {
          setStorageUsage(snap.data() as StorageUsage);
        } else {
          setStorageUsage({
            teamCode: 'FRC451',
            totalBytesUsed: 0,
            fileCount: 0,
            monthlyUploadsCount: 0,
            monthKey: getCurrentMonthKey(),
          });
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'storageMeta/usage');
      }
    );

    return () => {
      unsubProjects();
      unsubMachines();
      unsubUsage();
    };
  }, [authReady, user]);

  const signInGoogle = useCallback(async () => {
    try {
      await signInWithPopup(auth, googleProvider);
      pushToast('success', 'Signed in with Google.');
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === 'auth/unauthorized-domain') {
        const host = window.location.hostname || 'this domain';
        pushToast(
          'error',
          `Add "${host}" to Firebase Console -> Authentication -> Settings -> Authorized domains to allow Google Sign-In here.`
        );
        return;
      }
      const msg = err instanceof Error ? err.message : 'Sign-in failed.';
      pushToast('error', msg);
    }
  }, [pushToast]);

  const signOutUser = useCallback(async () => {
    await signOut(auth);
    safeSessionRemove('ca451_team_unlocked');
    safeSessionRemove('ca451_admin_unlocked');
    safeSessionRemove('ca451_spending_unlocked');
    safeSessionRemove('ca451_unlocked_projects');
    setTeamUnlocked(false);
    setAdminUnlocked(false);
    setSpendingUnlocked(false);
    setUnlockedProjectIds({});
  }, []);

  const unlockTeam = useCallback((passkey: string) => {
    if (passkey.trim() === TEAM_PASSKEY) {
      safeSessionSet('ca451_team_unlocked', 'true');
      setTeamUnlocked(true);
      return true;
    }
    return false;
  }, []);

  const unlockAdmin = useCallback((passkey: string) => {
    if (passkey.trim() === ADMIN_PASSKEY) {
      safeSessionSet('ca451_admin_unlocked', 'true');
      setAdminUnlocked(true);
      return true;
    }
    return false;
  }, []);

  const unlockSpending = useCallback((passkey: string) => {
    if (passkey.trim() === SPENDING_PASSKEY) {
      safeSessionSet('ca451_spending_unlocked', 'true');
      setSpendingUnlocked(true);
      return true;
    }
    return false;
  }, []);

  const unlockProjectEditor = useCallback(
    (projectId: string, password: string) => {
      const target = projects.find((p) => p.id === projectId);
      if (!target) return false;
      if (password === target.editorPassword) {
        setUnlockedProjectIds((prev) => {
          const next = { ...prev, [projectId]: true };
          safeSessionSet('ca451_unlocked_projects', JSON.stringify(next));
          return next;
        });
        return true;
      }
      return false;
    },
    [projects]
  );

  const createProject = useCallback(
    async ({
      name,
      description,
      editorPassword,
      coverImageFile,
    }: {
      name: string;
      description?: string;
      editorPassword: string;
      coverImageFile?: File | null;
    }) => {
      if (!user) throw new Error('Must be signed in.');
      const projectId = makeId('proj');
      let coverImageUrl = '';
      if (coverImageFile) {
        const uploaded = await uploadTeamFile(
          coverImageFile,
          `projects/${projectId}/cover_${Date.now()}_${coverImageFile.name}`
        );
        coverImageUrl = uploaded.url;
      }
      const path = `projects/${projectId}`;
      try {
        await setDoc(doc(db, 'projects', projectId), {
          teamCode: 'FRC451',
          name: name.trim().slice(0, 100),
          description: (description || '').trim().slice(0, 500),
          coverImageUrl,
          editorPassword: editorPassword.trim().slice(0, 64),
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setUnlockedProjectIds((prev) => {
          const next = { ...prev, [projectId]: true };
          safeSessionSet('ca451_unlocked_projects', JSON.stringify(next));
          return next;
        });
        pushToast('success', `Project "${name.trim()}" created.`);
        return projectId;
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    },
    [user, pushToast]
  );

  const updateProject = useCallback(
    async (
      projectId: string,
      {
        name,
        description,
        editorPassword,
        coverImageFile,
        removeCoverImage,
      }: {
        name: string;
        description?: string;
        editorPassword: string;
        coverImageFile?: File | null;
        removeCoverImage?: boolean;
      }
    ) => {
      if (!user) throw new Error('Must be signed in.');
      const path = `projects/${projectId}`;
      const existingProj = projects.find((p) => p.id === projectId);
      const previousCoverUrl = existingProj?.coverImageUrl || '';
      let nextCoverImageUrl = previousCoverUrl;

      if (coverImageFile) {
        const uploaded = await uploadTeamFile(
          coverImageFile,
          `projects/${projectId}/cover_${Date.now()}_${coverImageFile.name}`
        );
        nextCoverImageUrl = uploaded.url.slice(0, 2000);
        if (previousCoverUrl) {
          await deleteTeamFileByUrl(previousCoverUrl);
        }
      } else if (removeCoverImage) {
        if (previousCoverUrl) {
          await deleteTeamFileByUrl(previousCoverUrl);
        }
        nextCoverImageUrl = '';
      }

      try {
        await updateDoc(doc(db, 'projects', projectId), {
          name: name.trim().slice(0, 100),
          description: (description || '').trim().slice(0, 500),
          coverImageUrl: nextCoverImageUrl,
          editorPassword: editorPassword.trim().slice(0, 64),
          updatedAt: serverTimestamp(),
        });
        pushToast('success', `Project "${name.trim()}" updated.`);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [user, projects, pushToast]
  );

  const deleteProject = useCallback(
    async (projectId: string) => {
      const path = `projects/${projectId}`;
      try {
        const projSnap = await getDoc(doc(db, 'projects', projectId));
        if (projSnap.exists()) {
          const projData = projSnap.data() as Project;
          if (projData.coverImageUrl) {
            await deleteTeamFileByUrl(projData.coverImageUrl);
          }
        }
        const subsSnap = await getDocs(
          query(
            collection(db, 'projects', projectId, 'subassemblies'),
            where('teamCode', '==', 'FRC451')
          )
        );
        for (const subDoc of subsSnap.docs) {
          const partsSnap = await getDocs(
            query(
              collection(
                db,
                'projects',
                projectId,
                'subassemblies',
                subDoc.id,
                'parts'
              ),
              where('teamCode', '==', 'FRC451')
            )
          );
          for (const partDoc of partsSnap.docs) {
            const p = partDoc.data() as Part;
            if (p.pictureUrl) await deleteTeamFileByUrl(p.pictureUrl);
            if (p.drawingPdf) {
              await deleteTeamFile(p.drawingPdf.storagePath, p.drawingPdf.size);
            }
            for (const f of p.attachedFiles || []) {
              await deleteTeamFile(f.storagePath, f.size);
            }
          }
          const batch = writeBatch(db);
          partsSnap.docs.forEach((p) => batch.delete(p.ref));
          batch.delete(subDoc.ref);
          await batch.commit();
        }
        await deleteDoc(doc(db, 'projects', projectId));
        pushToast('success', 'Project, BOM data, and stored files deleted.');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    },
    [pushToast]
  );

  const createSubassembly = useCallback(
    async (
      projectId: string,
      { name, assemblyNumber }: { name: string; assemblyNumber: string }
    ) => {
      if (!user) throw new Error('Must be signed in.');
      const subId = makeId('sub');
      const path = `projects/${projectId}/subassemblies/${subId}`;
      try {
        await setDoc(doc(db, 'projects', projectId, 'subassemblies', subId), {
          projectId,
          teamCode: 'FRC451',
          name: name.trim().slice(0, 100),
          assemblyNumber: assemblyNumber.trim().slice(0, 40),
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        pushToast('success', `Subassembly "${name.trim()}" created.`);
        return subId;
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    },
    [user, pushToast]
  );

  const updateSubassembly = useCallback(
    async (
      projectId: string,
      subassemblyId: string,
      { name, assemblyNumber }: { name: string; assemblyNumber: string }
    ) => {
      if (!user) throw new Error('Must be signed in.');
      const path = `projects/${projectId}/subassemblies/${subassemblyId}`;
      try {
        await updateDoc(
          doc(db, 'projects', projectId, 'subassemblies', subassemblyId),
          {
            name: name.trim().slice(0, 100),
            assemblyNumber: assemblyNumber.trim().slice(0, 40),
            updatedAt: serverTimestamp(),
          }
        );
        pushToast('success', `Subassembly "${name.trim()}" updated.`);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [user, pushToast]
  );

  const deleteSubassembly = useCallback(
    async (projectId: string, subassemblyId: string) => {
      const path = `projects/${projectId}/subassemblies/${subassemblyId}`;
      try {
        const partsSnap = await getDocs(
          query(
            collection(
              db,
              'projects',
              projectId,
              'subassemblies',
              subassemblyId,
              'parts'
            ),
            where('teamCode', '==', 'FRC451')
          )
        );
        for (const partDoc of partsSnap.docs) {
          const p = partDoc.data() as Part;
          if (p.pictureUrl) await deleteTeamFileByUrl(p.pictureUrl);
          if (p.drawingPdf) {
            await deleteTeamFile(p.drawingPdf.storagePath, p.drawingPdf.size);
          }
          for (const f of p.attachedFiles || []) {
            await deleteTeamFile(f.storagePath, f.size);
          }
        }
        const batch = writeBatch(db);
        partsSnap.docs.forEach((p) => batch.delete(p.ref));
        batch.delete(doc(db, 'projects', projectId, 'subassemblies', subassemblyId));
        await batch.commit();
        pushToast('success', 'Subassembly and stored files deleted.');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    },
    [pushToast]
  );

  const createPart = useCallback(
    async (
      projectId: string,
      subassemblyId: string,
      partData: Omit<
        Part,
        | 'id'
        | 'projectId'
        | 'subassemblyId'
        | 'teamCode'
        | 'createdBy'
        | 'createdByName'
        | 'updatedBy'
        | 'updatedByName'
        | 'requestedBy'
        | 'requestedByName'
        | 'requestedAt'
        | 'createdAt'
        | 'updatedAt'
      >
    ) => {
      if (!user) throw new Error('Must be signed in.');
      const partId = makeId('part');
      const path = `projects/${projectId}/subassemblies/${subassemblyId}/parts/${partId}`;
      const actorLabel = getUserActorLabel(user);
      const isImmediateRequest =
        partData.status === 'Requested' || (partData.sparesRequested || 0) > 0;
      try {
        await setDoc(
          doc(db, 'projects', projectId, 'subassemblies', subassemblyId, 'parts', partId),
          {
            ...partData,
            projectId,
            subassemblyId,
            teamCode: 'FRC451',
            createdBy: user.uid,
            createdByName: actorLabel,
            updatedBy: user.uid,
            updatedByName: actorLabel,
            requestedBy: isImmediateRequest ? user.uid : '',
            requestedByName: isImmediateRequest ? actorLabel : '',
            requestedAt: isImmediateRequest ? serverTimestamp() : null,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          }
        );
        pushToast('success', `Added "${partData.name}" to BOM.`);
        return partId;
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, path);
      }
    },
    [user, pushToast]
  );

  const updatePart = useCallback(
    async (
      projectId: string,
      subassemblyId: string,
      partId: string,
      updates: Partial<Part>
    ) => {
      if (!user) throw new Error('Must be signed in.');
      const path = `projects/${projectId}/subassemblies/${subassemblyId}/parts/${partId}`;
      const actorLabel = getUserActorLabel(user);
      try {
        const cleanUpdates: Record<string, unknown> = { ...updates };
        delete cleanUpdates.id;
        delete cleanUpdates.projectId;
        delete cleanUpdates.subassemblyId;
        delete cleanUpdates.teamCode;
        delete cleanUpdates.createdBy;
        delete cleanUpdates.createdByName;
        delete cleanUpdates.createdAt;
        delete cleanUpdates.updatedBy;
        delete cleanUpdates.updatedByName;
        delete cleanUpdates.updatedAt;
        delete cleanUpdates.requestedBy;
        delete cleanUpdates.requestedByName;
        delete cleanUpdates.requestedAt;

        const isFullPropertyReset =
          'name' in cleanUpdates && 'partNumber' in cleanUpdates;
        const isShopFloorOrSpendingUpdate =
          !isFullPropertyReset &&
          ('totalMachined' in cleanUpdates ||
            'totalOrdered' in cleanUpdates ||
            'machinesUsed' in cleanUpdates ||
            'machiningNotes' in cleanUpdates);

        const isRequesting =
          !isShopFloorOrSpendingUpdate &&
          (cleanUpdates.status === 'Requested' ||
            (typeof cleanUpdates.sparesRequested === 'number' &&
              cleanUpdates.sparesRequested > 0));
        const isClearingRequest =
          !isShopFloorOrSpendingUpdate &&
          (cleanUpdates.status === 'Not Started' ||
            (cleanUpdates.status === 'Obtained' &&
              cleanUpdates.sparesRequested === 0));

        if (isRequesting) {
          cleanUpdates.requestedBy = user.uid;
          cleanUpdates.requestedByName = actorLabel;
          cleanUpdates.requestedAt = serverTimestamp();
        } else if (isClearingRequest) {
          cleanUpdates.requestedBy = '';
          cleanUpdates.requestedByName = '';
          cleanUpdates.requestedAt = null;
        }

        await updateDoc(
          doc(db, 'projects', projectId, 'subassemblies', subassemblyId, 'parts', partId),
          {
            ...cleanUpdates,
            updatedBy: user.uid,
            updatedByName: actorLabel,
            updatedAt: serverTimestamp(),
          }
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, path);
      }
    },
    [user]
  );

  const deletePart = useCallback(
    async (projectId: string, subassemblyId: string, partId: string) => {
      const path = `projects/${projectId}/subassemblies/${subassemblyId}/parts/${partId}`;
      try {
        const partRef = doc(
          db,
          'projects',
          projectId,
          'subassemblies',
          subassemblyId,
          'parts',
          partId
        );
        const partSnap = await getDoc(partRef);
        if (partSnap.exists()) {
          const p = partSnap.data() as Part;
          if (p.pictureUrl) await deleteTeamFileByUrl(p.pictureUrl);
          if (p.drawingPdf) {
            await deleteTeamFile(p.drawingPdf.storagePath, p.drawingPdf.size);
          }
          for (const f of p.attachedFiles || []) {
            await deleteTeamFile(f.storagePath, f.size);
          }
        }
        await deleteDoc(partRef);
        pushToast('success', 'Part and stored files removed.');
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, path);
      }
    },
    [pushToast]
  );

  const saveMachinesRoster = useCallback(
    async (nextMachines: string[]) => {
      if (!user) throw new Error('Must be signed in.');
      const clean = nextMachines
        .map((m) => m.trim().slice(0, 60))
        .filter(Boolean)
        .slice(0, 50);
      const path = 'settings/machines';
      try {
        await setDoc(doc(db, 'settings', 'machines'), {
          teamCode: 'FRC451',
          machines: clean,
          updatedBy: user.uid,
          updatedAt: serverTimestamp(),
        });
        pushToast('success', 'Shop machine roster updated.');
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, path);
      }
    },
    [user, pushToast]
  );

  const recalculateStorageUsage = useCallback(async () => {
    if (!user) return;
    const path = 'storageMeta/usage';
    try {
      let totalBytes = 0;
      let fileCount = 0;
      const projectsSnap = await getDocs(
        query(collection(db, 'projects'), where('teamCode', '==', 'FRC451'))
      );
      for (const projDoc of projectsSnap.docs) {
        const subsSnap = await getDocs(
          query(
            collection(db, 'projects', projDoc.id, 'subassemblies'),
            where('teamCode', '==', 'FRC451')
          )
        );
        for (const subDoc of subsSnap.docs) {
          const partsSnap = await getDocs(
            query(
              collection(
                db,
                'projects',
                projDoc.id,
                'subassemblies',
                subDoc.id,
                'parts'
              ),
              where('teamCode', '==', 'FRC451')
            )
          );
          for (const partDoc of partsSnap.docs) {
            const p = partDoc.data() as Part;
            if (p.drawingPdf) {
              totalBytes += p.drawingPdf.size || 0;
              fileCount += 1;
            }
            for (const f of p.attachedFiles || []) {
              totalBytes += f.size || 0;
              fileCount += 1;
            }
          }
        }
      }
      const currentMonth = getCurrentMonthKey();
      const prevSnap = await getDoc(doc(db, 'storageMeta', 'usage'));
      const prev = prevSnap.exists() ? (prevSnap.data() as StorageUsage) : null;
      const monthlyUploadsCount =
        prev && prev.monthKey === currentMonth ? prev.monthlyUploadsCount || 0 : 0;

      await setDoc(doc(db, 'storageMeta', 'usage'), {
        teamCode: 'FRC451',
        totalBytesUsed: Math.min(totalBytes, MAX_TOTAL_STORAGE_BYTES),
        fileCount,
        monthlyUploadsCount,
        monthKey: currentMonth,
        updatedBy: user.uid,
        updatedAt: serverTimestamp(),
      });
      pushToast('success', 'Storage usage recalculated.');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, path);
    }
  }, [user, pushToast]);

  return (
    <AppContext.Provider
      value={{
        user,
        authReady,
        teamUnlocked,
        adminUnlocked,
        spendingUnlocked,
        unlockedProjectIds,
        darkMode,
        projects,
        projectsLoading,
        machines,
        storageUsage,
        toasts,
        signInGoogle,
        signOutUser,
        unlockTeam,
        unlockAdmin,
        unlockSpending,
        unlockProjectEditor,
        toggleDarkMode,
        pushToast,
        dismissToast,
        createProject,
        updateProject,
        deleteProject,
        createSubassembly,
        updateSubassembly,
        deleteSubassembly,
        createPart,
        updatePart,
        deletePart,
        saveMachinesRoster,
        recalculateStorageUsage,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

export function useProjectDetails(projectId: string | null) {
  const { user, authReady } = useApp();
  const [subassemblies, setSubassemblies] = useState<Subassembly[]>([]);
  const [partsBySub, setPartsBySub] = useState<Record<string, Part[]>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const refresh = useCallback(() => {
    setRefreshNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!authReady || !user || !user.emailVerified || !projectId) {
      setSubassemblies([]);
      setPartsBySub({});
      setLoading(false);
      return;
    }

    setLoading(true);
    const subsQ = query(
      collection(db, 'projects', projectId, 'subassemblies'),
      where('teamCode', '==', 'FRC451')
    );

    const partUnsubs: Array<() => void> = [];

    const unsubSubs = onSnapshot(
      subsQ,
      (snap) => {
        const list: Subassembly[] = snap.docs.map((d) => ({
          ...(d.data() as Omit<Subassembly, 'id'>),
          id: d.id,
        }));
        list.sort((a, b) => a.assemblyNumber.localeCompare(b.assemblyNumber));
        setSubassemblies(list);

        // Clean up old part listeners and attach fresh listeners per subassembly
        partUnsubs.forEach((fn) => fn());
        partUnsubs.length = 0;

        if (list.length === 0) {
          setPartsBySub({});
          setLoading(false);
          return;
        }

        const nextPartsMap: Record<string, Part[]> = {};
        const resolvedSubIds = new Set<string>();

        list.forEach((sub) => {
          const partsQ = query(
            collection(db, 'projects', projectId, 'subassemblies', sub.id, 'parts'),
            where('teamCode', '==', 'FRC451')
          );
          const unsubPart = onSnapshot(
            partsQ,
            (pSnap) => {
              nextPartsMap[sub.id] = pSnap.docs.map((pd) => ({
                ...(pd.data() as Omit<Part, 'id'>),
                id: pd.id,
              }));
              setPartsBySub({ ...nextPartsMap });
              resolvedSubIds.add(sub.id);
              if (resolvedSubIds.size >= list.length) {
                setLoading(false);
              }
            },
            (err) => {
              setLoading(false);
              handleFirestoreError(
                err,
                OperationType.LIST,
                `projects/${projectId}/subassemblies/${sub.id}/parts`
              );
            }
          );
          partUnsubs.push(unsubPart);
        });
      },
      (err) => {
        setLoading(false);
        handleFirestoreError(
          err,
          OperationType.LIST,
          `projects/${projectId}/subassemblies`
        );
      }
    );

    return () => {
      unsubSubs();
      partUnsubs.forEach((fn) => fn());
    };
  }, [authReady, user, projectId, refreshNonce]);

  const allParts = Object.values(partsBySub).flat();

  return { subassemblies, partsBySub, allParts, loading, refresh };
}
