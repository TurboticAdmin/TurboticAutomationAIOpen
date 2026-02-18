'use client';

import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, CreditCard } from 'lucide-react';
import Link from 'next/link';

interface UpgradeAction {
  title: string;
  description: string;
  buttonText: string;
  buttonUrl: string;
  features?: string[];
}

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  upgradeAction?: UpgradeAction;
}

export function UpgradeModal({ isOpen, onClose, upgradeAction }: UpgradeModalProps) {
  if (!upgradeAction) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="sm:max-w-xl"
        style={{
          backgroundColor: 'var(--background-color)',
          border: '1px solid var(--border-default)',
          color: 'var(--text-color)',
          padding: '32px',
          maxWidth: '600px'
        }}
      >
        <DialogHeader className="space-y-4">
          <DialogTitle
            className="text-xl font-bold text-center"
            style={{ color: 'var(--text-title-theme)' }}
          >
            {upgradeAction.title}
          </DialogTitle>
          <DialogDescription
            className="text-center text-base leading-relaxed"
            style={{ color: 'var(--secondary-text)' }}
          >
            {upgradeAction.description}
          </DialogDescription>
        </DialogHeader>

        {upgradeAction.features && upgradeAction.features.length > 0 && (
          <div className="space-y-4 mt-6">
            <h4
              className="font-semibold text-lg"
              style={{ color: 'var(--text-title-theme)' }}
            >
              What you'll get:
            </h4>
            <ul className="space-y-3">
              {upgradeAction.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-3">
                  <div
                    className="rounded-full p-1 mt-0.5"
                    style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)' }}
                  >
                    <Check
                      className="h-4 w-4 shrink-0"
                      style={{ color: 'var(--progress-indicator-green)' }}
                    />
                  </div>
                  <span
                    className="text-sm leading-relaxed"
                    style={{ color: 'var(--text-color)' }}
                  >
                    {feature}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-3 pt-6 mt-2">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex-1 h-11"
            style={{
              backgroundColor: 'transparent',
              borderColor: 'var(--border-default)',
              color: 'var(--text-color)'
            }}
          >
            Maybe Later
          </Button>
          <Button
            className="flex-1 h-11"
            style={{
              backgroundColor: 'var(--primary-color)',
              color: '#fff',
              border: 'none'
            }}
            onClick={() => {
              // Close modal immediately, then navigate
              try { onClose(); } catch {}
              window.location.href = upgradeAction.buttonUrl;
            }}
          >
            <CreditCard className="h-4 w-4 mr-2" />
            {upgradeAction.buttonText}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
