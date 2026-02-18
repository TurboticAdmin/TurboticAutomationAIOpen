"use client";

import React, { useEffect, useState } from 'react';
import { toast } from '@/hooks/use-toast';
import { Tour, message } from 'antd';
import type { TourStepProps } from 'antd';
import { useOnboarding } from '@/hooks/useOnboarding';
import { useAuth } from '@/app/authentication';

interface OnboardingTourProps {
  page: 'landing' | 'canvas';
  onFinish?: () => void;
}

export function OnboardingTour({ page, onFinish }: OnboardingTourProps) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState(0);
  const [lastStep, setLastStep] = useState(-1);
  const [hasInitialized, setHasInitialized] = useState(false);
  const { onboardingState, loading, tourEnabled, updateOnboardingState } = useOnboarding();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    // Don't show tour if not authenticated or still loading
    if (!isAuthenticated || loading || !onboardingState) {
      return;
    }

    // Don't show tour if it's disabled in config
    if (!tourEnabled) {
      return;
    }

    // Don't re-initialize if already done
    if (hasInitialized) {
      return;
    }

    const { hasCompletedTour, tourStarted, tourStep } = onboardingState;

    if (!hasCompletedTour) {
      if (page === 'landing' && !tourStarted) {
        // Start tour on landing page when user focuses on input
        const chatInput = document.querySelector('[data-tour="chat-input"]');
        if (chatInput) {
          const handleFocus = async () => {
            await updateOnboardingState({ tourStarted: true, tourStep: 0 });


            setTimeout(() => setOpen(true), 500);
            setHasInitialized(true); // Mark as initialized for landing page
          };
          chatInput.addEventListener('focus', handleFocus, { once: true });
          return () => chatInput.removeEventListener('focus', handleFocus);
        }
      } else if (page === 'canvas' && tourStarted) {
        // Continue tour on canvas page - wait for automation to load
        const checkInterval = setInterval(() => {
          const chatWindow = document.querySelector('[data-tour="chat-window"]');
          const codeEditor = document.querySelector('[data-tour="code-editor"]');

          // Check if key elements are loaded
          if (chatWindow && codeEditor) {
            clearInterval(checkInterval);

            // Calculate which canvas step to start from (tourStep 3+ are canvas steps)
            const canvasStep = tourStep >= LANDING_STEPS_COUNT ? tourStep - LANDING_STEPS_COUNT : 0;

            // Set initial tab before opening tour
            const automationEditor = (window as any).automationEditor;
            if (automationEditor?.setActiveTab) {
              automationEditor.setActiveTab('automations'); // Start with automations/chat view
            }

            // Resume from the saved step
            setCurrent(canvasStep);
            setLastStep(canvasStep); // Set lastStep to prevent immediate re-trigger
            setOpen(true);
            setHasInitialized(true); // Mark as initialized to prevent re-runs
          }
        }, 500);

        // Timeout after 10 seconds
        const timeout = setTimeout(() => {
          clearInterval(checkInterval);

          // Calculate which canvas step to start from
          const canvasStep = tourStep >= LANDING_STEPS_COUNT ? tourStep - LANDING_STEPS_COUNT : 0;

          // Set initial tab before opening tour
          const automationEditor = (window as any).automationEditor;
          if (automationEditor?.setActiveTab) {
            automationEditor.setActiveTab('automations');
          }

          setCurrent(canvasStep);
          setLastStep(canvasStep);
          setOpen(true);
          setHasInitialized(true); // Mark as initialized to prevent re-runs
        }, 10000);

        return () => {
          clearInterval(checkInterval);
          clearTimeout(timeout);
        };
      }
    }
  }, [page, isAuthenticated, loading, onboardingState, tourEnabled, updateOnboardingState]);

  // Close tour when leaving landing page (user submitted input and is being redirected)
  useEffect(() => {
    if (page === 'landing' && open) {
      // Tour will be closed when component unmounts (user navigates away)
      return () => {
        setOpen(false);
      };
    }
  }, [page, open]);

  // Handle tab switching when step changes (only on canvas page)
  useEffect(() => {
    if (page === 'canvas' && open && current !== lastStep) {
      setLastStep(current);

      const automationEditor = (window as any).automationEditor;
      if (!automationEditor?.setActiveTab) return;

      // Map of step index (in canvas) to tab name
      // Canvas steps start at index 0, which is actually step 3 overall (Chat with AI)
      const stepToTab: Record<number, string> = {
        0: 'automations', // Chat with AI - show automations tab
        1: 'main',        // Code Editor
        2: 'env',         // Environment Variables
        3: 'logs',        // View Output & Logs
        4: 'main',        // Run Your Automation (back to code)
        // 5: fix button - no tab change
        // 6: edit/delete - no tab change
        // 7: version history - no tab change
        // 8: schedule - no tab change
        // 9: final - no tab change
      };

      const targetTab = stepToTab[current];
      if (targetTab) {
        automationEditor.setActiveTab(targetTab);
      }
    }
  }, [page, open, current, lastStep]);

  // All steps combined - landing (0-2) + canvas (3-12)
  const allSteps: TourStepProps[] = [
    // Landing steps (0-2)
    {
      title: 'Welcome to AutomationAI!',
      description: 'Let\'s take a quick tour to help you get started with creating and managing your automations.',
      target: null,
    },
    {
      title: 'Describe Your Automation',
      description: 'Type what you want to automate in natural language. For example: "Send me a daily email with weather forecast".',
      target: () => document.querySelector('[data-tour="chat-input"]') as HTMLElement,
      placement: 'bottom',
    },
    {
      title: 'Ready to Create!',
      description: 'Now press Enter or click the send button below to create your automation. The tour will continue once your automation is created.',
      target: () => document.querySelector('[data-tour="send-button"]') as HTMLElement,
      placement: 'left',
      nextButtonProps: {
        children: 'Next',
      },
    },
    // Canvas steps (3-12)
    {
      title: 'Chat with AI',
      description: 'Use this chat window to refine your automation. The AI will help you fix issues, add features, or make changes.',
      target: () => document.querySelector('[data-tour="chat-window"]') as HTMLElement,
      placement: 'left',
    },
    {
      title: 'Code Editor',
      description: 'Your automation code appears here. You can review and edit it directly if needed.',
      target: () => document.querySelector('[data-tour="code-editor"]') as HTMLElement,
      placement: 'right',
    },
    {
      title: 'Environment Variables',
      description: 'Store sensitive data like API keys and passwords here. These variables are encrypted and can be used in your automation code.',
      target: () => document.querySelector('[data-tour="code-editor"]') as HTMLElement,
      placement: 'right',
    },
    {
      title: 'View Output & Logs',
      description: 'After running, monitor execution logs, errors, and browser activity here. You can switch between console output and browser screen using the tabs.',
      target: () => document.querySelector('[data-tour="output-panel"]') as HTMLElement,
      placement: 'top',
    },
    {
      title: 'Run Your Automation',
      description: 'Click the Run button to execute your automation and see it in action.',
      target: () => document.querySelector('[data-tour="run-button"]') as HTMLElement,
      placement: 'bottom',
    },
    {
      title: 'Fix Issues with AI',
      description: 'If your automation fails, use the "Fix" button to let AI analyze errors and suggest corrections.',
      target: () => document.querySelector('[data-tour="fix-button"]') as HTMLElement,
      placement: 'bottom',
    },
    {
      title: 'Edit or Delete Automation',
      description: 'Click the three dots menu to see options like renaming your automation, updating its description, or deleting it.',
      target: () => {
        // Auto-click the more actions button to show the dropdown
        const moreActionsBtn = document.querySelector('[data-tour="more-actions"]') as HTMLElement;
        if (moreActionsBtn) {
          // Trigger hover and click to show dropdown
          const mouseEnterEvent = new MouseEvent('mouseenter', { bubbles: true });
          moreActionsBtn.dispatchEvent(mouseEnterEvent);
          setTimeout(() => moreActionsBtn.click(), 300);
        }
        return moreActionsBtn;
      },
      placement: 'left',
    },
    {
      title: 'Version History',
      description: 'Track all changes to your automation and rollback to previous versions if needed. Click this icon in the chat area to view all versions.',
      target: () => document.querySelector('[data-tour="version-history-chat"]') as HTMLElement,
      placement: 'top',
    },
    {
      title: 'Schedule Your Automation',
      description: 'To schedule your automation, simply type in the chat below! For example: "Schedule this automation to run every Monday at 13:30 CET"',
      target: () => {
        // Close any open dropdowns first
        const backdrop = document.querySelector('.ant-dropdown-mask');
        if (backdrop) {
          (backdrop as HTMLElement).click();
        }
        // Point to the chat input
        return document.querySelector('[data-tour="chat-input-canvas"]') as HTMLElement;
      },
      placement: 'top',
    },
    {
      title: 'You\'re All Set!',
      description: 'Now you\'re ready to create amazing automations! Use the chat to refine your automation, run it, and schedule it.',
      target: null,
    },
  ];

  // Filter steps based on current page
  const LANDING_STEPS_COUNT = 3;
  const steps = page === 'landing'
    ? allSteps.slice(0, LANDING_STEPS_COUNT)
    : allSteps.slice(LANDING_STEPS_COUNT);

  const handleFinish = async () => {
    try {
      await updateOnboardingState({
        hasCompletedTour: true,
        tourStarted: false,
        tourStep: 0
      });



      setOpen(false);
      onFinish?.();
    } catch (error) {
      console.error('Error finishing tour:', error);
      setOpen(false);
    }
  };

  const handleClose = async () => {
    try {
      // User skipped the tour
      await updateOnboardingState({
        hasCompletedTour: true,
        tourStarted: false,
        tourStep: 0
      });
      setOpen(false);
      onFinish?.();
    } catch (error) {
      console.error('Error closing tour:', error);
      setOpen(false);
    }
  };

  const handleStepChange = async (newCurrent: number) => {
    // Validate step 2 (Describe Your Automation) - don't allow forward without text
    if (page === 'landing' && current === 1 && newCurrent === 2) {
      const chatInput = document.querySelector('[data-tour="chat-input"]') as HTMLTextAreaElement;
      if (!chatInput?.value?.trim()) {
        toast.warning('Please describe your automation before continuing');
        return; // Don't advance if input is empty
      }
    }

    // On landing page, when moving from step 2 to step 3, just close the tour
    // The user will submit the form and go to canvas
    if (page === 'landing' && current === 2 && newCurrent === 3) {
      // Don't advance to step 3, just close and keep step at 2
      // When canvas loads, it will start from step 3 (first canvas step)
      setOpen(false);
      return;
    }

    setCurrent(newCurrent);

    try {
      // Calculate global step number (landing steps are 0-2, canvas steps start at 3)
      const globalStep = page === 'canvas' ? newCurrent + LANDING_STEPS_COUNT : newCurrent;

      // Track step completion (only when moving forward)
      if (newCurrent > current) {
        try {
          // Extract step title, ensuring it's always a string for GA tracking
          const stepTitleRaw = allSteps[globalStep]?.title;
          // Convert to string: TourStepProps.title can be ReactNode, but GA label must be string
          const stepTitle: string = typeof stepTitleRaw === 'string' 
            ? stepTitleRaw 
            : `Step ${globalStep + 1}`;

        } catch (err) {
          console.error('[Analytics] Error tracking onboarding step:', err);
        }
      }

      // Save the current step
      await updateOnboardingState({ tourStep: globalStep });
    } catch (error) {
      console.error('Error updating tour step:', error);
    }
  };

  // Don't render if not authenticated or loading
  if (!isAuthenticated || loading) {
    return null;
  }

  return (
    <Tour
      open={open}
      onClose={handleClose}
      onFinish={handleFinish}
      current={current}
      onChange={handleStepChange}
      steps={steps}
      indicatorsRender={(current, total) => {
        // On landing page, show actual position in overall tour (e.g., 1/11, 2/11)
        // On canvas page, continue counting (e.g., 3/11, 4/11, etc.)
        const actualCurrent = page === 'landing' ? current : current + LANDING_STEPS_COUNT;
        const totalSteps = allSteps.length;
        return (
          <span style={{ color: '#1890ff' }}>
            {actualCurrent + 1} / {totalSteps}
          </span>
        );
      }}
    />
  );
}

