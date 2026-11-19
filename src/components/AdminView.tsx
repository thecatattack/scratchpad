import React, { useState } from 'react';
import {
  Copy,
  Eye,
  EyeOff,
  HardDrive,
  Lock,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Trash2,
  Wrench,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import {
  DEFAULT_MACHINES,
  MAX_MONTHLY_UPLOADS,
  MAX_TOTAL_STORAGE_BYTES,
  Project,
} from '../types';
import { formatFileSize, getCurrentMonthKey } from '../firebase';
import { Modal } from './ui/Modal';

export const AdminView: React.FC = () => {
  const {
    adminUnlocked,
    unlockAdmin,
    projects,
    deleteProject,
    machines,
    saveMachinesRoster,
    storageUsage,
    recalculateStorageUsage,
    pushToast,
  } = useApp();

  const [passInput, setPassInput] = useState('');
  const [passError, setPassError] = useState('');

  const [newMachine, setNewMachine] = useState('');
  const [revealedPasswords, setRevealedPasswords] = useState<
    Record<string, boolean>
  >({});
  const [confirmProject, setConfirmProject] = useState<Project | null>(null);
  const [busy, setBusy] = useState(false);

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
            Enter the Admin passkey to manage shop machines, view Project
            passwords, or delete Projects.
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

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-8 space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Team #451 Admin Console
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">
          Manage the shop machine list, inspect Project Editor passwords,
          monitor Blaze free-tier storage caps, and delete Projects or BOMs.
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Panel 1: Shop Machines Roster */}
        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-red-500" />
              <h2 className="text-lg font-bold">Shop Machines Roster</h2>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleResetMachines()}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 text-xs font-semibold hover:border-zinc-400"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Defaults</span>
            </button>
          </div>

          <form onSubmit={handleAddMachine} className="flex gap-2">
            <input
              type="text"
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

          <div className="divide-y divide-zinc-100 dark:divide-zinc-800 max-h-96 overflow-y-auto">
            {machines.map((m) => (
              <div
                key={m}
                className="py-2.5 flex items-center justify-between gap-3 text-sm"
              >
                <span className="font-medium">{m}</span>
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
            ))}
          </div>
        </section>

        {/* Panel 2: Projects, Passwords & Deletion */}
        <section className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] p-5 space-y-4">
          <h2 className="text-lg font-bold">
            Team Projects & Editor Passwords ({projects.length})
          </h2>

          {projects.length === 0 ? (
            <p className="text-sm text-zinc-500 py-8 text-center">
              No team Projects created yet.
            </p>
          ) : (
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {projects.map((proj) => {
                const shown = Boolean(revealedPasswords[proj.id]);
                return (
                  <div
                    key={proj.id}
                    className="py-3 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">
                        {proj.name}
                      </div>
                      <div className="text-xs font-mono-tabular text-zinc-500 mt-0.5">
                        Password:{' '}
                        <span className="text-zinc-900 dark:text-zinc-200 font-semibold">
                          {shown ? proj.editorPassword : '••••••••'}
                        </span>
                      </div>
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
                          void navigator.clipboard.writeText(
                            proj.editorPassword
                          );
                          pushToast('info', 'Editor password copied.');
                        }}
                        title="Copy password"
                        className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-zinc-400 text-zinc-600 dark:text-zinc-300"
                      >
                        <Copy className="w-4 h-4" />
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
      </div>

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
