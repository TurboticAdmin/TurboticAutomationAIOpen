import { LoadingOutlined, DownloadOutlined, FileOutlined } from "@ant-design/icons";
import { Button, Spin, Modal, Typography, Empty } from "antd";
import useAutomationEditor from "../hooks/automation-editor";
import { useEffect, useMemo, useState, useRef } from "react";
// import LogExplainer from "./log-explainer";
import WorkflowViewport, { WorkflowViewportHandle } from "./workflow-viewport";
import OutputSummary from "./output-summary";
import { toast } from '@/hooks/use-toast';
import { createPortal } from "react-dom";

const { Text } = Typography;

function Automation() {
  const { isTesting, responseStatusMessage, runCode, isSaving, setActiveTab, chatLoading, workflow, finalWorkflow, outputSummary, automationRef, latestProgress } =
    useAutomationEditor();
  
  const [selectedStep, setSelectedStep] = useState<any>(null);
  const [isFullScreenModalOpen, setIsFullScreenModalOpen] = useState(false);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const prevIsTestingRef = useRef(isTesting);

  // Refs to call imperative pan inside WorkflowViewport
  const mainViewportRef = useRef<WorkflowViewportHandle | null>(null);
  const modalViewportRef = useRef<WorkflowViewportHandle | null>(null);

  const buttonText = useMemo(() => {
    if (chatLoading) {
      return 'See code'
    }

    if (isSaving) {
      return "Saving...";
    }

    if (isTesting) {
      return "See logs";
    }

    return "Run automation";
  }, [isTesting, isSaving, responseStatusMessage]);

  // Clear selected step (especially final-summary) when outputSummary is cleared
  // This only runs when a NEW run is about to start, not when the current run finishes
  useEffect(() => {
    // Only clear if outputSummary was explicitly cleared (when starting a NEW run)
    // Don't clear when run just finished (if isSummaryLoading is true, we're waiting for the summary)
    if (outputSummary === null && selectedStep?.id === 'final-summary' && !isTesting && !isSummaryLoading) {
      setSelectedStep(null);
      setIsSummaryLoading(false);
    }
  }, [outputSummary, selectedStep, isTesting, isSummaryLoading]);

  // Derive active/running step id from latestProgress
  const activeStepId = useMemo(() => {
    const steps = latestProgress?.steps || [];
    if (!steps.length) return null;

    const normalized = (s: any) => (s?.status || "").toLowerCase();

    // prefer running
    const running = steps.find((s: any) => ["running", "in_progress"].includes(normalized(s)));
    if (running?.stepId) return running.stepId;

    // else next after last completed, or last completed if no next
    let lastDoneIdx = -1;
    for (let i = steps.length - 1; i >= 0; i--) {
      if (normalized(steps[i]) === "completed") { 
        lastDoneIdx = i; 
        break; 
      }
    }
    if (lastDoneIdx >= 0) {
      return steps[lastDoneIdx + 1]?.stepId ?? steps[lastDoneIdx]?.stepId ?? null;
    }

    // else first
    return steps[0]?.stepId ?? null;
  }, [latestProgress]);

  // Reset state at run boundaries + auto-focus
  useEffect(() => {
    const justStarted = prevIsTestingRef.current === false && isTesting === true;
    const justFinished = prevIsTestingRef.current === true && isTesting === false;
    prevIsTestingRef.current = isTesting;

    if (justStarted) {
      // snap hard-left and focus first step if present
      mainViewportRef.current?.focusStep(null, { snapLeft: true });
      modalViewportRef.current?.focusStep(null, { snapLeft: true });

      const firstId = latestProgress?.steps?.[0]?.stepId ?? null;
      if (firstId) {
        mainViewportRef.current?.focusStep(firstId);
        modalViewportRef.current?.focusStep(firstId);
      }
    }

    if (justFinished) {
      setIsSummaryLoading(true);
      // focus tail at the end
      const lastId = latestProgress?.steps?.slice(-1)?.[0]?.stepId ?? null;
      if (lastId) {
        mainViewportRef.current?.focusStep(lastId, { biasLeft: true });
        modalViewportRef.current?.focusStep(lastId, { biasLeft: true });
      }
    }
  }, [isTesting, latestProgress]);

  // Follow active step while running - call on every activeStepId change
  useEffect(() => {
    if (!activeStepId) {
      return;
    }
    // Always call focusStep when activeStepId changes, not just when isTesting changes
    mainViewportRef.current?.focusStep(activeStepId, { biasLeft: true, smooth: true });
    modalViewportRef.current?.focusStep(activeStepId, { biasLeft: true, smooth: true });
  }, [activeStepId]); // Only depend on activeStepId, not isTesting

  // When outputSummary becomes available, clear loading state
  useEffect(() => {
    if (outputSummary) {
      setIsSummaryLoading(false);
    }
  }, [outputSummary]);

  // When a new run starts, steps get reset to 'pending'. If the currently
  // selected step has been reset, clear the selection to avoid showing
  // stale status from the previous run.
  // Note: Don't clear if it's the End step (final-summary) as we want to keep it selected
  useEffect(() => {
    if (!selectedStep) return;

    // Don't clear the End step selection
    if (selectedStep.id === 'final-summary') {
      return;
    }

    const updated = finalWorkflow?.steps?.find((s: any) => s.id === selectedStep.id);
    if (updated && (updated.status === 'pending' || updated.status === undefined)) {
      setSelectedStep(null);
    }
  }, [finalWorkflow, selectedStep]);

  // Calculate if we should show the "Show details" button
  const showDetailsButton = !isTesting && outputSummary && !selectedStep;
  
  // Get output files from outputSummary
  const outputFiles = outputSummary?.outputFiles || [];
  
  // Handle download files
  const handleDownloadFile = (file: { fileId: string; fileName: string }) => {
    const link = document.createElement('a');
    link.href = `/api/files/${file.fileId}`;
    link.download = file.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAll = () => {
    if (outputFiles.length === 0) return;
    toast.info('Downloaded ' + outputFiles.length + ' files');
    outputFiles.forEach((f: any) => handleDownloadFile(f));
  };

  const handleDownloadAllFromModal = () => {
    if (outputFiles.length === 0) return;
    toast.info('Downloaded ' + outputFiles.length + ' files');
    outputFiles.forEach((f: any) => handleDownloadFile(f));
  };

  return (
    <div className="flex align-center flex-col gap-4" style={{ height: 'calc(100%)', position: 'relative' }}>
      <div className="font-bold text-center sm:m-0 mt-10 mb-4 h-full">
        {chatLoading && (automationRef.current?.v3Steps || [])?.length === 0 && <>
            <div className="flex justify-center items-center">
              <Spin indicator={<LoadingOutlined spin style={{ fontSize: 48 }} />} />
            </div>
            <span className="text-[32px] ai-gradient-text small-screen-text-20">
            Building your automation
          </span>
          <div>
            <Button type="primary" shape="round" onClick={() => setActiveTab('main')}>See code</Button>
          </div>
        </>}
          {/* style={{ marginTop: '24px', marginBottom: showDetailsButton ? '80px' : '24px', height: 'calc(100% - 24px)' }}*/}
        {(!chatLoading || (automationRef.current?.v3Steps || [])?.length > 0) && <div className="h-full" >
          <WorkflowViewport
            ref={mainViewportRef}
            onStepClick={(step: any) => {
              if (!step && isTesting) {
                return;
              }
              setSelectedStep(step);
              // Open modal when a step is clicked
              if (step) {
                setIsFullScreenModalOpen(true);
              }
            }}
            selectedStep={selectedStep}
          />
        </div>}
      </div>

      {/* Show details button at the bottom when automation finishes */}
      {showDetailsButton && document.getElementById('running-step-details-portal') && createPortal((
        <div style={{
          zIndex: 1000,
          display: 'flex',
          // bottom: isTesting ? 60 : undefined
        }}>
          <Button shape="round" type="text" className="secondary-text" onClick={() => setActiveTab('logs')}>See logs</Button>
          {outputFiles.length > 0 && (
            <Button
              type="text"
              shape="round"
              className="secondary-text"
              onClick={() => setIsDownloadModalOpen(true)}
            >
              Download Files ({outputFiles.length})
            </Button>
          )}
          <Button
            type="text"
            shape="round"
            className="secondary-text"
            onClick={() => {
              // Select the End summary step
              const lpSteps = latestProgress?.steps || [];
              const hasStopped = lpSteps.some((s: any) => s.status === 'stopped');
              const hasFailed = lpSteps.some((s: any) => ['failed', 'error', 'errored'].includes(s.status));
              const allCompleted = lpSteps.length > 0 && lpSteps.every((s: any) => s.status === 'completed');
              const endStatus = hasStopped ? 'stopped' : (hasFailed ? 'failed' : (allCompleted ? 'completed' : 'completed'));

              setSelectedStep({
                id: 'final-summary',
                name: automationRef.current?.title || 'End',
                title: automationRef.current?.title || 'End',
                status: endStatus,
                explanation: outputSummary?.summary
              });
              setIsFullScreenModalOpen(true);

              const lastStepId = latestProgress?.steps?.slice(-1)?.[0]?.stepId ?? null;
              if (lastStepId) {
                mainViewportRef.current?.focusStep(lastStepId, { biasLeft: true, smooth: true });
              }
            }}
          >
            Show Details
          </Button>
        </div>
      ), document.getElementById('running-step-details-portal') as HTMLElement)}

      {/* {(isTesting) && !selectedStep && (
        <Spin 
          indicator={<LoadingOutlined spin style={{ fontSize: 48 }} />} 
          className="!absolute lg:bottom-[25px] md:bottom-[25px] sm:bottom-[15px] bottom-[40px] xl:bottom-[30px] 2xl:bottom-[25%] left-[50%]"
          style={{ transform: 'translateX(-50%)', zIndex: 10 }} 
        />
      )} */}

      {/* Full Screen Modal */}
      <Modal
        open={isFullScreenModalOpen}
        onCancel={() => {
          setIsFullScreenModalOpen(false);
          setSelectedStep(null); // Clear selected step when closing modal
        }}
        footer={null}
        width="var(--window-width)"
        style={{ top: 20, maxWidth: 'calc(var(--window-width) - 40px)' }}
        styles={{
          body: {
            padding: '24px',
            height: 'calc(var(--window-height) - 85px)'
          }
        }}
      >
        <div className="flex h-full" style={{ flexDirection: 'column', gap: '16px' }}>
          {/* Top section - Workflow Viewport (40% height) */}
          <div style={{ 
            height: '40%', 
            display: 'flex', 
            flexDirection: 'column',
            borderBottom: '1px solid var(--border-default)',
            paddingBottom: '16px',
            overflow: 'hidden'
          }}>
            <h3 className="text-lg font-semibold !mb-4">Workflow details</h3>
            <div style={{ 
              flex: 1,
              overflow: 'auto' 
            }}>
              <WorkflowViewport 
                ref={modalViewportRef}
                onStepClick={setSelectedStep}
                selectedStep={selectedStep}
                isFullScreen={true}
              />
            </div>
          </div>
          
          {/* Bottom section - Output Summary (60% height) */}
          <div style={{ 
            height: '60%', 
            display: 'flex', 
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {selectedStep && <h3 className="text-lg font-semibold !mb-4">Step details</h3>}
            <div style={{ flex: 1, overflow: 'auto' }}>
              <OutputSummary
                outputSummary={outputSummary}
                selectedStep={selectedStep}
                loading={isSummaryLoading && selectedStep?.id === 'final-summary'}
                isFullScreen={true}
              />
            </div>
          </div>
        </div>
      </Modal>

      {/* Download Files Modal */}
      <Modal
        title="Download Files"
        open={isDownloadModalOpen}
        onCancel={() => setIsDownloadModalOpen(false)}
        footer={null}
        width={600}
      >
        {outputFiles.length > 0 ? (
          <div>
            <div className="mb-4">
              <Text>Available files for download:</Text>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {outputFiles.map((file: any) => (
                <div
                  key={file.fileId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: 10,
                    background: 'var(--cards)',
                    minWidth: 0
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        background: '#E7F7EF',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}
                    >
                      <FileOutlined style={{ color: '#1E8E3E' }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
                      <span 
                        className="text-color"
                        style={{
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          maxWidth: '100%'
                        }}
                        title={file.fileName}
                      >
                        {file.fileName}
                      </span>
                    </div>
                  </div>

                  <Button
                    shape="circle"
                    type="text"
                    aria-label={`Download ${file.fileName}`}
                    icon={<DownloadOutlined />}
                    onClick={() => handleDownloadFile(file)}
                  />
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
              <Button onClick={() => setIsDownloadModalOpen(false)}>Cancel</Button>
              <Button type="primary" icon={<DownloadOutlined />} onClick={handleDownloadAllFromModal}>
                Download all ({outputFiles.length})
              </Button>
            </div>
          </div>
        ) : (
          <Empty description="No files available for download" />
        )}
      </Modal>
    </div>
  );
}

export default Automation;
