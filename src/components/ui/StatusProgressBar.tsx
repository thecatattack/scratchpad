import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { AggregatedPart, PartStatus } from '../../types';

const STORAGE_KEY = 'ca451_hide_status_progress';

function readCollapsedPref(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeCollapsedPref(value: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, value ? 'true' : 'false');
  } catch {
    // Ignore storage restriction errors
  }
}

interface StatusMeta {
  status: PartStatus;
  barClass: string;
  dotClass: string;
  textClass: string;
}

const STATUS_META: StatusMeta[] = [
  {
    status: 'Obtained',
    barClass: 'bg-emerald-500',
    dotClass: 'bg-emerald-500',
    textClass: 'text-emerald-600 dark:text-emerald-400',
  },
  {
    status: 'Shipping',
    barClass: 'bg-orange-500',
    dotClass: 'bg-orange-500',
    textClass: 'text-orange-600 dark:text-orange-400',
  },
  {
    status: 'In-Progress',
    barClass: 'bg-amber-500',
    dotClass: 'bg-amber-500',
    textClass: 'text-amber-600 dark:text-amber-400',
  },
  {
    status: 'Ready for Machine',
    barClass: 'bg-cyan-500',
    dotClass: 'bg-cyan-500',
    textClass: 'text-cyan-600 dark:text-cyan-400',
  },
  {
    status: 'Needs CAM',
    barClass: 'bg-indigo-500',
    dotClass: 'bg-indigo-500',
    textClass: 'text-indigo-600 dark:text-indigo-400',
  },
  {
    status: 'Needs Drawing',
    barClass: 'bg-violet-500',
    dotClass: 'bg-violet-500',
    textClass: 'text-violet-600 dark:text-violet-400',
  },
  {
    status: 'Requested',
    barClass: 'bg-sky-500',
    dotClass: 'bg-sky-500',
    textClass: 'text-sky-600 dark:text-sky-400',
  },
  {
    status: 'Denied',
    barClass: 'bg-red-500',
    dotClass: 'bg-red-500',
    textClass: 'text-red-600 dark:text-red-400',
  },
  {
    status: 'Not Started',
    barClass: 'bg-zinc-400 dark:bg-zinc-600',
    dotClass: 'bg-zinc-400 dark:bg-zinc-500',
    textClass: 'text-zinc-600 dark:text-zinc-400',
  },
];

interface StatusProgressBarProps {
  parts: AggregatedPart[];
  activeStatusFilter: 'ALL' | PartStatus;
  onSelectStatusFilter: (next: 'ALL' | PartStatus) => void;
  title?: string;
}

export const StatusProgressBar: React.FC<StatusProgressBarProps> = ({
  parts,
  activeStatusFilter,
  onSelectStatusFilter,
  title = 'Part Status Progress',
}) => {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsedPref);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsedPref(next);
      return next;
    });
  };

  const stats = useMemo(() => {
    const counts = new Map<PartStatus, number>();
    let totalUnits = 0;

    for (const meta of STATUS_META) {
      counts.set(meta.status, 0);
    }

    for (const p of parts) {
      counts.set(p.status, (counts.get(p.status) ?? 0) + 1);
      totalUnits += p.quantity || 0;
    }

    const totalParts = parts.length;
    const obtainedCount = counts.get('Obtained') ?? 0;
    const obtainedPct =
      totalParts > 0 ? Math.round((obtainedCount / totalParts) * 100) : 0;

    const breakdown = STATUS_META.map((meta) => {
      const count = counts.get(meta.status) ?? 0;
      const pct = totalParts > 0 ? Math.round((count / totalParts) * 100) : 0;
      const exactPct = totalParts > 0 ? (count / totalParts) * 100 : 0;
      return {
        ...meta,
        count,
        pct,
        exactPct,
      };
    });

    return {
      totalParts,
      totalUnits,
      obtainedCount,
      obtainedPct,
      breakdown,
    };
  }, [parts]);

  if (stats.totalParts === 0) return null;

  return (
    <div
      className={`rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] ${
        collapsed ? 'px-3.5 py-2' : 'p-3.5 sm:p-4 space-y-3'
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold text-zinc-900 dark:text-white">
            {title}
          </span>
          <span className="text-zinc-500 dark:text-zinc-400 font-mono-tabular">
            {stats.totalParts} part{stats.totalParts === 1 ? '' : 's'} ·{' '}
            {stats.totalUnits} total qty
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {activeStatusFilter !== 'ALL' ? (
            <button
              type="button"
              onClick={() => onSelectStatusFilter('ALL')}
              className="text-[11px] font-semibold text-red-600 dark:text-red-400 hover:underline"
            >
              Clear "{activeStatusFilter}" filter
            </button>
          ) : null}
          <span className="font-mono-tabular font-semibold text-emerald-600 dark:text-emerald-400">
            {stats.obtainedCount}/{stats.totalParts} Obtained ({stats.obtainedPct}
            %)
          </span>
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-expanded={!collapsed}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 transition-colors"
          >
            {collapsed ? (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>Show</span>
              </>
            ) : (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>Hide</span>
              </>
            )}
          </button>
        </div>
      </div>

      {!collapsed ? (
        <>
          {/* Stacked Progress Bar */}
          <div
            role="progressbar"
            aria-label={title}
            aria-valuenow={stats.obtainedPct}
            aria-valuemin={0}
            aria-valuemax={100}
            className="h-3 w-full rounded-full overflow-hidden flex bg-zinc-100 dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800"
          >
            {stats.breakdown.map((item) => {
              if (item.count === 0) return null;
              const isDimmed =
                activeStatusFilter !== 'ALL' &&
                activeStatusFilter !== item.status;
              return (
                <button
                  key={item.status}
                  type="button"
                  onClick={() =>
                    onSelectStatusFilter(
                      activeStatusFilter === item.status ? 'ALL' : item.status
                    )
                  }
                  style={{ width: `${item.exactPct}%` }}
                  title={`${item.status}: ${item.count} part${
                    item.count === 1 ? '' : 's'
                  } (${item.pct}%) — Click to filter`}
                  className={`h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full hover:brightness-110 cursor-pointer ${
                    item.barClass
                  } ${isDimmed ? 'opacity-30' : 'opacity-100'}`}
                />
              );
            })}
          </div>

          {/* All Status Stats */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px]">
            {stats.breakdown.map((item) => {
              const isSelected = activeStatusFilter === item.status;
              const isZero = item.count === 0;
              return (
                <button
                  key={item.status}
                  type="button"
                  onClick={() =>
                    onSelectStatusFilter(isSelected ? 'ALL' : item.status)
                  }
                  title={`Filter table by ${item.status}`}
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                    isSelected
                      ? 'border-red-500 bg-red-500/10 text-zinc-900 dark:text-white font-semibold'
                      : isZero
                      ? 'border-transparent text-zinc-400 dark:text-zinc-600 opacity-70 hover:opacity-100'
                      : 'border-zinc-200/80 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-600'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full shrink-0 ${item.dotClass}`}
                  />
                  <span>{item.status}:</span>
                  <span
                    className={`font-mono-tabular font-semibold ${
                      isZero ? '' : item.textClass
                    }`}
                  >
                    {item.count}
                  </span>
                  <span className="font-mono-tabular text-zinc-400 dark:text-zinc-500">
                    ({item.pct}%)
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
};
