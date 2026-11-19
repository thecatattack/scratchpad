import React, { useEffect, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  Paperclip,
  Trash2,
  Upload,
} from 'lucide-react';
import {
  COTS_VENDORS,
  FILAMENT_MATERIALS,
  MaterialCategory,
  OUTSOURCED_MANUFACTURERS,
  Part,
  PartSource,
  PartType,
  RESIN_MATERIALS,
  STOCK_MATERIALS,
  STOCK_SHAPES,
  StockDimensions,
  StockShape,
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
import { Modal } from '../ui/Modal';

interface PartWizardModalProps {
  open: boolean;
  onClose: () => void;
  projectId: string;
  subassemblyId: string;
  existingPartsInProject: Part[];
  editingPart?: Part | null;
}

export const PartWizardModal: React.FC<PartWizardModalProps> = ({
  open,
  onClose,
  projectId,
  subassemblyId,
  existingPartsInProject,
  editingPart,
}) => {
  const { machines, createPart, updatePart, pushToast } = useApp();

  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Step 1: Core identity + optional picture
  const [name, setName] = useState('');
  const [partNumber, setPartNumber] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [pictureUrl, setPictureUrl] = useState('');
  const [pictureFile, setPictureFile] = useState<File | null>(null);
  const [picturePreview, setPicturePreview] = useState('');

  // Step 2: Pathway (COTS / In-House / Outsourced)
  const [pathway, setPathway] = useState<'COTS' | 'In-House' | 'Outsourced'>('In-House');
  const [cotsPathway, setCotsPathway] = useState<'Purchased' | 'Inventory'>('Purchased');
  const [vendorSelect, setVendorSelect] = useState(COTS_VENDORS[0]);
  const [customVendor, setCustomVendor] = useState('');
  const [selectedMachines, setSelectedMachines] = useState<string[]>([]);
  const [manufacturerSelect, setManufacturerSelect] = useState(OUTSOURCED_MANUFACTURERS[0]);
  const [customManufacturer, setCustomManufacturer] = useState('');
  const [costsMoney, setCostsMoney] = useState(true);

  // Step 3: Material, Dimensions, Files, Drawing PDF, Identical Part (Custom only)
  const [materialCategory, setMaterialCategory] = useState<MaterialCategory>('Stock Material');
  const [materialSelect, setMaterialSelect] = useState(STOCK_MATERIALS[2]);
  const [customMaterial, setCustomMaterial] = useState('');
  const [stockShape, setStockShape] = useState<StockShape>('');
  const [dimensions, setDimensions] = useState<StockDimensions>({});
  const [drawingPdf, setDrawingPdf] = useState<StoredFileRef | null>(null);
  const [drawingPdfFile, setDrawingPdfFile] = useState<File | null>(null);
  const [attachedFiles, setAttachedFiles] = useState<StoredFileRef[]>([]);
  const [newAttachmentFiles, setNewAttachmentFiles] = useState<File[]>([]);
  const [hasIdentical, setHasIdentical] = useState(false);
  const [identicalPartId, setIdenticalPartId] = useState('');

  // Step 4: Notes
  const [notes, setNotes] = useState('');

  const resetForm = () => {
    setStep(1);
    setErrorMsg('');
    setName('');
    setPartNumber('');
    setQuantity(1);
    setPictureUrl('');
    setPictureFile(null);
    setPicturePreview('');
    setPathway('In-House');
    setCotsPathway('Purchased');
    setVendorSelect(COTS_VENDORS[0]);
    setCustomVendor('');
    setSelectedMachines([]);
    setManufacturerSelect(OUTSOURCED_MANUFACTURERS[0]);
    setCustomManufacturer('');
    setCostsMoney(true);
    setMaterialCategory('Stock Material');
    setMaterialSelect(STOCK_MATERIALS[2]);
    setCustomMaterial('');
    setStockShape('');
    setDimensions({});
    setDrawingPdf(null);
    setDrawingPdfFile(null);
    setAttachedFiles([]);
    setNewAttachmentFiles([]);
    setHasIdentical(false);
    setIdenticalPartId('');
    setNotes('');
  };

  useEffect(() => {
    if (!open) return;
    if (editingPart) {
      setStep(1);
      setErrorMsg('');
      setName(editingPart.name);
      setPartNumber(editingPart.partNumber);
      setQuantity(editingPart.quantity);
      setPictureUrl(editingPart.pictureUrl || '');
      setPictureFile(null);
      setPicturePreview(editingPart.pictureUrl || '');

      if (editingPart.type === 'COTS') {
        setPathway('COTS');
        setCotsPathway(
          editingPart.source === 'Inventory' ? 'Inventory' : 'Purchased'
        );
        if (COTS_VENDORS.includes(editingPart.vendor)) {
          setVendorSelect(editingPart.vendor);
          setCustomVendor('');
        } else {
          setVendorSelect('Other');
          setCustomVendor(editingPart.vendor);
        }
      } else if (editingPart.source === 'Outsourced') {
        setPathway('Outsourced');
        if (OUTSOURCED_MANUFACTURERS.includes(editingPart.manufacturer)) {
          setManufacturerSelect(editingPart.manufacturer);
          setCustomManufacturer('');
        } else {
          setManufacturerSelect('Other');
          setCustomManufacturer(editingPart.manufacturer);
        }
        setCostsMoney(editingPart.costsMoney);
      } else {
        setPathway('In-House');
        setSelectedMachines(editingPart.machines || []);
      }

      const cat = editingPart.materialCategory || 'Stock Material';
      setMaterialCategory(cat);
      const list =
        cat === '3D Printer Filaments'
          ? FILAMENT_MATERIALS
          : cat === 'Resin'
          ? RESIN_MATERIALS
          : STOCK_MATERIALS;
      if (list.includes(editingPart.materialName)) {
        setMaterialSelect(editingPart.materialName);
        setCustomMaterial('');
      } else if (editingPart.materialName) {
        setMaterialSelect('Other');
        setCustomMaterial(editingPart.materialName);
      } else {
        setMaterialSelect(list[0]);
        setCustomMaterial('');
      }
      setStockShape(editingPart.stockShape || '');
      setDimensions(editingPart.dimensions || {});
      setDrawingPdf(editingPart.drawingPdf || null);
      setDrawingPdfFile(null);
      setAttachedFiles(editingPart.attachedFiles || []);
      setNewAttachmentFiles([]);
      setHasIdentical(Boolean(editingPart.identicalGroupId));
      setIdenticalPartId('');
      setNotes(editingPart.notes || '');
    } else {
      resetForm();
    }
  }, [open, editingPart]);

  // Revoke object URL when picture preview changes
  useEffect(() => {
    return () => {
      if (picturePreview && picturePreview.startsWith('blob:')) {
        URL.revokeObjectURL(picturePreview);
      }
    };
  }, [picturePreview]);

  const materialOptions =
    materialCategory === '3D Printer Filaments'
      ? FILAMENT_MATERIALS
      : materialCategory === 'Resin'
      ? RESIN_MATERIALS
      : STOCK_MATERIALS;

  const customPartsCandidates = existingPartsInProject.filter(
    (p) => p.type === 'Custom' && p.id !== editingPart?.id
  );

  const handleIdenticalSelect = (candidateId: string) => {
    setIdenticalPartId(candidateId);
    const match = customPartsCandidates.find((p) => p.id === candidateId);
    if (!match) return;
    if (match.materialCategory) {
      setMaterialCategory(match.materialCategory);
      const list =
        match.materialCategory === '3D Printer Filaments'
          ? FILAMENT_MATERIALS
          : match.materialCategory === 'Resin'
          ? RESIN_MATERIALS
          : STOCK_MATERIALS;
      if (list.includes(match.materialName)) {
        setMaterialSelect(match.materialName);
        setCustomMaterial('');
      } else {
        setMaterialSelect('Other');
        setCustomMaterial(match.materialName);
      }
    }
    setStockShape(match.stockShape || '');
    setDimensions(match.dimensions || {});
    if (match.drawingPdf && !drawingPdf && !drawingPdfFile) {
      setDrawingPdf(match.drawingPdf);
    }
    if (!notes && match.notes) {
      setNotes(match.notes);
    }
  };

  const handlePictureChange = (file: File | null) => {
    setErrorMsg('');
    if (!file) return;
    try {
      validateFileSize(file);
      setPictureFile(file);
      setPicturePreview(URL.createObjectURL(file));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid file.');
    }
  };

  const handleDrawingPdfChange = (file: File | null) => {
    setErrorMsg('');
    if (!file) return;
    try {
      validateFileSize(file);
      setDrawingPdfFile(file);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Invalid file.');
    }
  };

  const handleAddAttachments = (files: FileList | null) => {
    setErrorMsg('');
    if (!files) return;
    const valid: File[] = [];
    for (const file of Array.from(files)) {
      try {
        validateFileSize(file);
        valid.push(file);
      } catch (err) {
        setErrorMsg(err instanceof Error ? err.message : 'File exceeds 10 MB.');
        return;
      }
    }
    setNewAttachmentFiles((prev) => [...prev, ...valid].slice(0, 15));
  };

  const validateCurrentStep = (): boolean => {
    setErrorMsg('');
    if (step === 1) {
      if (!name.trim()) {
        setErrorMsg('Part Name is required.');
        return false;
      }
      if (!partNumber.trim()) {
        setErrorMsg('Part Number is required.');
        return false;
      }
      if (!Number.isFinite(quantity) || quantity < 1) {
        setErrorMsg('Quantity must be at least 1.');
        return false;
      }
    }
    if (step === 2) {
      if (pathway === 'COTS' && vendorSelect === 'Other' && !customVendor.trim()) {
        setErrorMsg('Please enter the Vendor name.');
        return false;
      }
      if (pathway === 'In-House' && selectedMachines.length === 0) {
        setErrorMsg('Select at least one machine for an In-House part.');
        return false;
      }
      if (
        pathway === 'Outsourced' &&
        manufacturerSelect === 'Other' &&
        !customManufacturer.trim()
      ) {
        setErrorMsg('Please enter the Manufacturer name.');
        return false;
      }
    }
    if (step === 3 && pathway !== 'COTS') {
      if (materialSelect === 'Other' && !customMaterial.trim()) {
        setErrorMsg('Please enter the custom material name.');
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (!validateCurrentStep()) return;
    if (step === 2 && pathway === 'COTS') {
      // COTS skips material & drawing PDF step
      setStep(4);
      return;
    }
    setStep((s) => Math.min(4, s + 1));
  };

  const handleBack = () => {
    setErrorMsg('');
    if (step === 4 && pathway === 'COTS') {
      setStep(2);
      return;
    }
    setStep((s) => Math.max(1, s - 1));
  };

  const handleSave = async (addAnother = false) => {
    if (!validateCurrentStep()) return;
    setSaving(true);
    setErrorMsg('');
    try {
      let finalPictureUrl = pictureUrl;
      const uploadNamespace = `projects/${projectId}/subassemblies/${subassemblyId}/parts/${Date.now()}`;

      if (pictureFile) {
        const up = await uploadTeamFile(
          pictureFile,
          `${uploadNamespace}_pic_${pictureFile.name}`
        );
        finalPictureUrl = up.url;
      }

      let finalDrawingPdf = pathway === 'COTS' ? null : drawingPdf;
      if (pathway !== 'COTS' && drawingPdfFile) {
        finalDrawingPdf = await uploadTeamFile(
          drawingPdfFile,
          `${uploadNamespace}_drawing_${drawingPdfFile.name}`
        );
      }

      const uploadedExtras: StoredFileRef[] = [...attachedFiles];
      for (const file of newAttachmentFiles) {
        const up = await uploadTeamFile(
          file,
          `${uploadNamespace}_att_${file.name}`
        );
        uploadedExtras.push(up);
      }

      const type: PartType = pathway === 'COTS' ? 'COTS' : 'Custom';
      const source: PartSource =
        pathway === 'COTS'
          ? cotsPathway
          : pathway === 'Outsourced'
          ? 'Outsourced'
          : 'In-House';

      const vendor =
        pathway === 'COTS'
          ? vendorSelect === 'Other'
            ? customVendor.trim()
            : vendorSelect
          : '';

      const manufacturer =
        pathway === 'Outsourced'
          ? manufacturerSelect === 'Other'
            ? customManufacturer.trim()
            : manufacturerSelect
          : '';

      const resolvedMaterialName =
        pathway === 'COTS'
          ? ''
          : materialSelect === 'Other'
          ? customMaterial.trim()
          : materialSelect;

      let identicalGroupId = editingPart?.identicalGroupId || '';
      if (pathway !== 'COTS' && hasIdentical && identicalPartId) {
        const match = customPartsCandidates.find((p) => p.id === identicalPartId);
        if (match) {
          identicalGroupId = match.identicalGroupId || `grp_${match.id}`;
          if (!match.identicalGroupId) {
            await updatePart(projectId, match.subassemblyId, match.id, {
              identicalGroupId,
            });
          }
        }
      } else if (!hasIdentical) {
        identicalGroupId = '';
      }

      const cleanDims: StockDimensions =
        pathway !== 'COTS' && materialCategory === 'Stock Material' && stockShape
          ? {
              ...(dimensions.length ? { length: dimensions.length.trim() } : {}),
              ...(dimensions.width ? { width: dimensions.width.trim() } : {}),
              ...(dimensions.height ? { height: dimensions.height.trim() } : {}),
              ...(dimensions.thickness
                ? { thickness: dimensions.thickness.trim() }
                : {}),
              ...(dimensions.innerDiameter
                ? { innerDiameter: dimensions.innerDiameter.trim() }
                : {}),
              ...(dimensions.outerDiameter
                ? { outerDiameter: dimensions.outerDiameter.trim() }
                : {}),
            }
          : {};

      const payload = {
        name: name.trim(),
        partNumber: partNumber.trim(),
        quantity: Math.max(1, Math.floor(quantity)),
        type,
        source,
        vendor,
        manufacturer,
        costsMoney:
          pathway === 'Outsourced' ? costsMoney : pathway === 'COTS' && cotsPathway === 'Purchased',
        machines: pathway === 'In-House' ? selectedMachines : [],
        materialCategory: pathway === 'COTS' ? ('' as MaterialCategory) : materialCategory,
        materialName: resolvedMaterialName,
        stockShape:
          pathway !== 'COTS' && materialCategory === 'Stock Material'
            ? stockShape
            : ('' as StockShape),
        dimensions: cleanDims,
        pictureUrl: finalPictureUrl,
        drawingPdf: finalDrawingPdf,
        attachedFiles: uploadedExtras.slice(0, 15),
        identicalGroupId,
        notes: notes.trim(),
        // Status and workflow fields reset on edit or initialize on create
        status: 'Not Started' as const,
        priority: 'Regular Priority' as const,
        assignedMachinist: '',
        vendorLink: '',
        sparesRequested: 0,
        sparesCount: 0,
        totalMachined: 0,
        totalOrdered: 0,
        machinesUsed: [],
      };

      if (editingPart) {
        await updatePart(projectId, editingPart.subassemblyId, editingPart.id, payload);
        if (editingPart.pictureUrl && editingPart.pictureUrl !== finalPictureUrl) {
          await deleteTeamFileByUrl(editingPart.pictureUrl);
        }
        if (
          editingPart.drawingPdf &&
          editingPart.drawingPdf.storagePath !== finalDrawingPdf?.storagePath
        ) {
          await deleteTeamFile(
            editingPart.drawingPdf.storagePath,
            editingPart.drawingPdf.size
          );
        }
        const keptPaths = new Set(uploadedExtras.map((f) => f.storagePath));
        for (const oldFile of editingPart.attachedFiles || []) {
          if (!keptPaths.has(oldFile.storagePath)) {
            await deleteTeamFile(oldFile.storagePath, oldFile.size);
          }
        }
        pushToast(
          'success',
          `Updated "${payload.name}" (workflow status reset to Not Started).`
        );
        onClose();
      } else {
        await createPart(projectId, subassemblyId, payload);
        if (addAnother) {
          resetForm();
        } else {
          onClose();
        }
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save part.');
    } finally {
      setSaving(false);
    }
  };

  const toggleMachine = (machineName: string) => {
    setSelectedMachines((prev) =>
      prev.includes(machineName)
        ? prev.filter((m) => m !== machineName)
        : [...prev, machineName]
    );
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editingPart ? `Edit Part: ${editingPart.name}` : 'Add Part Wizard'}
      subtitle={
        editingPart
          ? 'Re-editing part properties resets status and previous requests.'
          : `Step ${step} of 4 · Answer each conditional question`
      }
      maxWidth="2xl"
    >
      <div className="space-y-5">
        {/* Progress Bar */}
        <div className="grid grid-cols-4 gap-2">
          {[1, 2, 3, 4].map((n) => {
            const skipped = n === 3 && pathway === 'COTS';
            const active = step === n;
            const completed = step > n && !skipped;
            return (
              <div
                key={n}
                className={`h-1.5 rounded-full transition-colors ${
                  skipped
                    ? 'bg-zinc-200 dark:bg-zinc-800 opacity-40'
                    : active
                    ? 'bg-red-600'
                    : completed
                    ? 'bg-emerald-500'
                    : 'bg-zinc-200 dark:bg-zinc-800'
                }`}
              />
            );
          })}
        </div>

        {/* Visual Part Preview Banner */}
        <div className="flex items-center gap-4 p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B]">
          <div className="w-16 h-16 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#131317] overflow-hidden flex items-center justify-center shrink-0">
            {picturePreview ? (
              <img
                src={picturePreview}
                alt={name || 'Part preview'}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <ImagePlus className="w-6 h-6 text-zinc-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
              {name.trim() || 'Untitled Part'}
            </div>
            <div className="text-xs font-mono-tabular text-zinc-500 dark:text-zinc-400">
              {partNumber.trim() || 'PN-TBD'} · Qty {quantity} · {pathway}
            </div>
          </div>
        </div>

        {/* STEP 1: Identity & Optional Picture */}
        {step === 1 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Part Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Shooter Side Plate"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Part Number
                </label>
                <input
                  type="text"
                  value={partNumber}
                  onChange={(e) => setPartNumber(e.target.value)}
                  placeholder="e.g., 451-SHT-001"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm font-mono-tabular"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Part Quantity
                </label>
                <input
                  type="number"
                  min={1}
                  max={100000}
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, Number(e.target.value)))}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm font-mono-tabular"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Optional Part Picture (max 10 MB)
                </label>
                <label className="flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-red-500 cursor-pointer text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-[#09090B]">
                  <Upload className="w-4 h-4 text-red-500" />
                  <span className="truncate">
                    {pictureFile ? pictureFile.name : 'Choose image file'}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    onChange={(e) =>
                      handlePictureChange(e.target.files?.[0] ?? null)
                    }
                  />
                </label>
              </div>
            </div>
          </div>
        ) : null}

        {/* STEP 2: COTS vs In-House vs Outsourced */}
        {step === 2 ? (
          <div className="space-y-5">
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                How is this part sourced?
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {(['In-House', 'Outsourced', 'COTS'] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setPathway(option)}
                    className={`py-2.5 px-3 rounded-lg border text-sm font-semibold transition-all active:scale-[0.98] ${
                      pathway === option
                        ? 'border-red-600 bg-red-600 text-white'
                        : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-zinc-700 dark:text-zinc-300 hover:border-zinc-400'
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            {/* COTS Branch */}
            {pathway === 'COTS' ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Vendor
                  </label>
                  <select
                    value={vendorSelect}
                    onChange={(e) => setVendorSelect(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
                  >
                    {COTS_VENDORS.map((v) => (
                      <option key={v} value={v}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                {vendorSelect === 'Other' ? (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Enter Vendor Name
                    </label>
                    <input
                      type="text"
                      value={customVendor}
                      onChange={(e) => setCustomVendor(e.target.value)}
                      placeholder="e.g., Thrifty Bot / Amazon"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
                    />
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Part Pathway
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    {(['Purchased', 'Inventory'] as const).map((pw) => (
                      <button
                        key={pw}
                        type="button"
                        onClick={() => setCotsPathway(pw)}
                        className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-all ${
                          cotsPathway === pw
                            ? 'border-red-600 bg-red-600/15 text-red-600 dark:text-red-400'
                            : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        {pw === 'Purchased' ? 'Needs to be Purchased' : 'In Inventory'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {/* In-House Branch */}
            {pathway === 'In-House' ? (
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Select Machines Used ({selectedMachines.length} selected)
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {machines.map((machine) => {
                    const checked = selectedMachines.includes(machine);
                    return (
                      <button
                        key={machine}
                        type="button"
                        onClick={() => toggleMachine(machine)}
                        className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs font-medium text-left transition-all ${
                          checked
                            ? 'border-red-600 bg-red-600/15 text-red-600 dark:text-red-400'
                            : 'border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] text-zinc-700 dark:text-zinc-300 hover:border-zinc-400'
                        }`}
                      >
                        <span className="truncate">{machine}</span>
                        {checked ? <Check className="w-3.5 h-3.5 shrink-0" /> : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* Outsourced Branch */}
            {pathway === 'Outsourced' ? (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Manufacturer
                  </label>
                  <select
                    value={manufacturerSelect}
                    onChange={(e) => setManufacturerSelect(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
                  >
                    {OUTSOURCED_MANUFACTURERS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>

                {manufacturerSelect === 'Other' ? (
                  <div className="space-y-1.5">
                    <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                      Enter Manufacturer Name
                    </label>
                    <input
                      type="text"
                      value={customManufacturer}
                      onChange={(e) => setCustomManufacturer(e.target.value)}
                      placeholder="e.g., OSH Cut / Local Shop"
                      className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
                    />
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Does it cost money to outsource?
                  </label>
                  <div className="grid grid-cols-2 gap-2.5">
                    {[true, false].map((val) => (
                      <button
                        key={String(val)}
                        type="button"
                        onClick={() => setCostsMoney(val)}
                        className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-all ${
                          costsMoney === val
                            ? 'border-red-600 bg-red-600/15 text-red-600 dark:text-red-400'
                            : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        {val ? 'Yes (Costs Money)' : 'No (Sponsor / Free)'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* STEP 3: Material, Dimensions, Drawing PDF, Files, Identical Part (Custom only) */}
        {step === 3 && pathway !== 'COTS' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Material Category
                </label>
                <select
                  value={materialCategory}
                  onChange={(e) => {
                    const cat = e.target.value as MaterialCategory;
                    setMaterialCategory(cat);
                    const nextList =
                      cat === '3D Printer Filaments'
                        ? FILAMENT_MATERIALS
                        : cat === 'Resin'
                        ? RESIN_MATERIALS
                        : STOCK_MATERIALS;
                    setMaterialSelect(nextList[0]);
                    setCustomMaterial('');
                    if (cat !== 'Stock Material') {
                      setStockShape('');
                      setDimensions({});
                    }
                  }}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
                >
                  <option value="3D Printer Filaments">3D Printer Filaments</option>
                  <option value="Resin">Resin</option>
                  <option value="Stock Material">Stock Material</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Material
                </label>
                <select
                  value={materialSelect}
                  onChange={(e) => setMaterialSelect(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
                >
                  {materialOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {materialSelect === 'Other' ? (
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Custom Material Name
                </label>
                <input
                  type="text"
                  value={customMaterial}
                  onChange={(e) => setCustomMaterial(e.target.value)}
                  placeholder="Enter material name"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
                />
              </div>
            ) : null}

            {/* Optional Stock Shape & Conditional Dimensions */}
            {materialCategory === 'Stock Material' ? (
              <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] space-y-3">
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Optional Stock Shape
                  </label>
                  <select
                    value={stockShape}
                    onChange={(e) => {
                      setStockShape(e.target.value as StockShape);
                      setDimensions({});
                    }}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#131317] text-sm"
                  >
                    <option value="">None / Not Specified</option>
                    {STOCK_SHAPES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>

                {stockShape === 'Box Tube' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {(
                      [
                        ['length', 'Length'],
                        ['width', 'Width'],
                        ['height', 'Height'],
                        ['thickness', 'Thickness'],
                      ] as const
                    ).map(([field, label]) => (
                      <div key={field} className="space-y-1">
                        <label className="text-[11px] font-medium text-zinc-500">
                          {label}
                        </label>
                        <input
                          type="text"
                          value={dimensions[field] || ''}
                          onChange={(e) =>
                            setDimensions((d) => ({ ...d, [field]: e.target.value }))
                          }
                          placeholder='e.g. 12"'
                          className="w-full px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#131317] text-xs font-mono-tabular"
                        />
                      </div>
                    ))}
                  </div>
                ) : null}

                {stockShape === 'Plate' ? (
                  <div className="grid grid-cols-3 gap-2.5">
                    {(
                      [
                        ['length', 'Length'],
                        ['width', 'Width'],
                        ['thickness', 'Thickness'],
                      ] as const
                    ).map(([field, label]) => (
                      <div key={field} className="space-y-1">
                        <label className="text-[11px] font-medium text-zinc-500">
                          {label}
                        </label>
                        <input
                          type="text"
                          value={dimensions[field] || ''}
                          onChange={(e) =>
                            setDimensions((d) => ({ ...d, [field]: e.target.value }))
                          }
                          placeholder='e.g. 0.25"'
                          className="w-full px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#131317] text-xs font-mono-tabular"
                        />
                      </div>
                    ))}
                  </div>
                ) : null}

                {stockShape === 'Tube' ? (
                  <div className="grid grid-cols-3 gap-2.5">
                    {(
                      [
                        ['length', 'Length'],
                        ['innerDiameter', 'Inner Diameter'],
                        ['outerDiameter', 'Outer Diameter'],
                      ] as const
                    ).map(([field, label]) => (
                      <div key={field} className="space-y-1">
                        <label className="text-[11px] font-medium text-zinc-500">
                          {label}
                        </label>
                        <input
                          type="text"
                          value={dimensions[field] || ''}
                          onChange={(e) =>
                            setDimensions((d) => ({ ...d, [field]: e.target.value }))
                          }
                          placeholder='e.g. 0.5"'
                          className="w-full px-2.5 py-1.5 rounded border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#131317] text-xs font-mono-tabular"
                        />
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Optional Drawing PDF & Files */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Optional Drawing PDF (max 10 MB)
                </label>
                <label className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-red-500 cursor-pointer text-xs font-medium bg-zinc-50 dark:bg-[#09090B]">
                  <Upload className="w-4 h-4 text-red-500 shrink-0" />
                  <span className="truncate">
                    {drawingPdfFile
                      ? drawingPdfFile.name
                      : drawingPdf
                      ? drawingPdf.name
                      : 'Upload Drawing PDF'}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    className="sr-only"
                    onChange={(e) =>
                      handleDrawingPdfChange(e.target.files?.[0] ?? null)
                    }
                  />
                </label>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Optional Attached Files (CAD / STEP / STL, max 10 MB each)
                </label>
                <label className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-red-500 cursor-pointer text-xs font-medium bg-zinc-50 dark:bg-[#09090B]">
                  <Paperclip className="w-4 h-4 text-red-500 shrink-0" />
                  <span>Add Files</span>
                  <input
                    type="file"
                    multiple
                    className="sr-only"
                    onChange={(e) => handleAddAttachments(e.target.files)}
                  />
                </label>
              </div>
            </div>

            {attachedFiles.length > 0 || newAttachmentFiles.length > 0 ? (
              <div className="space-y-1.5">
                {attachedFiles.map((f, idx) => (
                  <div
                    key={f.storagePath || f.name}
                    className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 text-xs"
                  >
                    <span className="truncate">
                      {f.name} ({formatFileSize(f.size)})
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setAttachedFiles((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="text-red-500 hover:text-red-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                {newAttachmentFiles.map((f, idx) => (
                  <div
                    key={`${f.name}-${idx}`}
                    className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-900 text-xs"
                  >
                    <span className="truncate">
                      {f.name} ({formatFileSize(f.size)})
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setNewAttachmentFiles((prev) =>
                          prev.filter((_, i) => i !== idx)
                        )
                      }
                      className="text-red-500 hover:text-red-400 p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            {/* Identical Part Combine */}
            {customPartsCandidates.length > 0 ? (
              <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] space-y-2.5">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    Is there an identical part already in this project?
                  </span>
                  <div className="flex items-center gap-2">
                    {[false, true].map((val) => (
                      <button
                        key={String(val)}
                        type="button"
                        onClick={() => setHasIdentical(val)}
                        className={`px-3 py-1 rounded text-xs font-semibold border ${
                          hasIdentical === val
                            ? 'border-red-600 bg-red-600 text-white'
                            : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        {val ? 'Yes' : 'No'}
                      </button>
                    ))}
                  </div>
                </div>

                {hasIdentical ? (
                  <select
                    value={identicalPartId}
                    onChange={(e) => handleIdenticalSelect(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#131317] text-xs"
                  >
                    <option value="">Select identical part to combine metadata...</option>
                    {customPartsCandidates.map((cand) => (
                      <option key={cand.id} value={cand.id}>
                        {cand.partNumber} — {cand.name}
                      </option>
                    ))}
                  </select>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* STEP 4: Optional Note */}
        {step === 4 ? (
          <div className="space-y-3">
            <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
              Optional Note for this Part
            </label>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add fabrication tips, tolerances, hardware sizes, or ordering notes..."
              className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
            />
          </div>
        ) : null}

        {errorMsg ? (
          <p className="text-xs font-medium text-red-600 dark:text-red-400">
            {errorMsg}
          </p>
        ) : null}

        {/* Footer Controls */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-200 dark:border-zinc-800">
          <div>
            {step > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
            >
              Cancel
            </button>

            {step < 4 ? (
              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold transition-all active:scale-[0.98]"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <>
                {!editingPart ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleSave(true)}
                    className="px-3.5 py-2 rounded-lg border border-red-600 text-red-600 dark:text-red-400 hover:bg-red-600/10 text-xs font-semibold transition-all active:scale-[0.98]"
                  >
                    {saving ? 'Saving...' : 'Save & Add Another'}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave(false)}
                  className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-xs font-semibold transition-all active:scale-[0.98]"
                >
                  {saving
                    ? 'Saving...'
                    : editingPart
                    ? 'Save Changes & Reset Status'
                    : 'Save Part'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
};
