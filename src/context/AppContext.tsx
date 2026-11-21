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
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
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

const PART_REQUIRED_KEYS = [
  'projectId',
  'subassemblyId',
  'teamCode',
  'name',
  'partNumber',
  'quantity',
  'type',
  'source',
  'vendor',
  'manufacturer',
  'costsMoney',
  'machines',
  'materialCategory',
  'materialName',
  'stockShape',
  'dimensions',
  'pictureUrl',
  'drawingPdf',
  'attachedFiles',
  'identicalGroupId',
  'notes',
  'status',
  'priority',
  'assignedMachinist',
  'vendorLink',
  'sparesRequested',
  'sparesCount',
  'totalMachined',
  'totalOrdered',
  'machinesUsed',
  'createdBy',
  'createdAt',
  'updatedAt',
];

const PART_ALLOWED_KEYS = new Set([
  ...PART_REQUIRED_KEYS,
  'revision',
  'machiningNotes',
  'createdByName',
  'updatedBy',
  'updatedByName',
  'requestedBy',
  'requestedByName',
  'requestedAt',
]);

function collectPartSchemaFailures(
  docData: Record<string, unknown>,
  projectId: string,
  subassemblyId: string
): string[] {
  const failures: string[] = [];
  const missingKeys = PART_REQUIRED_KEYS.filter((k) => !(k in docData));
  const extraKeys = Object.keys(docData).filter((k) => !PART_ALLOWED_KEYS.has(k));
  if (missingKeys.length > 0) failures.push(`missingKeys=[${missingKeys.join(',')}]`);
  if (extraKeys.length > 0) failures.push(`extraKeys=[${extraKeys.join(',')}]`);
  if (docData.projectId !== projectId) {
    failures.push(`projectId mismatch (${String(docData.projectId)} != ${projectId})`);
  }
  if (docData.subassemblyId !== subassemblyId) {
    failures.push(`subassemblyId mismatch (${String(docData.subassemblyId)} != ${subassemblyId})`);
  }
  if (docData.teamCode !== 'FRC451') failures.push(`teamCode=${String(docData.teamCode)}`);
  if (typeof docData.name !== 'string' || docData.name.length < 1 || docData.name.length > 120) {
    failures.push(`invalid name (${typeof docData.name})`);
  }
  if (typeof docData.partNumber !== 'string' || docData.partNumber.length < 1 || docData.partNumber.length > 60) {
    failures.push(`invalid partNumber (${typeof docData.partNumber})`);
  }
  if (
    'revision' in docData &&
    docData.revision !== null &&
    (typeof docData.revision !== 'string' || docData.revision.length > 20)
  ) {
    failures.push(`invalid revision (${typeof docData.revision})`);
  }
  if (typeof docData.quantity !== 'number' || !Number.isFinite(docData.quantity) || docData.quantity < 1 || docData.quantity > 100000) {
    failures.push(`invalid quantity=${String(docData.quantity)}`);
  }
  if (docData.type !== 'Custom' && docData.type !== 'COTS') {
    failures.push(`invalid type=${String(docData.type)}`);
  }
  if (!['In-House', 'Outsourced', 'Purchased', 'Inventory'].includes(String(docData.source))) {
    failures.push(`invalid source=${String(docData.source)}`);
  }
  if (typeof docData.vendor !== 'string' || docData.vendor.length > 80) {
    failures.push(`invalid vendor (${typeof docData.vendor})`);
  }
  if (typeof docData.manufacturer !== 'string' || docData.manufacturer.length > 80) {
    failures.push(`invalid manufacturer (${typeof docData.manufacturer})`);
  }
  if (typeof docData.costsMoney !== 'boolean') {
    failures.push(`invalid costsMoney (${typeof docData.costsMoney})`);
  }
  if (
    !Array.isArray(docData.machines) ||
    docData.machines.length > 25 ||
    (docData.machines.length > 0 && (typeof docData.machines[0] !== 'string' || docData.machines[0].length > 60))
  ) {
    failures.push('invalid machines array');
  }
  if (!['', '3D Printer Filaments', 'Resin', 'Stock Material'].includes(String(docData.materialCategory))) {
    failures.push(`invalid materialCategory=${String(docData.materialCategory)}`);
  }
  if (typeof docData.materialName !== 'string' || docData.materialName.length > 80) {
    failures.push(`invalid materialName (${typeof docData.materialName})`);
  }
  if (!['', 'Box Tube', 'Plate', 'Tube'].includes(String(docData.stockShape))) {
    failures.push(`invalid stockShape=${String(docData.stockShape)}`);
  }
  const dims = docData.dimensions as Record<string, unknown> | null;
  const allowedDims = new Set(['length', 'width', 'height', 'thickness', 'innerDiameter', 'outerDiameter']);
  if (!dims || typeof dims !== 'object' || Array.isArray(dims)) {
    failures.push('dimensions not map');
  } else {
    for (const [dk, dv] of Object.entries(dims)) {
      if (!allowedDims.has(dk)) failures.push(`unexpected dimension key ${dk}`);
      else if (typeof dv !== 'string' || dv.length > 30) failures.push(`invalid dimension ${dk} (${typeof dv})`);
    }
  }
  if (typeof docData.pictureUrl !== 'string' || docData.pictureUrl.length > 2000) {
    failures.push(`invalid pictureUrl (${typeof docData.pictureUrl})`);
  }
  if (docData.drawingPdf !== null) {
    const pdf = docData.drawingPdf as Record<string, unknown>;
    if (
      !pdf ||
      typeof pdf !== 'object' ||
      typeof pdf.name !== 'string' ||
      pdf.name.length < 1 ||
      pdf.name.length > 200 ||
      typeof pdf.size !== 'number' ||
      !Number.isFinite(pdf.size) ||
      pdf.size < 0 ||
      pdf.size > 10485760 ||
      typeof pdf.url !== 'string' ||
      pdf.url.length < 1 ||
      pdf.url.length > 2000 ||
      typeof pdf.storagePath !== 'string' ||
      pdf.storagePath.length < 1 ||
      pdf.storagePath.length > 500 ||
      ('contentType' in pdf &&
        pdf.contentType !== null &&
        (typeof pdf.contentType !== 'string' || pdf.contentType.length > 120)) ||
      Object.keys(pdf).some((k) => !['name', 'size', 'url', 'storagePath', 'contentType'].includes(k))
    ) {
      failures.push(`invalid drawingPdf`);
    }
  }
  if (!Array.isArray(docData.attachedFiles) || docData.attachedFiles.length > 15) {
    failures.push('invalid attachedFiles array');
  } else if (docData.attachedFiles.length > 0) {
    const firstFile = docData.attachedFiles[0] as Record<string, unknown>;
    if (
      !firstFile ||
      typeof firstFile !== 'object' ||
      Object.keys(firstFile).some((k) => !['name', 'size', 'url', 'storagePath', 'contentType'].includes(k))
    ) {
      failures.push('invalid attachedFiles[0]');
    }
  }
  if (typeof docData.identicalGroupId !== 'string' || docData.identicalGroupId.length > 128) {
    failures.push(`invalid identicalGroupId (${typeof docData.identicalGroupId})`);
  }
  if (typeof docData.notes !== 'string' || docData.notes.length > 2000) {
    failures.push(`invalid notes (${typeof docData.notes})`);
  }
  if (
    ![
      'Not Started',
      'Requested',
      'Needs Drawing',
      'Needs CAM',
      'Ready for Machine',
      'In-Progress',
      'Denied',
      'Shipping',
      'Obtained',
    ].includes(String(docData.status))
  ) {
    failures.push(`invalid status=${String(docData.status)}`);
  }
  if (!['Low Priority', 'Regular Priority', 'High Priority', 'Critical Priority'].includes(String(docData.priority))) {
    failures.push(`invalid priority=${String(docData.priority)}`);
  }
  if (typeof docData.assignedMachinist !== 'string' || docData.assignedMachinist.length > 80) {
    failures.push(`invalid assignedMachinist (${typeof docData.assignedMachinist})`);
  }
  if (typeof docData.vendorLink !== 'string' || docData.vendorLink.length > 1000) {
    failures.push(`invalid vendorLink (${typeof docData.vendorLink})`);
  }
  for (const [intField, maxVal] of [
    ['sparesRequested', 10000],
    ['sparesCount', 10000],
    ['totalMachined', 100000],
    ['totalOrdered', 100000],
  ] as const) {
    const val = docData[intField];
    if (typeof val !== 'number' || !Number.isFinite(val) || val < 0 || val > maxVal) {
      failures.push(`invalid ${intField}=${String(val)}`);
    }
  }
  if (
    !Array.isArray(docData.machinesUsed) ||
    docData.machinesUsed.length > 25 ||
    (docData.machinesUsed.length > 0 && (typeof docData.machinesUsed[0] !== 'string' || docData.machinesUsed[0].length > 60))
  ) {
    failures.push('invalid machinesUsed array');
  }
  if (
    'machiningNotes' in docData &&
    docData.machiningNotes !== null &&
    (typeof docData.machiningNotes !== 'string' || docData.machiningNotes.length > 1000)
  ) {
    failures.push(`invalid machiningNotes (${typeof docData.machiningNotes})`);
  }
  if (typeof docData.createdBy !== 'string' || docData.createdBy.length < 1 || docData.createdBy.length > 128) {
    failures.push(`invalid createdBy=${String(docData.createdBy)}`);
  }
  for (const [nameField, maxLen, minLen] of [
    ['createdByName', 120, 0],
    ['updatedBy', 128, 1],
    ['updatedByName', 120, 0],
    ['requestedBy', 128, 0],
    ['requestedByName', 120, 0],
  ] as const) {
    if (nameField in docData && docData[nameField] !== null) {
      const v = docData[nameField];
      if (typeof v !== 'string' || v.length < minLen || v.length > maxLen) {
        failures.push(`invalid ${nameField} (${typeof v})`);
      }
    }
  }
  return failures;
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
      const payload: Record<string, unknown> = {
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
      };
      try {
        await setDoc(
          doc(db, 'projects', projectId, 'subassemblies', subassemblyId, 'parts', partId),
          payload
        );
        pushToast('success', `Added "${partData.name}" to BOM.`);
        return partId;
      } catch (err) {
        const errCode = (err as { code?: string })?.code;
        const rawMsg = err instanceof Error ? err.message : String(err);
        const isPermError =
          errCode === 'permission-denied' ||
          rawMsg.includes('Missing or insufficient permissions') ||
          rawMsg.includes('PERMISSION_DENIED');

        if (!isPermError) {
          handleFirestoreError(err, OperationType.CREATE, path);
        }

        const failures: string[] = [];
        if (!user.emailVerified) failures.push('emailVerified=false');
        failures.push(...collectPartSchemaFailures(payload, projectId, subassemblyId));
        try {
          const subSnap = await getDoc(
            doc(db, 'projects', projectId, 'subassemblies', subassemblyId)
          );
          if (!subSnap.exists()) {
            failures.push('parent subassembly does not exist in Firestore');
          }
        } catch (subErr) {
          failures.push(
            `parentSubReadFailed: ${subErr instanceof Error ? subErr.message : String(subErr)}`
          );
        }
        if (failures.length === 0) {
          const tokenResult = await user.getIdTokenResult().catch(() => null);
          failures.push(
            `ALL_CLIENT_CHECKS_PASSED_CREATE uid=${user.uid} email=${
              user.email ?? 'none'
            } tokenEmailVerified=${String(
              tokenResult?.claims?.email_verified
            )} payloadKeysCount=${Object.keys(payload).length}`
          );
        }
        handleFirestoreError(
          new Error(`${rawMsg} | Rule check: ${failures.join('; ')}`),
          OperationType.CREATE,
          path
        );
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
      const partRef = doc(
        db,
        'projects',
        projectId,
        'subassemblies',
        subassemblyId,
        'parts',
        partId
      );

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

      const payload: Record<string, unknown> = {
        ...cleanUpdates,
        updatedBy: user.uid,
        updatedByName: actorLabel,
        updatedAt: serverTimestamp(),
      };

      try {
        await updateDoc(partRef, payload);
      } catch (err) {
        const errCode = (err as { code?: string })?.code;
        const rawMsg = err instanceof Error ? err.message : String(err);
        const isPermError =
          errCode === 'permission-denied' ||
          rawMsg.includes('Missing or insufficient permissions') ||
          rawMsg.includes('PERMISSION_DENIED');

        if (!isPermError) {
          handleFirestoreError(err, OperationType.UPDATE, path);
        }

        // Diagnose why Firestore rejected the update against live server document fields
        const failures: string[] = [];
        try {
          let snap = await getDocFromServer(partRef).catch(() => null);
          let readSource = 'server';
          if (!snap) {
            snap = await getDoc(partRef);
            readSource = 'cache';
          }
          if (!snap.exists()) {
            failures.push(`document does not exist in Firestore (${readSource})`);
          } else {
            const existing = snap.data() as Record<string, unknown>;
            const merged: Record<string, unknown> = { ...existing, ...payload };
            const utf8Len = (s: string) => new TextEncoder().encode(s).length;

            const defaultableMutableFields: Record<string, unknown> = {
              vendor: '',
              manufacturer: '',
              costsMoney: false,
              machines: [],
              materialCategory: '',
              materialName: '',
              stockShape: '',
              dimensions: {},
              pictureUrl: '',
              drawingPdf: null,
              attachedFiles: [],
              identicalGroupId: '',
              notes: '',
              assignedMachinist: '',
              vendorLink: '',
              sparesRequested: 0,
              sparesCount: 0,
              totalMachined: 0,
              totalOrdered: 0,
              machinesUsed: [],
            };

            const requiredKeys = [
              'projectId',
              'subassemblyId',
              'teamCode',
              'name',
              'partNumber',
              'quantity',
              'type',
              'source',
              'vendor',
              'manufacturer',
              'costsMoney',
              'machines',
              'materialCategory',
              'materialName',
              'stockShape',
              'dimensions',
              'pictureUrl',
              'drawingPdf',
              'attachedFiles',
              'identicalGroupId',
              'notes',
              'status',
              'priority',
              'assignedMachinist',
              'vendorLink',
              'sparesRequested',
              'sparesCount',
              'totalMachined',
              'totalOrdered',
              'machinesUsed',
              'createdBy',
              'createdAt',
              'updatedAt',
            ];
            const allowedKeys = new Set([
              ...requiredKeys,
              'revision',
              'machiningNotes',
              'createdByName',
              'updatedBy',
              'updatedByName',
              'requestedBy',
              'requestedByName',
              'requestedAt',
            ]);

            const missingKeys = requiredKeys.filter((k) => !(k in merged));
            const extraKeys = Object.keys(merged).filter(
              (k) => !allowedKeys.has(k)
            );

            // Auto-retry once if only safe mutable default fields were missing on a legacy doc
            if (
              missingKeys.length > 0 &&
              missingKeys.every((k) => k in defaultableMutableFields) &&
              extraKeys.length === 0 &&
              'createdBy' in existing &&
              'createdAt' in existing
            ) {
              const backfill: Record<string, unknown> = { ...payload };
              for (const k of missingKeys) {
                backfill[k] = defaultableMutableFields[k];
              }
              try {
                await updateDoc(partRef, backfill);
                return;
              } catch {
                // Fall through to full diagnostics if retry still fails
              }
            }

            if (!user.emailVerified) failures.push('emailVerified=false');
            if (missingKeys.length > 0) {
              failures.push(`missingKeys=[${missingKeys.join(',')}]`);
            }
            if (extraKeys.length > 0) {
              failures.push(`extraKeys=[${extraKeys.join(',')}]`);
            }
            if (merged.projectId !== projectId) {
              failures.push(
                `projectId mismatch (${String(merged.projectId)} != ${projectId})`
              );
            }
            if (merged.subassemblyId !== subassemblyId) {
              failures.push(
                `subassemblyId mismatch (${String(merged.subassemblyId)} != ${subassemblyId})`
              );
            }
            if (merged.teamCode !== 'FRC451') {
              failures.push(`teamCode=${String(merged.teamCode)}`);
            }
            if (
              typeof merged.name !== 'string' ||
              merged.name.length < 1 ||
              merged.name.length > 120
            ) {
              failures.push(`invalid name (${typeof merged.name})`);
            }
            if (
              typeof merged.partNumber !== 'string' ||
              merged.partNumber.length < 1 ||
              merged.partNumber.length > 60
            ) {
              failures.push(`invalid partNumber (${typeof merged.partNumber})`);
            }
            if (
              'revision' in merged &&
              merged.revision !== null &&
              (typeof merged.revision !== 'string' ||
                merged.revision.length > 20)
            ) {
              failures.push(`invalid revision (${typeof merged.revision})`);
            }
            if (
              typeof merged.quantity !== 'number' ||
              !Number.isInteger(merged.quantity) ||
              merged.quantity < 1 ||
              merged.quantity > 100000
            ) {
              failures.push(`invalid quantity=${String(merged.quantity)}`);
            }
            if (merged.type !== 'Custom' && merged.type !== 'COTS') {
              failures.push(`invalid type=${String(merged.type)}`);
            }
            if (
              !['In-House', 'Outsourced', 'Purchased', 'Inventory'].includes(
                String(merged.source)
              )
            ) {
              failures.push(`invalid source=${String(merged.source)}`);
            }
            if (typeof merged.vendor !== 'string' || merged.vendor.length > 80) {
              failures.push(`invalid vendor (${typeof merged.vendor})`);
            }
            if (
              typeof merged.manufacturer !== 'string' ||
              merged.manufacturer.length > 80
            ) {
              failures.push(
                `invalid manufacturer (${typeof merged.manufacturer})`
              );
            }
            if (typeof merged.costsMoney !== 'boolean') {
              failures.push(`invalid costsMoney (${typeof merged.costsMoney})`);
            }
            if (
              !Array.isArray(merged.machines) ||
              merged.machines.length > 25 ||
              (merged.machines.length > 0 &&
                (typeof merged.machines[0] !== 'string' ||
                  merged.machines[0].length > 60))
            ) {
              failures.push('invalid machines array');
            }
            if (
              !['', '3D Printer Filaments', 'Resin', 'Stock Material'].includes(
                String(merged.materialCategory)
              )
            ) {
              failures.push(
                `invalid materialCategory=${String(merged.materialCategory)}`
              );
            }
            if (
              typeof merged.materialName !== 'string' ||
              merged.materialName.length > 80
            ) {
              failures.push(
                `invalid materialName (${typeof merged.materialName})`
              );
            }
            if (
              !['', 'Box Tube', 'Plate', 'Tube'].includes(
                String(merged.stockShape)
              )
            ) {
              failures.push(`invalid stockShape=${String(merged.stockShape)}`);
            }
            const dims = merged.dimensions as Record<string, unknown> | null;
            const allowedDims = new Set([
              'length',
              'width',
              'height',
              'thickness',
              'innerDiameter',
              'outerDiameter',
            ]);
            if (!dims || typeof dims !== 'object' || Array.isArray(dims)) {
              failures.push('dimensions not map');
            } else {
              for (const [dk, dv] of Object.entries(dims)) {
                if (!allowedDims.has(dk)) {
                  failures.push(`unexpected dimension key ${dk}`);
                } else if (typeof dv !== 'string' || dv.length > 30) {
                  failures.push(`invalid dimension ${dk} (${typeof dv})`);
                }
              }
            }
            if (
              typeof merged.pictureUrl !== 'string' ||
              merged.pictureUrl.length > 2000
            ) {
              failures.push(
                `invalid pictureUrl (type=${typeof merged.pictureUrl}, len=${
                  typeof merged.pictureUrl === 'string'
                    ? merged.pictureUrl.length
                    : 'n/a'
                })`
              );
            }
            if (merged.drawingPdf !== null) {
              const pdf = merged.drawingPdf as Record<string, unknown>;
              if (
                !pdf ||
                typeof pdf !== 'object' ||
                typeof pdf.name !== 'string' ||
                pdf.name.length < 1 ||
                pdf.name.length > 200 ||
                typeof pdf.size !== 'number' ||
                !Number.isInteger(pdf.size) ||
                pdf.size < 0 ||
                pdf.size > 10485760 ||
                typeof pdf.url !== 'string' ||
                pdf.url.length < 1 ||
                pdf.url.length > 2000 ||
                typeof pdf.storagePath !== 'string' ||
                pdf.storagePath.length < 1 ||
                pdf.storagePath.length > 500 ||
                ('contentType' in pdf &&
                  pdf.contentType !== null &&
                  (typeof pdf.contentType !== 'string' ||
                    pdf.contentType.length > 120)) ||
                Object.keys(pdf).some(
                  (k) =>
                    !['name', 'size', 'url', 'storagePath', 'contentType'].includes(
                      k
                    )
                )
              ) {
                failures.push(`invalid drawingPdf (${JSON.stringify(pdf)})`);
              }
            }
            if (!Array.isArray(merged.attachedFiles) || merged.attachedFiles.length > 15) {
              failures.push('invalid attachedFiles array');
            } else if (merged.attachedFiles.length > 0) {
              const firstFile = merged.attachedFiles[0] as Record<string, unknown>;
              if (
                !firstFile ||
                typeof firstFile !== 'object' ||
                Object.keys(firstFile).some(
                  (k) =>
                    !['name', 'size', 'url', 'storagePath', 'contentType'].includes(
                      k
                    )
                )
              ) {
                failures.push(
                  `invalid attachedFiles[0] keys=[${
                    firstFile && typeof firstFile === 'object'
                      ? Object.keys(firstFile).join(',')
                      : typeof firstFile
                  }]`
                );
              }
            }
            if (
              typeof merged.identicalGroupId !== 'string' ||
              merged.identicalGroupId.length > 128
            ) {
              failures.push(
                `invalid identicalGroupId (${typeof merged.identicalGroupId})`
              );
            }
            if (
              typeof merged.notes !== 'string' ||
              merged.notes.length > 2000
            ) {
              failures.push(
                `invalid notes (type=${typeof merged.notes}, len=${
                  typeof merged.notes === 'string' ? merged.notes.length : 'n/a'
                })`
              );
            }
            if (
              ![
                'Not Started',
                'Requested',
                'Needs Drawing',
                'Needs CAM',
                'Ready for Machine',
                'In-Progress',
                'Denied',
                'Shipping',
                'Obtained',
              ].includes(String(merged.status))
            ) {
              failures.push(`invalid status=${String(merged.status)}`);
            }
            if (
              ![
                'Low Priority',
                'Regular Priority',
                'High Priority',
                'Critical Priority',
              ].includes(String(merged.priority))
            ) {
              failures.push(`invalid priority=${String(merged.priority)}`);
            }
            if (
              typeof merged.assignedMachinist !== 'string' ||
              merged.assignedMachinist.length > 80
            ) {
              failures.push(
                `invalid assignedMachinist (${typeof merged.assignedMachinist})`
              );
            }
            if (
              typeof merged.vendorLink !== 'string' ||
              merged.vendorLink.length > 1000
            ) {
              failures.push(`invalid vendorLink (${typeof merged.vendorLink})`);
            }
            for (const [intField, maxVal] of [
              ['sparesRequested', 10000],
              ['sparesCount', 10000],
              ['totalMachined', 100000],
              ['totalOrdered', 100000],
            ] as const) {
              const val = merged[intField];
              if (
                typeof val !== 'number' ||
                !Number.isInteger(val) ||
                val < 0 ||
                val > maxVal
              ) {
                failures.push(`invalid ${intField}=${String(val)}`);
              }
            }
            if (
              !Array.isArray(merged.machinesUsed) ||
              merged.machinesUsed.length > 25 ||
              (merged.machinesUsed.length > 0 &&
                (typeof merged.machinesUsed[0] !== 'string' ||
                  merged.machinesUsed[0].length > 60))
            ) {
              failures.push('invalid machinesUsed array');
            }
            if (
              'machiningNotes' in merged &&
              merged.machiningNotes !== null &&
              (typeof merged.machiningNotes !== 'string' ||
                merged.machiningNotes.length > 1000)
            ) {
              failures.push(
                `invalid machiningNotes (${typeof merged.machiningNotes})`
              );
            }
            if (
              typeof existing.createdBy !== 'string' ||
              existing.createdBy.length < 1 ||
              existing.createdBy.length > 128
            ) {
              failures.push(`invalid existing.createdBy=${String(existing.createdBy)}`);
            }
            for (const [nameField, maxLen, minLen] of [
              ['createdByName', 120, 0],
              ['updatedBy', 128, 1],
              ['updatedByName', 120, 0],
              ['requestedBy', 128, 0],
              ['requestedByName', 120, 0],
            ] as const) {
              if (nameField in merged && merged[nameField] !== null) {
                const v = merged[nameField];
                if (
                  typeof v !== 'string' ||
                  v.length < minLen ||
                  v.length > maxLen
                ) {
                  failures.push(
                    `invalid ${nameField} (type=${typeof v}, val=${String(v).slice(0, 40)})`
                  );
                }
              }
            }
            if (
              'requestedAt' in merged &&
              merged.requestedAt !== null &&
              !(merged.requestedAt instanceof Timestamp) &&
              !('requestedAt' in cleanUpdates)
            ) {
              failures.push(
                `invalid existing.requestedAt (${typeof merged.requestedAt}: ${JSON.stringify(
                  merged.requestedAt
                )})`
              );
            }
            if (!(existing.createdAt instanceof Timestamp)) {
              failures.push(
                `invalid existing.createdAt (${typeof existing.createdAt})`
              );
            }

            // Check UTF-8 byte lengths (Firestore Rules .size() on strings measures UTF-8 bytes)
            const byteLimits: Array<[string, number]> = [
              ['name', 120],
              ['partNumber', 60],
              ['revision', 20],
              ['vendor', 80],
              ['manufacturer', 80],
              ['materialName', 80],
              ['pictureUrl', 2000],
              ['identicalGroupId', 128],
              ['notes', 2000],
              ['assignedMachinist', 80],
              ['vendorLink', 1000],
              ['machiningNotes', 1000],
              ['createdBy', 128],
              ['createdByName', 120],
              ['updatedBy', 128],
              ['updatedByName', 120],
              ['requestedBy', 128],
              ['requestedByName', 120],
            ];
            for (const [fKey, maxBytes] of byteLimits) {
              const val = merged[fKey];
              if (typeof val === 'string' && utf8Len(val) > maxBytes) {
                failures.push(
                  `utf8Bytes(${fKey})=${utf8Len(val)}>${maxBytes}`
                );
              }
            }

            if (failures.length === 0) {
              const tokenResult = await user.getIdTokenResult().catch(() => null);
              const tokenEmailVerified = tokenResult?.claims?.email_verified;
              const optKeys = Object.keys(existing).filter(
                (k) => !requiredKeys.includes(k)
              );
              const affectedKeys = Object.keys(payload).filter((k) => {
                if (k === 'updatedAt' || k === 'requestedAt') return true;
                return (
                  JSON.stringify(existing[k]) !== JSON.stringify(payload[k])
                );
              });
              const reqAtVal = existing.requestedAt;
              const reqAtInfo = !('requestedAt' in existing)
                ? 'absent'
                : reqAtVal === null
                ? 'null'
                : reqAtVal instanceof Timestamp
                ? 'ts'
                : typeof reqAtVal;
              failures.push(
                `ALL_CLIENT_CHECKS_PASSED src=${readSource} uid=${user.uid} email=${
                  user.email ?? 'none'
                } tokenEmailVerified=${String(
                  tokenEmailVerified
                )} payloadKeys=[${Object.keys(payload).join(
                  ','
                )}] affectedKeys=[${affectedKeys.join(
                  ','
                )}] existingKeysCount=${
                  Object.keys(existing).length
                } optKeys=[${optKeys.join(',')}] createdByMatch=${String(
                  existing.createdBy === user.uid
                )} existingUpdatedBy=${String(
                  existing.updatedBy ?? 'none'
                )} reqAt=${reqAtInfo} status=${String(
                  existing.status
                )} type=${String(existing.type)} srcType=${String(
                  existing.source
                )}`
              );
            }
          }
        } catch (diagErr) {
          failures.push(
            `diagReadFailed: ${
              diagErr instanceof Error ? diagErr.message : String(diagErr)
            }`
          );
        }

        const detailedErr = new Error(
          `${rawMsg} | Rule check: ${failures.join('; ')}`
        );
        handleFirestoreError(detailedErr, OperationType.UPDATE, path);
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
