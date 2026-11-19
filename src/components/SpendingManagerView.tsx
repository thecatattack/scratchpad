import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  DollarSign,
  History,
  Image as ImageIcon,
  Layers,
  Lock,
  Search,
  StickyNote,
} from 'lucide-react';
import { useApp, useProjectDetails } from '../context/AppContext';
import { AggregatedPart } from '../types';
import {
  buildFlattenedMainParts,
  buildSubassemblyViewParts,
} from '../utils/bomAggregator';
import { PriorityLabel, StatusLabel } from './ui/StatusText';
import { SubassemblyLabels } from './ui/SubassemblyLabels';
import { ActiveDetailModal, DetailModals } from './modals/DetailModals';

interface SpendingManagerViewProps {
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
}

export const SpendingManagerView: React.FC<SpendingManagerViewProps> = ({
  selectedProjectId,
  onSelectProject,
}) => {
  const { projects, projectsLoading, spendingUnlocked, unlockSpending } =
    useApp();
  const [passInput, setPassInput] = useState('');
  const [passError, setPassError] = useState('');
  const [selectedSubId, setSelectedSubId] = useState<'main' | string>('main');
  const [searchQuery, setSearchQuery] = useState('');
  const [detailModal, setDetailModal] = useState<ActiveDetailModal>(null);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const { subassemblies, partsBySub, allParts, loading } = useProjectDetails(
    spendingUnlocked ? selectedProjectId : null
  );

  const activeSub = useMemo(
    () => subassemblies.find((s) => s.id === selectedSubId) ?? null,
    [subassemblies, selectedSubId]
  );

  const purchaseRequests: AggregatedPart[] = useMemo(() => {
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
      const isBuyableCots = p.type === 'COTS';
      const isPaidOutsourced = p.source === 'Outsourced' && p.costsMoney;
      if (!isBuyableCots && !isPaidOutsourced) return false;

      const isActiveStatus =
        p.status === 'Requested' ||
        p.status === 'Needs Drawing' ||
        p.status === 'Needs CAM' ||
        p.status === 'Ready for Machine' ||
        p.status === 'In-Progress' ||
        p.status === 'Denied' ||
        p.status === 'Shipping' ||
        (p.source !== 'Inventory' && p.status === 'Obtained');
      const isInventorySparesPurchase =
        p.source === 'Inventory' &&
        (p.sparesRequested > 0 || p.totalOrdered > 0);
      if (!isActiveStatus && !isInventorySparesPurchase) return false;

      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.partNumber.toLowerCase().includes(q) ||
        (p.type === 'Custom' && (p.revision || '').toLowerCase().includes(q)) ||
        p.vendor.toLowerCase().includes(q) ||
        p.manufacturer.toLowerCase().includes(q) ||
        p.sourceParts.some(
          (s) =>
            s.subassemblyName.toLowerCase().includes(q) ||
            s.assemblyNumber.toLowerCase().includes(q)
        )
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

  if (!spendingUnlocked) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center p-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!unlockSpending(passInput)) {
              setPassError('Incorrect Spending Manager passkey.');
            }
          }}
          className="w-full max-w-sm rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] p-6 space-y-4 shadow-xl"
        >
          <div className="flex items-center gap-2.5">
            <Lock className="w-5 h-5 text-red-500" />
            <h1 className="text-xl font-bold">Spending Manager Access</h1>
          </div>
          <p className="text-xs text-zinc-500">
            Enter the Spending Manager passkey to view and approve purchase
            requests.
          </p>
          <input
            type="password"
            autoFocus
            value={passInput}
            onChange={(e) => {
              setPassInput(e.target.value);
              setPassError('');
            }}
            placeholder="Enter passkey"
            className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
          />
          {passError ? (
            <p className="text-xs font-medium text-red-500">{passError}</p>
          ) : null}
          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
          >
            Unlock Spending Manager
          </button>
        </form>
      </div>
    );
  }

  if (!selectedProject) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
            Spending Manager — Select Project
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">
            Select a Project to review and approve COTS and paid outsourced
            purchase requests.
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
            No Projects available yet.
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
                  <DollarSign className="w-6 h-6 text-red-500" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xl font-bold text-zinc-900 dark:text-white truncate group-hover:text-red-500 transition-colors">
                    {proj.name}
                  </h2>
                  {proj.description ? (
                    <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2 mt-0.5">
                      {proj.description}
                    </p>
                  ) : null}
                  <p className="text-xs text-zinc-500 mt-0.5">Open Purchase Queue →</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 space-y-5">
      <div>
        <button
          type="button"
          onClick={() => onSelectProject(null)}
          className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline"
        >
          ← All Projects
        </button>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-white mt-0.5">
          {selectedProject.name} — Purchase Requests
        </h1>
        {selectedProject.description ? (
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 max-w-2xl">
            {selectedProject.description}
          </p>
        ) : null}
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
            placeholder="Search part, vendor, manufacturer..."
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
      ) : purchaseRequests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 p-10 text-center text-sm text-zinc-500">
          No active purchase requests for this selection. (Outsourced parts only
          appear here if marked as costing money.)
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {purchaseRequests.map((p) => {
            const isInventorySparesOnly = p.source === 'Inventory';
            const pathway =
              p.source === 'Outsourced'
                ? 'Outsourced'
                : isInventorySparesOnly
                ? 'Inventory (Spares Only)'
                : 'Purchased';
            const supplier =
              p.type === 'COTS' ? p.vendor : p.manufacturer;
            return (
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
                      <div className="text-xs font-mono-tabular text-zinc-500">
                        {p.partNumber}
                        {p.type === 'Custom' && p.revision ? ` · Rev ${p.revision}` : ''}
                      </div>
                      {selectedSubId === 'main' ? (
                        <SubassemblyLabels part={p} compact />
                      ) : null}
                    </div>
                    <StatusLabel
                      status={
                        isInventorySparesOnly &&
                        p.status === 'Obtained' &&
                        p.totalOrdered === 0 &&
                        p.sparesRequested > 0
                          ? 'Requested'
                          : p.status
                      }
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded-lg bg-zinc-50 dark:bg-[#09090B] border border-zinc-200/70 dark:border-zinc-800/80">
                      <span className="text-zinc-500 block">
                        {isInventorySparesOnly ? 'Spares to Buy' : 'Qty / Spares Req'}
                      </span>
                      <span className="font-mono-tabular font-semibold">
                        {isInventorySparesOnly
                          ? `${p.sparesRequested} (${p.quantity} in stock)`
                          : `${p.quantity} / ${p.sparesRequested}`}
                      </span>
                    </div>
                    <div className="p-2 rounded-lg bg-zinc-50 dark:bg-[#09090B] border border-zinc-200/70 dark:border-zinc-800/80">
                      <span className="text-zinc-500 block">Priority</span>
                      <PriorityLabel priority={p.priority} />
                    </div>
                  </div>

                  <div className="text-xs space-y-1">
                    <div>
                      <span className="text-zinc-500">Pathway: </span>
                      <span className="font-medium">{pathway}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">
                        {p.type === 'COTS' ? 'Vendor: ' : 'Manufacturer: '}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setDetailModal({ type: 'vendor-link', part: p })
                        }
                        className="font-semibold underline decoration-dotted underline-offset-4 hover:text-red-500"
                      >
                        {supplier || 'View Link'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setDetailModal({ type: 'notes', part: p, canEdit: false })
                      }
                      title="View Notes"
                      className="min-h-[40px] px-3 inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-red-500 text-xs font-medium text-zinc-600 dark:text-zinc-300"
                    >
                      <StickyNote className="w-4 h-4" />
                      <span>Notes</span>
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDetailModal({ type: 'history', part: p })
                      }
                      title="View Activity & History"
                      className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-red-500 text-zinc-500"
                    >
                      <History className="w-4 h-4" />
                    </button>
                    {p.pictureUrl ? (
                      <button
                        type="button"
                        onClick={() =>
                          setDetailModal({ type: 'picture', part: p, canEdit: false })
                        }
                        title="View Part Picture"
                        className="min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 hover:border-red-500 text-red-500"
                      >
                        <ImageIcon className="w-4 h-4" />
                      </button>
                    ) : null}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setDetailModal({ type: 'approved-action', part: p })
                    }
                    className="min-h-[44px] px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-all active:scale-[0.98]"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Approved</span>
                  </button>
                </div>
              </div>
            );
          })}
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
