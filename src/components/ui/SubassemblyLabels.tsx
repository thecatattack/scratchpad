import React from 'react';
import { AggregatedPart } from '../../types';

interface SubassemblyLabelsProps {
  part: AggregatedPart;
  compact?: boolean;
  inTable?: boolean;
}

export const SubassemblyLabels: React.FC<SubassemblyLabelsProps> = ({
  part,
  compact = false,
  inTable = false,
}) => {
  const entries = React.useMemo(() => {
    const bySub = new Map<
      string,
      { subassemblyId: string; assemblyNumber: string; subassemblyName: string; qty: number }
    >();
    for (const ref of part.sourceParts) {
      const existing = bySub.get(ref.subassemblyId);
      if (existing) {
        existing.qty += ref.part.quantity || 0;
      } else {
        bySub.set(ref.subassemblyId, {
          subassemblyId: ref.subassemblyId,
          assemblyNumber: ref.assemblyNumber,
          subassemblyName: ref.subassemblyName,
          qty: ref.part.quantity || 0,
        });
      }
    }
    return Array.from(bySub.values());
  }, [part.sourceParts]);

  if (entries.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-1 ${inTable ? '' : compact ? 'mt-1' : 'mt-1'}`}>
      {entries.map((entry) => {
        const title = entry.assemblyNumber
          ? `${entry.assemblyNumber} · ${entry.subassemblyName}`
          : entry.subassemblyName;
        return (
          <span
            key={entry.subassemblyId}
            className="inline-flex items-center px-1.5 py-0.5 rounded border border-zinc-200 dark:border-zinc-700/80 bg-zinc-100 dark:bg-zinc-900 text-[10px] font-medium text-zinc-700 dark:text-zinc-300 leading-tight"
          >
            {title}
            {entries.length > 1 ? ` (×${entry.qty})` : ''}
          </span>
        );
      })}
    </div>
  );
};
