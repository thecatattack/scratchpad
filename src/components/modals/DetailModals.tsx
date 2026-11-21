import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CheckSquare,
  Clock,
  Download,
  ExternalLink,
  FileText,
  History,
  Image as ImageIcon,
  Square,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  AggregatedPart,
  PRIORITIES,
  PartPriority,
  PartStatus,
  StoredFileRef,
} from '../../types';
import { useApp } from '../../context/AppContext';
import {
  deleteTeamFile,
  deleteTeamFileByUrl,
  formatFileSize,
  uploadTeamFile,
  validateFileSize,
} from '../../firebase';
import {
  formatActorDisplay,
  formatTimestamp,
} from '../../utils/dateFormat';
import { Modal } from '../ui/Modal';
import { SubassemblyLabels } from '../ui/SubassemblyLabels';

export type ActiveDetailModal =
  | { type: 'machines'; part: AggregatedPart }
  | { type: 'manufacturer'; part: AggregatedPart }
  | { type: 'material'; part: AggregatedPart }
  | { type: 'vendor-link'; part: AggregatedPart }
  | { type: 'files'; part: AggregatedPart; canEdit: boolean }
  | { type: 'notes'; part: AggregatedPart; canEdit: boolean }
  | { type: 'drawing'; part: AggregatedPart; canEdit: boolean }
  | { type: 'picture'; part: AggregatedPart; canEdit: boolean }
  | { type: 'request-in-house'; part: AggregatedPart }
  | { type: 'request-purchased'; part: AggregatedPart }
  | { type: 'request-outsourced'; part: AggregatedPart }
  | { type: 'spare-edit'; part: AggregatedPart }
  | { type: 'request-more-spares'; part: AggregatedPart }
  | { type: 'machine-action'; part: AggregatedPart }
  | { type: 'approved-action'; part: AggregatedPart }
  | { type: 'in-progress-details'; part: AggregatedPart }
  | { type: 'history'; part: AggregatedPart }
  | null;

interface DetailModalsProps {
  modal: ActiveDetailModal;
  onClose: () => void;
  onSwitchModal: (next: ActiveDetailModal) => void;
  projectId: string;
}

const MACHINING_STATUSES: PartStatus[] = [
  'Requested',
  'Needs Drawing',
  'Needs CAM',
  'Ready for Machine',
  'In-Progress',
  'Obtained',
];

function extractReadableError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const raw = err.message;
  try {
    const parsed = JSON.parse(raw) as { error?: string; path?: string | null };
    if (parsed && typeof parsed.error === 'string' && parsed.error.trim()) {
      return parsed.path ? `${parsed.error} (${parsed.path})` : parsed.error;
    }
  } catch {
    // Not a JSON-wrapped Firestore error
  }
  return raw || fallback;
}

function parseNonNegativeInt(raw: string | number, max: number): number {
  const n = typeof raw === 'number' ? raw : Number(raw === '' ? 0 : raw);
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(0, Math.floor(n)));
}

function parseOptionalPrice(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(Math.min(1000000, n) * 100) / 100;
}

