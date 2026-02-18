'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { UpgradeModal } from '@/components/UpgradeModal';

interface UpgradeAction {
  title: string;
  description: string;
  buttonText: string;
  buttonUrl: string;
  features?: string[];
}

interface UpgradeContextType {
  showUpgradeAction: (action: UpgradeAction) => void;
  handleApiError: (error: any) => boolean;
}

const UpgradeContext = createContext<UpgradeContextType | null>(null);

export function UpgradeProvider({ children }: { children: React.ReactNode }) {
  const [upgradeAction, setUpgradeAction] = useState<UpgradeAction | null>(null);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);

  const showUpgradeAction = useCallback((action: UpgradeAction) => {
    setUpgradeAction(action);
    setIsUpgradeModalOpen(true);
  }, []);

  const hideUpgradeAction = useCallback(() => {
    setIsUpgradeModalOpen(false);
    setUpgradeAction(null);
  }, []);

  const handleApiError = useCallback((error: any) => {
    // Check if the error contains upgrade action data (limit breach)
    if (error?.upgradeAction) {
      showUpgradeAction(error.upgradeAction);
      // Trigger notification refresh event when limit is breached
      window.dispatchEvent(new CustomEvent('limit-breach', { detail: error }));
      return true; // Indicates we handled the upgrade action
    }
    return false; // Not an upgrade action error
  }, [showUpgradeAction]);

  return (
    <UpgradeContext.Provider value={{ showUpgradeAction, handleApiError }}>
      {children}
      <UpgradeModal 
        isOpen={isUpgradeModalOpen}
        onClose={hideUpgradeAction}
        upgradeAction={upgradeAction || undefined}
      />
    </UpgradeContext.Provider>
  );
}

export function useUpgrade() {
  const context = useContext(UpgradeContext);
  if (!context) {
    throw new Error('useUpgrade must be used within an UpgradeProvider');
  }
  return context;
}
