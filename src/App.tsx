import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { useHashRoute } from './utils/hashRouter';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import { ToastContainer, TopBar } from './components/TopBar';
import { TeamGate } from './components/TeamGate';
import { ModesHub } from './components/ModesHub';
import { ProjectWorkspace } from './components/ProjectWorkspace';
import { MachiningManagerView } from './components/MachiningManagerView';
import { SpendingManagerView } from './components/SpendingManagerView';
import { AdminView } from './components/AdminView';

const AppShell: React.FC = () => {
  const { user, authReady, teamUnlocked } = useApp();
  const { route, navigate } = useHashRoute();

  const isGateOpen = !authReady || !user || !user.emailVerified || !teamUnlocked;
  const activeMode = isGateOpen ? 'gate' : route.mode === 'gate' ? 'modes' : route.mode;

  return (
    <div className="min-h-screen flex flex-col bg-zinc-50 dark:bg-[#09090B] text-zinc-900 dark:text-zinc-100">
      <TopBar currentMode={activeMode} onNavigate={navigate} />

      <div className="flex-1">
        {isGateOpen ? (
          <TeamGate onUnlocked={() => navigate('modes')} />
        ) : activeMode === 'modes' ? (
          <ModesHub onSelectMode={(m) => navigate(m)} />
        ) : activeMode === 'bom' ? (
          <ProjectWorkspace
            editable={false}
            selectedProjectId={route.projectId}
            onSelectProject={(id) => navigate('bom', id)}
          />
        ) : activeMode === 'parts-manager' ? (
          <ProjectWorkspace
            editable={true}
            selectedProjectId={route.projectId}
            onSelectProject={(id) => navigate('parts-manager', id)}
          />
        ) : activeMode === 'machining' ? (
          <MachiningManagerView
            selectedProjectId={route.projectId}
            onSelectProject={(id) => navigate('machining', id)}
          />
        ) : activeMode === 'spending' ? (
          <SpendingManagerView
            selectedProjectId={route.projectId}
            onSelectProject={(id) => navigate('spending', id)}
          />
        ) : activeMode === 'admin' ? (
          <AdminView />
        ) : (
          <ModesHub onSelectMode={(m) => navigate(m)} />
        )}
      </div>

      <ToastContainer />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AppProvider>
        <AppShell />
      </AppProvider>
    </ErrorBoundary>
  );
}
