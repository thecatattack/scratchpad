import React from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  MinusCircle,
  Truck,
  XCircle,
} from 'lucide-react';
import { PartPriority, PartStatus } from '../../types';

export const StatusLabel: React.FC<{ status: PartStatus }> = ({ status }) => {
  switch (status) {
    case 'Obtained':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Obtained</span>
        </span>
      );
    case 'In-Progress':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>In-Progress</span>
        </span>
      );
    case 'Shipping':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">
          <Truck className="w-3.5 h-3.5 shrink-0" />
          <span>Shipping</span>
        </span>
      );
    case 'Requested':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400 whitespace-nowrap">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span>Requested</span>
        </span>
      );
    case 'Denied':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 dark:text-red-400 whitespace-nowrap">
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Denied</span>
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
          <MinusCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Not Started</span>
        </span>
      );
  }
};

export const PriorityLabel: React.FC<{ priority: PartPriority }> = ({
  priority,
}) => {
  switch (priority) {
    case 'Critical Priority':
      return (
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600 dark:text-red-400 whitespace-nowrap">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>Critical Priority</span>
        </span>
      );
    case 'High Priority':
      return (
        <span className="text-xs font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">
          High Priority
        </span>
      );
    case 'Regular Priority':
      return (
        <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
          Regular Priority
        </span>
      );
    default:
      return (
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400 whitespace-nowrap">
          Low Priority
        </span>
      );
  }
};
