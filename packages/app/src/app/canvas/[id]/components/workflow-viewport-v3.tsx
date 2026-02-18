'use client';

import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  forwardRef,
  useImperativeHandle,
  useCallback,
} from 'react';
import { Plus, MoreHorizontal, Zap, GitBranch, Play, Settings, Check, Minus, Copy, Edit, Trash2 } from 'lucide-react';
import { ApiOutlined, CaretRightFilled, ExclamationCircleFilled, LoadingOutlined } from '@ant-design/icons';
import { Modal, Typography, Button, App, Spin, Select } from 'antd';
import eventsEmitter from '@/lib/events-emitter';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import useAutomationEditor from '../hooks/automation-editor';
import { vendorLogos } from './vendor-icon-list';
import { exposedFunctions } from './chat-window';
import './workflow-hover.css';
import { WorkflowViewportHandle } from './workflow-viewport';

interface WorkflowStep {
  id: string;
  name: string;
  code: string;
  status: 'pending' | 'running' | 'completed' | 'error' | 'failed' | 'stopped';
  vendorIcon?: string;
  icon?: string;
  type?: string;
  edited?: boolean;
  explanation?: string;
}

const { Paragraph } = Typography;

// tiny throttle via requestAnimationFrame to prevent rapid setTransform jitter
const useRafThrottle = () => {
  const ticking = useRef(false);
  const run = useCallback((fn: () => void) => {
    if (ticking.current) return;
    ticking.current = true;
    requestAnimationFrame(() => {
      try { fn(); } finally { ticking.current = false; }
    });
  }, []);
  return run;
};

