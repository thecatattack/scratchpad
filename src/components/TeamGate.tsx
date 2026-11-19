import React, { useState } from 'react';
import { ArrowRight, KeyRound, Lock, ShieldCheck } from 'lucide-react';
import { useApp } from '../context/AppContext';

interface TeamGateProps {
  onUnlocked: () => void;
}

export const TeamGate: React.FC<TeamGateProps> = ({ onUnlocked }) => {
  const { user, authReady, signInGoogle, unlockTeam, teamUnlocked } = useApp();
  const [passkey, setPasskey] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!unlockTeam(passkey)) {
      setError('Incorrect team passkey. Please verify with your team lead.');
      return;
    }
    onUnlocked();
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] p-6 sm:p-8 shadow-xl space-y-6">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-xl bg-red-600 flex items-center justify-center text-white shrink-0">
            <svg
              viewBox="0 0 36 36"
              className="w-7 h-7"
              fill="none"
              aria-hidden="true"
            >
              <path
                d="M7 9L13 15L18 11L23 15L29 9V22C29 26.5 24 30 18 30C12 30 7 26.5 7 22V9Z"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinejoin="round"
              />
              <circle cx="14" cy="20" r="1.6" fill="currentColor" />
              <circle cx="22" cy="20" r="1.6" fill="currentColor" />
            </svg>
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white leading-none">
              FRC #451 Cat Attack
            </h1>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
              Parts, BOM & Shop Operations Portal
            </p>
          </div>
        </div>

        {/* Step 1: Google Sign-In for Firebase database access */}
        <div className="space-y-2.5 pt-2 border-t border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            <span>1. Team Member Account</span>
            {user ? (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-3.5 h-3.5" />
                Signed In
              </span>
            ) : null}
          </div>

          {!authReady ? (
            <div className="h-11 rounded-lg bg-zinc-100 dark:bg-zinc-800/60 animate-pulse" />
          ) : user ? (
            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] text-xs">
              <div className="min-w-0">
                <div className="font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                  {user.displayName || 'Cat Attack Member'}
                </div>
                <div className="text-zinc-500 dark:text-zinc-400 truncate">
                  {user.email}
                </div>
              </div>
              {!user.emailVerified ? (
                <span className="text-red-500 font-medium shrink-0">
                  Unverified
                </span>
              ) : null}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void signInGoogle()}
              className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#1C1C22] hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-semibold text-zinc-900 dark:text-white transition-all active:scale-[0.98]"
            >
              <Lock className="w-4 h-4 text-red-500" />
              <span>Sign in with Google to Sync Database</span>
            </button>
          )}
        </div>

        {/* Step 2: Team Passkey */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="team-passkey-input"
              className="flex items-center justify-between text-xs font-semibold text-zinc-700 dark:text-zinc-300"
            >
              <span>2. Team Passkey</span>
              {teamUnlocked ? (
                <span className="text-emerald-600 dark:text-emerald-400">
                  Verified
                </span>
              ) : null}
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="team-passkey-input"
                type="password"
                value={passkey}
                onChange={(e) => {
                  setPasskey(e.target.value);
                  setError('');
                }}
                placeholder="Enter team passkey"
                autoComplete="off"
                className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-[#09090B] text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-red-600 focus:border-transparent"
              />
            </div>
            {error ? (
              <p className="text-xs font-medium text-red-600 dark:text-red-400">
                {error}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            disabled={!user}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-45 disabled:pointer-events-none text-white text-sm font-semibold transition-all active:scale-[0.98]"
          >
            <span>Enter Cat Attack Workspace</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