export const DetailModals: React.FC<DetailModalsProps> = ({
  modal,
  onClose,
  onSwitchModal,
  projectId,
}) => {
  const { updatePart, pushToast } = useApp();

  const [selectedFileKeys, setSelectedFileKeys] = useState<string[]>([]);
  const [notesDraft, setNotesDraft] = useState('');
  const [machinistDraft, setMachinistDraft] = useState('');
  const [priorityDraft, setPriorityDraft] = useState<PartPriority>('Regular Priority');
  const [sparesDraft, setSparesDraft] = useState(0);
  const [linkDraft, setLinkDraft] = useState('');
  const [machinesUsedDraft, setMachinesUsedDraft] = useState<string[]>([]);
  const [machiningNotesDraft, setMachiningNotesDraft] = useState('');
  const [statusDraft, setStatusDraft] = useState<PartStatus>('Requested');
  const [totalCountInput, setTotalCountInput] = useState('0');
  const [priceInput, setPriceInput] = useState('');
  const [actionError, setActionError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!modal) return;
    const part = modal.part;
    setBusy(false);
    setActionError('');
    setSelectedFileKeys(part.attachedFiles.map((f) => f.storagePath || f.url));
    setNotesDraft(part.notes || '');
    setMachinistDraft(part.assignedMachinist || '');
    setPriorityDraft(part.priority || 'Regular Priority');
    setSparesDraft(modal.type === 'spare-edit' ? part.sparesCount : part.sparesRequested || 0);
    setLinkDraft(part.vendorLink || '');
    setPriceInput(
      typeof part.price === 'number' && Number.isFinite(part.price)
        ? part.price.toFixed(2)
        : ''
    );
    setMachinesUsedDraft(part.machinesUsed || []);
    setMachiningNotesDraft(part.machiningNotes || '');

    const isPendingInventorySpares =
      modal.type === 'approved-action' &&
      part.source === 'Inventory' &&
      part.status === 'Obtained' &&
      part.totalOrdered === 0 &&
      part.sparesRequested > 0;

    if (modal.type === 'machine-action') {
      setStatusDraft(
        MACHINING_STATUSES.includes(part.status) ? part.status : 'Requested'
      );
      setTotalCountInput(String(part.totalMachined || 0));
    } else {
      const approvalValidStatuses: PartStatus[] =
        part.type === 'Custom'
          ? [
              'Requested',
              'Needs Drawing',
              'Needs CAM',
              'Ready for Machine',
              'Denied',
              'Shipping',
              'Obtained',
            ]
          : ['Requested', 'Denied', 'Shipping', 'Obtained'];
      const candidateStatus =
        part.status === 'Not Started' || isPendingInventorySpares
          ? 'Requested'
          : part.status;
      setStatusDraft(
        modal.type === 'approved-action' &&
          !approvalValidStatuses.includes(candidateStatus)
          ? 'Requested'
          : candidateStatus
      );
      setTotalCountInput(String(part.totalOrdered || 0));
    }
  }, [modal]);

  if (!modal) return null;

  const part = modal.part;
  const partTag =
    part.type === 'Custom' && part.revision
      ? `${part.partNumber} (Rev ${part.revision})`
      : part.partNumber;

  const updateAllContributingParts = async (
    partial: Record<string, unknown>
  ) => {
    setBusy(true);
    setActionError('');
    try {
      await Promise.all(
        part.sourceParts.map((ref) =>
          updatePart(projectId, ref.subassemblyId, ref.part.id, partial)
        )
      );
    } finally {
      setBusy(false);
    }
  };

  const triggerDownload = (file: StoredFileRef) => {
    const a = document.createElement('a');
    a.href = file.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // 1. Assigned Machines Pop-up
  if (modal.type === 'machines') {
    return (
      <Modal
        open
        onClose={onClose}
        title="Assigned Shop Machines"
        subtitle={`${partTag} · ${part.name}`}
        maxWidth="sm"
      >
        {part.machines.length === 0 ? (
          <p className="text-sm text-zinc-500">No machines assigned.</p>
        ) : (
          <ul className="space-y-2">
            {part.machines.map((m) => (
              <li
                key={m}
                className="flex items-center justify-between px-3.5 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] text-sm font-medium"
              >
                <span>{m}</span>
                {part.machinesUsed.includes(m) ? (
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    Used
                  </span>
                ) : (
                  <span className="text-xs text-zinc-400">Pending</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Modal>
    );
  }

  // 2. Manufacturer Pop-up
  if (modal.type === 'manufacturer') {
    return (
      <Modal
        open
        onClose={onClose}
        title="Outsourced Manufacturer"
        subtitle={`${partTag} · ${part.name}`}
        maxWidth="sm"
      >
        <div className="space-y-3 text-sm">
          <div className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B]">
            <div className="text-xs text-zinc-500">Manufacturer</div>
            <div className="font-semibold text-base mt-0.5">
              {part.manufacturer || 'Not specified'}
            </div>
          </div>
          <div className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B]">
            <div className="text-xs text-zinc-500">Costs Money?</div>
            <div className="font-semibold mt-0.5">
              {part.costsMoney ? 'Yes (Routed to Spending Manager)' : 'No (Free / Sponsored)'}
            </div>
          </div>
        </div>
      </Modal>
    );
  }

  // 3. Stock Material Dimensions Pop-up
  if (modal.type === 'material') {
    const dims = part.dimensions || {};
    const entries = Object.entries(dims).filter(([, v]) => Boolean(v));
    return (
      <Modal
        open
        onClose={onClose}
        title="Material & Stock Dimensions"
        subtitle={`${partTag} · ${part.name}`}
        maxWidth="sm"
      >
        <div className="space-y-3 text-sm">
          <div className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B]">
            <div className="text-xs text-zinc-500">
              {part.materialCategory || 'Material'}
            </div>
            <div className="font-semibold text-base mt-0.5">
              {part.materialName || 'Not specified'}
            </div>
          </div>

          {part.stockShape ? (
            <div className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] space-y-2">
              <div className="text-xs text-zinc-500">Stock Shape</div>
              <div className="font-semibold">{part.stockShape}</div>
              {entries.length > 0 ? (
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                  {entries.map(([k, v]) => (
                    <div key={k} className="text-xs">
                      <span className="text-zinc-500 capitalize">
                        {k.replace(/([A-Z])/g, ' $1')}:{' '}
                      </span>
                      <span className="font-mono-tabular font-semibold">{v}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </Modal>
    );
  }

  // 4. Vendor / Manufacturer Website Link Pop-up
  if (modal.type === 'vendor-link') {
    return (
      <Modal
        open
        onClose={onClose}
        title="Vendor / Manufacturer Link"
        subtitle={`${part.vendor || part.manufacturer || 'Supplier'} · ${part.partNumber}`}
        maxWidth="sm"
      >
        {part.vendorLink ? (
          <div className="space-y-3">
            <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] text-xs font-mono break-all">
              {part.vendorLink}
            </div>
            <a
              href={
                part.vendorLink.startsWith('http')
                  ? part.vendorLink
                  : `https://${part.vendorLink}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Open Supplier Link in New Tab</span>
            </a>
          </div>
        ) : (
          <p className="text-sm text-zinc-500">
            No supplier website link was attached to this request.
          </p>
        )}
      </Modal>
    );
  }

  // 5. Files Pop-up (View / Select / Download / Upload in Parts Manager)
  if (modal.type === 'files') {
    const files = part.attachedFiles || [];
    const allSelected =
      files.length > 0 && selectedFileKeys.length === files.length;

    const handleUploadNew = async (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      setBusy(true);
      try {
        const uploaded: StoredFileRef[] = [];
        for (const f of Array.from(fileList)) {
          validateFileSize(f);
          const ref = await uploadTeamFile(
            f,
            `projects/${projectId}/subassemblies/${part.subassemblyId}/parts/${part.id}/att_${Date.now()}_${f.name}`
          );
          uploaded.push(ref);
        }
        const nextFiles = [...files, ...uploaded].slice(0, 15);
        await updateAllContributingParts({ attachedFiles: nextFiles });
        pushToast('success', 'File(s) attached.');
        onClose();
      } catch (err) {
        pushToast(
          'error',
          err instanceof Error ? err.message : 'Upload failed.'
        );
      } finally {
        setBusy(false);
      }
    };

    const handleDeleteFile = async (key: string) => {
      const target = files.find((f) => (f.storagePath || f.url) === key);
      if (target) {
        await deleteTeamFile(target.storagePath, target.size);
      }
      const nextFiles = files.filter((f) => (f.storagePath || f.url) !== key);
      await updateAllContributingParts({ attachedFiles: nextFiles });
      pushToast('success', 'Attachment removed from BOM and Storage.');
      onClose();
    };

    return (
      <Modal
        open
        onClose={onClose}
        title="Attached Files"
        subtitle={`${partTag} · ${part.name}`}
        maxWidth="lg"
      >
        <div className="space-y-4">
          {files.length === 0 ? (
            <p className="text-sm text-zinc-500 py-4 text-center">
              No extra files attached to this part yet.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedFileKeys(
                      allSelected
                        ? []
                        : files.map((f) => f.storagePath || f.url)
                    )
                  }
                  className="inline-flex items-center gap-1.5 font-semibold text-zinc-700 dark:text-zinc-300 hover:text-red-500"
                >
                  {allSelected ? (
                    <CheckSquare className="w-4 h-4 text-red-500" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                  <span>{allSelected ? 'Deselect All' : 'Select All'}</span>
                </button>
                <span className="text-zinc-500 font-mono-tabular">
                  {selectedFileKeys.length} of {files.length} selected
                </span>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {files.map((file) => {
                  const key = file.storagePath || file.url;
                  const checked = selectedFileKeys.includes(key);
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B]"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedFileKeys((prev) =>
                            prev.includes(key)
                              ? prev.filter((k) => k !== key)
                              : [...prev, key]
                          )
                        }
                        className="flex items-center gap-2.5 min-w-0 text-left flex-1"
                      >
                        {checked ? (
                          <CheckSquare className="w-4 h-4 text-red-500 shrink-0" />
                        ) : (
                          <Square className="w-4 h-4 text-zinc-400 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">
                            {file.name}
                          </div>
                          <div className="text-xs text-zinc-500 font-mono-tabular">
                            {formatFileSize(file.size)}
                          </div>
                        </div>
                      </button>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-300"
                          title="Open / Download"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        {modal.canEdit ? (
                          <button
                            type="button"
                            onClick={() => void handleDeleteFile(key)}
                            className="p-2 rounded-lg hover:bg-red-500/15 text-red-500"
                            title="Delete File"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  disabled={selectedFileKeys.length === 0}
                  onClick={() => {
                    files
                      .filter((f) =>
                        selectedFileKeys.includes(f.storagePath || f.url)
                      )
                      .forEach(triggerDownload);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 disabled:opacity-40 text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download Selected</span>
                </button>
                <button
                  type="button"
                  onClick={() => files.forEach(triggerDownload)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download All</span>
                </button>
              </div>
            </>
          )}

          {modal.canEdit ? (
            <label className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-red-500 cursor-pointer text-xs font-semibold">
              <Upload className="w-4 h-4 text-red-500" />
              <span>{busy ? 'Uploading...' : 'Attach More Files (max 10 MB each)'}</span>
              <input
                type="file"
                multiple
                disabled={busy}
                className="sr-only"
                onChange={(e) => void handleUploadNew(e.target.files)}
              />
            </label>
          ) : null}
        </div>
      </Modal>
    );
  }

  // 6. Notes Pop-up
  if (modal.type === 'notes') {
    return (
      <Modal
        open
        onClose={onClose}
        preventClose={busy}
        title="Part Notes"
        subtitle={`${partTag} · ${part.name}`}
        maxWidth="md"
      >
        {modal.canEdit ? (
          <div className="space-y-4">
            <textarea
              rows={5}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              placeholder="Write notes for machinists or purchasing..."
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
            />
            {actionError ? (
              <div className="p-2.5 rounded-lg border border-red-500/40 bg-red-500/10 text-xs text-red-600 dark:text-red-400">
                {actionError}
              </div>
            ) : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  try {
                    await updateAllContributingParts({
                      notes: notesDraft.trim().slice(0, 2000),
                    });
                    pushToast('success', 'Notes saved.');
                    onClose();
                  } catch (err) {
                    const msg = extractReadableError(err, 'Failed to save notes.');
                    setActionError(msg);
                    pushToast('error', msg);
                  }
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white disabled:opacity-50"
              >
                {busy ? 'Saving...' : 'Save Notes'}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] text-sm whitespace-pre-wrap min-h-[5rem]">
            {part.notes ? part.notes : 'No notes attached to this part.'}
          </div>
        )}
      </Modal>
    );
  }

  // 7. Drawing PDF Pop-up
  if (modal.type === 'drawing') {
    const handleUploadDrawing = async (file: File | null) => {
      if (!file) return;
      setBusy(true);
      try {
        validateFileSize(file);
        const uploaded = await uploadTeamFile(
          file,
          `projects/${projectId}/subassemblies/${part.subassemblyId}/parts/${part.id}/drawing_${Date.now()}_${file.name}`
        );
        if (part.drawingPdf) {
          await deleteTeamFile(part.drawingPdf.storagePath, part.drawingPdf.size);
        }
        await updateAllContributingParts({ drawingPdf: uploaded });
        pushToast('success', 'Drawing PDF updated.');
        onClose();
      } catch (err) {
        pushToast(
          'error',
          err instanceof Error ? err.message : 'PDF upload failed.'
        );
      } finally {
        setBusy(false);
      }
    };

    return (
      <Modal
        open
        onClose={onClose}
        title="Drawing PDF"
        subtitle={`${partTag} · ${part.name}`}
        maxWidth="3xl"
      >
        <div className="space-y-4">
          {part.drawingPdf ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <FileText className="w-4 h-4 text-red-500" />
                  <span>
                    {part.drawingPdf.name} ({formatFileSize(part.drawingPdf.size)})
                  </span>
                </span>
                <div className="flex items-center gap-2">
                  <a
                    href={part.drawingPdf.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Open / Download PDF</span>
                  </a>
                  {modal.canEdit ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={async () => {
                        if (part.drawingPdf) {
                          await deleteTeamFile(
                            part.drawingPdf.storagePath,
                            part.drawingPdf.size
                          );
                        }
                        await updateAllContributingParts({ drawingPdf: null });
                        pushToast('success', 'Drawing PDF removed from BOM and Storage.');
                        onClose();
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-500/40 text-red-500 hover:bg-red-500/10 font-semibold"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Delete</span>
                    </button>
                  ) : null}
                </div>
              </div>
              <iframe
                src={part.drawingPdf.url}
                title={`Drawing ${part.partNumber}`}
                className="w-full h-[60vh] rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white"
              />
            </>
          ) : (
            <p className="text-sm text-zinc-500 py-6 text-center">
              No drawing PDF attached to this part yet.
            </p>
          )}

          {modal.canEdit ? (
            <label className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-red-500 cursor-pointer text-xs font-semibold">
              <Upload className="w-4 h-4 text-red-500" />
              <span>
                {busy
                  ? 'Uploading...'
                  : part.drawingPdf
                  ? 'Replace Drawing PDF (max 10 MB)'
                  : 'Attach Drawing PDF (max 10 MB)'}
              </span>
              <input
                type="file"
                accept=".pdf,application/pdf"
                disabled={busy}
                className="sr-only"
                onChange={(e) =>
                  void handleUploadDrawing(e.target.files?.[0] ?? null)
                }
              />
            </label>
          ) : null}
        </div>
      </Modal>
    );
  }

  // 7b. Part Picture Pop-up (View / Replace / Delete)
  if (modal.type === 'picture') {
    const handleUploadPicture = async (file: File | null) => {
      if (!file) return;
      setBusy(true);
      try {
        validateFileSize(file);
        const uploaded = await uploadTeamFile(
          file,
          `projects/${projectId}/subassemblies/${part.subassemblyId}/parts/${part.id}/pic_${Date.now()}_${file.name}`
        );
        if (part.pictureUrl) {
          await deleteTeamFileByUrl(part.pictureUrl);
        }
        await updateAllContributingParts({
          pictureUrl: uploaded.url.slice(0, 2000),
        });
        pushToast('success', 'Part picture updated.');
        onClose();
      } catch (err) {
        pushToast(
          'error',
          err instanceof Error ? err.message : 'Picture upload failed.'
        );
      } finally {
        setBusy(false);
      }
    };

    const handleDeletePicture = async () => {
      if (!part.pictureUrl) return;
      setBusy(true);
      try {
        await deleteTeamFileByUrl(part.pictureUrl);
        await updateAllContributingParts({ pictureUrl: '' });
        pushToast('success', 'Part picture deleted.');
        onClose();
      } catch (err) {
        pushToast(
          'error',
          err instanceof Error ? err.message : 'Failed to delete picture.'
        );
      } finally {
        setBusy(false);
      }
    };

    return (
      <Modal
        open
        onClose={onClose}
        title="Part Picture"
        subtitle={`${partTag} · ${part.name}`}
        maxWidth="lg"
      >
        <div className="space-y-4">
          {part.pictureUrl ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] overflow-hidden flex items-center justify-center max-h-[60vh]">
                <img
                  src={part.pictureUrl}
                  alt={part.name}
                  referrerPolicy="no-referrer"
                  className="max-h-[60vh] w-auto object-contain"
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <a
                  href={part.pictureUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-semibold hover:border-zinc-400"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Full Image</span>
                </a>
                {modal.canEdit ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDeletePicture()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10 text-xs font-semibold"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{busy ? 'Deleting...' : 'Delete Picture'}</span>
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="py-8 text-center space-y-2">
              <ImageIcon className="w-8 h-8 text-zinc-400 mx-auto" />
              <p className="text-sm text-zinc-500">
                No picture attached to this part yet.
              </p>
            </div>
          )}

          {modal.canEdit ? (
            <label className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-red-500 cursor-pointer text-xs font-semibold">
              <Upload className="w-4 h-4 text-red-500" />
              <span>
                {busy
                  ? 'Uploading...'
                  : part.pictureUrl
                  ? 'Replace Part Picture (max 10 MB)'
                  : 'Upload Part Picture (max 10 MB)'}
              </span>
              <input
                type="file"
                accept="image/*"
                disabled={busy}
                className="sr-only"
                onChange={(e) => {
                  void handleUploadPicture(e.target.files?.[0] ?? null);
                  e.target.value = '';
                }}
              />
            </label>
          ) : null}
        </div>
      </Modal>
    );
  }

  // 8. Request In-House (Parts Manager -> Machining Manager)
  if (modal.type === 'request-in-house') {
    return (
      <Modal
        open
        onClose={onClose}
        preventClose={busy}
        title="Request Machining"
        subtitle={`${partTag} · ${part.name}`}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Desired Machinist Student (Optional)
            </label>
            <input
              type="text"
              value={machinistDraft}
              onChange={(e) => setMachinistDraft(e.target.value)}
              placeholder="e.g., Alex M."
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Priority
              </label>
              <select
                value={priorityDraft}
                onChange={(e) => setPriorityDraft(e.target.value as PartPriority)}
                className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Spares Needed
              </label>
              <input
                type="number"
                min={0}
                value={sparesDraft}
                onChange={(e) => setSparesDraft(parseNonNegativeInt(e.target.value, 10000))}
                className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm font-mono-tabular"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Optional Notes
            </label>
            <textarea
              rows={3}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
            />
          </div>

          {actionError ? (
            <div className="p-2.5 rounded-lg border border-red-500/40 bg-red-500/10 text-xs text-red-600 dark:text-red-400">
              {actionError}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                try {
                  await updateAllContributingParts({
                    status: 'Requested',
                    priority: priorityDraft,
                    assignedMachinist: machinistDraft.trim().slice(0, 80),
                    sparesRequested: parseNonNegativeInt(sparesDraft, 10000),
                    notes: notesDraft.trim().slice(0, 2000),
                  });
                  pushToast('success', 'Sent to Machining Manager.');
                  onClose();
                } catch (err) {
                  const msg = extractReadableError(err, 'Failed to send request.');
                  setActionError(msg);
                  pushToast('error', msg);
                }
              }}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white disabled:opacity-50"
            >
              {busy ? 'Sending...' : 'Send Request'}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // 9. Request Purchased (Parts Manager -> Spending Manager)
  if (modal.type === 'request-purchased') {
    const parsedPrice = parseOptionalPrice(priceInput);
    const totalOrderQty = part.quantity + sparesDraft;
    return (
      <Modal
        open
        onClose={onClose}
        preventClose={busy}
        title="Request COTS Purchase"
        subtitle={`${partTag} · ${part.name}`}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Vendor Website Link (Optional)
            </label>
            <input
              type="url"
              value={linkDraft}
              onChange={(e) => setLinkDraft(e.target.value)}
              placeholder="https://www.andymark.com/..."
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Priority
              </label>
              <select
                value={priorityDraft}
                onChange={(e) => setPriorityDraft(e.target.value as PartPriority)}
                className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Spares Needed
              </label>
              <input
                type="number"
                min={0}
                value={sparesDraft}
                onChange={(e) => setSparesDraft(parseNonNegativeInt(e.target.value, 10000))}
                className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm font-mono-tabular"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Unit Price ($ USD)
              </label>
              <input
                type="number"
                min={0}
                max={1000000}
                step="0.01"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder="0.00 (Optional)"
                className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm font-mono-tabular"
              />
            </div>
          </div>

          {parsedPrice !== null ? (
            <div className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] text-xs flex items-center justify-between">
              <span className="text-zinc-500 dark:text-zinc-400">
                Estimated Total ({part.quantity} BOM
                {sparesDraft > 0 ? ` + ${sparesDraft} spares` : ''})
              </span>
              <span className="font-mono-tabular font-bold text-zinc-900 dark:text-white">
                ${(totalOrderQty * parsedPrice).toFixed(2)}
              </span>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Optional Notes
            </label>
            <textarea
              rows={3}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
            />
          </div>

          {actionError ? (
            <div className="p-2.5 rounded-lg border border-red-500/40 bg-red-500/10 text-xs text-red-600 dark:text-red-400">
              {actionError}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                try {
                  await updateAllContributingParts({
                    status: 'Requested',
                    priority: priorityDraft,
                    vendorLink: linkDraft.trim().slice(0, 1000),
                    price: parseOptionalPrice(priceInput),
                    sparesRequested: parseNonNegativeInt(sparesDraft, 10000),
                    notes: notesDraft.trim().slice(0, 2000),
                  });
                  pushToast('success', 'Sent to Spending Manager.');
                  onClose();
                } catch (err) {
                  const msg = extractReadableError(err, 'Failed to send request.');
                  setActionError(msg);
                  pushToast('error', msg);
                }
              }}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white disabled:opacity-50"
            >
              {busy ? 'Sending...' : 'Send Request'}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // 10. Request Outsourced (Paid -> Spending Manager)
  if (modal.type === 'request-outsourced') {
    const parsedPrice = parseOptionalPrice(priceInput);
    const totalOrderQty = part.quantity + sparesDraft;
    return (
      <Modal
        open
        onClose={onClose}
        preventClose={busy}
        title="Request Outsourced Order"
        subtitle={`${partTag} · ${part.manufacturer}`}
        maxWidth="md"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Priority
              </label>
              <select
                value={priorityDraft}
                onChange={(e) => setPriorityDraft(e.target.value as PartPriority)}
                className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Spares Needed
              </label>
              <input
                type="number"
                min={0}
                value={sparesDraft}
                onChange={(e) => setSparesDraft(parseNonNegativeInt(e.target.value, 10000))}
                className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm font-mono-tabular"
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Unit Price ($ USD)
              </label>
              <input
                type="number"
                min={0}
                max={1000000}
                step="0.01"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder="0.00 (Optional)"
                className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm font-mono-tabular"
              />
            </div>
          </div>

          {parsedPrice !== null ? (
            <div className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] text-xs flex items-center justify-between">
              <span className="text-zinc-500 dark:text-zinc-400">
                Estimated Total ({part.quantity} BOM
                {sparesDraft > 0 ? ` + ${sparesDraft} spares` : ''})
              </span>
              <span className="font-mono-tabular font-bold text-zinc-900 dark:text-white">
                ${(totalOrderQty * parsedPrice).toFixed(2)}
              </span>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Manufacturer Website Link (Optional)
            </label>
            <input
              type="url"
              value={linkDraft}
              onChange={(e) => setLinkDraft(e.target.value)}
              placeholder="https://www.sendcutsend.com/..."
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Optional Notes
            </label>
            <textarea
              rows={3}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
            />
          </div>

          {actionError ? (
            <div className="p-2.5 rounded-lg border border-red-500/40 bg-red-500/10 text-xs text-red-600 dark:text-red-400">
              {actionError}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                try {
                  await updateAllContributingParts({
                    status: 'Requested',
                    priority: priorityDraft,
                    vendorLink: linkDraft.trim().slice(0, 1000),
                    price: parseOptionalPrice(priceInput),
                    sparesRequested: parseNonNegativeInt(sparesDraft, 10000),
                    notes: notesDraft.trim().slice(0, 2000),
                  });
                  pushToast('success', 'Sent to Spending Manager.');
                  onClose();
                } catch (err) {
                  const msg = extractReadableError(err, 'Failed to send request.');
                  setActionError(msg);
                  pushToast('error', msg);
                }
              }}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white disabled:opacity-50"
            >
              {busy ? 'Sending...' : 'Send Request'}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // 11. Spare Edit Modal (Manual count edit OR Request More)
  if (modal.type === 'spare-edit') {
    const canRequestMore =
      part.source === 'In-House' ||
      part.source === 'Purchased' ||
      (part.source === 'Outsourced' && part.costsMoney);

    return (
      <Modal
        open
        onClose={onClose}
        preventClose={busy}
        title="Edit Spare Parts"
        subtitle={`${partTag} · ${part.name}`}
        maxWidth="sm"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Current Quantity of Spares
            </label>
            <input
              type="number"
              min={0}
              value={sparesDraft}
              onChange={(e) => setSparesDraft(parseNonNegativeInt(e.target.value, 10000))}
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm font-mono-tabular"
            />
          </div>

          {actionError ? (
            <div className="p-2.5 rounded-lg border border-red-500/40 bg-red-500/10 text-xs text-red-600 dark:text-red-400">
              {actionError}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            {canRequestMore ? (
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  onSwitchModal({ type: 'request-more-spares', part })
                }
                className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-red-600 text-red-600 dark:text-red-400 hover:bg-red-600/10 disabled:opacity-40"
              >
                Request More
              </button>
            ) : (
              <span className="text-[11px] text-zinc-500">
                Free outsourced parts edit count directly.
              </span>
            )}
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                disabled={busy}
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const targetRef = part.sourceParts[0];
                  setBusy(true);
                  setActionError('');
                  try {
                    await updatePart(projectId, targetRef.subassemblyId, targetRef.part.id, {
                      sparesCount: parseNonNegativeInt(sparesDraft, 10000),
                    });
                    pushToast('success', 'Spares quantity updated.');
                    onClose();
                  } catch (err) {
                    const msg = extractReadableError(err, 'Failed to update spares count.');
                    setActionError(msg);
                    pushToast('error', msg);
                  } finally {
                    setBusy(false);
                  }
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white disabled:opacity-50"
              >
                {busy ? 'Saving...' : 'Save Count'}
              </button>
            </div>
          </div>
        </div>
      </Modal>
    );
  }

  // 12. Request More Spares (DOES NOT change status!)
  if (modal.type === 'request-more-spares') {
    const isInHouse = part.source === 'In-House';
    const isPurchased = part.source === 'Purchased' || part.type === 'COTS';
    const isOutsourcedPaid = part.source === 'Outsourced' && part.costsMoney;

    return (
      <Modal
        open
        onClose={onClose}
        preventClose={busy}
        title="Request More Spares"
        subtitle={`${partTag} · Status remains "${part.status}"`}
        maxWidth="md"
      >
        <div className="space-y-4">
          {isInHouse ? (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Desired Machinist Student (Optional)
              </label>
              <input
                type="text"
                value={machinistDraft}
                onChange={(e) => setMachinistDraft(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
              />
            </div>
          ) : null}

          {isInHouse || isPurchased || isOutsourcedPaid ? (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Priority of Spares
              </label>
              <select
                value={priorityDraft}
                onChange={(e) => setPriorityDraft(e.target.value as PartPriority)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {isPurchased || isOutsourcedPaid ? (
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                {isPurchased
                  ? 'Vendor Website Link (Optional)'
                  : 'Manufacturer Website Link (Optional)'}
              </label>
              <input
                type="url"
                value={linkDraft}
                onChange={(e) => setLinkDraft(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
              />
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Spares Needed
              </label>
              <input
                type="number"
                min={1}
                value={sparesDraft || 1}
                onChange={(e) => setSparesDraft(Math.max(1, parseNonNegativeInt(e.target.value, 10000)))}
                className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm font-mono-tabular"
              />
            </div>

            {isPurchased || isOutsourcedPaid ? (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Unit Price ($ USD)
                </label>
                <input
                  type="number"
                  min={0}
                  max={1000000}
                  step="0.01"
                  value={priceInput}
                  onChange={(e) => setPriceInput(e.target.value)}
                  placeholder="0.00 (Optional)"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm font-mono-tabular"
                />
              </div>
            ) : null}
          </div>

          {(isPurchased || isOutsourcedPaid) && parseOptionalPrice(priceInput) !== null ? (
            <div className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] text-xs flex items-center justify-between">
              <span className="text-zinc-500 dark:text-zinc-400">
                Estimated Spares Total ({Math.max(1, sparesDraft || 1)} unit
                {Math.max(1, sparesDraft || 1) === 1 ? '' : 's'})
              </span>
              <span className="font-mono-tabular font-bold text-zinc-900 dark:text-white">
                ${(Math.max(1, sparesDraft || 1) * (parseOptionalPrice(priceInput) ?? 0)).toFixed(2)}
              </span>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Optional Notes
            </label>
            <textarea
              rows={3}
              value={notesDraft}
              onChange={(e) => setNotesDraft(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
            />
          </div>

          {actionError ? (
            <div className="p-2.5 rounded-lg border border-red-500/40 bg-red-500/10 text-xs text-red-600 dark:text-red-400">
              {actionError}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const payload: Record<string, unknown> = {
                  sparesRequested: Math.max(1, parseNonNegativeInt(sparesDraft || 1, 10000)),
                  notes: notesDraft.trim().slice(0, 2000),
                };
                if (isInHouse) {
                  payload.assignedMachinist = machinistDraft.trim().slice(0, 80);
                  payload.priority = priorityDraft;
                } else if (isOutsourcedPaid) {
                  payload.priority = priorityDraft;
                  payload.vendorLink = linkDraft.trim().slice(0, 1000);
                  payload.price = parseOptionalPrice(priceInput);
                } else if (isPurchased) {
                  payload.priority = priorityDraft;
                  payload.vendorLink = linkDraft.trim().slice(0, 1000);
                  payload.price = parseOptionalPrice(priceInput);
                }
                try {
                  await updateAllContributingParts(payload);
                  pushToast(
                    'success',
                    'Spare request sent (part status preserved).'
                  );
                  onClose();
                } catch (err) {
                  const msg = extractReadableError(err, 'Failed to send spare request.');
                  setActionError(msg);
                  pushToast('error', msg);
                }
              }}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white disabled:opacity-50"
            >
              {busy ? 'Sending...' : 'Request More Spares'}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // 13. Machining Manager "Machine" Action Modal
  if (modal.type === 'machine-action') {
    const toggleUsed = (m: string) => {
      setMachinesUsedDraft((prev) =>
        prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]
      );
    };
    const parsedMachinedTotal = parseNonNegativeInt(totalCountInput, 100000);

    return (
      <Modal
        open
        onClose={onClose}
        preventClose={busy}
        title="Log Machining Progress"
        subtitle={`${partTag} · ${part.name} (BOM Qty: ${part.quantity})`}
        maxWidth="md"
      >
        <div className="space-y-4">
          {part.requestedAt || part.requestedByName || part.requestedBy ? (
            <div className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] text-xs text-zinc-600 dark:text-zinc-400">
              Requested by{' '}
              <span className="font-semibold text-zinc-900 dark:text-white">
                {formatActorDisplay(part.requestedByName, part.requestedBy)}
              </span>{' '}
              on {formatTimestamp(part.requestedAt)}
            </div>
          ) : null}

          <div className="space-y-2">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Machines Used So Far (Assigned Machines Only)
            </label>
            {part.machines.length === 0 ? (
              <p className="text-xs text-zinc-500">No machines assigned.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {part.machines.map((m) => {
                  const checked = machinesUsedDraft.includes(m);
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => toggleUsed(m)}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-xs font-medium text-left transition-all ${
                        checked
                          ? 'border-red-600 bg-red-600/15 text-red-600 dark:text-red-400'
                          : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B]'
                      }`}
                    >
                      {checked ? (
                        <CheckSquare className="w-4 h-4 shrink-0" />
                      ) : (
                        <Square className="w-4 h-4 shrink-0 text-zinc-400" />
                      )}
                      <span className="truncate">{m}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Part Status
              </label>
              <select
                value={statusDraft}
                onChange={(e) => setStatusDraft(e.target.value as PartStatus)}
                className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
              >
                <option value="Requested">Requested</option>
                <option value="Needs Drawing">Needs Drawing</option>
                <option value="Needs CAM">Needs CAM</option>
                <option value="Ready for Machine">Ready for Machine</option>
                <option value="In-Progress">In-Progress</option>
                <option value="Obtained">Obtained</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Total Machined (Including Spares)
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={totalCountInput}
                onChange={(e) => setTotalCountInput(e.target.value)}
                onBlur={() => setTotalCountInput(String(parsedMachinedTotal))}
                className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm font-mono-tabular"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              What Has Been Done / Machinist Notes (Optional)
            </label>
            <textarea
              rows={3}
              maxLength={1000}
              value={machiningNotesDraft}
              onChange={(e) => setMachiningNotesDraft(e.target.value)}
              placeholder="e.g., Cut stock to length on bandsaw, CNC pocket complete; needs tapping next."
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs leading-relaxed"
            />
          </div>

          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            Calculated Spares Produced:{' '}
            <span className="font-mono-tabular font-semibold text-zinc-900 dark:text-white">
              {Math.max(0, parsedMachinedTotal - part.quantity)}
            </span>
          </div>

          {actionError ? (
            <div className="p-2.5 rounded-lg border border-red-500/40 bg-red-500/10 text-xs text-red-600 dark:text-red-400">
              {actionError}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const total = parseNonNegativeInt(totalCountInput, 100000);
                const spares = Math.min(10000, Math.max(0, total - part.quantity));
                const cleanNotes = machiningNotesDraft.trim().slice(0, 1000);
                const cleanMachinesUsed = machinesUsedDraft
                  .map((m) => m.trim().slice(0, 60))
                  .filter(Boolean)
                  .slice(0, 25);

                setBusy(true);
                setActionError('');
                try {
                  if (part.sourceParts.length === 1) {
                    const ref = part.sourceParts[0];
                    await updatePart(projectId, ref.subassemblyId, ref.part.id, {
                      machinesUsed: cleanMachinesUsed,
                      status: statusDraft,
                      totalMachined: total,
                      sparesCount: spares,
                      machiningNotes: cleanNotes,
                    });
                  } else {
                    let remainingTotal = total;
                    const tasks = part.sourceParts.map((ref, idx) => {
                      const isLast = idx === part.sourceParts.length - 1;
                      const alloc = Math.min(
                        100000,
                        Math.max(
                          0,
                          isLast
                            ? remainingTotal
                            : Math.min(remainingTotal, ref.part.quantity)
                        )
                      );
                      remainingTotal = Math.max(0, remainingTotal - alloc);
                      const subSpares = Math.min(
                        10000,
                        Math.max(0, alloc - ref.part.quantity)
                      );
                      return updatePart(projectId, ref.subassemblyId, ref.part.id, {
                        machinesUsed: cleanMachinesUsed,
                        status: statusDraft,
                        totalMachined: alloc,
                        sparesCount: subSpares,
                        machiningNotes: cleanNotes,
                      });
                    });
                    await Promise.all(tasks);
                  }
                  pushToast('success', 'Machining progress synced across BOM.');
                  onClose();
                } catch (err) {
                  const msg = extractReadableError(
                    err,
                    'Failed to save machining progress.'
                  );
                  setActionError(msg);
                  pushToast('error', msg);
                } finally {
                  setBusy(false);
                }
              }}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white disabled:opacity-50"
            >
              {busy ? 'Saving...' : 'Update Machining'}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // 14. Spending Manager "Approved" Action Modal
  if (modal.type === 'approved-action') {
    const isInventorySparesOnly = part.source === 'Inventory';
    const parsedOrderedTotal = parseNonNegativeInt(totalCountInput, 100000);
    const parsedPrice = parseOptionalPrice(priceInput);
    const qtyForEstimate =
      parsedOrderedTotal > 0
        ? parsedOrderedTotal
        : isInventorySparesOnly
        ? part.sparesRequested
        : part.quantity + (part.sparesRequested || 0);

    return (
      <Modal
        open
        onClose={onClose}
        preventClose={busy}
        title="Approve & Update Order"
        subtitle={
          isInventorySparesOnly
            ? `${partTag} · ${part.name} (${part.quantity} In Inventory · ${part.sparesRequested} Spares Req)`
            : `${partTag} · ${part.name} (BOM Qty: ${part.quantity})`
        }
        maxWidth="md"
      >
        <div className="space-y-4">
          {part.requestedAt || part.requestedByName || part.requestedBy ? (
            <div className="px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] text-xs text-zinc-600 dark:text-zinc-400">
              Requested by{' '}
              <span className="font-semibold text-zinc-900 dark:text-white">
                {formatActorDisplay(part.requestedByName, part.requestedBy)}
              </span>{' '}
              on {formatTimestamp(part.requestedAt)}
            </div>
          ) : null}

          {isInventorySparesOnly ? (
            <div className="p-3 rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-800 dark:text-amber-300">
              All {part.quantity} BOM units are already in inventory. Enter only
              the spare quantity ordered below.
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Purchase Status
              </label>
              <select
                value={statusDraft}
                onChange={(e) => setStatusDraft(e.target.value as PartStatus)}
                className="w-full px-3 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
              >
                <option value="Requested">Requested</option>
                {part.type === 'Custom' ? (
                  <>
                    <option value="Needs Drawing">Needs Drawing</option>
                    <option value="Needs CAM">Needs CAM</option>
                    <option value="Ready for Machine">Ready for Machine</option>
                  </>
                ) : null}
                <option value="Denied">Denied</option>
                <option value="Shipping">Shipping</option>
                <option value="Obtained">Obtained</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                {isInventorySparesOnly
                  ? 'Total Spares Ordered'
                  : 'Total Ordered (Including Spares)'}
              </label>
              <input
                type="number"
                min={0}
                step={1}
                value={totalCountInput}
                onChange={(e) => setTotalCountInput(e.target.value)}
                onBlur={() => setTotalCountInput(String(parsedOrderedTotal))}
                className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm font-mono-tabular"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Unit Price ($ USD)
              </label>
              <input
                type="number"
                min={0}
                max={1000000}
                step="0.01"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
                placeholder="0.00 (Optional)"
                className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm font-mono-tabular"
              />
            </div>

            <div className="px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] text-xs space-y-0.5">
              <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
                <span>
                  {isInventorySparesOnly
                    ? 'Spares Added:'
                    : 'Calc. Spares:'}
                </span>
                <span className="font-mono-tabular font-semibold text-zinc-900 dark:text-white">
                  {isInventorySparesOnly
                    ? parsedOrderedTotal
                    : Math.max(0, parsedOrderedTotal - part.quantity)}
                </span>
              </div>
              <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
                <span>Est. Total ({qtyForEstimate} ea):</span>
                <span className="font-mono-tabular font-semibold text-zinc-900 dark:text-white">
                  {parsedPrice !== null
                    ? `$${(qtyForEstimate * parsedPrice).toFixed(2)}`
                    : '—'}
                </span>
              </div>
            </div>
          </div>

          {actionError ? (
            <div className="p-2.5 rounded-lg border border-red-500/40 bg-red-500/10 text-xs text-red-600 dark:text-red-400">
              {actionError}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700 disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const total = parseNonNegativeInt(totalCountInput, 100000);
                const spares = Math.min(
                  10000,
                  isInventorySparesOnly
                    ? total
                    : Math.max(0, total - part.quantity)
                );
                const nextPrice = parseOptionalPrice(priceInput);
                setBusy(true);
                setActionError('');
                try {
                  if (part.sourceParts.length === 1) {
                    const ref = part.sourceParts[0];
                    await updatePart(projectId, ref.subassemblyId, ref.part.id, {
                      status: statusDraft,
                      totalOrdered: total,
                      sparesCount: spares,
                      price: nextPrice,
                    });
                  } else if (isInventorySparesOnly) {
                    let remainingTotal = total;
                    const tasks = part.sourceParts.map((ref, idx) => {
                      const isLast = idx === part.sourceParts.length - 1;
                      const requestedForRef = ref.part.sparesRequested || 0;
                      const alloc = Math.min(
                        10000,
                        Math.max(
                          0,
                          isLast
                            ? remainingTotal
                            : Math.min(remainingTotal, requestedForRef)
                        )
                      );
                      remainingTotal = Math.max(0, remainingTotal - alloc);
                      return updatePart(projectId, ref.subassemblyId, ref.part.id, {
                        status: statusDraft,
                        totalOrdered: alloc,
                        sparesCount: alloc,
                        price: nextPrice,
                      });
                    });
                    await Promise.all(tasks);
                  } else {
                    let remainingTotal = total;
                    const tasks = part.sourceParts.map((ref, idx) => {
                      const isLast = idx === part.sourceParts.length - 1;
                      const alloc = Math.min(
                        100000,
                        Math.max(
                          0,
                          isLast
                            ? remainingTotal
                            : Math.min(remainingTotal, ref.part.quantity)
                        )
                      );
                      remainingTotal = Math.max(0, remainingTotal - alloc);
                      const subSpares = Math.min(
                        10000,
                        Math.max(0, alloc - ref.part.quantity)
                      );
                      return updatePart(projectId, ref.subassemblyId, ref.part.id, {
                        status: statusDraft,
                        totalOrdered: alloc,
                        sparesCount: subSpares,
                        price: nextPrice,
                      });
                    });
                    await Promise.all(tasks);
                  }
                  pushToast('success', 'Purchase order status synced.');
                  onClose();
                } catch (err) {
                  const msg = extractReadableError(
                    err,
                    'Failed to save purchase order.'
                  );
                  setActionError(msg);
                  pushToast('error', msg);
                } finally {
                  setBusy(false);
                }
              }}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white disabled:opacity-50"
            >
              {busy ? 'Saving...' : 'Save Approval'}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // 15. In-Progress / Machinist Details Pop-up
  if (modal.type === 'in-progress-details') {
    const completedMachines = part.machinesUsed || [];
    const assignedMachines = part.machines || [];
    const allMachinesList = Array.from(
      new Set([...assignedMachines, ...completedMachines])
    );
    const neededTotal = part.quantity + (part.sparesRequested || 0);
    const pct =
      neededTotal > 0
        ? Math.min(100, Math.round(((part.totalMachined || 0) / neededTotal) * 100))
        : 0;
    const hasProgress =
      completedMachines.length > 0 ||
      (part.totalMachined || 0) > 0 ||
      Boolean(part.machiningNotes?.trim());

    return (
      <Modal
        open
        onClose={onClose}
        title={
          part.status === 'In-Progress'
            ? 'In-Progress Machining Update'
            : 'Machining Progress & Notes'
        }
        subtitle={`${partTag} · ${part.name}`}
        maxWidth="md"
      >
        <div className="space-y-4 text-sm">
          {/* Quantity & Assigned Machinist */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] space-y-2">
              <div className="text-xs text-zinc-500">Machined Count Progress</div>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-lg font-bold font-mono-tabular text-zinc-900 dark:text-white">
                  {part.totalMachined || 0}{' '}
                  <span className="text-xs font-normal text-zinc-500">
                    / {part.quantity} BOM
                    {part.sparesRequested > 0
                      ? ` (+${part.sparesRequested} spares req)`
                      : ''}
                  </span>
                </span>
                <span className="text-xs font-mono-tabular font-semibold text-amber-600 dark:text-amber-400">
                  {pct}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
                <div
                  className="h-full bg-amber-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>

            <div className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] flex flex-col justify-center">
              <div className="text-xs text-zinc-500">Assigned Machinist</div>
              <div className="font-semibold text-sm text-zinc-900 dark:text-white mt-0.5">
                {part.assignedMachinist || 'Unassigned'}
              </div>
            </div>
          </div>

          {/* Machines Completed vs Pending */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                Shop Operations Completed (Entered by Machinist)
              </span>
              <span className="font-mono-tabular text-zinc-500">
                {completedMachines.length} / {allMachinesList.length} done
              </span>
            </div>

            {allMachinesList.length === 0 ? (
              <p className="text-xs text-zinc-500">
                No shop machines assigned to this part.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {allMachinesList.map((machine) => {
                  const done = completedMachines.includes(machine);
                  return (
                    <div
                      key={machine}
                      className={`flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-lg border text-xs font-medium ${
                        done
                          ? 'border-emerald-600/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] text-zinc-500 dark:text-zinc-400'
                      }`}
                    >
                      <span className="truncate">{machine}</span>
                      {done ? (
                        <span className="inline-flex items-center gap-1 font-semibold shrink-0">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Done</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 shrink-0">
                          <Clock className="w-3.5 h-3.5" />
                          <span>Pending</span>
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Machinist Progress Notes */}
          <div className="space-y-1.5">
            <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Machinist Progress Notes
            </div>
            <div className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] text-xs leading-relaxed whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
              {part.machiningNotes?.trim()
                ? part.machiningNotes
                : hasProgress
                ? 'No extra written notes from the machinist yet.'
                : 'No completed machines or notes have been logged by the machinist yet.'}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // 16. Part Activity & Audit History Pop-up
  if (modal.type === 'history') {
    const hasRequest = Boolean(
      part.requestedAt || part.requestedByName || part.requestedBy
    );

    return (
      <Modal
        open
        onClose={onClose}
        title="Part Activity & Audit Log"
        subtitle={`${partTag} · ${part.name}`}
        maxWidth="md"
      >
        <div className="space-y-4 text-sm">
          <div>
            <div className="text-xs font-semibold text-zinc-500 dark:text-zinc-400 mb-1">
              Subassemblies
            </div>
            <SubassemblyLabels part={part} />
          </div>

          <div className="space-y-2.5">
            <div className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B]">
              <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-700 dark:text-zinc-300">
                  <History className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Created</span>
                </span>
                <span className="font-mono-tabular">
                  {formatTimestamp(part.createdAt)}
                </span>
              </div>
              <div className="font-semibold text-zinc-900 dark:text-white mt-1 text-xs">
                {formatActorDisplay(part.createdByName, part.createdBy)}
              </div>
            </div>

            <div className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B]">
              <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-700 dark:text-zinc-300">
                  <History className="w-3.5 h-3.5 text-sky-500" />
                  <span>Last Changed</span>
                </span>
                <span className="font-mono-tabular">
                  {formatTimestamp(part.updatedAt)}
                </span>
              </div>
              <div className="font-semibold text-zinc-900 dark:text-white mt-1 text-xs">
                {formatActorDisplay(
                  part.updatedByName || part.createdByName,
                  part.updatedBy || part.createdBy
                )}
              </div>
            </div>

            <div className="p-3.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B]">
              <div className="flex items-center justify-between gap-2 text-xs text-zinc-500">
                <span className="inline-flex items-center gap-1.5 font-semibold text-zinc-700 dark:text-zinc-300">
                  <History className="w-3.5 h-3.5 text-amber-500" />
                  <span>Requested</span>
                </span>
                <span className="font-mono-tabular">
                  {hasRequest ? formatTimestamp(part.requestedAt) : '—'}
                </span>
              </div>
              <div className="font-semibold text-zinc-900 dark:text-white mt-1 text-xs">
                {hasRequest
                  ? formatActorDisplay(part.requestedByName, part.requestedBy)
                  : 'Not requested yet'}
              </div>
            </div>
          </div>

          {part.sourceParts.length > 1 ? (
            <div className="space-y-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
              <div className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Per-Subassembly Records ({part.sourceParts.length})
              </div>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {part.sourceParts.map((ref) => {
                  const subHasReq = Boolean(
                    ref.part.requestedAt ||
                      ref.part.requestedByName ||
                      ref.part.requestedBy
                  );
                  return (
                    <div
                      key={`${ref.subassemblyId}-${ref.part.id}`}
                      className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 font-semibold text-zinc-900 dark:text-white">
                        <span>
                          {ref.assemblyNumber
                            ? `${ref.assemblyNumber} · ${ref.subassemblyName}`
                            : ref.subassemblyName}
                        </span>
                        <span className="font-mono-tabular text-zinc-500">
                          Qty {ref.part.quantity}
                        </span>
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Created:{' '}
                        <span className="text-zinc-700 dark:text-zinc-300">
                          {formatActorDisplay(
                            ref.part.createdByName,
                            ref.part.createdBy
                          )}
                        </span>{' '}
                        ({formatTimestamp(ref.part.createdAt)})
                      </div>
                      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        Changed:{' '}
                        <span className="text-zinc-700 dark:text-zinc-300">
                          {formatActorDisplay(
                            ref.part.updatedByName || ref.part.createdByName,
                            ref.part.updatedBy || ref.part.createdBy
                          )}
                        </span>{' '}
                        ({formatTimestamp(ref.part.updatedAt)})
                      </div>
                      {subHasReq ? (
                        <div className="text-[11px] text-amber-700 dark:text-amber-400">
                          Requested:{' '}
                          {formatActorDisplay(
                            ref.part.requestedByName,
                            ref.part.requestedBy
                          )}{' '}
                          ({formatTimestamp(ref.part.requestedAt)})
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white"
            >
              Close
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return null;
};
