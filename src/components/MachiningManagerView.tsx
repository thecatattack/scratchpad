import React, { useMemo, useState } from 'react';
import {
  FileText,
  Kanban,
  Layers,
  LayoutGrid,
  Paperclip,
  Search,
  StickyNote,
  Wrench,
} from 'lucide-react';
import { useApp, useProjectDetails } from '../context/AppContext';
import { AggregatedPart, PartStatus } from '../types';
import {
  buildFlattenedMainParts,
  buildSubassemblyViewParts,
} from '../utils/bomAggregator';
import { PriorityLabel, StatusLabel } from './ui/StatusText';
import { ActiveDetailModal, DetailModals } from './modals/DetailModals';

interface MachiningManagerViewProps {
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
}

export const MachiningManagerView: React.FC<MachiningManagerViewProps> = ({
  selectedProjectId,
  onSelectProject,
}) => {
  const { projects, projectsLoading } = useApp();
  const [selectedSubId, setSelectedSubId] = useState<'main' | string>('main');
  const [viewMode, setViewMode] = useState<'cards' | 'kanban'>('cards');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailModal, setDetailModal] = useState<ActiveDetailModal>(null);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const { subassemblies, partsBySub, allParts, loading } =
    useProjectDetails(selectedProjectId);

  const activeSub = useMemo(
    () => subassemblies.find((s) => s.id === selectedSubId) ?? null,
    [subassemblies, selectedSubId]
  );

  const requestedParts: AggregatedPart[] = useMemo(() => {
    const base =
      selectedSubId === 'main'
        ? buildFlattenedMainParts(allParts, subassemblies)
        : activeSub
        ? buildSubassemblyViewParts(
            partsBySub[activeSub.id] || [],
            activeSub
          )
        : [];

    const q = searchQuery.trim().toLowerCase();
    return base.filter((p) => {
      if (p.source !== 'In-House') return false;
      const isRequested =
        p.status === 'Requested' ||
        p.status === 'Needs Drawing' ||
        p.status === 'Needs CAM' ||
        p.status === 'Ready for Machine' ||
        p.status === 'In-Progress' ||
        p.status === 'Obtained' ||
        p.sparesRequested > 0;
      if (!isRequested) return false;
      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.partNumber.toLowerCase().includes(q) ||
        (p.revision || '').toLowerCase().includes(q) ||
        p.machines.some((m) => m.toLowerCase().includes(q)) ||
        p.assignedMachinist.toLowerCase().includes(q)
      );
    });
  }, [
    selectedSubId,
    allParts,
    subassemblies,
    activeSub,
    partsBySub,
    searchQuery,
  ]);

  if (!selectedProject) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Machining Manager — Select Project
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">
            Choose a Project to view and update shop floor machining requests.
          </p>
        </div>

        {projectsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-44 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] animate-pulse"
              />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 p-10 text-center text-sm text-zinc-500">
            No Projects available yet. Create one in Parts Manager first.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((proj) => (
              <button
                key={proj.id}
                type="button"
                onClick={() => {
                  setSelectedSubId('main');
                  onSelectProject(proj.id);
                }}
                className="group text-left rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] hover:border-red-500/70 p-5 transition-all active:scale-[0.985] flex items-center gap-4"
              >
                <div className="w-12 h-12 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center shrink-0">
                  <Wrench className="w-6 h-6 text-red-500" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-white truncate group-hover:text-red-500 transition-colors">
                    {proj.name}
                  </h2>
                  <p className="text-xs text-zinc-500">Open Machining Queue →</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  const renderCard = (p: AggregatedPart) => (
    <div
      key={p.id}
      className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] p-4 space-y-3.5 flex flex-col justify-between"
    >
      <div className="space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-zinc-900 dark:text-white leading-snug">
              {p.name}
            </h3>
            <div className="text-xs font-mono-tabular text-zinc-500 dark:text-zinc-400">
              {p.partNumber}
              {p.type === 'Custom' && p.revision ? ` · Rev ${p.revision}` : ''}
            </div>
          </div>
          <StatusLabel status={p.status} />
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs pt-1">
          <div className="p-2 rounded-lg bg-zinc-50 dark:bg-[#09090B] border border-zinc-200/70 dark:border-zinc-800/80">
            <span className="text-zinc-500 block">Qty / Spares Req</span>
            <span className="font-mono-tabular font-semibold">
              {p.quantity} / {p.sparesRequested}
            </span>
          </div>
          <div className="p-2 rounded-lg bg-zinc-50 dark:bg-[#09090B] border border-zinc-200/70 dark:border-zinc-800/80">
            <span className="text-zinc-500 block">Priority</span>
            <PriorityLabel priority={p.priority} />
          </div>
        </div>

        <div className="text-xs space-y-1">
          <div>
            <span className="text-zinc-500">Machines: </span>
            <span className="font-medium text-zinc-800 dark:text-zinc-200">
              {p.machines.join(', ') || 'None assigned'}
            </span>
          </div>
          <div>
            <span className="text-zinc-500">Material: </span>
            <button
              type="button"
              onClick={() => setDetailModal({ type: 'material', part: p })}
              className="font-medium underline decoration-dotted underline-offset-4 hover:text-red-500"
            >
              {p.materialName || 'View Stock'}
            </button>
          </div>
          {p.assignedMachinist ? (
            <div>
              <span className="text-zinc-500">Assigned Student: </span>
              <span className="font-medium">{p.assignedMachinist}</span>
            </div>
          ) : null}
        </div>
      </div>

      <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() =>
              setDetailModal({ type: 'drawing', part: p, canEdit: false })
            }
            title="View Drawing PDF"
            className={`min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-red-500 ${
              p.drawingPdf ? 'text-red-500' : 'text-zinc-500'
            }`}
          >
            <FileText className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() =>
              setDetailModal({ type: 'notes', part: p, canEdit: false })
            }
            title="View Notes"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-red-500 text-zinc-500"
          >
            <StickyNote className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() =>
              setDetailModal({ type: 'files', part: p, canEdit: false })
            }
            title="View / Download Files"
            className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-red-500 text-zinc-500"
          >
            <Paperclip className="w-4 h-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={() => setDetailModal({ type: 'machine-action', part: p })}
          className="min-h-[44px] px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-all active:scale-[0.98]"
        >
          <Wrench className="w-4 h-4" />
          <span>Machine</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <button
            type="button"
            onClick={() => onSelectProject(null)}
            className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline"
          >
            ← All Projects
          </button>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white mt-0.5">
            {selectedProject.name} — Machining Queue
          </h1>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317]">
          <button
            type="button"
            onClick={() => setViewMode('cards')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold ${
              viewMode === 'cards'
                ? 'bg-red-600 text-white'
                : 'text-zinc-500'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" />
            <span>Cards</span>
          </button>
          <button
            type="button"
            onClick={() => setViewMode('kanban')}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-semibold ${
              viewMode === 'kanban'
                ? 'bg-red-600 text-white'
                : 'text-zinc-500'
            }`}
          >
            <Kanban className="w-3.5 h-3.5" />
            <span>Kanban</span>
          </button>
        </div>
      </div>

      {/* Subassembly Tabs + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedSubId('main')}
            className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap border transition-colors ${
              selectedSubId === 'main'
                ? 'border-red-600 bg-red-600 text-white'
                : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317]'
            }`}
          >
            <Layers className="w-3.5 h-3.5 inline mr-1.5" />
            Main (All Subassemblies)
          </button>
          {subassemblies.map((sub) => (
            <button
              key={sub.id}
              type="button"
              onClick={() => setSelectedSubId(sub.id)}
              className={`px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap border transition-colors ${
                selectedSubId === sub.id
                  ? 'border-red-600 bg-red-600 text-white'
                  : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317]'
              }`}
            >
              {sub.assemblyNumber} · {sub.name}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search part, machine, machinist..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] text-xs"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-48 rounded-xl bg-zinc-200/70 dark:bg-zinc-800/60 animate-pulse"
            />
          ))}
        </div>
      ) : requestedParts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 p-10 text-center text-sm text-zinc-500">
          No requested In-House machining jobs right now. Requests sent from
          Parts Manager appear here automatically.
        </div>
      ) : viewMode === 'cards' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {requestedParts.map(renderCard)}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(
            [
              'Requested',
              'Needs Drawing',
              'Needs CAM',
              'Ready for Machine',
              'In-Progress',
              'Obtained',
            ] as PartStatus[]
          ).map(
            (statusKey) => {
              const col = requestedParts.filter((p) => p.status === statusKey);
              return (
                <div
                  key={statusKey}
                  className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/60 dark:bg-[#0E0E12] p-3.5 space-y-3"
                >
                  <div className="flex items-center justify-between px-1">
                    <StatusLabel status={statusKey} />
                    <span className="text-xs font-mono-tabular text-zinc-500">
                      {col.length}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {col.length === 0 ? (
                      <div className="text-xs text-zinc-500 text-center py-6">
                        None
                      </div>
                    ) : (
                      col.map(renderCard)
                    )}
                  </div>
                </div>
              );
            }
          )}
        </div>
      )}

      <DetailModals
        modal={detailModal}
        onClose={() => setDetailModal(null)}
        onSwitchModal={(next) => setDetailModal(next)}
        projectId={selectedProject.id}
      />
    </div>
  );
};
