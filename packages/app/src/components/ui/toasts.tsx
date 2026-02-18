import { toast } from 'sonner';
import { CheckCircle2, XCircle, Info, AlertTriangle } from 'lucide-react';
import React from 'react';

export function showSuccessToast(message: string, description?: string) {
  toast(
    <div className="flex items-center gap-4">
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30">
        <CheckCircle2 className="text-green-600 dark:text-green-400 w-7 h-7" />
      </div>
      <div>
        <div className="font-semibold text-base text-black">{message}</div>
        {description && <div className="text-sm text-gray-800">{description}</div>}
      </div>
    </div>,
    {
      duration: 5000,
      className: "bg-white/80 border border-green-200 shadow-2xl rounded-xl backdrop-blur-md px-4 py-3",
    }
  );
}

export function showErrorToast(message: string, description?: string) {
  toast(
    <div className="flex items-center gap-4">
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30">
        <XCircle className="text-red-600 dark:text-red-400 w-7 h-7" />
      </div>
      <div>
        <div className="font-semibold text-base text-black">{message}</div>
        {description && <div className="text-sm text-gray-800">{description}</div>}
      </div>
    </div>,
    {
      duration: 6000,
      className: "bg-white/80 border border-red-200 shadow-2xl rounded-xl backdrop-blur-md px-4 py-3",
    }
  );
}

export function showInfoToast(message: string, description?: string) {
  toast(
    <div className="flex items-center gap-4">
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30">
        <Info className="text-blue-600 dark:text-blue-400 w-7 h-7" />
      </div>
      <div>
        <div className="font-semibold text-base text-black">{message}</div>
        {description && <div className="text-sm text-gray-800">{description}</div>}
      </div>
    </div>,
    {
      duration: 5000,
      className: "bg-white/80 border border-blue-200 shadow-2xl rounded-xl backdrop-blur-md px-4 py-3",
    }
  );
}

export function showWarningToast(message: string, description?: string) {
  toast(
    <div className="flex items-center gap-4">
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30">
        <AlertTriangle className="text-yellow-600 dark:text-yellow-400 w-7 h-7" />
      </div>
      <div>
        <div className="font-semibold text-base text-black">{message}</div>
        {description && <div className="text-sm text-gray-800">{description}</div>}
      </div>
    </div>,
    {
      duration: 6000,
      className: "bg-white/80 border border-yellow-200 shadow-2xl rounded-xl backdrop-blur-md px-4 py-3",
    }
  );
} 