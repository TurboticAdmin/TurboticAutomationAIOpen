import { useMemo, useRef, useEffect, forwardRef, useImperativeHandle, useState } from 'react';
import useAutomationEditor from "../hooks/automation-editor";
import { 
    Zap, 
    GitBranch, 
    Play,
    CheckIcon,
    Settings,
    ArrowUp,
} from 'lucide-react';
import { App, Spin, Tooltip, Typography, Button } from 'antd';
import { ApiOutlined, CaretRightFilled, CheckCircleFilled, ExclamationCircleFilled, LoadingOutlined } from '@ant-design/icons';
import { vendorLogos } from './vendor-icon-list';
import WorkflowViewportV3 from './workflow-viewport-v3';
import { exposedFunctions } from './chat-window';
import { toast } from '@/hooks/use-toast';
import eventsEmitter from '@/lib/events-emitter';

export type WorkflowViewportHandle = {
    /** Center/bias the canvas so the step is visible left-aligned-ish */
    focusStep: (stepId: string | null, opts?: { smooth?: boolean; biasLeft?: boolean; snapLeft?: boolean }) => void;
};

export const WorkflowViewportV2 = ({ 
    onStepClick,
    selectedStep,
    isFullScreen
  }: { 
    onStepClick?: (step: any) => void;
    selectedStep?: any;
    isFullScreen?: boolean;
  }) => {
    const automationEditor = useAutomationEditor();
    const [isUpgrading, setIsUpgrading] = useState(false);

    const workflow = automationEditor.finalWorkflow;
    const containerRef = useRef<HTMLDivElement>(null);
    
    // Check if version is not '3' - show button when in v2 view
    // (version is '2', 2, undefined, or null - anything except '3' or 3)
    const version = automationEditor.automationRef.current?.version;
    const isV2Automation = version !== '3' && version !== 3;
    
    // Note: Upgrade logic is now handled directly in chat-window.tsx when setReadyToTest(true) is called
    // This ensures the toast shows exactly when the Test Now button appears
    
    const handleUpgradeToV3 = async () => {
        if (!automationEditor.automationRef.current) return;
        
        setIsUpgrading(true);
        
        try {
            const automation = automationEditor.automationRef.current;                       
            // Emit event to signal that upgrade has started
            // This will be picked up by chat-window.tsx when code is generated
            eventsEmitter.emit('upgrade:v2-to-v3-started', { automationId: automation._id });            
            // Send chat message with the code
            const message = `Please migrate the code to the latest version while preserving the existing logic. Apply the update directly in the response without requiring additional clarification.Old code: ${automation.code}`;
            if (exposedFunctions.handleSend) {
                // Call handleSend with message as customMessage (second param)
                // Signature: handleSend(invisibleMessage?, customMessage?, attempt?, images?, previewUrls?)
                try {
                    exposedFunctions.handleSend(undefined, message);                    
                    // Note: The useEffect will handle detecting when chatLoading becomes true
                    // We just need to ensure the ref is updated when it happens
                    // The useEffect will log and detect the transition automatically
                } catch (sendError) {
                    toast.error("Error", 'Failed to send upgrade request. Please try again.');
                    setIsUpgrading(false);
                }
            }
            
            // Note: Version will be updated to '3' in chat-window.tsx when code is generated
            // The toast will show automatically when setReadyToTest(true) is called
        } catch (error) {
            toast.error("Error", 'Upgrade Failed - Failed to send upgrade request. Please try again.');
            setIsUpgrading(false);
        }
    };

    // Auto-scroll to selected step only when step ID changes
    useEffect(() => {
        if (selectedStep && containerRef.current) {
            const stepElement = containerRef.current.querySelector(`[data-step-id="${selectedStep.id}"]`);
            if (stepElement) {
                stepElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                    inline: 'center'
                });
            }
        }
    }, [selectedStep?.id]);

    const getStepIcon = (step: any) => {
        const stepType = step.vendorIcon || step.icon || 'automation';
        if (vendorLogos.includes(stepType)) {
            return <img src={`/images/vendor-logos/top100-logos/${stepType}.svg`} alt={stepType} className="w-8 h-8" />;
        }

        // Default icons for step types
        switch (stepType) {
            case 'settings':
                return <Settings className="w-8 h-8 text-blue-600" />;
            case 'automation':
                return <Zap className="w-8 h-8 text-blue-600" />;
            case 'condition':
                return <GitBranch className="w-8 h-8 text-blue-600" />;
            case 'trigger':
                return <Play className="w-8 h-8 text-blue-600" />;
            case 'api':
                return <ApiOutlined style={{ fontSize: 32 }} className="w-8 h-8 !text-blue-600" />;
            default:
                return <Zap className="w-8 h-8 text-gray-600" />;
        }
    };

    const getStepColors = (stepType: string) => {
        switch (stepType) {
            case 'automation':
                return {
                    bg: 'bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20',
                    border: 'border-blue-200 dark:border-blue-700',
                    icon: 'text-blue-600 dark:text-blue-400'
                };
            case 'condition':
                return {
                    bg: 'bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20',
                    border: 'border-purple-200 dark:border-purple-700',
                    icon: 'text-purple-600 dark:text-purple-400'
                };
            case 'trigger':
                return {
                    bg: 'bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20',
                    border: 'border-green-200 dark:border-green-700',
                    icon: 'text-green-600 dark:text-green-400'
                };
            default:
                return {
                    bg: 'bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900/20 dark:to-gray-800/20',
                    border: 'border-gray-200 dark:border-gray-700',
                    icon: 'text-gray-600 dark:text-gray-400'
                };
        }
    };

    const getStepStatus = (step: any) => {
        if (step.status === 'completed') return <CheckIcon style={{ background: 'var(--progress-indicator-green)', color: 'white', borderRadius: 50, padding: 3 }} className="w-4 h-4 text-[16px] text-green-500" />;
        // if (step.status === 'pending') return <Clock className="w-4 h-4 text-blue-500 animate-spin" />;
        // if (step.status === 'running') return <Clock className="w-4 h-4 text-blue-500 animate-spin" />;
        if (step.status === 'failed') return <ExclamationCircleFilled className="relative top-[-17px] w-4 h-4" style={{ color: 'var(--progress-indicator-red)' }} />;
        return null;
    };

    const getStepBorder = (step: any) => {
        if (step.status === 'running') return '2px solid var(--primary-color)';
        if (step.status === 'completed') return '2px solid var(--progress-indicator-green)';
        if (step.status === 'failed') return '2px solid var(--progress-indicator-red)';
        return undefined;
    };

    const getStepBorderColor = (step: any) => {
        if (step.status === 'running') return 'var(--primary-color)';
        if (step.status === 'completed') return 'var(--progress-indicator-green)';
        if (step.status === 'failed') return 'var(--progress-indicator-red)';
        return '#cbcbcb';
    };

    if (Array.isArray(workflow?.steps)) {
        return (
            <div className="flex flex-col justify-center" style={{ alignItems: 'flex-start', height: '100%', width: '100%' }}>
                <div
                    ref={containerRef}
                    className={`inline-flex items-center gap-6 small-screen-p-0 ${isFullScreen ? 'px-8 pb-8 pt-0' : 'p-8'}`}
                    style={{ overflow: 'auto', width: '100%' }}
                >
                    {workflow.steps.map((step: any, index: number) => {
                        const colors = getStepColors(step.type || 'automation');
                        const isLast = index === workflow.steps.length - 1;

                        return (
                            <div
                                key={step.id || index}
                                title={step.title || step.label || `Step ${index + 1}`}
                                className={"flex items-center relative " + (isLast ? '' : 'mr-[50px]')}
                                data-step-id={step.id || index}
                                onClick={() => {
                                    if (step.explanation && step.status !== 'pending') {
                                        // Call the onStepClick callback to update the output summary
                                        if (onStepClick) {
                                            onStepClick({
                                                ...step,
                                                isLastStep: isLast
                                            });
                                        }
                                    }
                                }}
                            >
                                {/* Step Card */}
                                <div>
                                    <div
                                        className={"relative bg-white rounded-xl hover:shadow-md transition-all duration-300 group w-[80px] h-[80px]" + (step.explanation ? ' !cursor-pointer' : ' !cursor-default')}
                                        style={{
                                            border: getStepBorder(step),
                                            boxShadow: selectedStep && selectedStep.id === step.id ? 'var(--primary-color) 0px 0px 0px 2px' : undefined

                                        }}
                                    >
                                        {/* Status Indicator */}
                                        <div className="absolute -top-2 -right-2 z-10">
                                            {getStepStatus(step)}
                                        </div>

                                        {/* Card Content */}
                                        <div className="p-4 flex flex-col h-full">
                                            {/* Icon */}
                                            <div className="flex justify-center flex-1 items-center">
                                                {getStepIcon(step)}
                                            </div>
                                        </div>
                                    </div>
                                    {/* Title */}
                                    <div className="text-center mt-auto relative w-[80px]">
                                        <Typography.Paragraph ellipsis={{ rows: 2, tooltip: true }} className="text-xs font-medium text-gray-700 leading-tight !m-0">
                                            {step.title || step.label || `Step ${index + 1}`}
                                        </Typography.Paragraph>
                                        {/* {step.status === "running" && (
                                            <div className="absolute bottom-[-40px] right-[30px]">
                                                <Spin
                                                    indicator={<LoadingOutlined className="text-[28px]" spin/>}
                                                />
                                            </div>
                                        )} */}
                                    </div>

                                </div>

                                {/* Connector Line */}
                                {!isLast && (
                                    <div className="flex items-center absolute left-[100%] top-[35px]">
                                        <div className="w-[13px] h-[13px] rounded-full" style={{ backgroundColor: getStepBorderColor(step) }}></div>
                                        <div className="w-[55px] h-0.5" style={{ backgroundColor: getStepBorderColor(step) }}></div>
                                        <CaretRightFilled className="w-4 h-4 relative left-[-5px]" style={{ color: getStepBorderColor(step) }} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                {/* Upgrade Button - Only show if version is not '3' */}
                {isV2Automation && (
                    <div className="flex justify-center w-full pb-4">
                        <Button
                            type="primary"
                            size="large"
                            icon={<ArrowUp className="w-4 h-4" />}
                            loading={isUpgrading}
                            onClick={handleUpgradeToV3}
                            className="flex items-center gap-2"
                        >
                            Upgrade to Latest Version
                        </Button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="flex justify-center items-center p-8">
            <div className="text-center text-gray-500 dark:text-gray-400">
                <Zap className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No workflow steps available</p>
            </div>
        </div>
    );
}

const WorkflowViewport = forwardRef<WorkflowViewportHandle, any>(function WorkflowViewport(props: any, ref) {
    const automationEditor = useAutomationEditor();
    
    if (!automationEditor.automationRef.current) {
        return null;
    }

    // Check for version 3 (string or number)
    const version = automationEditor.automationRef.current?.version;
    if (version === '3' || version === 3) {
        return <WorkflowViewportV3 {...props} ref={ref} />;
    }
    
    return (
        <WorkflowViewportV2 
            {...props}
        />
    )
});

export default WorkflowViewport;