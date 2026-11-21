export const TEAM_PASSKEY = 'FRC451';
export const ADMIN_PASSKEY = 'CADisthebest451';
export const SPENDING_PASSKEY = 'RIP451budget';
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB per file
export const MAX_TOTAL_STORAGE_BYTES = 4 * 1024 * 1024 * 1024; // 4 GB cap (1 GB safety buffer under 5 GB Blaze free tier)
export const MAX_MONTHLY_UPLOADS = 4000; // 4,000/month cap (1,000 buffer under 5,000 free Class A ops)

export interface ModePasskeys {
  teamPasskey: string;
  spendingPasskey: string;
  adminPasskey: string;
}

export const DEFAULT_MODE_PASSKEYS: ModePasskeys = {
  teamPasskey: TEAM_PASSKEY,
  spendingPasskey: SPENDING_PASSKEY,
  adminPasskey: ADMIN_PASSKEY,
};

export interface StorageUsage {
  teamCode: 'FRC451';
  totalBytesUsed: number;
  fileCount: number;
  monthlyUploadsCount: number;
  monthKey: string;
}

export const DEFAULT_MACHINES: string[] = [
  'Hacksaw/Jigsaw',
  'Bandsaw',
  'Hand Drill',
  'Drill Press',
  'Belt Sander',
  'Mill',
  'Lathe',
  'CNC',
  'Sandblaster',
  'Tap',
  'Press Brake',
];

export const COTS_VENDORS: string[] = [
  'AndyMark',
  'WCP',
  'McMaster-Carr',
  'REV',
  'CTRE',
  'SDS',
  'TTB',
  'Swyft',
  'Other',
];

export const OUTSOURCED_MANUFACTURERS: string[] = [
  'Formlabs',
  'Dana Printers',
  'Send-cut-send',
  'Fabworks',
  'Other',
];

export const FILAMENT_MATERIALS: string[] = [
  'Onyx/PA6-CF',
  'PC',
  'PETG',
  'PLA',
  '72D TPU',
  'Normal TPU',
  'Other',
];

export const RESIN_MATERIALS: string[] = [
  'Standard Resin',
  'Engineering Resin',
  'Other',
];

export const STOCK_MATERIALS: string[] = [
  'Polycarbonate',
  'SRPP',
  'Aluminum 6061',
  'Aluminum 7075',
  'Aluminum 5052',
  'Other',
];

export interface CatalogLists {
  vendors: string[];
  outsourcers: string[];
  filamentMaterials: string[];
  resinMaterials: string[];
  stockMaterials: string[];
}

export const DEFAULT_CATALOG_LISTS: CatalogLists = {
  vendors: COTS_VENDORS,
  outsourcers: OUTSOURCED_MANUFACTURERS,
  filamentMaterials: FILAMENT_MATERIALS,
  resinMaterials: RESIN_MATERIALS,
  stockMaterials: STOCK_MATERIALS,
};

export const STOCK_SHAPES: StockShape[] = ['Box Tube', 'Plate', 'Tube'];

export const PRIORITIES: PartPriority[] = [
  'Low Priority',
  'Regular Priority',
  'High Priority',
  'Critical Priority',
];

export type PartType = 'Custom' | 'COTS';
export type PartSource = 'In-House' | 'Outsourced' | 'Purchased' | 'Inventory';
export type MaterialCategory = '' | '3D Printer Filaments' | 'Resin' | 'Stock Material';
export type StockShape = '' | 'Box Tube' | 'Plate' | 'Tube';
export type PartStatus =
  | 'Not Started'
  | 'Requested'
  | 'Needs Drawing'
  | 'Needs CAM'
  | 'Ready for Machine'
  | 'In-Progress'
  | 'Denied'
  | 'Shipping'
  | 'Obtained';
export type PartPriority =
  | 'Low Priority'
  | 'Regular Priority'
  | 'High Priority'
  | 'Critical Priority';

export interface StockDimensions {
  length?: string;
  width?: string;
  height?: string;
  thickness?: string;
  innerDiameter?: string;
  outerDiameter?: string;
}

export interface StoredFileRef {
  name: string;
  size: number;
  url: string;
  storagePath: string;
  contentType?: string;
}

export interface Project {
  id: string;
  teamCode: 'FRC451';
  name: string;
  description?: string;
  coverImageUrl: string;
  editorPassword: string;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Subassembly {
  id: string;
  projectId: string;
  teamCode: 'FRC451';
  name: string;
  assemblyNumber: string;
  createdBy: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Part {
  id: string;
  projectId: string;
  subassemblyId: string;
  teamCode: 'FRC451';
  name: string;
  partNumber: string;
  revision?: string;
  quantity: number;
  type: PartType;
  source: PartSource;
  vendor: string;
  manufacturer: string;
  costsMoney: boolean;
  machines: string[];
  materialCategory: MaterialCategory;
  materialName: string;
  stockShape: StockShape;
  dimensions: StockDimensions;
  pictureUrl: string;
  drawingPdf: StoredFileRef | null;
  attachedFiles: StoredFileRef[];
  identicalGroupId: string;
  notes: string;
  status: PartStatus;
  priority: PartPriority;
  assignedMachinist: string;
  vendorLink: string;
  price?: number | null;
  sparesRequested: number;
  sparesCount: number;
  totalMachined: number;
  totalOrdered: number;
  machinesUsed: string[];
  machiningNotes?: string;
  createdBy: string;
  createdByName?: string;
  updatedBy?: string;
  updatedByName?: string;
  requestedBy?: string;
  requestedByName?: string;
  requestedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AggregatedPart extends Part {
  isAggregated: boolean;
  sourceParts: Array<{
    subassemblyId: string;
    subassemblyName: string;
    assemblyNumber: string;
    part: Part;
  }>;
}

export type AppMode =
  | 'gate'
  | 'modes'
  | 'bom'
  | 'parts-manager'
  | 'machining'
  | 'spending'
  | 'admin';

export type ProjectTab = 'bom' | 'in-house' | 'purchased' | 'outsourced' | 'spares';
