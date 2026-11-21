import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Eye,
  EyeOff,
  HardDrive,
  KeyRound,
  Layers,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  Wrench,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  CatalogLists,
  DEFAULT_CATALOG_LISTS,
  DEFAULT_MACHINES,
  DEFAULT_MODE_PASSKEYS,
  MAX_MONTHLY_UPLOADS,
  MAX_TOTAL_STORAGE_BYTES,
  ModePasskeys,
  Project,
} from '../types';
import { formatFileSize, getCurrentMonthKey } from '../firebase';
import { Modal } from './ui/Modal';

type CatalogTabKey = keyof CatalogLists;

const CATALOG_TABS: Array<{
  key: CatalogTabKey;
  label: string;
  placeholder: string;
  noun: string;
}> = [
  {
    key: 'vendors',
    label: 'Vendors',
    placeholder: 'Add vendor (e.g., Thrifty Bot)',
    noun: 'vendor',
  },
  {
    key: 'outsourcers',
    label: 'Outsourcers',
    placeholder: 'Add outsourcer (e.g., OSH Cut)',
    noun: 'outsourcer',
  },
  {
    key: 'stockMaterials',
    label: 'Stock Material',
    placeholder: 'Add stock material (e.g., Delrin)',
    noun: 'stock material',
  },
  {
    key: 'filamentMaterials',
    label: '3D Filaments',
    placeholder: 'Add filament (e.g., ASA)',
    noun: 'filament',
  },
  {
    key: 'resinMaterials',
    label: 'Resin',
    placeholder: 'Add resin (e.g., Tough 2000)',
    noun: 'resin',
  },
];

