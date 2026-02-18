import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { Play, Pause, Trash2, Copy, MoreHorizontal, CheckSquare } from 'lucide-react';

interface BulkOperationsProps {
  selectedItems: string[];
  onSelectAll: () => void;
  onClearSelection: () => void;
  totalItems: number;
}

export const BulkOperations = ({ selectedItems, onSelectAll, onClearSelection, totalItems }: BulkOperationsProps) => {
  const [isVisible, setIsVisible] = useState(selectedItems.length > 0);

  if (selectedItems.length === 0) return null;

  const handleBulkAction = (action: string) => {
    console.log(`Bulk ${action} for items:`, selectedItems);
    onClearSelection();
  };

  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 p-4 animate-slide-up">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Checkbox 
            checked={selectedItems.length === totalItems}
            onCheckedChange={selectedItems.length === totalItems ? onClearSelection : onSelectAll}
          />
          <span className="text-sm font-medium">
            {selectedItems.length} of {totalItems} selected
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleBulkAction('start')}
            className="gap-1"
          >
            <Play className="w-4 h-4" />
            Start
          </Button>
          
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleBulkAction('pause')}
            className="gap-1"
          >
            <Pause className="w-4 h-4" />
            Pause
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => handleBulkAction('clone')}
            className="gap-1"
          >
            <Copy className="w-4 h-4" />
            Clone
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline">
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shadow-lg">
              <DropdownMenuItem 
                onClick={() => handleBulkAction('export')}
                className="gap-2 text-gray-900 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-slate-700 focus:bg-gray-100 dark:focus:bg-slate-700"
              >
                Export Selected
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => handleBulkAction('delete')}
                className="gap-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 focus:bg-red-50 dark:focus:bg-red-900/20"
              >
                <Trash2 className="w-4 h-4" />
                Delete Selected
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            size="sm"
            variant="ghost"
            onClick={onClearSelection}
            className="text-gray-500"
          >
            Clear
          </Button>
        </div>
      </div>
    </div>
  );
};
