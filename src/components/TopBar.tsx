import React, { useEffect, useState } from 'react';
import {
  ArrowLeftRight,
  LogOut,
  Moon,
  Sun,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useApp } from '../context/AppContext';
import { AppMode } from '../types';
import { ScratchpadLogo } from './ui/ScratchpadLogo';

interface TopBarProps {
  currentMode: AppMode;
  onNavigate: (mode: AppMode, projectId?: string | null) => void;
}

const MODE_LABELS: Record<AppMode, string> = {
  gate: 'Team Access',
  modes: 'App Modes',
  bom: 'BOM Viewer',
  'parts-manager': 'Parts Manager',
  machining: 'Machining Manager',
  spending: 'Spending Manager',
  admin: 'Admin',
};

export const TopBar: React.FC<TopBarProps> = ({ currentMode, onNavigate }) => {
  const { darkMode, toggleDarkMode, teamUnlocked, user, signOutUser } = useApp();
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    setAvatarFailed(false);
  }, [user?.photoURL]);

  const userName = user?.displayName?.trim() || user?.email?.trim() || 'Team Member';
  const userTitle =
    user?.displayName && user?.email
      ? `${user.displayName} (${user.email})`
      : userName;

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 dark:border-zinc-800 bg-white/95 dark:bg-[#09090B]/95 backdrop-blur-sm">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4 sm:gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <a
          href="#/modes"
          onClick={(e) => {
            e.preventDefault();
            onNavigate(teamUnlocked ? 'modes' : 'gate');
          }}
          className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-zinc-900 dark:text-white whitespace-nowrap shrink-0 font-display"
        >
          <ScratchpadLogo className="w-8 h-8 shrink-0" />
          <span>Scratchpad</span>
        </a>

        {/* Zone 2: Concise single-line mode links (desktop) */}
        {teamUnlocked && user ? (
          <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-zinc-600 dark:text-zinc-400">
            {(
              [
                ['bom', 'BOM Viewer'],
                ['parts-manager', 'Parts Manager'],
                ['machining', 'Machining'],
                ['spending', 'Spending'],
                ['admin', 'Admin'],
              ] as Array<[AppMode, string]>
            ).map(([modeKey, label]) => {
              const active = currentMode === modeKey;
              return (
                <button
                  key={modeKey}
                  type="button"
                  onClick={() => onNavigate(modeKey)}
                  className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                    active
                      ? 'border-red-600 text-zinc-900 dark:text-white font-semibold'
                      : 'border-transparent hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </nav>
        ) : (
          <div className="hidden lg:block text-xs text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
            {MODE_LABELS[currentMode]}
          </div>
        )}

        {/* Zone 3: Theme Toggle + Switch Modes + Account Info + Sign Out */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <button
            type="button"
            onClick={toggleDarkMode}
            aria-label={darkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            title={darkMode ? 'Light mode' : 'Dark mode'}
            className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100/70 dark:bg-[#131317] text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white hover:border-zinc-300 dark:hover:border-zinc-700 transition-all active:scale-95"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {teamUnlocked && user && currentMode !== 'modes' ? (
            <button
              type="button"
              onClick={() => onNavigate('modes')}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white transition-all active:scale-[0.98] whitespace-nowrap shrink-0"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>Switch Mode</span>
            </button>
          ) : null}

          {user ? (
            <div className="flex items-center gap-2 pl-1 sm:pl-2 border-l border-zinc-200 dark:border-zinc-800">
              <div
                title={userTitle}
                className="flex items-center gap-2 px-2 py-1 rounded-lg bg-zinc-100/80 dark:bg-[#131317] border border-zinc-200 dark:border-zinc-800 min-w-0"
              >
                {user.photoURL && !avatarFailed ? (
                  <img
                    src={user.photoURL}
                    alt={userName}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarFailed(true)}
                    className="w-6 h-6 rounded-full object-cover shrink-0 border border-zinc-300 dark:border-zinc-700"
                  />
                ) : (
                  <span className="w-6 h-6 rounded-full bg-red-600/15 text-red-600 dark:text-red-400 border border-red-500/30 flex items-center justify-center text-[11px] font-bold shrink-0">
                    {user.displayName ? (
                      user.displayName.trim().charAt(0).toUpperCase()
                    ) : (
                      <UserIcon className="w-3.5 h-3.5" />
                    )}
                  </span>
                )}
                <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-100 truncate max-w-[110px] sm:max-w-[160px]">
                  {userName}
                </span>
              </div>

              <button
                type="button"
                onClick={() => void signOutUser()}
                aria-label="Sign out"
                title={`Sign out (${userTitle})`}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 text-xs font-medium rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all active:scale-[0.98] whitespace-nowrap shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Sign Out</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
};

export const ToastContainer: React.FC = () => {
  const { toasts, dismissToast } = useApp();
  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none px-4 sm:px-0">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto animate-modal-in flex items-start justify-between gap-3 px-4 py-3 rounded-xl border shadow-lg text-sm ${
            toast.type === 'error'
              ? 'bg-red-950/95 border-red-700 text-red-100'
              : toast.type === 'success'
              ? 'bg-zinc-900 border-emerald-600/60 text-zinc-100'
              : 'bg-zinc-900 border-zinc-700 text-zinc-100'
          }`}
        >
          <span className="leading-snug">{toast.text}</span>
          <button
            type="button"
            onClick={() => dismissToast(toast.id)}
            aria-label="Dismiss message"
            className="text-zinc-400 hover:text-white shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
};
