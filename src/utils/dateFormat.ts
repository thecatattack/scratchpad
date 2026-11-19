export function toMillis(ts: unknown): number {
  if (!ts) return 0;
  if (typeof ts === 'number') return Number.isFinite(ts) ? ts : 0;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts === 'object') {
    const maybe = ts as {
      toDate?: () => Date;
      toMillis?: () => number;
      seconds?: number;
      nanoseconds?: number;
    };
    if (typeof maybe.toMillis === 'function') return maybe.toMillis();
    if (typeof maybe.toDate === 'function') return maybe.toDate().getTime();
    if (typeof maybe.seconds === 'number') {
      return maybe.seconds * 1000 + Math.round((maybe.nanoseconds || 0) / 1e6);
    }
  }
  if (typeof ts === 'string') {
    const parsed = Date.parse(ts);
    return Number.isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

export function formatTimestamp(ts: unknown): string {
  const ms = toMillis(ts);
  if (!ms) return '—';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms));
}

export function formatShortTimestamp(ts: unknown): string {
  const ms = toMillis(ts);
  if (!ms) return '';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(ms));
}

export function formatActorDisplay(name?: string, fallbackId?: string): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  if (fallbackId?.trim()) return `User (${fallbackId.slice(0, 6)}…)`;
  return 'Unknown';
}

export function formatActorShort(name?: string, fallbackId?: string): string {
  const full = formatActorDisplay(name, fallbackId);
  const parenIdx = full.indexOf(' (');
  if (parenIdx > 0) return full.slice(0, parenIdx);
  return full;
}
