import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  CheckSquare,
  Clock,
  Download,
  ExternalLink,
  FileText,
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
  formatFileSize,
  uploadTeamFile,
  validateFileSize,
} from '../../firebase';
import { Modal } from '../ui/Modal';

export type ActiveDetailModal =
  | { type: 'machines'; part: AggregatedPart }
  | { type: 'manufacturer'; part: AggregatedPart }
  | { type: 'material'; part: AggregatedPart }
  | { type: 'vendor-link'; part: AggregatedPart }
  | { type: 'files'; part: AggregatedPart; canEdit: boolean }
  | { type: 'notes'; part: AggregatedPart; canEdit: boolean }
  | { type: 'drawing'; part: AggregatedPart; canEdit: boolean }
  | { type: 'request-in-house'; part: AggregatedPart }
  | { type: 'request-purchased'; part: AggregatedPart }
  | { type: 'request-outsourced'; part: AggregatedPart }
  | { type: 'spare-edit'; part: AggregatedPart }
  | { type: 'request-more-spares'; part: AggregatedPart }
  | { type: 'machine-action'; part: AggregatedPart }
  | { type: 'approved-action'; part: AggregatedPart }
  | { type: 'in-progress-details'; part: AggregatedPart }
  | null;

interface DetailModalsProps {
  modal: ActiveDetailModal;
  onClose: () => void;
  onSwitchModal: (next: ActiveDetailModal) => void;
  projectId: string;
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
  const [totalCountDraft, setTotalCountDraft] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!modal) return;
    const part = modal.part;
    setSelectedFileKeys(part.attachedFiles.map((f) => f.storagePath || f.url));
    setNotesDraft(part.notes || '');
    setMachinistDraft(part.assignedMachinist || '');
    setPriorityDraft(part.priority || 'Regular Priority');
    setSparesDraft(modal.type === 'spare-edit' ? part.sparesCount : part.sparesRequested || 0);
    setLinkDraft(part.vendorLink || '');
    setMachinesUsedDraft(part.machinesUsed || []);
    setMachiningNotesDraft(part.machiningNotes || '');
    const isPendingInventorySpares =
      modal.type === 'approved-action' &&
      part.source === 'Inventory' &&
      part.status === 'Obtained' &&
      part.totalOrdered === 0 &&
      part.sparesRequested > 0;
    setStatusDraft(
      part.status === 'Not Started' || isPendingInventorySpares
        ? 'Requested'
        : part.status
    );
    setTotalCountDraft(
      modal.type === 'machine-action'
        ? part.totalMachined || 0
        : part.totalOrdered || 0
    );
  }, [modal]);

  if (!modal) return null;

  const part = modal.part;

  const updateAllContributingParts = async (
    partial: Record<string, unknown>
  ) => {
    setBusy(true);
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
        subtitle={`${part.partNumber} · ${part.name}`}
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
        subtitle={`${part.partNumber} · ${part.name}`}
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
        subtitle={`${part.partNumber} · ${part.name}`}
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
        subtitle={`${part.partNumber} · ${part.name}`}
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
        title="Part Notes"
        subtitle={`${part.partNumber} · ${part.name}`}
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
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  await updateAllContributingParts({ notes: notesDraft.trim().slice(0, 2000) });
                  pushToast('success', 'Notes saved.');
                  onClose();
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white"
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
        subtitle={`${part.partNumber} · ${part.name}`}
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

  // 8. Request In-House (Parts Manager -> Machining Manager)
  if (modal.type === 'request-in-house') {
    return (
      <Modal
        open
        onClose={onClose}
        title="Request Machining"
        subtitle={`${part.partNumber} · ${part.name}`}
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
                onChange={(e) => setSparesDraft(Math.max(0, Number(e.target.value)))}
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

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                await updateAllContributingParts({
                  status: 'Requested',
                  priority: priorityDraft,
                  assignedMachinist: machinistDraft.trim().slice(0, 80),
                  sparesRequested: Math.min(10000, Math.max(0, Math.floor(sparesDraft))),
                  notes: notesDraft.trim().slice(0, 2000),
                });
                pushToast('success', 'Sent to Machining Manager.');
                onClose();
              }}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white"
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
    return (
      <Modal
        open
        onClose={onClose}
        title="Request COTS Purchase"
        subtitle={`${part.partNumber} · ${part.name}`}
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

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Spares Needed
            </label>
            <input
              type="number"
              min={0}
              value={sparesDraft}
              onChange={(e) => setSparesDraft(Math.max(0, Number(e.target.value)))}
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm font-mono-tabular"
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

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                await updateAllContributingParts({
                  status: 'Requested',
                  vendorLink: linkDraft.trim().slice(0, 1000),
                  sparesRequested: Math.min(10000, Math.max(0, Math.floor(sparesDraft))),
                  notes: notesDraft.trim().slice(0, 2000),
                });
                pushToast('success', 'Sent to Spending Manager.');
                onClose();
              }}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white"
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
    return (
      <Modal
        open
        onClose={onClose}
        title="Request Outsourced Order"
        subtitle={`${part.partNumber} · ${part.manufacturer}`}
        maxWidth="md"
      >
        <div className="space-y-4">
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
                onChange={(e) => setSparesDraft(Math.max(0, Number(e.target.value)))}
                className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm font-mono-tabular"
              />
            </div>
          </div>

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

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                await updateAllContributingParts({
                  status: 'Requested',
                  priority: priorityDraft,
                  vendorLink: linkDraft.trim().slice(0, 1000),
                  sparesRequested: Math.min(10000, Math.max(0, Math.floor(sparesDraft))),
                  notes: notesDraft.trim().slice(0, 2000),
                });
                pushToast('success', 'Sent to Spending Manager.');
                onClose();
              }}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white"
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
        title="Edit Spare Parts"
        subtitle={`${part.partNumber} · ${part.name}`}
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
              onChange={(e) => setSparesDraft(Math.max(0, Number(e.target.value)))}
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm font-mono-tabular"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            {canRequestMore ? (
              <button
                type="button"
                onClick={() =>
                  onSwitchModal({ type: 'request-more-spares', part })
                }
                className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-red-600 text-red-600 dark:text-red-400 hover:bg-red-600/10"
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
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const targetRef = part.sourceParts[0];
                  await updatePart(projectId, targetRef.subassemblyId, targetRef.part.id, {
                    sparesCount: Math.min(10000, Math.max(0, Math.floor(sparesDraft))),
                  });
                  pushToast('success', 'Spares quantity updated.');
                  onClose();
                }}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white"
              >
                Save Count
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
        title="Request More Spares"
        subtitle={`${part.partNumber} · Status remains "${part.status}"`}
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

          {isInHouse || isOutsourcedPaid ? (
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

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Spares Needed
            </label>
            <input
              type="number"
              min={1}
              value={sparesDraft || 1}
              onChange={(e) => setSparesDraft(Math.max(1, Number(e.target.value)))}
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm font-mono-tabular"
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

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const payload: Record<string, unknown> = {
                  sparesRequested: Math.min(10000, Math.max(1, Math.floor(sparesDraft || 1))),
                  notes: notesDraft.trim().slice(0, 2000),
                };
                if (isInHouse) {
                  payload.assignedMachinist = machinistDraft.trim().slice(0, 80);
                  payload.priority = priorityDraft;
                } else if (isOutsourcedPaid) {
                  payload.priority = priorityDraft;
                  payload.vendorLink = linkDraft.trim().slice(0, 1000);
                } else if (isPurchased) {
                  payload.vendorLink = linkDraft.trim().slice(0, 1000);
                }
                await updateAllContributingParts(payload);
                pushToast(
                  'success',
                  'Spare request sent (part status preserved).'
                );
                onClose();
              }}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white"
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

    return (
      <Modal
        open
        onClose={onClose}
        title="Log Machining Progress"
        subtitle={`${part.partNumber} · ${part.name} (BOM Qty: ${part.quantity})`}
        maxWidth="md"
      >
        <div className="space-y-4">
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
                value={totalCountDraft}
                onChange={(e) =>
                  setTotalCountDraft(Math.max(0, Number(e.target.value)))
                }
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
              {Math.max(0, Math.floor(totalCountDraft) - part.quantity)}
            </span>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const total = Math.min(100000, Math.max(0, Math.floor(totalCountDraft)));
                const spares = Math.min(10000, Math.max(0, total - part.quantity));
                const cleanNotes = machiningNotesDraft.trim().slice(0, 1000);
                const cleanMachinesUsed = machinesUsedDraft.slice(0, 25).map((m) => m.slice(0, 60));
                // Update contributing parts proportionally or on primary
                setBusy(true);
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
                    // Distribute across aggregated subassembly parts
                    let remainingTotal = total;
                    for (let i = 0; i < part.sourceParts.length; i++) {
                      const ref = part.sourceParts[i];
                      const isLast = i === part.sourceParts.length - 1;
                      const alloc = isLast
                        ? remainingTotal
                        : Math.min(remainingTotal, ref.part.quantity);
                      remainingTotal -= alloc;
                      const subSpares = Math.max(0, alloc - ref.part.quantity);
                      await updatePart(projectId, ref.subassemblyId, ref.part.id, {
                        machinesUsed: machinesUsedDraft,
                        status: statusDraft,
                        totalMachined: alloc,
                        sparesCount: subSpares,
                        machiningNotes: cleanNotes,
                      });
                    }
                  }
                  pushToast('success', 'Machining progress synced across BOM.');
                  onClose();
                } finally {
                  setBusy(false);
                }
              }}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white"
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

    return (
      <Modal
        open
        onClose={onClose}
        title="Approve & Update Order"
        subtitle={
          isInventorySparesOnly
            ? `${part.partNumber} · ${part.name} (${part.quantity} In Inventory · ${part.sparesRequested} Spares Req)`
            : `${part.partNumber} · ${part.name} (BOM Qty: ${part.quantity})`
        }
        maxWidth="md"
      >
        <div className="space-y-4">
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
                value={totalCountDraft}
                onChange={(e) =>
                  setTotalCountDraft(Math.max(0, Number(e.target.value)))
                }
                className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm font-mono-tabular"
              />
            </div>
          </div>

          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            {isInventorySparesOnly
              ? 'Spares Added to Stock: '
              : 'Calculated Spares Ordered: '}
            <span className="font-mono-tabular font-semibold text-zinc-900 dark:text-white">
              {isInventorySparesOnly
                ? Math.max(0, Math.floor(totalCountDraft))
                : Math.max(0, Math.floor(totalCountDraft) - part.quantity)}
            </span>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                const total = Math.min(100000, Math.max(0, Math.floor(totalCountDraft)));
                const spares = Math.min(
                  10000,
                  isInventorySparesOnly
                    ? total
                    : Math.max(0, total - part.quantity)
                );
                setBusy(true);
                try {
                  if (part.sourceParts.length === 1) {
                    const ref = part.sourceParts[0];
                    await updatePart(projectId, ref.subassemblyId, ref.part.id, {
                      status: statusDraft,
                      totalOrdered: total,
                      sparesCount: spares,
                    });
                  } else if (isInventorySparesOnly) {
                    let remainingTotal = total;
                    for (let i = 0; i < part.sourceParts.length; i++) {
                      const ref = part.sourceParts[i];
                      const isLast = i === part.sourceParts.length - 1;
                      const requestedForRef = ref.part.sparesRequested || 0;
                      const alloc = Math.min(
                        10000,
                        isLast
                          ? remainingTotal
                          : Math.min(remainingTotal, requestedForRef)
                      );
                      remainingTotal = Math.max(0, remainingTotal - alloc);
                      await updatePart(projectId, ref.subassemblyId, ref.part.id, {
                        status: statusDraft,
                        totalOrdered: alloc,
                        sparesCount: alloc,
                      });
                    }
                  } else {
                    let remainingTotal = total;
                    for (let i = 0; i < part.sourceParts.length; i++) {
                      const ref = part.sourceParts[i];
                      const isLast = i === part.sourceParts.length - 1;
                      const alloc = isLast
                        ? remainingTotal
                        : Math.min(remainingTotal, ref.part.quantity);
                      remainingTotal -= alloc;
                      const subSpares = Math.min(10000, Math.max(0, alloc - ref.part.quantity));
                      await updatePart(projectId, ref.subassemblyId, ref.part.id, {
                        status: statusDraft,
                        totalOrdered: alloc,
                        sparesCount: subSpares,
                      });
                    }
                  }
                  pushToast('success', 'Purchase order status synced.');
                  onClose();
                } finally {
                  setBusy(false);
                }
              }}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 text-white"
            >
              {busy ? 'Saving...' : 'Save Approval'}
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  // 15. In-Progress Custom In-House Machining Details Pop-up
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
        title="In-Progress Machining Update"
        subtitle={`${part.partNumber} · ${part.name}`}
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

  return null;
};
