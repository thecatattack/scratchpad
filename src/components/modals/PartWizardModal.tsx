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
  PRIORITIES,
  Part,
  PartPriority,
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
  const [revision, setRevision] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [pictureUrl, setPictureUrl] = useState('');
  const [pictureFile, setPictureFile] = useState<File | null>(null);
  const [picturePreview, setPicturePreview] = useState('');

  // Step 2: Pathway (COTS / In-House / Outsourced)
  const [pathway, setPathway] = useState<'COTS' | 'In-House' | 'Outsourced'>('In-House');
  const [cotsPathway, setCotsPathway] = useState<'Purchased' | 'Inventory' | 'Split'>('Purchased');
  const [inventoryQty, setInventoryQty] = useState(1);
  const [sparesToPurchase, setSparesToPurchase] = useState(0);
  const [splitVendorLink, setSplitVendorLink] = useState('');
  const [sendSplitRequestNow, setSendSplitRequestNow] = useState(true);
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

  // Step 4: Priority & Notes
  const [priority, setPriority] = useState<PartPriority>('Regular Priority');
  const [notes, setNotes] = useState('');

  const resetForm = () => {
    setStep(1);
    setErrorMsg('');
    setName('');
    setPartNumber('');
    setRevision('');
    setQuantity(1);
    setPictureUrl('');
    setPictureFile(null);
    setPicturePreview('');
    setPathway('In-House');
    setCotsPathway('Purchased');
    setInventoryQty(1);
    setSparesToPurchase(0);
    setSplitVendorLink('');
    setSendSplitRequestNow(true);
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
    setPriority('Regular Priority');
    setNotes('');
  };

  useEffect(() => {
    if (!open) return;
    if (editingPart) {
      setStep(1);
      setErrorMsg('');
      setName(editingPart.name);
      setPartNumber(editingPart.partNumber);
      setRevision(editingPart.revision || '');
      setQuantity(editingPart.quantity);
      setPictureUrl(editingPart.pictureUrl || '');
      setPictureFile(null);
      setPicturePreview(editingPart.pictureUrl || '');

      if (editingPart.type === 'COTS') {
        setPathway('COTS');
        if (editingPart.source === 'Inventory' && (editingPart.sparesRequested || 0) > 0) {
          setCotsPathway('Split');
          setInventoryQty(editingPart.quantity);
          setSparesToPurchase(editingPart.sparesRequested);
          setSplitVendorLink(editingPart.vendorLink || '');
          setSendSplitRequestNow(true);
        } else {
          setCotsPathway(
            editingPart.source === 'Inventory' ? 'Inventory' : 'Purchased'
          );
          setInventoryQty(Math.max(1, editingPart.quantity > 1 ? editingPart.quantity - 1 : 1));
          setSparesToPurchase(editingPart.sparesRequested || 0);
          setSplitVendorLink(editingPart.vendorLink || '');
          setSendSplitRequestNow(true);
        }
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
      setPriority(editingPart.priority || 'Regular Priority');
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
    if (!revision.trim() && match.revision) {
      setRevision(match.revision);
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
      if (pathway === 'COTS' && cotsPathway === 'Split') {
        const totalQty = Math.max(1, Math.floor(quantity));
        const invQty = Math.floor(inventoryQty);
        const sparesQty = Math.floor(sparesToPurchase);
        if (!Number.isFinite(invQty) || invQty < 1 || invQty > totalQty) {
          setErrorMsg(
            `Quantity in Inventory must be between 1 and ${totalQty}.`
          );
          return false;
        }
        if (!Number.isFinite(sparesQty) || sparesQty < 0) {
          setErrorMsg('Spares to purchase cannot be negative.');
          return false;
        }
        const purchaseBomQty = totalQty - invQty;
        if (purchaseBomQty === 0 && sparesQty < 1) {
          setErrorMsg(
            'Since all BOM quantity is in inventory, enter at least 1 spare to purchase (or choose "In Inventory").'
          );
          return false;
        }
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

      const sanitizeFileRef = (f: StoredFileRef): StoredFileRef => ({
        name: (f.name || 'file').slice(0, 200),
        size: Math.max(0, Math.min(10485760, Math.round(f.size || 0))),
        url: (f.url || '').slice(0, 2000),
        storagePath: (f.storagePath || '').slice(0, 500),
        ...(f.contentType ? { contentType: f.contentType.slice(0, 120) } : {}),
      });

      const rawDrawingPdf = pathway === 'COTS' ? null : drawingPdf;
      let finalDrawingPdf: StoredFileRef | null = rawDrawingPdf
        ? sanitizeFileRef(rawDrawingPdf)
        : null;
      if (pathway !== 'COTS' && drawingPdfFile) {
        finalDrawingPdf = sanitizeFileRef(
          await uploadTeamFile(
            drawingPdfFile,
            `${uploadNamespace}_drawing_${drawingPdfFile.name}`
          )
        );
      }

      const uploadedExtras: StoredFileRef[] = attachedFiles.map(sanitizeFileRef);
      for (const file of newAttachmentFiles) {
        const up = await uploadTeamFile(
          file,
          `${uploadNamespace}_att_${file.name}`
        );
        uploadedExtras.push(sanitizeFileRef(up));
      }

      const totalQty = Math.min(100000, Math.max(1, Math.floor(quantity)));
      const isSplitCots = pathway === 'COTS' && cotsPathway === 'Split';
      const clampedInvQty = isSplitCots
        ? Math.max(1, Math.min(totalQty, Math.floor(inventoryQty)))
        : 0;
      const purchaseBomQty = isSplitCots ? Math.max(0, totalQty - clampedInvQty) : 0;
      const cleanSparesToBuy = isSplitCots
        ? Math.min(10000, Math.max(0, Math.floor(sparesToPurchase)))
        : 0;

      const type: PartType = pathway === 'COTS' ? 'COTS' : 'Custom';
      const singleCotsSource: PartSource =
        cotsPathway === 'Inventory' ? 'Inventory' : 'Purchased';
      const source: PartSource =
        pathway === 'COTS'
          ? singleCotsSource
          : pathway === 'Outsourced'
          ? 'Outsourced'
          : 'In-House';

      const vendor = (
        pathway === 'COTS'
          ? vendorSelect === 'Other'
            ? customVendor.trim()
            : vendorSelect
          : ''
      ).slice(0, 80);

      const manufacturer = (
        pathway === 'Outsourced'
          ? manufacturerSelect === 'Other'
            ? customManufacturer.trim()
            : manufacturerSelect
          : ''
      ).slice(0, 80);

      const resolvedMaterialName = (
        pathway === 'COTS'
          ? ''
          : materialSelect === 'Other'
          ? customMaterial.trim()
          : materialSelect
      ).slice(0, 80);

      let identicalGroupId = (editingPart?.identicalGroupId || '').slice(0, 128);
      if (pathway !== 'COTS' && hasIdentical && identicalPartId) {
        const match = customPartsCandidates.find((p) => p.id === identicalPartId);
        if (match) {
          identicalGroupId = (match.identicalGroupId || `grp_${match.id}`).slice(0, 128);
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
              ...(dimensions.length ? { length: dimensions.length.trim().slice(0, 30) } : {}),
              ...(dimensions.width ? { width: dimensions.width.trim().slice(0, 30) } : {}),
              ...(dimensions.height ? { height: dimensions.height.trim().slice(0, 30) } : {}),
              ...(dimensions.thickness
                ? { thickness: dimensions.thickness.trim().slice(0, 30) }
                : {}),
              ...(dimensions.innerDiameter
                ? { innerDiameter: dimensions.innerDiameter.trim().slice(0, 30) }
                : {}),
              ...(dimensions.outerDiameter
                ? { outerDiameter: dimensions.outerDiameter.trim().slice(0, 30) }
                : {}),
            }
          : {};

      const basePayload = {
        name: name.trim().slice(0, 120),
        partNumber: partNumber.trim().slice(0, 60),
        revision: pathway === 'COTS' ? '' : revision.trim().slice(0, 20),
        quantity: totalQty,
        type,
        source,
        vendor,
        manufacturer,
        costsMoney:
          pathway === 'Outsourced'
            ? costsMoney
            : pathway === 'COTS' && cotsPathway === 'Purchased',
        machines:
          pathway === 'In-House'
            ? selectedMachines.slice(0, 25).map((m) => m.slice(0, 60))
            : [],
        materialCategory: pathway === 'COTS' ? ('' as MaterialCategory) : materialCategory,
        materialName: resolvedMaterialName,
        stockShape:
          pathway !== 'COTS' && materialCategory === 'Stock Material'
            ? stockShape
            : ('' as StockShape),
        dimensions: cleanDims,
        pictureUrl: (finalPictureUrl || '').slice(0, 2000),
        drawingPdf: finalDrawingPdf,
        attachedFiles: uploadedExtras.slice(0, 15),
        identicalGroupId,
        notes: notes.trim().slice(0, 2000),
        // Status and workflow fields reset on edit or initialize on create
        status:
          pathway === 'COTS' && cotsPathway === 'Inventory'
            ? ('Obtained' as const)
            : ('Not Started' as const),
        priority,
        assignedMachinist: '',
        vendorLink: '',
        sparesRequested: 0,
        sparesCount: 0,
        totalMachined: 0,
        totalOrdered: 0,
        machinesUsed: [],
        machiningNotes: '',
      };

      const cleanupReplacedEditingFiles = async () => {
        if (!editingPart) return;
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
      };

      if (isSplitCots && purchaseBomQty === 0) {
        // All BOM units are in inventory, purchasing spares only
        const sparesOnlyPayload = {
          ...basePayload,
          quantity: totalQty,
          source: 'Inventory' as PartSource,
          costsMoney: true,
          status: 'Obtained' as const,
          vendorLink: splitVendorLink.trim().slice(0, 1000),
          sparesRequested: cleanSparesToBuy,
        };
        if (editingPart) {
          await updatePart(
            projectId,
            editingPart.subassemblyId,
            editingPart.id,
            sparesOnlyPayload
          );
          await cleanupReplacedEditingFiles();
          pushToast(
            'success',
            `Updated "${sparesOnlyPayload.name}" (${totalQty} in inventory, ${cleanSparesToBuy} spares requested).`
          );
          onClose();
        } else {
          await createPart(projectId, subassemblyId, sparesOnlyPayload);
          if (addAnother) {
            resetForm();
          } else {
            onClose();
          }
        }
      } else if (isSplitCots && purchaseBomQty > 0) {
        // Split across Inventory portion (already in stock) + Purchased portion (needs buying + optional spares)
        const inventoryPayload = {
          ...basePayload,
          quantity: clampedInvQty,
          source: 'Inventory' as PartSource,
          costsMoney: false,
          status: 'Obtained' as const,
          vendorLink: '',
          sparesRequested: 0,
        };
        const purchasedPayload = {
          ...basePayload,
          quantity: purchaseBomQty,
          source: 'Purchased' as PartSource,
          costsMoney: true,
          status: sendSplitRequestNow
            ? ('Requested' as const)
            : ('Not Started' as const),
          vendorLink: splitVendorLink.trim().slice(0, 1000),
          sparesRequested: cleanSparesToBuy,
        };

        if (editingPart) {
          const targetSubId = editingPart.subassemblyId;
          await updatePart(projectId, targetSubId, editingPart.id, inventoryPayload);
          await createPart(projectId, targetSubId, purchasedPayload);
          await cleanupReplacedEditingFiles();
          pushToast(
            'success',
            `Split "${basePayload.name}": ${clampedInvQty} in inventory + ${purchaseBomQty} to purchase${
              cleanSparesToBuy > 0 ? ` (+${cleanSparesToBuy} spares)` : ''
            }.`
          );
          onClose();
        } else {
          await createPart(projectId, subassemblyId, inventoryPayload);
          await createPart(projectId, subassemblyId, purchasedPayload);
          if (addAnother) {
            resetForm();
          } else {
            onClose();
          }
        }
      } else if (editingPart) {
        await updatePart(projectId, editingPart.subassemblyId, editingPart.id, basePayload);
        await cleanupReplacedEditingFiles();
        pushToast(
          'success',
          `Updated "${basePayload.name}" (workflow status reset to ${basePayload.status}).`
        );
        onClose();
      } else {
        await createPart(projectId, subassemblyId, basePayload);
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
              {partNumber.trim() || 'PN-TBD'}
              {pathway !== 'COTS' && revision.trim()
                ? ` · Rev ${revision.trim()}`
                : ''}{' '}
              · Qty {quantity} · {pathway}
            </div>
          </div>
          {picturePreview ? (
            <button
              type="button"
              onClick={() => {
                setPictureFile(null);
                setPicturePreview('');
                setPictureUrl('');
              }}
              title="Delete attached picture"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10 text-xs font-semibold shrink-0"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remove Pic</span>
            </button>
          ) : null}
        </div>

        {/* STEP 1: Identity & Optional Picture */}
        {step === 1 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
              <div className="sm:col-span-5 space-y-1.5">
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

              <div className="sm:col-span-4 space-y-1.5">
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

              <div className="sm:col-span-3 space-y-1.5">
                <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  Revision (Optional)
                </label>
                <input
                  type="text"
                  maxLength={20}
                  value={revision}
                  onChange={(e) => setRevision(e.target.value)}
                  placeholder="e.g., A"
                  title="Optional revision (displayed for Custom parts)"
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
                <div className="flex items-center gap-2">
                  <label className="flex-1 min-w-0 flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-red-500 cursor-pointer text-xs font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-[#09090B]">
                    <Upload className="w-4 h-4 text-red-500 shrink-0" />
                    <span className="truncate">
                      {pictureFile
                        ? pictureFile.name
                        : picturePreview
                        ? 'Replace image'
                        : 'Choose image file'}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => {
                        handlePictureChange(e.target.files?.[0] ?? null);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {picturePreview ? (
                    <button
                      type="button"
                      onClick={() => {
                        setPictureFile(null);
                        setPicturePreview('');
                        setPictureUrl('');
                      }}
                      title="Delete part picture"
                      className="px-3 py-2.5 rounded-lg border border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-500/10 text-xs font-semibold shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  ) : null}
                </div>
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
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {(
                      [
                        ['Purchased', 'All Need Purchase'],
                        ['Inventory', 'All in Inventory'],
                        ['Split', 'Split: Inventory + Buy'],
                      ] as const
                    ).map(([pw, label]) => (
                      <button
                        key={pw}
                        type="button"
                        onClick={() => {
                          setCotsPathway(pw);
                          if (pw === 'Split') {
                            const totalQty = Math.max(1, Math.floor(quantity));
                            const defaultInv =
                              totalQty > 1
                                ? Math.min(totalQty, Math.max(1, inventoryQty))
                                : 1;
                            setInventoryQty(defaultInv);
                            if (defaultInv === totalQty && sparesToPurchase < 1) {
                              setSparesToPurchase(1);
                            }
                          }
                        }}
                        className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-all ${
                          cotsPathway === pw
                            ? 'border-red-600 bg-red-600/15 text-red-600 dark:text-red-400'
                            : 'border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {cotsPathway === 'Split' ? (() => {
                  const totalQty = Math.max(1, Math.floor(quantity));
                  const clampedInv = Math.max(
                    1,
                    Math.min(totalQty, Math.floor(inventoryQty || 1))
                  );
                  const purchaseBomQty = Math.max(0, totalQty - clampedInv);
                  const sparesQty = Math.max(0, Math.floor(sparesToPurchase || 0));
                  const totalToBuy = purchaseBomQty + sparesQty;

                  return (
                    <div className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-[#09090B] space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                            Quantity Already in Inventory
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={totalQty}
                            value={inventoryQty}
                            onChange={(e) => {
                              const nextInv = Math.max(
                                1,
                                Math.min(totalQty, Number(e.target.value) || 1)
                              );
                              setInventoryQty(nextInv);
                              if (nextInv === totalQty && sparesToPurchase < 1) {
                                setSparesToPurchase(1);
                              }
                            }}
                            className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#131317] text-sm font-mono-tabular"
                          />
                          <p className="text-[11px] text-zinc-500">
                            Max {totalQty} (BOM qty). Set to {totalQty} if buying spares only.
                          </p>
                        </div>

                        <div className="space-y-1">
                          <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                            Extra Spares to Purchase
                          </label>
                          <input
                            type="number"
                            min={purchaseBomQty === 0 ? 1 : 0}
                            max={10000}
                            value={sparesToPurchase}
                            onChange={(e) =>
                              setSparesToPurchase(
                                Math.max(0, Number(e.target.value) || 0)
                              )
                            }
                            className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#131317] text-sm font-mono-tabular"
                          />
                          <p className="text-[11px] text-zinc-500">
                            {purchaseBomQty === 0
                              ? 'At least 1 spare required when all BOM qty is in inventory.'
                              : 'Optional extra spares to include in the purchase.'}
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-white dark:bg-[#131317] border border-zinc-200 dark:border-zinc-800 text-xs">
                        <div>
                          <div className="text-[11px] text-zinc-500">In Inventory</div>
                          <div className="font-mono-tabular font-bold text-emerald-600 dark:text-emerald-400">
                            {clampedInv}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-zinc-500">Buy for BOM</div>
                          <div className="font-mono-tabular font-bold text-zinc-900 dark:text-white">
                            {purchaseBomQty}
                          </div>
                        </div>
                        <div>
                          <div className="text-[11px] text-zinc-500">Total to Buy</div>
                          <div className="font-mono-tabular font-bold text-red-600 dark:text-red-400">
                            {totalToBuy}
                            {sparesQty > 0 ? ` (${sparesQty} spares)` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                          Vendor Website Link (Optional)
                        </label>
                        <input
                          type="url"
                          value={splitVendorLink}
                          onChange={(e) => setSplitVendorLink(e.target.value)}
                          placeholder="https://www.andymark.com/..."
                          className="w-full px-3 py-2 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#131317] text-xs"
                        />
                      </div>

                      {purchaseBomQty > 0 ? (
                        <label className="flex items-center gap-2 text-xs text-zinc-700 dark:text-zinc-300 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={sendSplitRequestNow}
                            onChange={(e) => setSendSplitRequestNow(e.target.checked)}
                            className="rounded border-zinc-400 text-red-600 focus:ring-red-500"
                          />
                          <span>
                            Send purchase request ({purchaseBomQty} BOM
                            {sparesQty > 0 ? ` + ${sparesQty} spares` : ''}) to Spending Manager immediately
                          </span>
                        </label>
                      ) : (
                        <p className="text-[11px] text-zinc-600 dark:text-zinc-400">
                          All {totalQty} BOM units will be recorded as In Inventory (Obtained), and {sparesQty} spare{sparesQty === 1 ? '' : 's'} will be sent to Spending Manager.
                        </p>
                      )}
                    </div>
                  );
                })() : null}
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

        {/* STEP 4: Priority & Optional Note */}
        {step === 4 ? (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                Part Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as PartPriority)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-[#09090B] text-sm"
              >
                {PRIORITIES.map((pr) => (
                  <option key={pr} value={pr}>
                    {pr}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
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