const WorkflowViewportV3 = forwardRef<WorkflowViewportHandle, {
  onStepClick?: (step: any) => void;
  selectedStep?: any;
  isFullScreen?: boolean;
}>(function WorkflowViewportV3({
  onStepClick,
  selectedStep,
  isFullScreen
}, ref) {

  const automationEditor = useAutomationEditor();
  const { latestProgress } = automationEditor;

  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [copyStepData, setCopyStepData] = useState<WorkflowStep | null>(null);
  const [copyPosition, setCopyPosition] = useState<string>('');
  const transformRef = useRef<any>(null);
  const controllerRef = useRef<any>(null);         // Transform controller from onInit
  const stateRef = useRef<any>(null);              // Latest transform state
  const contentRef = useRef<HTMLDivElement>(null); // Horizontal steps container (content)
  const [zoomLevel, setZoomLevel] = useState(100);
  const [contextMenu, setContextMenu] = useState<{ step: WorkflowStep; x: number; y: number } | null>(null);
  const { modal } = App.useApp();
  const [hoveredConnectorIndex, setHoveredConnectorIndex] = useState<number | null>(null);
  const raf = useRafThrottle();
  const [isAddingStep, setIsAddingStep] = useState(false);
  const steps = automationEditor.automationRef.current?.v3Steps || [];

  // Active step detection
  const activeStepId = useMemo(() => {
    const p = latestProgress?.steps || [];
    if (!p.length) return null;

    const norm = (s: any) => (s?.status || '').toLowerCase();

    const running = p.find((s: any) => ['running', 'in_progress'].includes(norm(s)));
    if (running?.stepId) return running.stepId;

    const stopped = p.find((s: any) => norm(s) === 'stopped');
    if (stopped?.stepId) return stopped.stepId;

    let lastDone = -1;
    for (let i = p.length - 1; i >= 0; i--) {
      if (norm(p[i]) === 'completed') { lastDone = i; break; }
    }
    if (lastDone >= 0) return p[lastDone + 1]?.stepId ?? p[lastDone]?.stepId ?? null;

    const failed = p.find((s: any) => ['failed', 'error', 'errored'].includes(norm(s)));
    if (failed?.stepId) return failed.stepId;

    return p[0]?.stepId ?? null;
  }, [latestProgress?.steps]);

  const currentRunningStepDetails = useMemo(() => {
    if (!activeStepId) return null;
    const idx = steps.findIndex((s: WorkflowStep) => s.id === activeStepId);
    if (idx === -1) return null;
    const pStep = latestProgress?.steps?.find((s: any) => s.stepId === activeStepId);
    return { index: idx, step: steps[idx], status: pStep?.status };
  }, [activeStepId, steps, latestProgress?.steps]);

  // Auto zoom (desktop)
  useEffect(() => {
    const c = controllerRef.current;
    const st = stateRef.current;
    if (!c || isFullScreen) return;

    let targetZoom = 100;
    if (steps.length > 5) targetZoom = Math.max(60, 100 - (steps.length - 5) * 5);
    const targetScale = targetZoom / 100;
    setZoomLevel(targetZoom);

    // full signature to avoid jumpy animation defaults
    c.setTransform(st?.positionX || 0, st?.positionY || 0, targetScale, 0, 'easeOut');
  }, [steps.length, isFullScreen]);

  // Programmatic panning
  const focusStep = useCallback((stepId: string | null, opts?: { smooth?: boolean; snapLeft?: boolean }) => {
    const c = controllerRef.current;
    const st = stateRef.current;
    const content = contentRef.current;
    if (!c || !content || !st) return;

    const scale = st.scale ?? 1;
    const smooth = opts?.smooth ?? true;
    const animTime = smooth ? 200 : 0;

    if (opts?.snapLeft) {
      c.setTransform(0, st.positionY || 0, scale, animTime, 'easeOut');
      return;
    }

    // Target node
    let target: HTMLElement | null = null;
    if (stepId) target = content.querySelector<HTMLElement>(`[data-step-id="${stepId}"]`);
    if (!target) target = content.querySelector<HTMLElement>('[data-step-id]');
    if (!target) return;

    // Get viewport width from wrapper
    const wrapper = content.closest('.react-transform-wrapper') as HTMLElement | null;
    if (!wrapper) return;
    const viewportWidth = wrapper.getBoundingClientRect().width;

    // x in content coordinates (accumulate offsetLeft up to content)
    let xInContent = 0;
    let el: HTMLElement | null = target;
    while (el && el !== content) {
      xInContent += el.offsetLeft;
      el = el.offsetParent as HTMLElement | null;
    }

    const stepWidth = target.offsetWidth;
    const stepRightInContent = xInContent + stepWidth;

    // When running: position step on right side, showing 2-3 completed steps on left
    // Each step is ~238px (180px width + 58px margin), so 2-3 steps = ~476-714px
    // Position step so its right edge is at: viewportWidth - rightPadding
    // This leaves space for 2-3 steps on the left
    if (automationEditor.isTesting) {
      const stepsToShow = 2.5; // Show ~2.5 completed steps before running step
      const stepSpacing = 238; // Approximate step width + margin
      const spaceForCompletedSteps = stepsToShow * stepSpacing;
      const rightPadding = 50; // Small padding on right
      const desiredStepRight = viewportWidth - rightPadding;
      // Position so step's right edge is at desiredStepRight
      const newPosX = desiredStepRight - (stepRightInContent * scale);
      raf(() => c.setTransform(newPosX, st.positionY || 0, scale, animTime, 'easeOut'));
    } else {
      // When not running: keep Start button visible (snap to left)
      const desiredPaddingLeft = 24;
      let newPosX = desiredPaddingLeft - (xInContent * scale);
      // Don't pan past left edge
      if (newPosX < 0) {
        newPosX = 0;
      }
      raf(() => c.setTransform(newPosX, st.positionY || 0, scale, animTime, 'easeOut'));
    }
  }, [raf, automationEditor.isTesting]);

  useImperativeHandle(ref, () => ({ focusStep }), [focusStep]);

  // Initial positioning: snap left when not running (to show Start button)
  useEffect(() => {
    const c = controllerRef.current;
    const st = stateRef.current;
    if (!c || !st || activeStepId) return; // Only when not running
    
    // If we have steps but no active step, ensure Start button is visible
    if (steps.length > 0 && !automationEditor.isTesting) {
      c.setTransform(0, st.positionY || 0, st.scale || 1, 0, 'easeOut');
    }
  }, [steps.length, activeStepId, automationEditor.isTesting]);

  // Follow active step on progress updates
  useEffect(() => {
    if (!activeStepId) return;
    focusStep(activeStepId, { smooth: true });
  }, [activeStepId, focusStep]);

  // Re-focus on zoom change so step stays left padded
  useEffect(() => {
    const st = stateRef.current;
    if (!st) return;
    const onWheelRecenter = () => {
      if (!activeStepId) return;
      focusStep(activeStepId, { smooth: false });
    };
    // A simple observer via zoomLevel change
    onWheelRecenter();
  }, [zoomLevel, activeStepId, focusStep]);

  // Helpers
  const addStep = async (index?: number) => {
    setIsAddingStep(true);
    const newStep: WorkflowStep = {
      id: Date.now().toString(),
      name: `Step ${steps.length + 1}`,
      code: '',
      status: 'pending'
    };

    if (!automationEditor.automationRef.current) {
      automationEditor.automationRef.current = { v3Steps: [] };
    }


    // if (index !== undefined && index !== null) {
    //   automationEditor.automationRef.current.v3Steps = [...steps.slice(0, index), newStep, ...steps.slice(index)];
    // } else {
    //   automationEditor.automationRef.current.v3Steps = [...steps, newStep];
    // }
    // automationEditor.setDocVersion(automationEditor.docVersion + 1);
    try {
      await exposedFunctions.handleSend(
        undefined,
        `Create a new step with id ${newStep.id} and name ${newStep.name} at index ${index || 0} in the workflow and value of code is empty string. Then ask the user for the required inputs for the step and generate the step's code based on those inputs and update the step with the code and name.`
      );
    } catch (error) {
    } finally {
      setIsAddingStep(false);
    }
  };

  const getStepLatestProgress = (step: WorkflowStep) =>
    latestProgress?.steps?.find((pStep: any) => pStep.stepId === step.id) ?? null;

  const deleteStep = (stepId: string, stepName: string) => {
    modal.confirm({
      title: 'Delete Step',
      content: `Are you sure you want to delete "${stepName}"? This action cannot be undone.`,
      closable: true,
      okText: 'Delete',
      cancelText: 'Cancel',
      onOk() {
        if (!automationEditor.automationRef.current) return;
        const removedStep = steps.find((step: any) => step.id === stepId);
        const updatedSteps = steps.filter((s: any) => s.id !== stepId);
        let varsToRemove = removedStep?.environmentVariablesUsed || [];
        updatedSteps.forEach((step: any) => {
          step.environmentVariablesUsed?.forEach((env: any) => {
            if (varsToRemove?.includes(env)) {
              varsToRemove = varsToRemove?.filter((v:any) => v !== env)
            }
          });
        });
        if (varsToRemove.length) {
          automationEditor.automationRef.current.environmentVariables =
            automationEditor.automationRef.current.environmentVariables.filter(
              (env: any) => !varsToRemove?.includes(env.name)
            );
          automationEditor.automationRef.current.isEnvUpdated = true;
        }
        
        automationEditor.automationRef.current.v3Steps = updatedSteps;
        automationEditor.setDocVersion(automationEditor.docVersion + 1);
        
        if ((window as any).exposedFunctions?.commitCodeToGitHub) {
          const commitMessage = `Deleted step: ${stepName}`;
          (window as any).exposedFunctions.commitCodeToGitHub(
            '',
            '',
            automationEditor.automationRef.current.isEnvUpdated ? automationEditor.automationRef.current.environmentVariables : automationEditor.environmentVariables || [],
            automationEditor.dependencies || [],
            commitMessage
          );
        } else {
          const urlPath = window.location.pathname;
          const automationIdMatch = urlPath.match(/\/canvas\/([^\/]+)/);
          const automationId = automationIdMatch ? automationIdMatch[1] : null;
          
          if (automationId) {
            eventsEmitter.setPendingCommitMessage(automationId, `Deleted step: ${stepName}`);
            eventsEmitter.emit('code-editor:changes-accepted', { code: '' });
          }
        }
      },
    });
  };

  const editStep = (step: WorkflowStep) => {
    eventsEmitter.emit('code-editor:open-step', { stepId: step.id });
  };

  const getStepStatusIcon = (step: WorkflowStep) => {
    const s = getStepLatestProgress(step)?.status;
    if (!s) return null;
    if (s === 'stopped') return <ExclamationCircleFilled className="w-4 h-4" style={{ color: '#ffc107' }} />;
    if (s === 'completed') return (
      <Check
        style={{ background: 'var(--progress-indicator-green)', color: 'white', borderRadius: 50, padding: 3 }}
        className="w-4 h-4 text-[16px] text-green-500"
      />
    );
    if (s === 'failed' || s === 'error' || s === 'errored') return <ExclamationCircleFilled className="w-4 h-4" style={{ color: 'var(--progress-indicator-red)' }} />;
    return null;
  };

  const getStepBorder = (step: WorkflowStep) => {
    const s = getStepLatestProgress(step)?.status;
    if (!s) return '#888888';
    if (s === 'stopped') return '2px solid #ffc107';
    if (s === 'running') return '2px solid var(--primary-color)';
    if (s === 'completed') return '2px solid var(--progress-indicator-green)';
    if (s === 'failed' || s === 'error' || s === 'errored') return '2px solid var(--progress-indicator-red)';
    return undefined;
  };

  const getStepBorderColorByStep = (step: WorkflowStep) => {
    const s = getStepLatestProgress(step)?.status;
    if (!s) return '#d1d5db';
    if (s === 'stopped') return '#ffc107';
    if (s === 'running') return 'var(--primary-color)';
    if (s === 'completed') return 'var(--progress-indicator-green)';
    if (s === 'failed' || s === 'error' || s === 'errored') return 'var(--progress-indicator-red)';
    return '#d1d5db';
  };

  const getEndStepStatus = () => {
    if (!steps.length) return 'pending';
    if (latestProgress?.steps?.some((s: any) => s.status === 'stopped')) return 'stopped';
    const last = steps[steps.length - 1];
    const lastS = getStepLatestProgress(last)?.status;
    if (lastS === 'failed' || lastS === 'error' || lastS === 'errored') return 'failed';
    if (lastS === 'completed') return 'completed';
    if (latestProgress?.steps?.some((s: any) => s.status === 'failed' || s.status === 'error' || s.status === 'errored')) return 'failed';
    return 'pending';
  };

  const getIcon = (step: WorkflowStep) => {
    const t = step.vendorIcon || step.icon || 'automation';
    if (!step.code && !step.edited) return <Spin indicator={<LoadingOutlined spin style={{ fontSize: 24 }} />} />;
    if (vendorLogos.includes(t)) return <img src={`/images/vendor-logos/top100-logos/${t}.svg`} alt={t} className="w-8 h-8" />;
    switch (t) {
      case 'settings': return <Settings className="w-8 h-8" style={{ color: 'var(--primary-color)' }} />;
      case 'automation': return <Zap className="w-8 h-8" style={{ color: 'var(--primary-color)' }} />;
      case 'condition': return <GitBranch className="w-8 h-8" style={{ color: 'var(--primary-color)' }} />;
      case 'trigger': return <Play className="w-8 h-8" style={{ color: 'var(--primary-color)' }} />;
      case 'api': return <ApiOutlined style={{ fontSize: 32, color: 'var(--primary-color)' }} className="w-8 h-8" />;
      default: return <Zap className="w-8 h-8 secondary-text" />;
    }
  };

  const handleContextMenu = (e: React.MouseEvent, step: WorkflowStep) => {
    e.preventDefault(); e.stopPropagation();
    setContextMenu({ step, x: e.clientX, y: e.clientY });
  };
  const closeContextMenu = () => setContextMenu(null);

  const handleMenuAction = (action: string, selectedStep: WorkflowStep) => {
    const step = steps.find((s: WorkflowStep) => s.id === selectedStep.id);
    if (!step) return;

    switch (action) {
      case 'run':
        modal.confirm({
          title: 'Run Step',
          content: (
            <div className="space-y-3 py-2">
              <p className="text-sm text-gray-600 mb-4">How would you like to run this step?</p>
              <div className="flex flex-col gap-2">
                <Button
                  type="primary"
                  block
                  onClick={() => {
                    automationEditor.runCode(true, undefined, false, true, selectedStep.id, true);
                    Modal.destroyAll();
                  }}
                >
                  Run only this step
                </Button>
                <Button
                  block
                  onClick={() => {
                    automationEditor.runCode(true, undefined, false, true, selectedStep.id, false);
                    Modal.destroyAll()
                  }}
                >
                  Run from this step
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-4 italic">
                Note: If any previous steps have not run successfully, they will be executed first before running this step.
              </p>
            </div>
          ),
          closable: true,
          okButtonProps: { style: { display: 'none' } },
          cancelButtonProps: { style: { display: 'none' } },
        });
        break;
      case 'copy':
        setCopyStepData(step);
        setIsCopyModalOpen(true);
        break;
      case 'edit':
        editStep(step);
        break;
      case 'delete':
        deleteStep(selectedStep.id, selectedStep.name);
        break;
    }
    closeContextMenu();
  };

  return (
    <div style={{ height: isFullScreen ? '100%' : 'calc(100% - 44px)' }}>
      <div className="relative h-full" onClick={closeContextMenu}>
        {/* Zoom Controls */}
        {!isFullScreen && (
          <div className="absolute top-4 right-4 z-10">
            <div className="card-background-color flex flex-col items-center gap-1" style={{ borderRadius: 24, padding: '7px 0' }}>
              <button
                onClick={() => transformRef.current?.zoomIn(0.1)}
                className="!p-0 w-6 h-6 cursor-pointer container-background-color hover:bg-gray-300 rounded-full flex items-center justify-center transition-colors border-0 outline-none"
                title="Zoom In"
                style={{ borderRadius: 24 }}
              >
                <Plus className="w-3 h-3 text-color" />
              </button>
              
              <div
                className="text-xs text-color font-medium cursor-pointer hover:secondary-text transition-colors px-1.5 py-0.5"
                onClick={() => transformRef.current?.resetTransform()}
                title="Reset to 100%"
              >
                {zoomLevel}%
              </div>
              
              <button
                onClick={() => transformRef.current?.zoomOut(0.1)}
                className="!p-0 w-6 h-6 cursor-pointer container-background-color hover:bg-gray-300 rounded-full flex items-center justify-center transition-colors border-0 outline-none"
                title="Zoom Out"
                style={{ borderRadius: 24 }}
              >
                <Minus className="w-3 h-3 text-color" />
              </button>
            </div>
          </div>
        )}

        {/* Context Menu */}
        {contextMenu && (
          <div
            className="fixed z-50 card-background-color rounded-[12px] shadow-lg p-2 flex items-center gap-2"
            style={{ left: contextMenu.x - 100, top: contextMenu.y - 60 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button onClick={() => handleMenuAction('run', contextMenu.step)} className="cursor-pointer p-2 dark:hover:bg-gray-800 hover:bg-gray-200 rounded">
              <Play className="w-4 h-4 text-color" />
            </button>
            <button onClick={() => handleMenuAction('copy', contextMenu.step)} className="cursor-pointer p-2 dark:hover:bg-gray-800 hover:bg-gray-200 rounded">
              <Copy className="w-4 h-4 text-color" />
            </button>
            <button onClick={() => handleMenuAction('edit', contextMenu.step)} className="cursor-pointer p-2 dark:hover:bg-gray-800 hover:bg-gray-200 rounded">
              <Edit className="w-4 h-4 text-color" />
            </button>
            <button onClick={() => handleMenuAction('delete', contextMenu.step)} className="cursor-pointer p-2 dark:hover:bg-gray-800 hover:bg-gray-200 rounded">
              <Trash2 className="w-4 h-4 text-color" />
            </button>
          </div>
        )}

        {currentRunningStepDetails?.step && !isFullScreen && (automationEditor.isTesting
          || currentRunningStepDetails.status === 'completed'
          || currentRunningStepDetails.status === 'stopped'
          || currentRunningStepDetails.status === 'failed'
          || currentRunningStepDetails.status === 'error'
          || currentRunningStepDetails.status === 'errored') && (
          <div className="running-step-details absolute p-3 flex justify-center items-center">
            <div className="flex gap-2 items-center">
              {currentRunningStepDetails.status === 'running' ? (
                <Spin indicator={<LoadingOutlined spin style={{ fontSize: 24 }} />} />
              ) : currentRunningStepDetails.status === 'stopped' ? (
                <ExclamationCircleFilled style={{ color: '#ffc107', fontSize: 24 }} />
              ) : currentRunningStepDetails.status === 'completed' ? (
                <Check style={{ color: 'var(--progress-indicator-green)', fontSize: 24 }} />
              ) : (currentRunningStepDetails.status === 'failed' || currentRunningStepDetails.status === 'error' || currentRunningStepDetails.status === 'errored') ? (
                <ExclamationCircleFilled style={{ color: 'var(--progress-indicator-red)', fontSize: 24 }} />
              ) : null}
              <span className="font-bold secondary-text">
                {currentRunningStepDetails?.step?.name} {`(Step ${currentRunningStepDetails?.index + 1} of ${steps.length})`}
                {currentRunningStepDetails.status === 'stopped' && <span style={{ color: '#ffc107', marginLeft: '8px' }}> - Stopped</span>}
                {currentRunningStepDetails.status === 'completed' && <span style={{ color: 'var(--progress-indicator-green)', marginLeft: '8px' }}> - Completed</span>}
                {(currentRunningStepDetails.status === 'failed' || currentRunningStepDetails.status === 'error' || currentRunningStepDetails.status === 'errored') && <span style={{ color: 'var(--progress-indicator-red)', marginLeft: '8px' }}> - Failed</span>}
              </span>
            </div>
          </div>
        )}
        <div id="running-step-details-portal"></div>

        <TransformWrapper
          ref={transformRef}
          initialScale={1}
          minScale={0.1}
          maxScale={3}
          centerOnInit={false}
          wheel={{ step: 0.1 }}
          pinch={{ step: 5 }}
          doubleClick={{ disabled: true }}
          onZoom={(inst) => {
            if (inst?.state?.scale) setZoomLevel(Math.round(inst.state.scale * 100));
          }}
          onInit={(inst) => {
            if (inst) {
              controllerRef.current = inst;
              if (inst.state) stateRef.current = inst.state;

              let targetZoom = 100;
              if (!isFullScreen && steps.length > 5) targetZoom = Math.max(60, 100 - (steps.length - 5) * 5);
              const targetScale = targetZoom / 100;
              setZoomLevel(targetZoom);

              // full signature - start at left edge to show Start button
              inst.setTransform(0, 0, targetScale, 0, 'easeOut');
            }
          }}
          onTransformed={(inst, st) => {
            if (st) {
              stateRef.current = st;
              if (st.scale) setZoomLevel(Math.round(st.scale * 100));
              if (inst && !controllerRef.current) controllerRef.current = inst;
            }
          }}
        >
          <TransformComponent
            wrapperClass="!w-full !h-full"
            contentClass={isFullScreen ? "flex gap-4 pb-4 items-start justify-start" : "flex gap-4 pb-4 items-center justify-start min-h-[400px]"}
            wrapperStyle={{ cursor: 'grab' }}
          >
            <div ref={contentRef} className="flex gap-4 items-center h-full workflow-container" style={{ cursor: 'grab' }}>
              {/* Start + connector */}
              {steps.length > 0 && !isFullScreen && (
                <div className="flex" style={{ marginRight: -24 }}>
                  <Button
                    type="primary"
                    className={`${automationEditor.isTesting ? '!bg-black !text-white !shadow-none' : ''}`}
                    icon={!automationEditor.isTesting && <CaretRightFilled />}
                    onClick={() => {
                      if (!automationEditor.isTesting) {
                        automationEditor.runCode(true);
                        onStepClick?.(null);
                      }
                    }}
                  >
                    {automationEditor.isTesting ? 'Running' : 'Start'}
                  </Button>

                  <div className="flex items-center relative workflow-connector"
                       onMouseEnter={() => setHoveredConnectorIndex(-1)}
                       onMouseLeave={() => setHoveredConnectorIndex(null)}>
                    <div className="w-[13px] h-[13px] rounded-full" style={{ backgroundColor: getStepBorderColorByStep(steps[0]), flexShrink: 0 }} />
                    <svg width="55" height="4" className="cipher-connector-line" style={{ flexShrink: 0 }}>
                      <line x1="0" y1="2" x2="55" y2="2" stroke={getStepBorderColorByStep(steps[0])} strokeWidth="2" />
                    </svg>
                    <CaretRightFilled className="w-4 h-4 relative left-[-5px]" style={{ color: getStepBorderColorByStep(steps[0]), flexShrink: 0 }} />
                    {isAddingStep && (
                      <div
                        style={{
                          position: 'absolute',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                        className="connector-add-btn"
                      >
                        <Button
                          style={{
                            position: 'absolute',
                            // opacity: hoveredConnectorIndex === -1 ? 1 : 0,
                            transition: 'opacity 0.2s ease-in-out',
                            pointerEvents: hoveredConnectorIndex === -1 ? 'auto' : 'none'
                          }}
                          className="absolute left-[20px] connector-add-btn"
                          icon={<Spin indicator={<LoadingOutlined spin style={{ fontSize: 16 }} />} />}
                          shape="circle"
                        />
                        
                      </div>
                    )}
                    {!automationEditor.isTesting && !automationEditor.chatLoading && (
                      <>
                        {!isAddingStep && (
                          <Button
                            style={{
                              position: 'absolute',
                              opacity: hoveredConnectorIndex === -1 ? 1 : 0,
                              transition: 'opacity 0.2s ease-in-out',
                              pointerEvents: hoveredConnectorIndex === -1 ? 'auto' : 'none'
                            }}
                            onClick={() => addStep(0)}
                            className="absolute left-[20px] connector-add-btn"
                            icon={<Plus className="w-4 h-4" />}
                            shape="circle"
                          />
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Steps */}
              {steps.map((step: WorkflowStep, index: number) => {
                const stepProgress = getStepLatestProgress(step);
                const clickable = stepProgress?.status && stepProgress.status !== 'pending';
                return (
                  <div key={step.id} data-step-id={step.id} className="flex items-center h-[108px]" style={{ position: 'relative', marginRight: '58px', overflow: 'visible', cursor: 'grab' }}>
                    <div
                      className={`relative tertiary-background-color rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow min-w-[180px] max-w-[180px] h-[108px] ${clickable ? 'cursor-pointer' : ''}`}
                      style={{
                        border: getStepBorder(step),
                        overflow: 'visible',
                        ...(stepProgress?.status === 'running'
                          ? { boxShadow: 'var(--primary-color) 0px 0px 10px 3px', animation: 'glow 2s ease-in-out infinite' }
                          : stepProgress?.status === 'stopped'
                          ? { boxShadow: '#ffc107 0px 0px 10px 3px' }
                          : selectedStep && selectedStep.id === step.id
                          ? { boxShadow: 'var(--primary-color) 0px 0px 0px 2px' }
                          : {})
                      }}
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!clickable || !onStepClick) return;

                        if (step.explanation) {
                          onStepClick({ ...step, title: step.name, status: stepProgress?.status, explanation: step.explanation });
                          return;
                        }

                        onStepClick({ ...step, title: step.name, status: stepProgress?.status });

                        try {
                          const stepSummary = await automationEditor.fetchStepSummary(step.id, stepProgress?.status);
                          if (stepSummary?.summary) {
                            if (automationEditor.automationRef.current) {
                              automationEditor.automationRef.current.v3Steps = steps.map((s: WorkflowStep) =>
                                s.id === step.id ? { ...s, explanation: stepSummary.summary } : s
                              );
                            }
                            onStepClick({ ...step, title: step.name, status: stepProgress?.status, explanation: stepSummary.summary });
                          }
                        } catch { /* ignore */ }
                      }}
                    >
                      <div className="absolute -top-2 -right-2 z-10">{getStepStatusIcon(step)}</div>
                      <div className="absolute top-3 left-3 w-6 h-6 rounded-sm flex items-center justify-center">{getIcon(step)}</div>

                      {!automationEditor.isTesting && !isFullScreen && (
                        <div className="absolute top-3 right-3 cursor-pointer rounded p-1" onClick={(e) => handleContextMenu(e, step)}>
                          <MoreHorizontal className="w-4 h-4 text-color" />
                        </div>
                      )}

                      <div className="mt-8">
                        <Paragraph ellipsis={{ rows: 2, tooltip: true }} className="text-sm font-medium !m-0 text-left">
                          {step.name}
                        </Paragraph>
                      </div>
                    </div>

                    {/* Connector to next */}
                    <div
                      className="flex items-center workflow-connector"
                      style={{ position: 'absolute', left: '180px', top: '46px' }}
                      onMouseEnter={() => setHoveredConnectorIndex(index)}
                      onMouseLeave={() => setHoveredConnectorIndex(null)}
                    >
                      <div className="w-[13px] h-[13px] rounded-full" style={{ backgroundColor: getStepBorderColorByStep(step), flexShrink: 0 }} />
                      <svg width="55" height="4" className="cipher-connector-line" style={{ flexShrink: 0 }}>
                        <line x1="0" y1="2" x2="55" y2="2" stroke={getStepBorderColorByStep(step)} strokeWidth="2" />
                      </svg>
                      <CaretRightFilled className="w-4 h-4 relative left-[-5px]" style={{ color: getStepBorderColorByStep(step), flexShrink: 0 }} />
                      {!automationEditor.isTesting && !automationEditor.chatLoading && !isFullScreen && (
                        <>
                          {isAddingStep && (
                            <div
                              style={{
                                position: 'absolute',
                                left: '20px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                opacity: hoveredConnectorIndex === index ? 1 : 0,
                                transition: 'opacity 0.2s ease-in-out',
                                pointerEvents: hoveredConnectorIndex === index ? 'auto' : 'none'
                              }}
                              className="connector-add-btn"
                            >
                              <Spin indicator={<LoadingOutlined spin style={{ fontSize: 16 }} />} />
                            </div>
                          )}
                          {!isAddingStep && (
                            <Button
                              style={{
                                position: 'absolute',
                                opacity: hoveredConnectorIndex === index ? 1 : 0,
                                transition: 'opacity 0.2s ease-in-out',
                                pointerEvents: hoveredConnectorIndex === index ? 'auto' : 'none'
                              }}
                              onClick={() => addStep(index + 1)}
                              className="absolute left-[20px] connector-add-btn"
                              icon={<Plus className="w-4 h-4" />}
                              shape="circle"
                            />
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* End */}
              {steps.length > 0 && (
                <div className="flex" style={{ marginRight: 24 }}>
                  <div
                    className="relative card-background-color rounded-lg p-2 shadow-sm hover:shadow-md transition-shadow cursor-pointer min-w-[100px] max-w-[100px]"
                    style={{
                      border: ((): string | undefined => {
                        const s = getEndStepStatus();
                        if (s === 'stopped') return '2px solid #ffc107';
                        if (s === 'completed') return '2px solid var(--progress-indicator-green)';
                        if (s === 'failed') return '2px solid var(--progress-indicator-red)';
                        return undefined;
                      })(),
                      boxShadow: selectedStep && selectedStep.id === 'final-summary' ? 'var(--primary-color) 0px 0px 0px 2px' : undefined
                    }}
                    onClick={() => {
                      onStepClick?.({
                        id: 'final-summary',
                        name: automationEditor.automationRef.current?.title || 'Automation Execution Summary',
                        status: getEndStepStatus(),
                        type: 'end',
                        title: automationEditor.automationRef.current?.title || 'Automation Execution Summary',
                        explanation: automationEditor.outputSummary?.summary
                      });
                    }}
                  >
                    End
                  </div>
                </div>
              )}

              {steps.length === 0 && (
                <div className="flex flex-col items-center justify-center w-full h-full text-gray-500">
                  <div className="text-center">
                    <p className="text-lg mb-4">No workflow steps yet</p>
                    <Button icon={<Plus className="w-4 h-4" />} onClick={() => addStep(0)} type="primary" size="large">
                      Add Step
                    </Button>
                    <p className="text-sm mt-4">Click &quot;Add Step&quot; to create your first workflow step</p>
                  </div>
                </div>
              )}
            </div>
          </TransformComponent>
        </TransformWrapper>
      </div>

      {/* Copy Step Modal */}
      <Modal
        title={`Copy Step: ${copyStepData?.name || ''}`}
        open={isCopyModalOpen}
        onCancel={() => { setIsCopyModalOpen(false); setCopyStepData(null); }}
        footer={null}
        width={500}
      >
        {copyStepData && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-gray-600 mb-3">Choose where to place the copied step:</p>
            <Select
              placeholder="Select position"
              className="w-full"
              value={copyPosition}
              onChange={(value) => setCopyPosition(value)}
              options={[
                { value: 'beginning', label: 'At the beginning' },
                ...steps.map((s: WorkflowStep) => ({ value: s.id, label: `After "${s.name}"` })),
                { value: 'end', label: 'At the end' }
              ]}
            />
            <div className="flex justify-end gap-2 mt-4">
              <Button onClick={() => { setIsCopyModalOpen(false); setCopyStepData(null); setCopyPosition(''); }}>
                Cancel
              </Button>
              <Button
                type="primary"
                onClick={() => {
                  if (!copyPosition) return;
                  const toCopy = copyStepData!;
                  const newStep: WorkflowStep = { ...toCopy, id: String(Date.now()), name: `${toCopy.name} (Copy)`, status: 'pending' };
                  let newSteps: WorkflowStep[] = [];
                  if (copyPosition === 'beginning') newSteps = [newStep, ...steps];
                  else if (copyPosition === 'end') newSteps = [...steps, newStep];
                  else {
                    const idx = steps.findIndex((s: WorkflowStep) => s.id === copyPosition);
                    newSteps = [...steps]; newSteps.splice(idx + 1, 0, newStep);
                  }
                  automationEditor.automationRef.current!.v3Steps = newSteps;
                  automationEditor.setDocVersion(automationEditor.docVersion + 1);
                  setIsCopyModalOpen(false); setCopyStepData(null); setCopyPosition('');
                }}
                disabled={!copyPosition}
              >
                Copy Step
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
});

export default WorkflowViewportV3;
