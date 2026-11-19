import {
  AggregatedPart,
  Part,
  PartPriority,
  PartStatus,
  StoredFileRef,
  Subassembly,
} from '../types';

import { toMillis } from './dateFormat';

const PRIORITY_RANK: Record<PartPriority, number> = {
  'Low Priority': 1,
  'Regular Priority': 2,
  'High Priority': 3,
  'Critical Priority': 4,
};

function combineStatus(statuses: PartStatus[]): PartStatus {
  if (statuses.length === 0) return 'Not Started';
  const unique = Array.from(new Set(statuses));
  if (unique.length === 1) return unique[0];
  if (unique.includes('Denied')) return 'Denied';
  if (unique.includes('In-Progress')) return 'In-Progress';
  if (unique.includes('Shipping')) return 'Shipping';
  if (unique.includes('Ready for Machine')) return 'Ready for Machine';
  if (unique.includes('Needs CAM')) return 'Needs CAM';
  if (unique.includes('Needs Drawing')) return 'Needs Drawing';
  if (unique.includes('Requested')) return 'Requested';
  if (unique.includes('Obtained') && unique.includes('Not Started')) return 'In-Progress';
  return unique[0];
}

function combinePriority(priorities: PartPriority[]): PartPriority {
  if (priorities.length === 0) return 'Regular Priority';
  return priorities.reduce((highest, current) =>
    PRIORITY_RANK[current] > PRIORITY_RANK[highest] ? current : highest
  );
}

function dedupeFiles(files: StoredFileRef[]): StoredFileRef[] {
  const seen = new Set<string>();
  const result: StoredFileRef[] = [];
  for (const f of files) {
    const key = f.storagePath || f.url || `${f.name}-${f.size}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(f);
    }
  }
  return result;
}

export function buildSubassemblyViewParts(
  parts: Part[],
  subassembly: Subassembly
): AggregatedPart[] {
  return parts.map((p) => ({
    ...p,
    isAggregated: false,
    sourceParts: [
      {
        subassemblyId: subassembly.id,
        subassemblyName: subassembly.name,
        assemblyNumber: subassembly.assemblyNumber,
        part: p,
      },
    ],
  }));
}

export function buildFlattenedMainParts(
  allParts: Part[],
  subassemblies: Subassembly[]
): AggregatedPart[] {
  const subMap = new Map(subassemblies.map((s) => [s.id, s]));
  const groups = new Map<string, Part[]>();

  for (const part of allParts) {
    const key = part.identicalGroupId
      ? `group:${part.identicalGroupId}`
      : `pn:${part.partNumber.trim().toLowerCase()}::${part.type}::${part.source}`;
    const existing = groups.get(key);
    if (existing) {
      existing.push(part);
    } else {
      groups.set(key, [part]);
    }
  }

  const aggregated: AggregatedPart[] = [];

  for (const group of groups.values()) {
    const primary = group[0];
    const sourceParts = group.map((p) => {
      const sub = subMap.get(p.subassemblyId);
      return {
        subassemblyId: p.subassemblyId,
        subassemblyName: sub?.name ?? 'Subassembly',
        assemblyNumber: sub?.assemblyNumber ?? '',
        part: p,
      };
    });

    const totalQty = group.reduce((sum, p) => sum + (p.quantity || 0), 0);
    const totalSparesReq = group.reduce((sum, p) => sum + (p.sparesRequested || 0), 0);
    const totalSparesCount = group.reduce((sum, p) => sum + (p.sparesCount || 0), 0);
    const totalMachined = group.reduce((sum, p) => sum + (p.totalMachined || 0), 0);
    const totalOrdered = group.reduce((sum, p) => sum + (p.totalOrdered || 0), 0);

    const machines = Array.from(new Set(group.flatMap((p) => p.machines || [])));
    const machinesUsed = Array.from(new Set(group.flatMap((p) => p.machinesUsed || [])));
    const attachedFiles = dedupeFiles(group.flatMap((p) => p.attachedFiles || []));
    const drawingPdf = group.find((p) => p.drawingPdf)?.drawingPdf ?? null;
    const pictureUrl = group.find((p) => p.pictureUrl)?.pictureUrl ?? '';
    const notes = Array.from(
      new Set(group.map((p) => p.notes?.trim()).filter(Boolean))
    ).join('\n---\n');
    const machiningNotes = Array.from(
      new Set(group.map((p) => p.machiningNotes?.trim()).filter(Boolean))
    ).join('\n---\n');
    const assignedMachinist = Array.from(
      new Set(group.map((p) => p.assignedMachinist?.trim()).filter(Boolean))
    ).join(', ');
    const revision = Array.from(
      new Set(group.map((p) => p.revision?.trim()).filter(Boolean))
    ).join(', ');
    const vendorLink = group.find((p) => p.vendorLink)?.vendorLink ?? '';

    const earliestCreated = group.reduce((earliest, p) => {
      const eMs = toMillis(earliest.createdAt);
      const pMs = toMillis(p.createdAt);
      if (!eMs) return p;
      if (pMs && pMs < eMs) return p;
      return earliest;
    }, primary);

    const latestUpdated = group.reduce((latest, p) => {
      const lMs = toMillis(latest.updatedAt);
      const pMs = toMillis(p.updatedAt);
      return pMs >= lMs ? p : latest;
    }, primary);

    const requestedGroup = group.filter(
      (p) => Boolean(p.requestedAt) || Boolean(p.requestedByName) || Boolean(p.requestedBy)
    );
    const latestRequested =
      requestedGroup.length > 0
        ? requestedGroup.reduce((latest, p) =>
            toMillis(p.requestedAt) >= toMillis(latest.requestedAt) ? p : latest
          )
        : null;

    aggregated.push({
      ...primary,
      revision,
      quantity: totalQty,
      sparesRequested: totalSparesReq,
      sparesCount: totalSparesCount,
      totalMachined,
      totalOrdered,
      machines,
      machinesUsed,
      attachedFiles,
      drawingPdf,
      pictureUrl,
      notes,
      machiningNotes,
      assignedMachinist,
      vendorLink,
      createdBy: earliestCreated.createdBy,
      createdByName: earliestCreated.createdByName,
      createdAt: earliestCreated.createdAt,
      updatedBy: latestUpdated.updatedBy,
      updatedByName: latestUpdated.updatedByName,
      updatedAt: latestUpdated.updatedAt,
      requestedBy: latestRequested?.requestedBy || '',
      requestedByName: latestRequested?.requestedByName || '',
      requestedAt: latestRequested?.requestedAt ?? null,
      status: combineStatus(group.map((p) => p.status)),
      priority: combinePriority(group.map((p) => p.priority)),
      costsMoney: group.some((p) => p.costsMoney),
      isAggregated: group.length > 1,
      sourceParts,
    });
  }

  return aggregated.sort((a, b) => a.partNumber.localeCompare(b.partNumber));
}
