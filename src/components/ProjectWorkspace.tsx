import React, { useMemo, useState } from 'react';
import {
  FileText,
  FolderOpen,
  Kanban,
  Layers,
  Lock,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Send,
  StickyNote,
  Table2,
  Trash2,
  Upload,
} from 'lucide-react';
import { useApp, useProjectDetails } from '../context/AppContext';
import {
  AggregatedPart,
  Part,
  PartStatus,
  Project,
  ProjectTab,
} from '../types';
import {
  buildFlattenedMainParts,
  buildSubassemblyViewParts,
} from '../utils/bomAggregator';
import { validateFileSize } from '../firebase';
import { Modal } from './ui/Modal';
import { PriorityLabel, StatusLabel } from './ui/StatusText';
import { ActiveDetailModal, DetailModals } from './modals/DetailModals';
import { PartWizardModal } from './modals/PartWizardModal';

interface ProjectWorkspaceProps {
  editable: boolean;
  selectedProjectId: string | null;
  onSelectProject: (projectId: string | null) => void;
}

export const ProjectWorkspace: React.FC<ProjectWorkspaceProps> = ({
  editable,
  selectedProjectId,
  onSelectProject,
}) => {
  const {
    projects,
    projectsLoading,
    unlockedProjectIds,
    unlockProjectEditor,
    createProject,
    createSubassembly,
    deleteSubassembly,
    deletePart,
    updatePart,
    pushToast,
  } = useApp();

  // Password gate state for Parts Manager
  const [pwdTargetProject, setPwdTargetProject] = useState<Project | null>(null);
  const [pwdInput, setPwdInput] = useState('');
  const [pwdError, setPwdError] = useState('');

  // Create Project modal
  const [createProjOpen, setCreateProjOpen] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjPassword, setNewProjPassword] = useState('');
  const [newProjCover, setNewProjCover] = useState<File | null>(null);
  const [creatingProj, setCreatingProj] = useState(false);

  // Create Subassembly modal
  const [createSubOpen, setCreateSubOpen] = useState(false);
  const [newSubName, setNewSubName] = useState('');
  const [newSubNumber, setNewSubNumber] = useState('');
  const [creatingSub, setCreatingSub] = useState(false);

  // Active workspace selection
  const [selectedSubId, setSelectedSubId] = useState<'main' | string>('main');
  const [activeTab, setActiveTab] = useState<ProjectTab>('bom');
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');

  // Search & filters
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'Custom' | 'COTS'>('ALL');
  const [sourceFilter, setSourceFilter] = useState<
    'ALL' | 'In-House' | 'Outsourced' | 'Purchased' | 'Inventory'
  >('ALL');

  // Wizard & Detail modals
  const [wizardOpen, setWizardOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<Part | null>(null);
  const [detailModal, setDetailModal] = useState<ActiveDetailModal>(null);
  const [confirmDeletePart, setConfirmDeletePart] =
    useState<AggregatedPart | null>(null);

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId]
  );

  const isProjectAuthorized =
    !editable ||
    (selectedProject !== null && Boolean(unlockedProjectIds[selectedProject.id]));

  const {
    subassemblies,
    partsBySub,
    allParts,
    loading: projectDataLoading,
    refresh,
  } = useProjectDetails(isProjectAuthorized ? selectedProjectId : null);

  const activeSubassembly = useMemo(
    () => subassemblies.find((s) => s.id === selectedSubId) ?? null,
    [subassemblies, selectedSubId]
  );

  const displayParts: AggregatedPart[] = useMemo(() => {
    if (selectedSubId === 'main') {
      return buildFlattenedMainParts(allParts, subassemblies);
    }
    if (!activeSubassembly) return [];
    return buildSubassemblyViewParts(
      partsBySub[activeSubassembly.id] || [],
      activeSubassembly
    );
  }, [selectedSubId, allParts, subassemblies, activeSubassembly, partsBySub]);

  const matchesSearch = (p: AggregatedPart) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      p.name.toLowerCase().includes(q) ||
      p.partNumber.toLowerCase().includes(q) ||
      p.materialName.toLowerCase().includes(q) ||
      p.vendor.toLowerCase().includes(q) ||
      p.manufacturer.toLowerCase().includes(q)
    );
  };

  const bomParts = useMemo(
    () =>
      displayParts.filter((p) => {
        if (!matchesSearch(p)) return false;
        if (typeFilter !== 'ALL' && p.type !== typeFilter) return false;
        if (sourceFilter !== 'ALL' && p.source !== sourceFilter) return false;
        return true;
      }),
    [displayParts, searchQuery, typeFilter, sourceFilter]
  );

  const inHouseParts = useMemo(
    () =>
      displayParts.filter(
        (p) => p.source === 'In-House' && matchesSearch(p)
      ),
    [displayParts, searchQuery]
  );

  const purchasedParts = useMemo(
    () =>
      displayParts.filter((p) => p.type === 'COTS' && matchesSearch(p)),
    [displayParts, searchQuery]
  );

  const outsourcedParts = useMemo(
    () =>
      displayParts.filter(
        (p) => p.source === 'Outsourced' && matchesSearch(p)
      ),
    [displayParts, searchQuery]
  );

  const spareParts = useMemo(
    () =>
      displayParts.filter((p) => {
        if (p.sparesCount <= 0) return false;
        if (!matchesSearch(p)) return false;
        if (typeFilter !== 'ALL' && p.type !== typeFilter) return false;
        if (sourceFilter !== 'ALL' && p.source !== sourceFilter) return false;
        return true;
      }),
    [displayParts, searchQuery, typeFilter, sourceFilter]
  );

  const handleOpenProject = (proj: Project) => {
    setSelectedSubId('main');
    setActiveTab('bom');
    setViewMode('table');
    if (editable && !unlockedProjectIds[proj.id]) {
      setPwdTargetProject(proj);
      setPwdInput('');
      setPwdError('');
      return;
    }
    onSelectProject(proj.id);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName.trim() || !newProjPassword.trim()) return;
    setCreatingProj(true);
    try {
      const id = await createProject({
        name: newProjName,
        editorPassword: newProjPassword,
        coverImageFile: newProjCover,
      });
      setCreateProjOpen(false);
      setNewProjName('');
      setNewProjPassword('');
      setNewProjCover(null);
      setSelectedSubId('main');
      onSelectProject(id);
    } catch (err) {
      pushToast(
        'error',
        err instanceof Error ? err.message : 'Failed to create project.'
      );
    } finally {
      setCreatingProj(false);
    }
  };

  const handleCreateSubassembly = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject || !newSubName.trim() || !newSubNumber.trim()) return;
    setCreatingSub(true);
    try {
      const subId = await createSubassembly(selectedProject.id, {
        name: newSubName,
        assemblyNumber: newSubNumber,
      });
      setCreateSubOpen(false);
      setNewSubName('');
      setNewSubNumber('');
      setSelectedSubId(subId);
      setActiveTab('bom');
    } catch (err) {
      pushToast(
        'error',
        err instanceof Error ? err.message : 'Failed to create subassembly.'
      );
    } finally {
      setCreatingSub(false);
    }
  };

  // ---------------------------------------------------------------------------
  // VIEW A: PROJECT SELECTION SCREEN
  // ---------------------------------------------------------------------------
  if (!selectedProject || !isProjectAuthorized) {
    return (
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-white">
              {editable ? 'Parts Manager — Projects' : 'BOM Viewer — Projects'}
            </h1>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-0.5">
              {editable
                ? 'Select a Project and enter its Editor password, or create a new Project.'
                : 'Select any team Project to inspect its Main and Subassembly BOMs.'}
            </p>
          </div>
          {editable ? (
            <button
              type="button"
              onClick={() => setCreateProjOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-all active:scale-[0.98]"
            >
              <Plus className="w-4 h-4" />
              <span>Create New Project</span>
            </button>
          ) : null}
        </div>

        {projectsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-52 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] animate-pulse"
              />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-800 bg-white dark:bg-[#131317] p-12 text-center space-y-3">
            <FolderOpen className="w-10 h-10 text-zinc-400 mx-auto" />
            <div className="text-base font-semibold">No Projects Yet</div>
            <p className="text-sm text-zinc-500 max-w-md mx-auto">
              {editable
                ? 'Create your first robot or mechanism Project to start organizing subassemblies and parts.'
                : 'No team projects have been created in Parts Manager yet.'}
            </p>
            {editable ? (
              <button
                type="button"
                onClick={() => setCreateProjOpen(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
              >
                <Plus className="w-4 h-4" />
                <span>Create First Project</span>
              </button>
            ) : null}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((proj) => (
              <button
                key={proj.id}
                type="button"
                onClick={() => handleOpenProject(proj)}
                className="group text-left rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] hover:border-red-500/70 overflow-hidden transition-all active:scale-[0.985]"
              >
                <div className="h-36 bg-zinc-100 dark:bg-[#09090B] border-b border-zinc-200 dark:border-zinc-800 overflow-hidden flex items-center justify-center">
                  {proj.coverImageUrl ? (
                    <img
                      src={proj.coverImageUrl}
                      alt={proj.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 text-zinc-400 dark:text-zinc-600">
                      <Layers className="w-8 h-8 text-red-600/70" />
                      <span className="text-xs font-medium">FRC #451 Project</span>
                    </div>
                  )}
                </div>
                <div className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-lg font-bold text-zinc-900 dark:text-white truncate group-hover:text-red-500 transition-colors">
                      {proj.name}
                    </h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {editable ? 'Editor access required' : 'Read-only BOM view'}
                    </p>
                  </div>
                  {editable && !unlockedProjectIds[proj.id] ? (
                    <Lock className="w-4 h-4 text-zinc-400 shrink-0" />
                  ) : null}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Editor Password Prompt */}
        <Modal
          open={pwdTargetProject !== null}
          onClose={() => setPwdTargetProject(null)}
          title={`Unlock ${pwdTargetProject?.name || 'Project'}`}
          subtitle="Enter this Project's Editor password to modify BOMs and parts."
          maxWidth="sm"
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!pwdTargetProject) return;
              if (unlockProjectEditor(pwdTargetProject.id, pwdInput)) {
                const id = pwdTargetProject.id;
                setPwdTargetProject(null);
                onSelectProject(id);
              } else {
                setPwdError('Incorrect Editor password for this Project.');
              }
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Editor Password
              </label>
              <input
                type="password"
                autoFocus
                value={pwdInput}
                onChange={(e) => {
                  setPwdInput(e.target.value);
                  setPwdError('');
                }}
                className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
              />
              {pwdError ? (
                <p className="text-xs font-medium text-red-500">{pwdError}</p>
              ) : null}
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPwdTargetProject(null)}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white"
              >
                Open Project
              </button>
            </div>
          </form>
        </Modal>

        {/* Create Project Modal */}
        <Modal
          open={createProjOpen}
          onClose={() => setCreateProjOpen(false)}
          title="Create New Project"
          subtitle="Starts with an empty Main cumulative BOM and lets you add Subassemblies."
          maxWidth="md"
        >
          <form onSubmit={handleCreateProject} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Project Name
              </label>
              <input
                type="text"
                required
                value={newProjName}
                onChange={(e) => setNewProjName(e.target.value)}
                placeholder="e.g., 2026 Competition Robot"
                className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Create Editor Password
              </label>
              <input
                type="text"
                required
                value={newProjPassword}
                onChange={(e) => setNewProjPassword(e.target.value)}
                placeholder="Shared with CAD leads to edit this Project"
                className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Optional Cover Picture (max 10 MB)
              </label>
              <label className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-red-500 cursor-pointer text-xs font-medium">
                <Upload className="w-4 h-4 text-red-500" />
                <span className="truncate">
                  {newProjCover ? newProjCover.name : 'Choose cover image'}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (!f) return;
                    try {
                      validateFileSize(f);
                      setNewProjCover(f);
                    } catch (err) {
                      pushToast(
                        'error',
                        err instanceof Error ? err.message : 'File too large.'
                      );
                    }
                  }}
                />
              </label>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setCreateProjOpen(false)}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingProj}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white"
              >
                {creatingProj ? 'Creating...' : 'Create Project'}
              </button>
            </div>
          </form>
        </Modal>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // VIEW B: INSIDE PROJECT WORKSPACE
  // ---------------------------------------------------------------------------
  const renderKanban = (
    items: AggregatedPart[],
    statuses: PartStatus[],
    extraAction?: (p: AggregatedPart) => React.ReactNode
  ) => (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {statuses.map((st) => {
        const colItems = items.filter((i) => i.status === st);
        return (
          <div
            key={st}
            className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100/60 dark:bg-[#0E0E12] p-3 space-y-3"
          >
            <div className="flex items-center justify-between px-1">
              <StatusLabel status={st} />
              <span className="text-xs font-mono-tabular text-zinc-500">
                {colItems.length}
              </span>
            </div>
            <div className="space-y-2.5">
              {colItems.length === 0 ? (
                <div className="text-xs text-zinc-500 py-6 text-center">
                  None
                </div>
              ) : (
                colItems.map((p) => (
                  <div
                    key={p.id}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">
                          {p.name}
                        </div>
                        <div className="text-xs font-mono-tabular text-zinc-500">
                          {p.partNumber} · Qty {p.quantity}
                        </div>
                      </div>
                      {p.type === 'Custom' &&
                      p.source === 'In-House' &&
                      p.status === 'In-Progress' ? (
                        <button
                          type="button"
                          onClick={() =>
                            setDetailModal({
                              type: 'in-progress-details',
                              part: p,
                            })
                          }
                          title="View machinist progress"
                          className="shrink-0 underline decoration-dotted underline-offset-4 decoration-amber-500/70 hover:opacity-80 cursor-pointer"
                        >
                          <StatusLabel status={p.status} />
                        </button>
                      ) : null}
                    </div>
                    <div className="text-xs text-zinc-600 dark:text-zinc-400">
                      {p.source === 'In-House'
                        ? p.machines.join(', ') || 'In-House'
                        : p.type === 'COTS'
                        ? p.vendor
                        : p.manufacturer}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() =>
                            setDetailModal({
                              type: 'notes',
                              part: p,
                              canEdit: editable,
                            })
                          }
                          title="Notes"
                          className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                        >
                          <StickyNote className="w-3.5 h-3.5" />
                        </button>
                        {p.type === 'Custom' ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setDetailModal({
                                  type: 'drawing',
                                  part: p,
                                  canEdit: editable,
                                })
                              }
                              title="Drawing PDF"
                              className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                            >
                              <FileText className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDetailModal({
                                  type: 'files',
                                  part: p,
                                  canEdit: editable,
                                })
                              }
                              title="Files"
                              className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                            >
                              <Paperclip className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : null}
                      </div>
                      {extraAction ? extraAction(p) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );

  const renderMaterialOrVendorCell = (p: AggregatedPart) => {
    if (p.type === 'COTS') {
      return <span>{p.vendor || '—'}</span>;
    }
    return (
      <button
        type="button"
        onClick={() => setDetailModal({ type: 'material', part: p })}
        className="text-left underline decoration-dotted underline-offset-4 hover:text-red-500 transition-colors"
      >
        {p.materialName || '—'}
      </button>
    );
  };

  const renderSourceCell = (p: AggregatedPart) => {
    if (p.source === 'In-House') {
      return (
        <button
          type="button"
          onClick={() => setDetailModal({ type: 'machines', part: p })}
          className="underline decoration-dotted underline-offset-4 hover:text-red-500 transition-colors whitespace-nowrap"
        >
          In-House
        </button>
      );
    }
    if (p.source === 'Outsourced') {
      return (
        <button
          type="button"
          onClick={() => setDetailModal({ type: 'manufacturer', part: p })}
          className="underline decoration-dotted underline-offset-4 hover:text-red-500 transition-colors whitespace-nowrap"
        >
          Outsourced
        </button>
      );
    }
    return <span className="whitespace-nowrap">{p.source}</span>;
  };

  const renderStatusCell = (p: AggregatedPart) => {
    if (
      p.type === 'Custom' &&
      p.source === 'In-House' &&
      p.status === 'In-Progress'
    ) {
      return (
        <button
          type="button"
          onClick={() =>
            setDetailModal({ type: 'in-progress-details', part: p })
          }
          title="View what has been done by the machinist"
          className="inline-flex items-center underline decoration-dotted underline-offset-4 decoration-amber-500/70 hover:opacity-80 transition-opacity cursor-pointer"
        >
          <StatusLabel status={p.status} />
        </button>
      );
    }
    return <StatusLabel status={p.status} />;
  };

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-6 flex flex-col lg:flex-row gap-6">
      {/* Left Sidebar: Project + Subassemblies */}
      <aside className="lg:w-64 shrink-0 space-y-4">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => onSelectProject(null)}
              className="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline"
            >
              ← All Projects
            </button>
            <span className="text-[11px] font-medium text-zinc-500">
              {editable ? 'Editor' : 'Viewer'}
            </span>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white leading-tight">
            {selectedProject.name}
          </h1>

          <div className="space-y-1 pt-2 border-t border-zinc-200 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => setSelectedSubId('main')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-colors ${
                selectedSubId === 'main'
                  ? 'bg-red-600 text-white'
                  : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
              }`}
            >
              <span className="truncate">Main BOM (Flattened)</span>
              <span className="font-mono-tabular opacity-80">
                {buildFlattenedMainParts(allParts, subassemblies).length}
              </span>
            </button>

            <div className="pt-2 pb-1 px-1 flex items-center justify-between text-[11px] font-semibold text-zinc-500">
              <span>Subassemblies ({subassemblies.length})</span>
              {editable ? (
                <button
                  type="button"
                  onClick={() => setCreateSubOpen(true)}
                  className="inline-flex items-center gap-1 text-red-600 dark:text-red-400 hover:underline"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New</span>
                </button>
              ) : null}
            </div>

            {subassemblies.map((sub) => {
              const count = (partsBySub[sub.id] || []).length;
              const active = selectedSubId === sub.id;
              return (
                <div key={sub.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSelectedSubId(sub.id)}
                    className={`flex-1 min-w-0 flex items-center justify-between px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                      active
                        ? 'bg-red-600 text-white font-semibold'
                        : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <span className="truncate">
                      {sub.assemblyNumber} · {sub.name}
                    </span>
                    <span className="font-mono-tabular opacity-75 ml-2">
                      {count}
                    </span>
                  </button>
                  {editable ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (selectedSubId === sub.id) setSelectedSubId('main');
                        void deleteSubassembly(selectedProject.id, sub.id);
                      }}
                      title="Delete subassembly"
                      className="p-1.5 rounded text-zinc-400 hover:text-red-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>

          {editable ? (
            <button
              type="button"
              onClick={() => setCreateSubOpen(true)}
              className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 hover:border-red-500 text-xs font-semibold transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-red-500" />
              <span>Create Subassembly</span>
            </button>
          ) : null}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 min-w-0 space-y-4">
        {/* Top Context Header + Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white">
              {selectedSubId === 'main'
                ? 'Main Cumulative BOM'
                : `${activeSubassembly?.assemblyNumber} — ${activeSubassembly?.name}`}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {selectedSubId === 'main'
                ? 'Automatically combines identical parts across all Subassemblies and sums quantities.'
                : 'Subassembly parts workspace.'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {editable ? (
              <button
                type="button"
                onClick={refresh}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] text-xs font-semibold hover:border-zinc-400 transition-all active:scale-[0.98]"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload</span>
              </button>
            ) : null}

            {editable && selectedSubId !== 'main' ? (
              <button
                type="button"
                onClick={() => {
                  setEditingPart(null);
                  setWizardOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-all active:scale-[0.98]"
              >
                <Plus className="w-4 h-4" />
                <span>Add Parts</span>
              </button>
            ) : null}
          </div>
        </div>

        {/* 5 Tabs */}
        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-[#131317]">
          {(
            [
              ['bom', 'BOM Table'],
              ['in-house', 'In-House Parts'],
              ['purchased', 'Purchased Parts'],
              ['outsourced', 'Outsourced Parts'],
              ['spares', 'Spare Parts'],
            ] as Array<[ProjectTab, string]>
          ).map(([tabKey, label]) => (
            <button
              key={tabKey}
              type="button"
              onClick={() => {
                setActiveTab(tabKey);
                if (tabKey === 'bom' || tabKey === 'spares') {
                  setViewMode('table');
                }
              }}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                activeTab === tabKey
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search + Filter Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 min-w-[240px]">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search part name, number, material, vendor..."
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] text-xs"
              />
            </div>

            {activeTab === 'bom' || activeTab === 'spares' ? (
              <>
                <select
                  value={typeFilter}
                  onChange={(e) =>
                    setTypeFilter(e.target.value as 'ALL' | 'Custom' | 'COTS')
                  }
                  className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] text-xs font-medium"
                >
                  <option value="ALL">All Types</option>
                  <option value="Custom">Custom</option>
                  <option value="COTS">COTS</option>
                </select>
                <select
                  value={sourceFilter}
                  onChange={(e) =>
                    setSourceFilter(
                      e.target.value as
                        | 'ALL'
                        | 'In-House'
                        | 'Outsourced'
                        | 'Purchased'
                        | 'Inventory'
                    )
                  }
                  className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] text-xs font-medium"
                >
                  <option value="ALL">All Sources</option>
                  <option value="In-House">In-House</option>
                  <option value="Outsourced">Outsourced</option>
                  <option value="Purchased">Purchased</option>
                  <option value="Inventory">Inventory</option>
                </select>
              </>
            ) : null}
          </div>

          {activeTab === 'in-house' ||
          activeTab === 'purchased' ||
          activeTab === 'outsourced' ? (
            <div className="flex items-center gap-1 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317]">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold ${
                  viewMode === 'table'
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'text-zinc-500'
                }`}
              >
                <Table2 className="w-3.5 h-3.5" />
                <span>Table</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('kanban')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-semibold ${
                  viewMode === 'kanban'
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900'
                    : 'text-zinc-500'
                }`}
              >
                <Kanban className="w-3.5 h-3.5" />
                <span>Kanban</span>
              </button>
            </div>
          ) : null}
        </div>

        {/* Loading State */}
        {projectDataLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-12 rounded-lg bg-zinc-200/70 dark:bg-zinc-800/60 animate-pulse"
              />
            ))}
          </div>
        ) : null}

        {/* TAB 1: BOM TABLE */}
        {!projectDataLoading && activeTab === 'bom' ? (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] overflow-x-auto">
            {bomParts.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <p className="text-sm font-semibold">No parts in this BOM yet.</p>
                <p className="text-xs text-zinc-500">
                  {editable
                    ? selectedSubId === 'main'
                      ? 'Select or create a Subassembly on the left to add parts.'
                      : 'Click "Add Parts" above to launch the conditional part wizard.'
                    : 'Parts added in Parts Manager will appear here in real time.'}
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400">
                    <th className="py-3 px-4 font-semibold">Part Name</th>
                    <th className="py-3 px-3 font-semibold">Part Number</th>
                    <th className="py-3 px-3 font-semibold text-right">Qty</th>
                    <th className="py-3 px-3 font-semibold">Type</th>
                    <th className="py-3 px-3 font-semibold">Source</th>
                    <th className="py-3 px-3 font-semibold">Material / Vendor</th>
                    <th className="py-3 px-3 font-semibold">Status</th>
                    <th className="py-3 px-3 font-semibold">Files</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                  {bomParts.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors"
                    >
                      <td className="py-2.5 px-4 font-semibold text-zinc-900 dark:text-white">
                        {p.name}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular text-zinc-600 dark:text-zinc-300">
                        {p.partNumber}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular text-right font-semibold">
                        {p.quantity}
                      </td>
                      <td className="py-2.5 px-3">{p.type}</td>
                      <td className="py-2.5 px-3">{renderSourceCell(p)}</td>
                      <td className="py-2.5 px-3">
                        {renderMaterialOrVendorCell(p)}
                      </td>
                      <td className="py-2.5 px-3">
                        {renderStatusCell(p)}
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          onClick={() =>
                            setDetailModal({
                              type: 'files',
                              part: p,
                              canEdit: editable,
                            })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-zinc-200 dark:border-zinc-700 hover:border-red-500 text-xs font-medium whitespace-nowrap"
                        >
                          <Paperclip className="w-3 h-3" />
                          <span>Files ({p.attachedFiles.length})</span>
                        </button>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setDetailModal({
                                type: 'notes',
                                part: p,
                                canEdit: editable,
                              })
                            }
                            title="Notes"
                            className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                          >
                            <StickyNote className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDetailModal({
                                type: 'drawing',
                                part: p,
                                canEdit: editable,
                              })
                            }
                            title="Drawing PDF"
                            className={`p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 ${
                              p.drawingPdf
                                ? 'text-red-500'
                                : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                            }`}
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                          {editable ? (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingPart(p.sourceParts[0].part);
                                  setWizardOpen(true);
                                }}
                                title="Edit Properties (resets status)"
                                className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                              >
                                <Pencil className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeletePart(p)}
                                title="Delete Part"
                                className="p-1.5 rounded hover:bg-red-500/15 text-red-500"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}

        {/* TAB 2: IN-HOUSE PARTS */}
        {!projectDataLoading && activeTab === 'in-house' ? (
          viewMode === 'kanban' ? (
            renderKanban(
              inHouseParts,
              ['Not Started', 'Requested', 'In-Progress', 'Obtained'],
              editable
                ? (p) => (
                    <button
                      type="button"
                      onClick={() =>
                        setDetailModal({ type: 'request-in-house', part: p })
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-[11px] font-semibold"
                    >
                      <Send className="w-3 h-3" />
                      <span>Request</span>
                    </button>
                  )
                : undefined
            )
          ) : (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] overflow-x-auto">
              {inHouseParts.length === 0 ? (
                <div className="p-10 text-center text-sm text-zinc-500">
                  No In-House parts found.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500">
                      <th className="py-3 px-4 font-semibold">Part Name</th>
                      <th className="py-3 px-3 font-semibold">Part Number</th>
                      <th className="py-3 px-3 font-semibold text-right">Qty</th>
                      <th className="py-3 px-3 font-semibold">Material</th>
                      <th className="py-3 px-3 font-semibold">Machines</th>
                      <th className="py-3 px-3 font-semibold">Priority</th>
                      <th className="py-3 px-3 font-semibold">Status</th>
                      <th className="py-3 px-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                    {inHouseParts.map((p) => (
                      <tr
                        key={p.id}
                        className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                      >
                        <td className="py-2.5 px-4 font-semibold">{p.name}</td>
                        <td className="py-2.5 px-3 font-mono-tabular">
                          {p.partNumber}
                        </td>
                        <td className="py-2.5 px-3 font-mono-tabular text-right font-semibold">
                          {p.quantity}
                        </td>
                        <td className="py-2.5 px-3">
                          {renderMaterialOrVendorCell(p)}
                        </td>
                        <td className="py-2.5 px-3">
                          {p.machines.join(', ') || '—'}
                        </td>
                        <td className="py-2.5 px-3">
                          <PriorityLabel priority={p.priority} />
                        </td>
                        <td className="py-2.5 px-3">
                          {renderStatusCell(p)}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setDetailModal({
                                  type: 'notes',
                                  part: p,
                                  canEdit: editable,
                                })
                              }
                              title="Notes"
                              className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500"
                            >
                              <StickyNote className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDetailModal({
                                  type: 'files',
                                  part: p,
                                  canEdit: editable,
                                })
                              }
                              title="Files"
                              className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500"
                            >
                              <Paperclip className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDetailModal({
                                  type: 'drawing',
                                  part: p,
                                  canEdit: editable,
                                })
                              }
                              title="Drawing PDF"
                              className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                            {editable ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setDetailModal({
                                    type: 'request-in-house',
                                    part: p,
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold whitespace-nowrap"
                              >
                                <Send className="w-3 h-3" />
                                <span>Request</span>
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )
        ) : null}

        {/* TAB 3: PURCHASED PARTS (COTS) */}
        {!projectDataLoading && activeTab === 'purchased' ? (
          viewMode === 'kanban' ? (
            renderKanban(
              purchasedParts,
              ['Not Started', 'Requested', 'Shipping', 'Obtained'],
              editable
                ? (p) => (
                    <button
                      type="button"
                      onClick={() =>
                        setDetailModal({ type: 'request-purchased', part: p })
                      }
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-[11px] font-semibold"
                    >
                      <Send className="w-3 h-3" />
                      <span>Request</span>
                    </button>
                  )
                : undefined
            )
          ) : (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] overflow-x-auto">
              {purchasedParts.length === 0 ? (
                <div className="p-10 text-center text-sm text-zinc-500">
                  No COTS / Purchased parts found.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500">
                      <th className="py-3 px-4 font-semibold">Part Name</th>
                      <th className="py-3 px-3 font-semibold">Part Number</th>
                      <th className="py-3 px-3 font-semibold text-right">Qty</th>
                      <th className="py-3 px-3 font-semibold">Vendor</th>
                      <th className="py-3 px-3 font-semibold">Status</th>
                      <th className="py-3 px-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                    {purchasedParts.map((p) => (
                      <tr
                        key={p.id}
                        className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                      >
                        <td className="py-2.5 px-4 font-semibold">{p.name}</td>
                        <td className="py-2.5 px-3 font-mono-tabular">
                          {p.partNumber}
                        </td>
                        <td className="py-2.5 px-3 font-mono-tabular text-right font-semibold">
                          {p.quantity}
                        </td>
                        <td className="py-2.5 px-3">{p.vendor || '—'}</td>
                        <td className="py-2.5 px-3">
                          <StatusLabel status={p.status} />
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setDetailModal({
                                  type: 'notes',
                                  part: p,
                                  canEdit: editable,
                                })
                              }
                              title="Notes"
                              className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500"
                            >
                              <StickyNote className="w-4 h-4" />
                            </button>
                            {editable ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setDetailModal({
                                    type: 'request-purchased',
                                    part: p,
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold whitespace-nowrap"
                              >
                                <Send className="w-3 h-3" />
                                <span>Request</span>
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )
        ) : null}

        {/* TAB 4: OUTSOURCED PARTS */}
        {!projectDataLoading && activeTab === 'outsourced' ? (
          viewMode === 'kanban' ? (
            renderKanban(
              outsourcedParts,
              ['Not Started', 'Requested', 'In-Progress', 'Obtained'],
              editable
                ? (p) =>
                    p.costsMoney ? (
                      <button
                        type="button"
                        onClick={() =>
                          setDetailModal({
                            type: 'request-outsourced',
                            part: p,
                          })
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-red-600 hover:bg-red-500 text-white text-[11px] font-semibold"
                      >
                        <Send className="w-3 h-3" />
                        <span>Request</span>
                      </button>
                    ) : (
                      <select
                        value={p.status}
                        onChange={(e) => {
                          const next = e.target.value as PartStatus;
                          p.sourceParts.forEach((ref) => {
                            void updatePart(
                              selectedProject.id,
                              ref.subassemblyId,
                              ref.part.id,
                              { status: next }
                            );
                          });
                        }}
                        className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-[11px]"
                      >
                        <option value="Not Started">Not Started</option>
                        <option value="Requested">Requested</option>
                        <option value="In-Progress">In-Progress</option>
                        <option value="Obtained">Obtained</option>
                      </select>
                    )
                : undefined
            )
          ) : (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] overflow-x-auto">
              {outsourcedParts.length === 0 ? (
                <div className="p-10 text-center text-sm text-zinc-500">
                  No Outsourced parts found.
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500">
                      <th className="py-3 px-4 font-semibold">Part Name</th>
                      <th className="py-3 px-3 font-semibold">Part Number</th>
                      <th className="py-3 px-3 font-semibold text-right">Qty</th>
                      <th className="py-3 px-3 font-semibold">Material</th>
                      <th className="py-3 px-3 font-semibold">Pathway</th>
                      <th className="py-3 px-3 font-semibold">Files</th>
                      <th className="py-3 px-3 font-semibold">Status</th>
                      <th className="py-3 px-4 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                    {outsourcedParts.map((p) => (
                      <tr
                        key={p.id}
                        className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                      >
                        <td className="py-2.5 px-4 font-semibold">{p.name}</td>
                        <td className="py-2.5 px-3 font-mono-tabular">
                          {p.partNumber}
                        </td>
                        <td className="py-2.5 px-3 font-mono-tabular text-right font-semibold">
                          {p.quantity}
                        </td>
                        <td className="py-2.5 px-3">
                          {renderMaterialOrVendorCell(p)}
                        </td>
                        <td className="py-2.5 px-3">
                          {p.manufacturer || '—'}
                          {!p.costsMoney ? ' (No Cost)' : ''}
                        </td>
                        <td className="py-2.5 px-3">
                          <button
                            type="button"
                            onClick={() =>
                              setDetailModal({
                                type: 'files',
                                part: p,
                                canEdit: editable,
                              })
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-zinc-200 dark:border-zinc-700 hover:border-red-500 text-xs font-medium"
                          >
                            <Paperclip className="w-3 h-3" />
                            <span>Files ({p.attachedFiles.length})</span>
                          </button>
                        </td>
                        <td className="py-2.5 px-3">
                          {editable && !p.costsMoney ? (
                            <select
                              value={p.status}
                              onChange={(e) => {
                                const next = e.target.value as PartStatus;
                                p.sourceParts.forEach((ref) => {
                                  void updatePart(
                                    selectedProject.id,
                                    ref.subassemblyId,
                                    ref.part.id,
                                    { status: next }
                                  );
                                });
                              }}
                              className="px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs"
                            >
                              <option value="Not Started">Not Started</option>
                              <option value="Requested">Requested</option>
                              <option value="In-Progress">In-Progress</option>
                              <option value="Obtained">Obtained</option>
                            </select>
                          ) : (
                            <StatusLabel status={p.status} />
                          )}
                        </td>
                        <td className="py-2.5 px-4">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                setDetailModal({
                                  type: 'notes',
                                  part: p,
                                  canEdit: editable,
                                })
                              }
                              title="Notes"
                              className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500"
                            >
                              <StickyNote className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setDetailModal({
                                  type: 'drawing',
                                  part: p,
                                  canEdit: editable,
                                })
                              }
                              title="Drawing PDF"
                              className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500"
                            >
                              <FileText className="w-4 h-4" />
                            </button>
                            {editable && p.costsMoney ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setDetailModal({
                                    type: 'request-outsourced',
                                    part: p,
                                  })
                                }
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold whitespace-nowrap"
                              >
                                <Send className="w-3 h-3" />
                                <span>Request</span>
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )
        ) : null}

        {/* TAB 5: SPARE PARTS */}
        {!projectDataLoading && activeTab === 'spares' ? (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] overflow-x-auto">
            {spareParts.length === 0 ? (
              <div className="p-10 text-center space-y-1.5">
                <p className="text-sm font-semibold">No Spare Parts Recorded Yet</p>
                <p className="text-xs text-zinc-500">
                  Spare parts appear here automatically once Machining Manager or
                  Spending Manager records extras machined or ordered.
                </p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-zinc-200 dark:border-zinc-800 text-zinc-500">
                    <th className="py-3 px-4 font-semibold">Part Name</th>
                    <th className="py-3 px-3 font-semibold">Part Number</th>
                    <th className="py-3 px-3 font-semibold text-right">
                      Qty of Spares
                    </th>
                    <th className="py-3 px-3 font-semibold">Type</th>
                    <th className="py-3 px-3 font-semibold">Source</th>
                    <th className="py-3 px-3 font-semibold">Material / Vendor</th>
                    <th className="py-3 px-3 font-semibold">Files</th>
                    <th className="py-3 px-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
                  {spareParts.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                    >
                      <td className="py-2.5 px-4 font-semibold">{p.name}</td>
                      <td className="py-2.5 px-3 font-mono-tabular">
                        {p.partNumber}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular text-right font-bold text-emerald-600 dark:text-emerald-400">
                        {p.sparesCount}
                      </td>
                      <td className="py-2.5 px-3">{p.type}</td>
                      <td className="py-2.5 px-3">{renderSourceCell(p)}</td>
                      <td className="py-2.5 px-3">
                        {renderMaterialOrVendorCell(p)}
                      </td>
                      <td className="py-2.5 px-3">
                        <button
                          type="button"
                          onClick={() =>
                            setDetailModal({
                              type: 'files',
                              part: p,
                              canEdit: editable,
                            })
                          }
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-zinc-200 dark:border-zinc-700 hover:border-red-500 text-xs font-medium"
                        >
                          <Paperclip className="w-3 h-3" />
                          <span>Files ({p.attachedFiles.length})</span>
                        </button>
                      </td>
                      <td className="py-2.5 px-4">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setDetailModal({
                                type: 'notes',
                                part: p,
                                canEdit: editable,
                              })
                            }
                            title="Notes"
                            className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500"
                          >
                            <StickyNote className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDetailModal({
                                type: 'drawing',
                                part: p,
                                canEdit: editable,
                              })
                            }
                            title="Drawing PDF"
                            className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                          {editable ? (
                            <button
                              type="button"
                              onClick={() =>
                                setDetailModal({ type: 'spare-edit', part: p })
                              }
                              title="Edit Spares / Request More"
                              className="p-1.5 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 hover:text-red-500"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}
      </main>

      {/* Create Subassembly Modal */}
      <Modal
        open={createSubOpen}
        onClose={() => setCreateSubOpen(false)}
        title="Create Subassembly"
        subtitle={`Inside ${selectedProject.name}`}
        maxWidth="sm"
      >
        <form onSubmit={handleCreateSubassembly} className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Subassembly Name
            </label>
            <input
              type="text"
              required
              value={newSubName}
              onChange={(e) => setNewSubName(e.target.value)}
              placeholder="e.g., Swerve Drive"
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Assembly Number
            </label>
            <input
              type="text"
              required
              value={newSubNumber}
              onChange={(e) => setNewSubNumber(e.target.value)}
              placeholder="e.g., 451-100"
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm font-mono-tabular"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateSubOpen(false)}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creatingSub}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white"
            >
              {creatingSub ? 'Creating...' : 'Create Subassembly'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Confirm Part Delete Modal */}
      <Modal
        open={confirmDeletePart !== null}
        onClose={() => setConfirmDeletePart(null)}
        title="Delete Part"
        subtitle={
          confirmDeletePart
            ? `${confirmDeletePart.partNumber} · ${confirmDeletePart.name}`
            : ''
        }
        maxWidth="sm"
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            Are you sure you want to remove this part from the BOM? This action
            cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmDeletePart(null)}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!confirmDeletePart) return;
                for (const ref of confirmDeletePart.sourceParts) {
                  await deletePart(
                    selectedProject.id,
                    ref.subassemblyId,
                    ref.part.id
                  );
                }
                setConfirmDeletePart(null);
              }}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white"
            >
              Delete Part
            </button>
          </div>
        </div>
      </Modal>

      {/* Conditional Add/Edit Part Wizard */}
      {editable && (selectedSubId !== 'main' || editingPart) ? (
        <PartWizardModal
          open={wizardOpen}
          onClose={() => {
            setWizardOpen(false);
            setEditingPart(null);
          }}
          projectId={selectedProject.id}
          subassemblyId={
            editingPart ? editingPart.subassemblyId : selectedSubId
          }
          existingPartsInProject={allParts}
          editingPart={editingPart}
        />
      ) : null}

      {/* Detail & Action Modals */}
      <DetailModals
        modal={detailModal}
        onClose={() => setDetailModal(null)}
        onSwitchModal={(next) => setDetailModal(next)}
        projectId={selectedProject.id}
      />
    </div>
  );
};
