import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { CodeExplanationModal } from './CodeExplanationModal';
import { FileText } from 'lucide-react';
import { Tooltip } from 'antd';

interface CodeExplanationButtonProps {
  automationId: string;
  automationTitle?: string;
  variant?: 'default' | 'outline' | 'ghost' | 'secondary';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
}

export function CodeExplanationButton({ 
  automationId, 
  automationTitle, 
  variant = 'outline',
  size = 'default',
  className = ''
}: CodeExplanationButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);

  return (
    <>
        <Tooltip title="Get AI explanation of this automation code">
          <Button
            variant={variant}
            size={size}
            onClick={() => setIsModalOpen(true)}
            className={`flex items-center gap-2 ${className}`}
          >
            <FileText className="h-4 w-4" />
            Explain Code
          </Button>
        </Tooltip>

      <CodeExplanationModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        automationId={automationId}
        automationTitle={automationTitle}
      />
    </>
  );
}
