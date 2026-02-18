"use client";

import { Badge } from '@/components/ui/badge';
import { Clock, Play, Pause } from 'lucide-react';

interface AutomationStatusBadgeProps {
  status: 'draft' | 'live' | 'not_in_use';
  isScheduled?: boolean;
  scheduleEnabled?: boolean;
  className?: string;
}

export function AutomationStatusBadge({ 
  status, 
  isScheduled = false, 
  scheduleEnabled = false,
  className = "" 
}: AutomationStatusBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'live':
        return {
          label: 'Live',
          variant: 'default' as const,
          className: 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
        };
      case 'draft':
        return {
          label: 'Draft',
          variant: 'secondary' as const,
          className: 'bg-yellow-100 text-yellow-800 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800'
        };
      case 'not_in_use':
        return {
          label: 'Not in Use',
          variant: 'outline' as const,
          className: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700 text-nowrap'
        };
      default:
        return {
          label: 'Unknown',
          variant: 'outline' as const,
          className: 'bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-700'
        };
    }
  };

  const statusConfig = getStatusConfig();

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Badge 
        variant={statusConfig.variant}
        className={statusConfig.className}
      >
        {statusConfig.label}
      </Badge>
      
      {isScheduled && (
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {scheduleEnabled ? (
            <Play className="w-2 h-2 text-green-600" />
          ) : (
            <Pause className="w-2 h-2 text-red-600" />
          )}
        </div>
      )}
    </div>
  );
}
