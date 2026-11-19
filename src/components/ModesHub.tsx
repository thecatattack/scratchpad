import React, { useState } from 'react';
import {
  ClipboardList,
  DollarSign,
  FolderKanban,
  Lock,
  ShieldAlert,
  Wrench,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { AppMode } from '../types';
import { Modal } from './ui/Modal';

interface ModesHubProps {
  onSelectMode: (mode: AppMode) => void;
}

export const ModesHub: React.FC<ModesHubProps> = ({ onSelectMode }) => {
  const { adminUnlocked, spendingUnlocked, unlockAdmin, unlockSpending } =
    useApp();

  const [pendingGate, setPendingGate] = useState<'admin' | 'spending' | null>(
    null
  );
  const [passInput, setPassInput] = useState('');
  const [passError, setPassError] = useState('');

  const handleCardClick = (mode: AppMode) => {
    if (mode === 'admin' && !adminUnlocked) {
      setPassInput('');
      setPassError('');
      setPendingGate('admin');
      return;
    }
    if (mode === 'spending' && !spendingUnlocked) {
      setPassInput('');
      setPassError('');
      setPendingGate('spending');
      return;
    }
    onSelectMode(mode);
  };

  const handlePassSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pendingGate === 'admin') {
      if (unlockAdmin(passInput)) {
        setPendingGate(null);
        onSelectMode('admin');
      } else {
        setPassError('Invalid Admin passkey.');
      }
    } else if (pendingGate === 'spending') {
      if (unlockSpending(passInput)) {
        setPendingGate(null);
        onSelectMode('spending');
      } else {
        setPassError('Invalid Spending Manager passkey.');
      }
    }
  };

  const cards: Array<{
    mode: AppMode;
    title: string;
    subtitle: string;
    description: string;
    icon: React.ReactNode;
    locked?: boolean;
  }> = [
    {
      mode: 'bom',
      title: 'BOM Viewer',
      subtitle: 'Read-Only Team Access',
      description:
        'Inspect Main and Subassembly BOMs, search parts, view Kanban statuses, preview drawing PDFs, and download files.',
      icon: <ClipboardList className="w-6 h-6 text-red-500" />,
    },
    {
      mode: 'parts-manager',
      title: 'Parts Manager',
      subtitle: 'Project Editor Password',
      description:
        'Create Projects and Subassemblies, run the guided Add Parts wizard, edit properties, and submit machining or purchase requests.',
      icon: <FolderKanban className="w-6 h-6 text-red-500" />,
      locked: true,
    },
    {
      mode: 'machining',
      title: 'Machining Manager',
      subtitle: 'Shop Floor Queue',
      description:
        'View requested in-house parts, log machines completed, update status to Obtained, and track machined spares.',
      icon: <Wrench className="w-6 h-6 text-red-500" />,
    },
    {
      mode: 'spending',
      title: 'Spending Manager',
      subtitle: 'Budget Passkey Required',
      description:
        'Review COTS and paid outsourced purchase requests, open vendor links, approve orders, and log received quantities.',
      icon: <DollarSign className="w-6 h-6 text-red-500" />,
      locked: !spendingUnlocked,
    },
    {
      mode: 'admin',
      title: 'Admin Console',
      subtitle: 'Admin Passkey Required',
      description:
        'Edit the shop machine roster, view Project editor passwords, and remove old team Projects and BOMs.',
      icon: <ShieldAlert className="w-6 h-6 text-red-500" />,
      locked: !adminUnlocked,
    },
  ];

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
      <div className="space-y-2 max-w-2xl">
        <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-zinc-900 dark:text-white">
          Select Workspace Mode
        </h1>
        <p className="text-sm sm:text-base text-zinc-600 dark:text-zinc-400">
          Choose your role in Team #451 Cat Attack. You can return here at any
          time using Switch Mode in the header.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {cards.map((card) => (
          <button
            key={card.mode}
            type="button"
            onClick={() => handleCardClick(card.mode)}
            className="group text-left rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] hover:border-red-500/70 dark:hover:border-red-500/70 p-6 transition-all duration-150 hover:-translate-y-0.5 active:scale-[0.985] flex flex-col justify-between gap-5"
          >
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="w-11 h-11 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                  {card.icon}
                </div>
                {card.locked ? (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                    <Lock className="w-3.5 h-3.5" />
                    <span>Protected</span>
                  </span>
                ) : null}
              </div>

              <div>
                <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white group-hover:text-red-600 dark:group-hover:text-red-400 transition-colors">
                  {card.title}
                </h2>
                <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-0.5">
                  {card.subtitle}
                </div>
              </div>

              <p className="text-sm text-zinc-600 dark:text-zinc-300 leading-relaxed">
                {card.description}
              </p>
            </div>

            <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800/80 flex items-center justify-between text-xs font-semibold text-red-600 dark:text-red-400">
              <span>Open {card.title}</span>
              <span className="transition-transform group-hover:translate-x-1">
                →
              </span>
            </div>
          </button>
        ))}
      </div>

      <Modal
        open={pendingGate !== null}
        onClose={() => setPendingGate(null)}
        title={
          pendingGate === 'admin'
            ? 'Enter Admin Passkey'
            : 'Enter Spending Manager Passkey'
        }
        subtitle={
          pendingGate === 'admin'
            ? 'Required to edit shop machines, view project passwords, and delete BOMs.'
            : 'Required for budgeting students to approve and update purchase requests.'
        }
        maxWidth="sm"
      >
        <form onSubmit={handlePassSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="mode-passkey"
              className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300"
            >
              Passkey
            </label>
            <input
              id="mode-passkey"
              type="password"
              autoFocus
              value={passInput}
              onChange={(e) => {
                setPassInput(e.target.value);
                setPassError('');
              }}
              placeholder="Enter passkey"
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#09090B] text-sm text-zinc-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-red-600"
            />
            {passError ? (
              <p className="text-xs font-medium text-red-600 dark:text-red-400">
                {passError}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setPendingGate(null)}
              className="px-4 py-2 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white transition-all active:scale-[0.98]"
            >
              Unlock Mode
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