function reorderArray(items: string[], fromIndex: number, toIndex: number): string[] {
  if (
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length ||
    fromIndex === toIndex
  ) {
    return items;
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

export const AdminView: React.FC = () => {
  const {
    adminUnlocked,
    unlockAdmin,
    projects,
    deleteProject,
    updateProjectPassword,
    machines,
    saveMachinesRoster,
    catalogLists,
    saveCatalogLists,
    modePasskeys,
    saveModePasskeys,
    storageUsage,
    recalculateStorageUsage,
    pushToast,
  } = useApp();

  const [passInput, setPassInput] = useState('');
  const [passError, setPassError] = useState('');

  // Mode Passwords editor state
  const [passkeyDrafts, setPasskeyDrafts] = useState<ModePasskeys>(modePasskeys);
  const [revealedModePasskeys, setRevealedModePasskeys] = useState<
    Record<keyof ModePasskeys, boolean>
  >({
    teamPasskey: false,
    spendingPasskey: false,
    adminPasskey: false,
  });
  const [passkeyFormError, setPasskeyFormError] = useState('');

  // Machines & Catalog lists editor state
  const [newMachine, setNewMachine] = useState('');
  const [activeCatalogTab, setActiveCatalogTab] =
    useState<CatalogTabKey>('vendors');
  const [newCatalogItem, setNewCatalogItem] = useState('');

  // Project editor passwords state
  const [revealedPasswords, setRevealedPasswords] = useState<
    Record<string, boolean>
  >({});
  const [editingProjId, setEditingProjId] = useState<string | null>(null);
  const [editingProjPassword, setEditingProjPassword] = useState('');
  const [confirmProject, setConfirmProject] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPasskeyDrafts(modePasskeys);
  }, [modePasskeys]);

  if (!adminUnlocked) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!unlockAdmin(passInput)) {
              setPassError('Incorrect Admin passkey.');
            }
          }}
          className="w-full max-w-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] p-6 space-y-4 shadow-xl"
        >
          <div className="flex items-center gap-2.5">
            <Lock className="w-5 h-5 text-red-500" />
            <h1 className="text-xl font-bold">Admin Console Access</h1>
          </div>
          <p className="text-xs text-zinc-500">
            Enter the Admin passkey to manage workspace passwords, shop
            machines, materials, vendors, outsourcers, or Projects.
          </p>
          <input
            type="password"
            autoFocus
            value={passInput}
            onChange={(e) => {
              setPassInput(e.target.value);
              setPassError('');
            }}
            placeholder="Enter admin passkey"
            className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
          />
          {passError ? (
            <p className="text-xs font-medium text-red-500">{passError}</p>
          ) : null}
          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
          >
            Unlock Admin Console
          </button>
        </form>
      </div>
    );
  }

  const passkeysDirty =
    passkeyDrafts.teamPasskey.trim() !== modePasskeys.teamPasskey ||
    passkeyDrafts.spendingPasskey.trim() !== modePasskeys.spendingPasskey ||
    passkeyDrafts.adminPasskey.trim() !== modePasskeys.adminPasskey;

  const handleSaveModePasskeys = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasskeyFormError('');
    if (
      !passkeyDrafts.teamPasskey.trim() ||
      !passkeyDrafts.spendingPasskey.trim() ||
      !passkeyDrafts.adminPasskey.trim()
    ) {
      setPasskeyFormError('All three mode passkeys are required.');
      return;
    }
    setBusy(true);
    try {
      await saveModePasskeys(passkeyDrafts);
    } catch (err) {
      setPasskeyFormError(
        err instanceof Error ? err.message : 'Failed to update passkeys.'
      );
    } finally {
      setBusy(false);
    }
  };

  const handleResetModePasskeys = async () => {
    setPasskeyFormError('');
    setBusy(true);
    try {
      await saveModePasskeys(DEFAULT_MODE_PASSKEYS);
    } finally {
      setBusy(false);
    }
  };

  // Machine handlers
  const handleAddMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newMachine.trim();
    if (!trimmed) return;
    if (machines.includes(trimmed)) {
      pushToast('info', `"${trimmed}" is already in the machine roster.`);
      return;
    }
    setBusy(true);
    try {
      await saveMachinesRoster([...machines, trimmed]);
      setNewMachine('');
    } finally {
      setBusy(false);
    }
  };

  const handleMoveMachine = async (index: number, delta: -1 | 1) => {
    const next = reorderArray(machines, index, index + delta);
    if (next === machines) return;
    setBusy(true);
    try {
      await saveMachinesRoster(next);
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveMachine = async (name: string) => {
    setBusy(true);
    try {
      await saveMachinesRoster(machines.filter((m) => m !== name));
    } finally {
      setBusy(false);
    }
  };

  const handleResetMachines = async () => {
    setBusy(true);
    try {
      await saveMachinesRoster(DEFAULT_MACHINES);
    } finally {
      setBusy(false);
    }
  };

  // Catalog lists handlers (vendors, outsourcers, materials)
  const activeCatalogMeta =
    CATALOG_TABS.find((t) => t.key === activeCatalogTab) || CATALOG_TABS[0];
  const activeCatalogItems = catalogLists[activeCatalogTab];

  const handleAddCatalogItem = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCatalogItem.trim();
    if (!trimmed) return;
    if (activeCatalogItems.includes(trimmed)) {
      pushToast(
        'info',
        `"${trimmed}" is already in the ${activeCatalogMeta.label.toLowerCase()} list.`
      );
      return;
    }
    setBusy(true);
    try {
      await saveCatalogLists({
        ...catalogLists,
        [activeCatalogTab]: [...activeCatalogItems, trimmed],
      });
      setNewCatalogItem('');
    } finally {
      setBusy(false);
    }
  };

  const handleMoveCatalogItem = async (index: number, delta: -1 | 1) => {
    const nextList = reorderArray(activeCatalogItems, index, index + delta);
    if (nextList === activeCatalogItems) return;
    setBusy(true);
    try {
      await saveCatalogLists({
        ...catalogLists,
        [activeCatalogTab]: nextList,
      });
    } finally {
      setBusy(false);
    }
  };

  const handleRemoveCatalogItem = async (item: string) => {
    setBusy(true);
    try {
      await saveCatalogLists({
        ...catalogLists,
        [activeCatalogTab]: activeCatalogItems.filter((x) => x !== item),
      });
    } finally {
      setBusy(false);
    }
  };

  const handleResetCatalogTab = async () => {
    setBusy(true);
    try {
      await saveCatalogLists({
        ...catalogLists,
        [activeCatalogTab]: DEFAULT_CATALOG_LISTS[activeCatalogTab],
      });
    } finally {
      setBusy(false);
    }
  };

  const handleSaveProjectPassword = async (projectId: string) => {
    const trimmed = editingProjPassword.trim();
    if (!trimmed) {
      pushToast('error', 'Project editor password cannot be empty.');
      return;
    }
    setBusy(true);
    try {
      await updateProjectPassword(projectId, trimmed);
      setEditingProjId(null);
      setEditingProjPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Team #451 Admin Console
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">
          Manage mode passkeys, reorder shop machines, customize materials,
          vendors &amp; outsourcers, inspect or update Project passwords, and
          monitor Blaze storage caps.
        </p>
      </div>

      {/* Blaze Free-Tier Storage Guard */}
      {(() => {
        const bytesUsed = storageUsage?.totalBytesUsed || 0;
        const pctBytes = Math.min(
          100,
          Math.round((bytesUsed / MAX_TOTAL_STORAGE_BYTES) * 100)
        );
        const currentMonth = getCurrentMonthKey();
        const monthlyUploads =
          storageUsage?.monthKey === currentMonth
            ? storageUsage.monthlyUploadsCount || 0
            : 0;
        const pctUploads = Math.min(
          100,
          Math.round((monthlyUploads / MAX_MONTHLY_UPLOADS) * 100)
        );

        return (
          <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-500" />
                <div>
                  <h2 className="text-lg font-bold">
                    Blaze Free-Tier Storage Guard
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Automatic hard caps keep your team safely inside Firebase
                    Storage&apos;s free tier (5 GB stored / 5,000 monthly uploads)
                    and auto-compress uploaded images.
                  </p>
                </div>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await recalculateStorageUsage();
                  } finally {
                    setBusy(false);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-semibold hover:border-zinc-400"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Recalculate Usage</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <HardDrive className="w-3.5 h-3.5 text-red-500" />
                    <span>Stored Files Safety Cap</span>
                  </span>
                  <span className="font-mono-tabular font-semibold">
                    {formatFileSize(bytesUsed)} / 4.00 GB
                  </span>
                </div>
                <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      pctBytes > 85 ? 'bg-red-600' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${pctBytes}%` }}
                  />
                </div>
                <div className="text-[11px] text-zinc-500 font-mono-tabular">
                  {storageUsage?.fileCount || 0} tracked files · 1.00 GB safety
                  buffer below 5 GB limit
                </div>
              </div>

              <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold">
                    Monthly Upload Cap ({currentMonth})
                  </span>
                  <span className="font-mono-tabular font-semibold">
                    {monthlyUploads} / {MAX_MONTHLY_UPLOADS.toLocaleString()}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full transition-all ${
                      pctUploads > 85 ? 'bg-red-600' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${pctUploads}%` }}
                  />
                </div>
                <div className="text-[11px] text-zinc-500 font-mono-tabular">
                  1,000-upload buffer below 5,000 monthly free Class A ops · 10
                  MB max per file
                </div>
              </div>
            </div>
          </section>
        );
      })()}

      {/* Workspace Mode Passwords */}
      <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] p-5 space-y-4">
        <form onSubmit={handleSaveModePasskeys} className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-red-500" />
              <div>
                <h2 className="text-lg font-bold">Workspace Mode Passwords</h2>
                <p className="text-xs text-zinc-500">
                  Update the passkeys required for Team Gate, Spending Manager,
                  and Admin Console. Changes sync immediately across all team
                  devices.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleResetModePasskeys()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-semibold hover:border-zinc-400"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Defaults</span>
              </button>
              <button
                type="submit"
                disabled={busy || !passkeysDirty}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-45 text-white text-xs font-semibold transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Passwords</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {(
              [
                {
                  key: 'teamPasskey',
                  label: 'Team Gate Password',
                  hint: 'Required after Google Sign-In to enter Scratchpad.',
                },
                {
                  key: 'spendingPasskey',
                  label: 'Spending Manager Password',
                  hint: 'Required to open Spending Manager and approve orders.',
                },
                {
                  key: 'adminPasskey',
                  label: 'Admin Console Password',
                  hint: 'Required to access this Admin Console.',
                },
              ] as const
            ).map((item) => {
              const shown = revealedModePasskeys[item.key];
              const value = passkeyDrafts[item.key];
              return (
                <div
                  key={item.key}
                  className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] space-y-2"
                >
                  <div>
                    <label
                      htmlFor={`mode-pass-${item.key}`}
                      className="block text-xs font-semibold text-zinc-900 dark:text-zinc-100"
                    >
                      {item.label}
                    </label>
                    <p className="text-[11px] text-zinc-500 mt-0.5">
                      {item.hint}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      id={`mode-pass-${item.key}`}
                      type={shown ? 'text' : 'password'}
                      maxLength={64}
                      value={value}
                      onChange={(e) => {
                        setPasskeyDrafts((prev) => ({
                          ...prev,
                          [item.key]: e.target.value,
                        }));
                        setPasskeyFormError('');
                      }}
                      className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#131317] text-xs font-mono-tabular"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setRevealedModePasskeys((prev) => ({
                          ...prev,
                          [item.key]: !prev[item.key],
                        }))
                      }
                      title={shown ? 'Hide password' : 'Show password'}
                      className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 text-zinc-600 dark:text-zinc-300 bg-white dark:bg-[#131317]"
                    >
                      {shown ? (
                        <EyeOff className="w-3.5 h-3.5" />
                      ) : (
                        <Eye className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(value);
                        pushToast('info', `${item.label} copied.`);
                      }}
                      title="Copy password"
                      className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 text-zinc-600 dark:text-zinc-300 bg-white dark:bg-[#131317]"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {passkeyFormError ? (
            <p className="text-xs font-medium text-red-500">
              {passkeyFormError}
            </p>
          ) : null}
        </form>
      </section>

      {/* Lists Editors: Machines Roster + Materials / Vendors / Outsourcers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel 1: Shop Machines Roster */}
        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-red-500" />
              <div>
                <h2 className="text-lg font-bold">
                  Shop Machines Roster ({machines.length})
                </h2>
                <p className="text-[11px] text-zinc-500">
                  Add, remove, or reorder machines shown in the Parts Wizard.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleResetMachines()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-semibold hover:border-zinc-400 shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>
          </div>

          <form onSubmit={handleAddMachine} className="flex gap-2">
            <input
              type="text"
              maxLength={60}
              value={newMachine}
              onChange={(e) => setNewMachine(e.target.value)}
              placeholder="Add new machine (e.g., Waterjet)"
              className="flex-1 px-3.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#09090B] text-sm"
            />
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
            </button>
          </form>

          {machines.length === 0 ? (
            <p className="text-xs text-zinc-500 py-8 text-center">
              No machines in roster. Add one above or reset defaults.
            </p>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-96 overflow-y-auto">
              {machines.map((m, idx) => (
                <div
                  key={m}
                  className="py-2 flex items-center justify-between gap-2 text-sm"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xs font-mono-tabular text-zinc-400 w-5 text-right shrink-0">
                      {idx + 1}.
                    </span>
                    <span className="font-medium truncate">{m}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={busy || idx === 0}
                      onClick={() => void handleMoveMachine(idx, -1)}
                      title={`Move ${m} up`}
                      className="p-1.5 rounded border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 disabled:opacity-30 disabled:pointer-events-none text-zinc-600 dark:text-zinc-300"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={busy || idx === machines.length - 1}
                      onClick={() => void handleMoveMachine(idx, 1)}
                      title={`Move ${m} down`}
                      className="p-1.5 rounded border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 disabled:opacity-30 disabled:pointer-events-none text-zinc-600 dark:text-zinc-300"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleRemoveMachine(m)}
                      title={`Remove ${m}`}
                      className="p-1.5 rounded hover:bg-red-500/15 text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Panel 2: Materials, Vendors & Outsourcers */}
        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-red-500" />
              <div>
                <h2 className="text-lg font-bold">
                  Materials, Vendors &amp; Outsourcers
                </h2>
                <p className="text-[11px] text-zinc-500">
                  Add, remove, or reorder dropdown options used across part
                  creation and bulk editing.
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleResetCatalogTab()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-semibold hover:border-zinc-400 shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset {activeCatalogMeta.label}</span>
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {CATALOG_TABS.map((tab) => {
              const active = activeCatalogTab === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => {
                    setActiveCatalogTab(tab.key);
                    setNewCatalogItem('');
                  }}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                    active
                      ? 'border-red-600 bg-red-600 text-white'
                      : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] text-zinc-700 dark:text-zinc-300 hover:border-zinc-400'
                  }`}
                >
                  {tab.label} ({catalogLists[tab.key].length})
                </button>
              );
            })}
          </div>

          <form onSubmit={handleAddCatalogItem} className="flex gap-2">
            <input
              type="text"
              maxLength={60}
              value={newCatalogItem}
              onChange={(e) => setNewCatalogItem(e.target.value)}
              placeholder={activeCatalogMeta.placeholder}
              className="flex-1 px-3.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#09090B] text-sm"
            />
            <button
              type="submit"
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
            </button>
          </form>

          {activeCatalogItems.length === 0 ? (
            <p className="text-xs text-zinc-500 py-8 text-center">
              No {activeCatalogMeta.noun} entries yet. Add one above or reset
              defaults.
            </p>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-80 overflow-y-auto">
              {activeCatalogItems.map((item, idx) => (
                <div
                  key={item}
                  className="py-2 flex items-center justify-between gap-2 text-sm"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-xs font-mono-tabular text-zinc-400 w-5 text-right shrink-0">
                      {idx + 1}.
                    </span>
                    <span className="font-medium truncate">{item}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={busy || idx === 0}
                      onClick={() => void handleMoveCatalogItem(idx, -1)}
                      title={`Move ${item} up`}
                      className="p-1.5 rounded border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 disabled:opacity-30 disabled:pointer-events-none text-zinc-600 dark:text-zinc-300"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={busy || idx === activeCatalogItems.length - 1}
                      onClick={() => void handleMoveCatalogItem(idx, 1)}
                      title={`Move ${item} down`}
                      className="p-1.5 rounded border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 disabled:opacity-30 disabled:pointer-events-none text-zinc-600 dark:text-zinc-300"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void handleRemoveCatalogItem(item)}
                      title={`Remove ${item}`}
                      className="p-1.5 rounded hover:bg-red-500/15 text-red-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!activeCatalogItems.includes('Other') ? (
            <p className="text-[11px] text-amber-600 dark:text-amber-400">
              Note: Adding &ldquo;Other&rdquo; allows students to type custom
              one-off entries in the Parts Wizard.
            </p>
          ) : null}
        </section>
      </div>

      {/* Team Projects & Editor Passwords */}
      <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] p-5 space-y-4">
        <h2 className="text-lg font-bold">
          Team Projects &amp; Editor Passwords ({projects.length})
        </h2>

        {projects.length === 0 ? (
          <p className="text-sm text-zinc-500 py-8 text-center">
            No team Projects created yet.
          </p>
        ) : (
          <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {projects.map((proj) => {
              const shown = Boolean(revealedPasswords[proj.id]);
              const isEditing = editingProjId === proj.id;
              return (
                <div
                  key={proj.id}
                  className="py-3 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">
                      {proj.name}
                    </div>
                    {isEditing ? (
                      <div className="mt-1.5 flex items-center gap-1.5 max-w-sm">
                        <input
                          type="text"
                          maxLength={64}
                          value={editingProjPassword}
                          onChange={(e) =>
                            setEditingProjPassword(e.target.value)
                          }
                          placeholder="New editor password"
                          className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#09090B] text-xs font-mono-tabular"
                        />
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void handleSaveProjectPassword(proj.id)
                          }
                          title="Save project password"
                          className="p-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setEditingProjId(null);
                            setEditingProjPassword('');
                          }}
                          title="Cancel"
                          className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-500"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="text-xs font-mono-tabular text-zinc-500 mt-0.5">
                        Password:{' '}
                        <span className="text-zinc-900 dark:text-zinc-200 font-semibold">
                          {shown ? proj.editorPassword : '••••••••'}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setRevealedPasswords((prev) => ({
                          ...prev,
                          [proj.id]: !prev[proj.id],
                        }))
                      }
                      title={shown ? 'Hide password' : 'Show password'}
                      className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 text-zinc-600 dark:text-zinc-300"
                    >
                      {shown ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText(proj.editorPassword);
                        pushToast('info', 'Editor password copied.');
                      }}
                      title="Copy password"
                      className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 text-zinc-600 dark:text-zinc-300"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingProjId(proj.id);
                        setEditingProjPassword(proj.editorPassword);
                      }}
                      title="Edit project editor password"
                      className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 text-zinc-600 dark:text-zinc-300"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmProject(proj)}
                      title="Delete Project & BOM"
                      className="p-2 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/15"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <Modal
        open={confirmProject !== null}
        onClose={() => setConfirmProject(null)}
        title="Delete Project & All BOMs"
        subtitle={confirmProject?.name}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            This will permanently delete <strong>{confirmProject?.name}</strong>
            , all Subassemblies, and all Parts inside it.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmProject(null)}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                if (!confirmProject) return;
                setBusy(true);
                try {
                  await deleteProject(confirmProject.id);
                  setConfirmProject(null);
                } finally {
                  setBusy(false);
                }
              }}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white"
            >
              {busy ? 'Deleting...' : 'Delete Permanently'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
