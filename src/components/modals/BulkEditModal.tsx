import React, { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import {
  AggregatedPart,
  COTS_VENDORS,
  FILAMENT_MATERIALS,
  MaterialCategory,
  OUTSOURCED_MANUFACTURERS,
  PRIORITIES,
  Part,
  PartPriority,
  PartStatus,
  RESIN_MATERIALS,
  STOCK_MATERIALS,
  STOCK_SHAPES,
  StockDimensions,
  StockShape,
} from '../../types';
import { useApp } from '../../context/AppContext';
import { Modal } from '../ui/Modal';

interface BulkEditModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  selectedParts: AggregatedPart[];
  onSaved?: () => void;
}

type WorkflowAction =
  | 'send-request'
  | 'unsend-request'
  | 'Not Started'
  | 'In-Progress'
  | 'Obtained';

export const BulkEditModal: React.FC<BulkEditModalProps> = ({
  open,
  onClose,
  projectId,
  selectedParts,
  onSaved,
}) => {
  const { machines, updatePart, pushToast } = useApp();

  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Field enable checkboxes
  const [applyPriority, setApplyPriority] = useState(false);
  const [applyWorkflow, setApplyWorkflow] = useState(false);
  const [applyQuantity, setApplyQuantity] = useState(false);
  const [applySparesReq, setApplySparesReq] = useState(false);
  const [applyRevision, setApplyRevision] = useState(false);
  const [applyMachinist, setApplyMachinist] = useState(false);
  const [applyMachines, setApplyMachines] = useState(false);
  const [applyMaterial, setApplyMaterial] = useState(false);
  const [applyVendor, setApplyVendor] = useState(false);
  const [applyManufacturer, setApplyManufacturer] = useState(false);
  const [applyCostsMoney, setApplyCostsMoney] = useState(false);
  const [applyLink, setApplyLink] = useState(false);
  const [applyNotes, setApplyNotes] = useState(false);

  // Draft values
  const [priority, setPriority] = useState<PartPriority>('Regular Priority');
  const [workflowAction, setWorkflowAction] =
    useState<WorkflowAction>('send-request');
  const [quantity, setQuantity] = useState(1);
  const [sparesRequested, setSparesRequested] = useState(0);
  const [revision, setRevision] = useState('');
  const [assignedMachinist, setAssignedMachinist] = useState('');
  const [selectedMachines, setSelectedMachines] = useState<string[]>([]);
  const [materialCategory, setMaterialCategory] =
    useState<MaterialCategory>('Stock Material');
  const [materialSelect, setMaterialSelect] = useState(STOCK_MATERIALS[2]);
  const [customMaterial, setCustomMaterial] = useState('');
  const [stockShape, setStockShape] = useState<StockShape>('');
  const [dimensions, setDimensions] = useState<StockDimensions>({});
  const [vendorSelect, setVendorSelect] = useState(COTS_VENDORS[0]);
  const [customVendor, setCustomVendor] = useState('');
  const [manufacturerSelect, setManufacturerSelect] = useState(
    OUTSOURCED_MANUFACTURERS[0]
  );
  const [customManufacturer, setCustomManufacturer] = useState('');
  const [costsMoney, setCostsMoney] = useState(true);
  const [vendorLink, setVendorLink] = useState('');
  const [notesMode, setNotesMode] = useState<'replace' | 'append'>('replace');
  const [notesText, setNotesText] = useState('');

  const summary = useMemo(() => {
    const hasCustom = selectedParts.some((p) => p.type === 'Custom');
    const hasCots = selectedParts.some((p) => p.type === 'COTS');
    const hasInHouse = selectedParts.some((p) => p.source === 'In-House');
    const hasOutsourced = selectedParts.some((p) => p.source === 'Outsourced');
    const allFreeOutsourced =
      selectedParts.length > 0 &&
      selectedParts.every((p) => p.source === 'Outsourced' && !p.costsMoney);
    const hasAggregated = selectedParts.some((p) => p.sourceParts.length > 1);
    const totalDocs = selectedParts.reduce(
      (sum, p) => sum + p.sourceParts.length,
      0
    );
    return {
      hasCustom,
      hasCots,
      hasInHouse,
      hasOutsourced,
      allFreeOutsourced,
      hasAggregated,
      totalDocs,
    };
  }, [selectedParts]);

  useEffect(() => {
    if (!open) return;
    setErrorMsg('');
    setSaving(false);
    setApplyPriority(false);
    setApplyWorkflow(false);
    setApplyQuantity(false);
    setApplySparesReq(false);
    setApplyRevision(false);
    setApplyMachinist(false);
    setApplyMachines(false);
    setApplyMaterial(false);
    setApplyVendor(false);
    setApplyManufacturer(false);
    setApplyCostsMoney(false);
    setApplyLink(false);
    setApplyNotes(false);

    const first = selectedParts[0];
    setPriority(first?.priority || 'Regular Priority');
    setWorkflowAction('send-request');
    setQuantity(first?.quantity || 1);
    setSparesRequested(0);
    setRevision(first?.revision || '');
    setAssignedMachinist('');
    setSelectedMachines([]);
    setMaterialCategory('Stock Material');
    setMaterialSelect(STOCK_MATERIALS[2]);
    setCustomMaterial('');
    setStockShape('');
    setDimensions({});
    setVendorSelect(COTS_VENDORS[0]);
    setCustomVendor('');
    setManufacturerSelect(OUTSOURCED_MANUFACTURERS[0]);
    setCustomManufacturer('');
    setCostsMoney(true);
    setVendorLink('');
    setNotesMode('replace');
    setNotesText('');
  }, [open, selectedParts]);

  const materialOptions =
    materialCategory === '3D Printer Filaments'
      ? FILAMENT_MATERIALS
      : materialCategory === 'Resin'
      ? RESIN_MATERIALS
      : STOCK_MATERIALS;

  const toggleMachine = (m: string) => {
    setSelectedMachines((prev) =>
      prev.includes(m) ? prev.filter((item) => item !== m) : [...prev, m]
    );
  };

  const anyEnabled =
    applyPriority ||
    applyWorkflow ||
    applyQuantity ||
    applySparesReq ||
    applyRevision ||
    applyMachinist ||
    applyMachines ||
    applyMaterial ||
    applyVendor ||
    applyManufacturer ||
    applyCostsMoney ||
    applyLink ||
    applyNotes;

  const handleApplyBulkEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!anyEnabled) {
      setErrorMsg('Select at least one field to update.');
      return;
    }
    if (applyQuantity && (!Number.isFinite(quantity) || quantity < 1)) {
      setErrorMsg('Quantity must be at least 1.');
      return;
    }
    if (applyMachines && selectedMachines.length === 0) {
      setErrorMsg('Select at least one machine when updating shop machines.');
      return;
    }
    if (applyMaterial && materialSelect === 'Other' && !customMaterial.trim()) {
      setErrorMsg('Please enter the custom material name.');
      return;
    }
    if (applyVendor && vendorSelect === 'Other' && !customVendor.trim()) {
      setErrorMsg('Please enter the custom vendor name.');
      return;
    }
    if (
      applyManufacturer &&
      manufacturerSelect === 'Other' &&
      !customManufacturer.trim()
    ) {
      setErrorMsg('Please enter the custom manufacturer name.');
      return;
    }

    setSaving(true);
    try {
      const refsToUpdate = selectedParts.flatMap((agg) => agg.sourceParts);
      const tasks: Array<Promise<void>> = [];

      for (const ref of refsToUpdate) {
        const part: Part = ref.part;
        const updates: Partial<Part> = {};

        if (applyPriority) {
          updates.priority = priority;
        }
        if (applyQuantity) {
          updates.quantity = Math.min(100000, Math.max(1, Math.floor(quantity)));
        }
        if (applySparesReq) {
          updates.sparesRequested = Math.min(
            10000,
            Math.max(0, Math.floor(sparesRequested))
          );
        }
        if (applyRevision && part.type === 'Custom') {
          updates.revision = revision.trim().slice(0, 20);
        }
        if (applyMachinist && part.source === 'In-House') {
          updates.assignedMachinist = assignedMachinist.trim().slice(0, 80);
        }
        if (applyMachines && part.source === 'In-House') {
          updates.machines = selectedMachines
            .slice(0, 25)
            .map((m) => m.slice(0, 60));
        }
        if (applyMaterial && part.type === 'Custom') {
          updates.materialCategory = materialCategory;
          updates.materialName = (
            materialSelect === 'Other' ? customMaterial.trim() : materialSelect
          ).slice(0, 80);
          if (materialCategory === 'Stock Material') {
            updates.stockShape = stockShape;
            updates.dimensions = stockShape
              ? {
                  ...(dimensions.length
                    ? { length: dimensions.length.trim().slice(0, 30) }
                    : {}),
                  ...(dimensions.width
                    ? { width: dimensions.width.trim().slice(0, 30) }
                    : {}),
                  ...(dimensions.height
                    ? { height: dimensions.height.trim().slice(0, 30) }
                    : {}),
                  ...(dimensions.thickness
                    ? { thickness: dimensions.thickness.trim().slice(0, 30) }
                    : {}),
                  ...(dimensions.innerDiameter
                    ? {
                        innerDiameter: dimensions.innerDiameter
                          .trim()
                          .slice(0, 30),
                      }
                    : {}),
                  ...(dimensions.outerDiameter
                    ? {
                        outerDiameter: dimensions.outerDiameter
                          .trim()
                          .slice(0, 30),
                      }
                    : {}),
                }
              : {};
          } else {
            updates.stockShape = '';
            updates.dimensions = {};
          }
        }
        if (applyVendor && part.type === 'COTS') {
          updates.vendor = (
            vendorSelect === 'Other' ? customVendor.trim() : vendorSelect
          ).slice(0, 80);
        }
        if (applyManufacturer && part.source === 'Outsourced') {
          updates.manufacturer = (
            manufacturerSelect === 'Other'
              ? customManufacturer.trim()
              : manufacturerSelect
          ).slice(0, 80);
        }
        if (applyCostsMoney && part.source === 'Outsourced') {
          updates.costsMoney = costsMoney;
        }
        if (
          applyLink &&
          (part.type === 'COTS' || part.source === 'Outsourced')
        ) {
          updates.vendorLink = vendorLink.trim().slice(0, 1000);
        }
        if (applyNotes) {
          const incomingNote = notesText.trim();
          if (notesMode === 'append') {
            const existingNote = (part.notes || '').trim();
            updates.notes = (
              existingNote && incomingNote
                ? `${existingNote}\n${incomingNote}`
                : existingNote || incomingNote
            ).slice(0, 2000);
          } else {
            updates.notes = incomingNote.slice(0, 2000);
          }
        }
        if (applyWorkflow) {
          if (workflowAction === 'send-request') {
            if (part.source !== 'Inventory') {
              updates.status = 'Requested';
            }
          } else if (workflowAction === 'unsend-request') {
            updates.status =
              part.source === 'Inventory' ? 'Obtained' : 'Not Started';
            updates.sparesRequested = 0;
          } else if (
            part.source === 'Outsourced' &&
            !part.costsMoney &&
            (
              ['Not Started', 'In-Progress', 'Obtained'] as PartStatus[]
            ).includes(workflowAction)
          ) {
            updates.status = workflowAction;
          }
        }

        if (Object.keys(updates).length > 0) {
          tasks.push(updatePart(projectId, ref.subassemblyId, part.id, updates));
        }
      }

      if (tasks.length === 0) {
        setErrorMsg(
          'None of the checked fields apply to the selected part types.'
        );
        setSaving(false);
        return;
      }

      await Promise.all(tasks);
      pushToast(
        'success',
        `Updated ${selectedParts.length} part${
          selectedParts.length === 1 ? '' : 's'
        }.`
      );
      onSaved?.();
      onClose();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to apply bulk updates.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Bulk Edit Selected Parts"
      subtitle={`Editing ${selectedParts.length} part${
        selectedParts.length === 1 ? '' : 's'
      }${
        summary.totalDocs !== selectedParts.length
          ? ` (${summary.totalDocs} subassembly records)`
          : ''
      } · Only checked fields will be updated`}
      maxWidth="2xl"
    >
      <form onSubmit={handleApplyBulkEdit} className="space-y-4">
        {/* Selected Parts Summary */}
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B]">
          {selectedParts.map((p) => (
            <span
              key={p.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-[#131317] text-[11px] font-medium"
            >
              <span className="font-mono-tabular text-zinc-500">
                {p.partNumber}
              </span>
              <span className="truncate max-w-[160px]">{p.name}</span>
            </span>
          ))}
        </div>

        <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
          {/* Priority */}
          <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-2">
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={applyPriority}
                onChange={(e) => setApplyPriority(e.target.checked)}
                className="rounded border-zinc-400 text-red-600 focus:ring-red-500"
              />
              <span>Priority</span>
            </label>
            {applyPriority ? (
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as PartPriority)}
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs"
              >
                {PRIORITIES.map((pr) => (
                  <option key={pr} value={pr}>
                    {pr}
                  </option>
                ))}
              </select>
            ) : null}
          </div>

          {/* Workflow / Request Action */}
          <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-2">
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={applyWorkflow}
                onChange={(e) => setApplyWorkflow(e.target.checked)}
                className="rounded border-zinc-400 text-red-600 focus:ring-red-500"
              />
              <span>Request / Status Action</span>
            </label>
            {applyWorkflow ? (
              <div className="space-y-1.5">
                <select
                  value={workflowAction}
                  onChange={(e) =>
                    setWorkflowAction(e.target.value as WorkflowAction)
                  }
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs"
                >
                  <option value="send-request">
                    Send Request (set non-Inventory parts to Requested)
                  </option>
                  <option value="unsend-request">
                    Unsend Request (reset back to Not Started / Obtained)
                  </option>
                  {summary.allFreeOutsourced ? (
                    <>
                      <option value="Not Started">
                        Set Status: Not Started (Free Outsourced)
                      </option>
                      <option value="In-Progress">
                        Set Status: In-Progress (Free Outsourced)
                      </option>
                      <option value="Obtained">
                        Set Status: Obtained (Free Outsourced)
                      </option>
                    </>
                  ) : null}
                </select>
                <p className="text-[11px] text-zinc-500">
                  Shop-floor statuses (Needs Drawing, Needs CAM, Ready for
                  Machine) and Shipping are managed in Machining / Spending
                  Manager.
                </p>
              </div>
            ) : null}
          </div>

          {/* Quantity & Spares Requested */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyQuantity}
                  onChange={(e) => setApplyQuantity(e.target.checked)}
                  className="rounded border-zinc-400 text-red-600 focus:ring-red-500"
                />
                <span>Quantity</span>
              </label>
              {applyQuantity ? (
                <div className="space-y-1">
                  <input
                    type="number"
                    min={1}
                    max={100000}
                    value={quantity}
                    onChange={(e) =>
                      setQuantity(Math.max(1, Number(e.target.value) || 1))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs font-mono-tabular"
                  />
                  {summary.hasAggregated ? (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      Applies per subassembly entry.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>

            <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={applySparesReq}
                  onChange={(e) => setApplySparesReq(e.target.checked)}
                  className="rounded border-zinc-400 text-red-600 focus:ring-red-500"
                />
                <span>Spares Requested</span>
              </label>
              {applySparesReq ? (
                <input
                  type="number"
                  min={0}
                  max={10000}
                  value={sparesRequested}
                  onChange={(e) =>
                    setSparesRequested(Math.max(0, Number(e.target.value) || 0))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs font-mono-tabular"
                />
              ) : null}
            </div>
          </div>

          {/* Custom-only fields: Revision & Material */}
          {summary.hasCustom ? (
            <>
              <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyRevision}
                    onChange={(e) => setApplyRevision(e.target.checked)}
                    className="rounded border-zinc-400 text-red-600 focus:ring-red-500"
                  />
                  <span>Revision (Custom parts only)</span>
                </label>
                {applyRevision ? (
                  <input
                    type="text"
                    maxLength={20}
                    value={revision}
                    onChange={(e) => setRevision(e.target.value)}
                    placeholder="e.g., B (leave blank to clear)"
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs font-mono-tabular"
                  />
                ) : null}
              </div>

              <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyMaterial}
                    onChange={(e) => setApplyMaterial(e.target.checked)}
                    className="rounded border-zinc-400 text-red-600 focus:ring-red-500"
                  />
                  <span>Material & Stock Dimensions (Custom parts only)</span>
                </label>
                {applyMaterial ? (
                  <div className="space-y-2.5 pt-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <select
                        value={materialCategory}
                        onChange={(e) => {
                          const nextCat = e.target.value as MaterialCategory;
                          setMaterialCategory(nextCat);
                          const nextList =
                            nextCat === '3D Printer Filaments'
                              ? FILAMENT_MATERIALS
                              : nextCat === 'Resin'
                              ? RESIN_MATERIALS
                              : STOCK_MATERIALS;
                          setMaterialSelect(nextList[0]);
                          setCustomMaterial('');
                          if (nextCat !== 'Stock Material') {
                            setStockShape('');
                            setDimensions({});
                          }
                        }}
                        className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs"
                      >
                        <option value="Stock Material">Stock Material</option>
                        <option value="3D Printer Filaments">
                          3D Printer Filaments
                        </option>
                        <option value="Resin">Resin</option>
                      </select>

                      <select
                        value={materialSelect}
                        onChange={(e) => setMaterialSelect(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs"
                      >
                        {materialOptions.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>

                    {materialSelect === 'Other' ? (
                      <input
                        type="text"
                        value={customMaterial}
                        onChange={(e) => setCustomMaterial(e.target.value)}
                        placeholder="Enter custom material name"
                        className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs"
                      />
                    ) : null}

                    {materialCategory === 'Stock Material' ? (
                      <div className="space-y-2">
                        <select
                          value={stockShape}
                          onChange={(e) => {
                            setStockShape(e.target.value as StockShape);
                            setDimensions({});
                          }}
                          className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs"
                        >
                          <option value="">No specific stock shape</option>
                          {STOCK_SHAPES.map((s) => (
                            <option key={s} value={s}>
                              {s}
                            </option>
                          ))}
                        </select>

                        {stockShape === 'Box Tube' ? (
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <input
                              type="text"
                              placeholder="Length"
                              value={dimensions.length || ''}
                              onChange={(e) =>
                                setDimensions((d) => ({
                                  ...d,
                                  length: e.target.value,
                                }))
                              }
                              className="px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs"
                            />
                            <input
                              type="text"
                              placeholder="Width"
                              value={dimensions.width || ''}
                              onChange={(e) =>
                                setDimensions((d) => ({
                                  ...d,
                                  width: e.target.value,
                                }))
                              }
                              className="px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs"
                            />
                            <input
                              type="text"
                              placeholder="Height"
                              value={dimensions.height || ''}
                              onChange={(e) =>
                                setDimensions((d) => ({
                                  ...d,
                                  height: e.target.value,
                                }))
                              }
                              className="px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs"
                            />
                            <input
                              type="text"
                              placeholder="Wall"
                              value={dimensions.thickness || ''}
                              onChange={(e) =>
                                setDimensions((d) => ({
                                  ...d,
                                  thickness: e.target.value,
                                }))
                              }
                              className="px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs"
                            />
                          </div>
                        ) : stockShape === 'Plate' ? (
                          <div className="grid grid-cols-3 gap-2">
                            <input
                              type="text"
                              placeholder="Length"
                              value={dimensions.length || ''}
                              onChange={(e) =>
                                setDimensions((d) => ({
                                  ...d,
                                  length: e.target.value,
                                }))
                              }
                              className="px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs"
                            />
                            <input
                              type="text"
                              placeholder="Width"
                              value={dimensions.width || ''}
                              onChange={(e) =>
                                setDimensions((d) => ({
                                  ...d,
                                  width: e.target.value,
                                }))
                              }
                              className="px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs"
                            />
                            <input
                              type="text"
                              placeholder="Thickness"
                              value={dimensions.thickness || ''}
                              onChange={(e) =>
                                setDimensions((d) => ({
                                  ...d,
                                  thickness: e.target.value,
                                }))
                              }
                              className="px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs"
                            />
                          </div>
                        ) : stockShape === 'Tube' ? (
                          <div className="grid grid-cols-3 gap-2">
                            <input
                              type="text"
                              placeholder="Length"
                              value={dimensions.length || ''}
                              onChange={(e) =>
                                setDimensions((d) => ({
                                  ...d,
                                  length: e.target.value,
                                }))
                              }
                              className="px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs"
                            />
                            <input
                              type="text"
                              placeholder="ID"
                              value={dimensions.innerDiameter || ''}
                              onChange={(e) =>
                                setDimensions((d) => ({
                                  ...d,
                                  innerDiameter: e.target.value,
                                }))
                              }
                              className="px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs"
                            />
                            <input
                              type="text"
                              placeholder="OD"
                              value={dimensions.outerDiameter || ''}
                              onChange={(e) =>
                                setDimensions((d) => ({
                                  ...d,
                                  outerDiameter: e.target.value,
                                }))
                              }
                              className="px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs"
                            />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          {/* In-House fields: Machinist & Shop Machines */}
          {summary.hasInHouse ? (
            <>
              <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyMachinist}
                    onChange={(e) => setApplyMachinist(e.target.checked)}
                    className="rounded border-zinc-400 text-red-600 focus:ring-red-500"
                  />
                  <span>Desired Machinist Student (In-House parts only)</span>
                </label>
                {applyMachinist ? (
                  <input
                    type="text"
                    maxLength={80}
                    value={assignedMachinist}
                    onChange={(e) => setAssignedMachinist(e.target.value)}
                    placeholder="e.g., Alex M. (leave blank to clear)"
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs"
                  />
                ) : null}
              </div>

              <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-2">
                <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={applyMachines}
                    onChange={(e) => setApplyMachines(e.target.checked)}
                    className="rounded border-zinc-400 text-red-600 focus:ring-red-500"
                  />
                  <span>Assigned Shop Machines (In-House parts only)</span>
                </label>
                {applyMachines ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 pt-1">
                    {machines.map((m) => {
                      const active = selectedMachines.includes(m);
                      return (
                        <button
                          key={m}
                          type="button"
                          onClick={() => toggleMachine(m)}
                          className={`flex items-center justify-between gap-1.5 px-2.5 py-1.5 rounded border text-xs font-medium text-left ${
                            active
                              ? 'border-red-600 bg-red-600/15 text-red-600 dark:text-red-400'
                              : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] text-zinc-600 dark:text-zinc-300'
                          }`}
                        >
                          <span className="truncate">{m}</span>
                          {active ? <Check className="w-3 h-3 shrink-0" /> : null}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          {/* COTS Vendor */}
          {summary.hasCots ? (
            <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyVendor}
                  onChange={(e) => setApplyVendor(e.target.checked)}
                  className="rounded border-zinc-400 text-red-600 focus:ring-red-500"
                />
                <span>Vendor (COTS parts only)</span>
              </label>
              {applyVendor ? (
                <div className="space-y-2">
                  <select
                    value={vendorSelect}
                    onChange={(e) => setVendorSelect(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs"
                  >
                    {COTS_VENDORS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                  {vendorSelect === 'Other' ? (
                    <input
                      type="text"
                      value={customVendor}
                      onChange={(e) => setCustomVendor(e.target.value)}
                      placeholder="Enter vendor name"
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs"
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Outsourced Manufacturer & Cost */}
          {summary.hasOutsourced ? (
            <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-2.5">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyManufacturer}
                  onChange={(e) => setApplyManufacturer(e.target.checked)}
                  className="rounded border-zinc-400 text-red-600 focus:ring-red-500"
                />
                <span>Manufacturer (Outsourced parts only)</span>
              </label>
              {applyManufacturer ? (
                <div className="space-y-2">
                  <select
                    value={manufacturerSelect}
                    onChange={(e) => setManufacturerSelect(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs"
                  >
                    {OUTSOURCED_MANUFACTURERS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  {manufacturerSelect === 'Other' ? (
                    <input
                      type="text"
                      value={customManufacturer}
                      onChange={(e) => setCustomManufacturer(e.target.value)}
                      placeholder="Enter manufacturer name"
                      className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs"
                    />
                  ) : null}
                </div>
              ) : null}

              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={applyCostsMoney}
                  onChange={(e) => setApplyCostsMoney(e.target.checked)}
                  className="rounded border-zinc-400 text-red-600 focus:ring-red-500"
                />
                <span>Outsourced Cost Setting (Outsourced parts only)</span>
              </label>
              {applyCostsMoney ? (
                <div className="flex items-center gap-3 text-xs">
                  <button
                    type="button"
                    onClick={() => setCostsMoney(true)}
                    className={`px-3 py-1.5 rounded border font-semibold ${
                      costsMoney
                        ? 'border-red-600 bg-red-600/15 text-red-600 dark:text-red-400'
                        : 'border-zinc-300 dark:border-zinc-700 text-zinc-500'
                    }`}
                  >
                    Costs Money
                  </button>
                  <button
                    type="button"
                    onClick={() => setCostsMoney(false)}
                    className={`px-3 py-1.5 rounded border font-semibold ${
                      !costsMoney
                        ? 'border-red-600 bg-red-600/15 text-red-600 dark:text-red-400'
                        : 'border-zinc-300 dark:border-zinc-700 text-zinc-500'
                    }`}
                  >
                    Free / Sponsored
                  </button>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Vendor / Manufacturer Website Link */}
          {summary.hasCots || summary.hasOutsourced ? (
            <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-2">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyLink}
                  onChange={(e) => setApplyLink(e.target.checked)}
                  className="rounded border-zinc-400 text-red-600 focus:ring-red-500"
                />
                <span>Vendor / Manufacturer Link (COTS & Outsourced)</span>
              </label>
              {applyLink ? (
                <input
                  type="url"
                  maxLength={1000}
                  value={vendorLink}
                  onChange={(e) => setVendorLink(e.target.value)}
                  placeholder="https://... (leave blank to clear)"
                  className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs"
                />
              ) : null}
            </div>
          ) : null}

          {/* Notes */}
          <div className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
                <input
                  type="checkbox"
                  checked={applyNotes}
                  onChange={(e) => setApplyNotes(e.target.checked)}
                  className="rounded border-zinc-400 text-red-600 focus:ring-red-500"
                />
                <span>Notes</span>
              </label>
              {applyNotes ? (
                <div className="flex items-center gap-1 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setNotesMode('replace')}
                    className={`px-2 py-0.5 rounded border font-semibold ${
                      notesMode === 'replace'
                        ? 'border-red-600 bg-red-600 text-white'
                        : 'border-zinc-300 dark:border-zinc-700 text-zinc-500'
                    }`}
                  >
                    Replace
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotesMode('append')}
                    className={`px-2 py-0.5 rounded border font-semibold ${
                      notesMode === 'append'
                        ? 'border-red-600 bg-red-600 text-white'
                        : 'border-zinc-300 dark:border-zinc-700 text-zinc-500'
                    }`}
                  >
                    Append
                  </button>
                </div>
              ) : null}
            </div>
            {applyNotes ? (
              <textarea
                rows={3}
                maxLength={2000}
                value={notesText}
                onChange={(e) => setNotesText(e.target.value)}
                placeholder={
                  notesMode === 'append'
                    ? 'Text to append to each selected part’s notes...'
                    : 'New notes for all selected parts (leave blank to clear)...'
                }
                className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-xs"
              />
            ) : null}
          </div>
        </div>

        {errorMsg ? (
          <div className="p-2.5 rounded-lg border border-red-500/40 bg-red-500/10 text-xs font-medium text-red-600 dark:text-red-400">
            {errorMsg}
          </div>
        ) : null}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-zinc-300 dark:border-zinc-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white"
          >
            {saving
              ? 'Updating...'
              : `Apply to ${selectedParts.length} Part${
                  selectedParts.length === 1 ? '' : 's'
                }`}
          </button>
        </div>
      </form>
    </Modal>
  );
};
