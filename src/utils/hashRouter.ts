import { useCallback, useEffect, useState } from 'react';
import { AppMode } from '../types';

export interface HashRouteState {
  mode: AppMode;
  projectId: string | null;
}

function parseHash(): HashRouteState {
  const raw = window.location.hash.replace(/^#\/?/, '').trim();
  if (!raw) return { mode: 'modes', projectId: null };
  const segments = raw.split('/').filter(Boolean);
  const first = segments[0] as AppMode | undefined;
  const validModes: AppMode[] = [
    'gate',
    'modes',
    'bom',
    'parts-manager',
    'machining',
    'spending',
    'admin',
  ];
  if (!first || !validModes.includes(first)) {
    return { mode: 'modes', projectId: null };
  }
  return {
    mode: first,
    projectId: segments[1] ? decodeURIComponent(segments[1]) : null,
  };
}

export function useHashRoute() {
  const [route, setRoute] = useState<HashRouteState>(() => parseHash());

  useEffect(() => {
    const handleHashChange = () => {
      setRoute(parseHash());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const navigate = useCallback((mode: AppMode, projectId?: string | null) => {
    const targetHash = projectId
      ? `#/${mode}/${encodeURIComponent(projectId)}`
      : `#/${mode}`;
    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    } else {
      setRoute({ mode, projectId: projectId ?? null });
    }
  }, []);

  return { route, navigate };
}
