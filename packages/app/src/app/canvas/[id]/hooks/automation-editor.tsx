"use client";
import { createContext, Dispatch, RefObject, SetStateAction, useCallback, useContext, useEffect, useRef, useState, useMemo } from 'react';
import { AIMessageChunk, HumanMessageChunk, ToolMessageChunk } from '@langchain/core/messages';
import { concat } from '@langchain/core/utils/stream';
import { cloneDeep } from 'lodash';
import { applyCodeEdits, convertAIMessageToString } from '@/lib/utils';
import { getDeviceId } from '@/lib/get-deviceid';
import { useParams } from 'next/navigation';
import { toast } from '@/hooks/use-toast';
import { exposedFunctions } from '../components/chat-window';
import { editor } from 'monaco-editor';
import eventsEmitter from '@/lib/events-emitter';
import { useUserCapabilities } from '@/hooks/useUserCapabilities';
import { useUpgrade } from '@/contexts/UpgradeContext';
import { socket } from '@/lib/socket';

type AutomationStates = 'ready' | 'running' | 'pausing' | 'paused';

type UploadModalState = {
    isOpen: boolean,
    fileList: any[],
    uploadStatus: 'initial' | 'pending' | 'success' | 'error'
}

type AutomationEditor = {
    load: (id: string) => Promise<void>
    isLoading: boolean
    automationRef: RefObject<any>
    docVersion: number,
    setDocVersion: Dispatch<SetStateAction<number>>
    fitAddon: RefObject<any>
    terminal: RefObject<any>
    writeTerminalLine: (line: string) => void
    currentCode: string
    setCurrentCode: Dispatch<SetStateAction<string>>
    environmentVariables: any[]
    setEnvironmentVariables: Dispatch<SetStateAction<any[]>>
    isSaving: boolean
    dependencies: any[]
    setDependencies: Dispatch<SetStateAction<any[]>>
    currentExecutionId: string | null,
    setCurrentExecutionId: Dispatch<SetStateAction<string | null>>
    planToAutomate: RefObject<any>,
    automationChangeVersion: number,
    setActiveTab: Dispatch<SetStateAction<string>>,
    activeTab: string,
    enableContinue: string,
    setEnableContinue: Dispatch<SetStateAction<string>>,
    continueCallbackRef: RefObject<any>,
    runCode: (waitForResult?: boolean, inputFiles?: string[], showRunInfoPopup?: boolean, resume?: boolean, runFromStepId?: string, runOne?: boolean) => Promise<any>
    isTesting: boolean,
    fetchTestResult: (executionId: string) => Promise<any>
    automationState: AutomationStates,
    setAutomationState: Dispatch<SetStateAction<AutomationStates>>
    onceCallbacksRef: RefObject<any>
    autoPilot: boolean,
    setAutoPilot: Dispatch<SetStateAction<boolean>>
    readyToTest: boolean,
    setReadyToTest: Dispatch<SetStateAction<boolean>>
    autopilotCountdown: number,
    readyToFix: boolean,
    getAutoFixMessage: () => string | false,
    setReadyToFix: Dispatch<SetStateAction<boolean>>
    responseStatusMessage: string,
    setResponseStatusMessage: Dispatch<SetStateAction<string>>,
    showBrowserScreen: boolean,
    setShowBrowserScreen: Dispatch<SetStateAction<boolean>>
    lastErrorCode: number,
    screenshots: string[],
    setScreenshots: Dispatch<SetStateAction<string[]>>,
    uploadModalState: UploadModalState,
    setUploadModalState: Dispatch<SetStateAction<UploadModalState>>,
    executeUploadFiles: (files: any[], envName?: string, atuomationId?: string, userId?: string, uploadMode?: string) => Promise<any>,
    activeOutputTab: string,
    setActiveOutputTab: Dispatch<SetStateAction<string>>,
    showChatWindow: boolean,
    setShowChatWindow: Dispatch<SetStateAction<boolean>>,
    stopAutomation: () => Promise<any>,
    isStoppingAutomation: boolean,
    showScheduleAutomationModal: boolean,
    setShowScheduleAutomationModal: Dispatch<SetStateAction<boolean>>,
    editorRef: RefObject<editor.IStandaloneCodeEditor>,
    chatLoading: boolean,
    setChatLoading: Dispatch<SetStateAction<boolean>>,
    logExplanation: any,
    setLogExplanation: Dispatch<SetStateAction<any>>,
    workflow: any,
    finalWorkflow: any,
    autoAcceptChanges: boolean,
    setAutoAcceptChanges: Dispatch<SetStateAction<boolean>>,
    generateWorkflow: (id: string, code: string) => Promise<any>,
    setUpdatedWorkflow: Dispatch<SetStateAction<any>>,
    setWorkflow: Dispatch<SetStateAction<any>>,
    outputSummary: any,
    latestProgress: any,
    isResumable: boolean,
    setIsResumable: Dispatch<SetStateAction<boolean>>,
    lastRunTokenId: string | null,
    setLastRunTokenId: Dispatch<SetStateAction<string | null>>,
    checkResumability: () => Promise<void>,
    fetchStepSummary: (stepId: string, stepStatus: string) => Promise<any>
}

export function DeserialiseChunk(chunk: any) {
    switch (chunk.type) {
        case 'ai':
            return new AIMessageChunk(chunk.data);
        case 'tool':
            return new ToolMessageChunk(chunk.data);
        case 'human':
            return new HumanMessageChunk(chunk.data);
    }
}

function normalizePlanItem(item: any) {
    return item;
}

function normalizePlan(plan: any) {
    plan.steps = plan.steps.map(normalizePlanItem);
    plan.currentActiveSteps = [];
    return plan;
}

const terminalTheme = {
    background: 'var(--background-color)',              // soft light background
    foreground: 'var(--text-color)',              // base text (cool gray-blue)
    cursor: '#657b83',                  // darker gray-blue for visibility
    cursorAccent: '#fdf6e3',            // cursor text color (same as bg)
    selectionBackground: '#dbeaf7',     // light blue selection
    selectionForeground: '#000000',     // black text when selected
    selectionInactiveBackground: '#e5e5e5',

    black: '#073642',
    red: '#dc322f',
    green: '#859900',
    yellow: '#b58900',
    blue: '#268bd2',
    magenta: '#d33682',
    cyan: '#2aa198',
    white: '#eee8d5',

    brightBlack: '#002b36',
    brightRed: '#cb4b16',
    brightGreen: '#586e75',
    brightYellow: '#657b83',
    brightBlue: '#839496',
    brightMagenta: '#6c71c4',
    brightCyan: '#93a1a1',
    brightWhite: '#fdf6e3',

    extendedAnsi: undefined // Only needed if you define 256+ colors manually
}

const isAutoPilotEnabled = () => {
    if (typeof window === 'undefined') return true;
    if (!localStorage.getItem('autoPilot')) {
        return true;
    }
    return localStorage.getItem('autoPilot') === 'true';
}

export const getModel = () => {
    if (global?.window?.localStorage) {
        const m = global.window.localStorage.getItem('model');
        
        if (m === 'gpt-5') {
            console.log('Using GPT 5');
            return 'gpt-5';
        }

        if (m === 'gpt-5.1-codex') {
            console.log('Using GPT 5.1 Codex');
            return 'gpt-5.1-codex';
        }
    }

    return undefined;
}

export function createAutomationEditor(): AutomationEditor {
    const automationRef = useRef<any>(null);
    const [docVersion, setDocVersion] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const fitAddon = useRef<any>(null);
    const terminal = useRef<any>(null);
    const [currentCode, setCurrentCode] = useState('');
    const [environmentVariables, setEnvironmentVariables] = useState<any[]>([]);
    const [dependencies, setDependencies] = useState<any[]>([]);

    // Sync environmentVariables state to ref for autosave
    useEffect(() => {
        if (automationRef.current) {
            automationRef.current.environmentVariables = environmentVariables;
        }
    }, [environmentVariables]);
    const [isSaving, setIsSaving] = useState(false);
    const [hasInitialised, setHasInitialised] = useState(false);
    const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
    const [workflow, setWorkflow] = useState<any>(null);
    const planToAutomate = useRef<any>(null);
    const [automationChangeVersion, setAutomationChangeVersion] = useState(0);
    const [activeTab, setActiveTab] = useState('automations');
    const [activeOutputTab, setActiveOutputTab] = useState('logs');
    const [enableContinue, setEnableContinue] = useState('');
    const continueCallbackRef = useRef<any>(null);
    const [isTesting, setIsTesting] = useState(false);
    const params = useParams();
    const [automationState, setAutomationState] = useState<AutomationStates>('ready');
    const onceCallbacksRef = useRef<any>({});
    const [autoPilot, setAutoPilot] = useState(true);
    const [readyToTest, setReadyToTest] = useState(false);
    const [readyToFix, setReadyToFix] = useState(false);
    const [lastErrorCode, setLastErrorCode] = useState(0);
    const [autopilotCountdown, setAutopilotCountdown] = useState(5);
    const [responseStatusMessage, setResponseStatusMessage] = useState('');
    const [showBrowserScreen, setShowBrowserScreen] = useState(false);
    const [showChatWindow, setShowChatWindow] = useState(true);
    const logQueue = useRef<string[]>([]);
    const [screenshots, setScreenshots] = useState<string[]>([]);
    const [uploadModalState, setUploadModalState] = useState<UploadModalState>(
        {
          isOpen: false,
          fileList: [],
          uploadStatus: 'initial'
        }
    );
    const [isStoppingAutomation, setIsStoppingAutomation] = useState(false);
    const [showScheduleAutomationModal, setShowScheduleAutomationModal] = useState(false);
    const editorRef = useRef<any>(undefined);
    const [chatLoading, setChatLoading] = useState(false)
    const [logExplanation, setLogExplanation] = useState<any>(null);
    const [updatedWorkflow, setUpdatedWorkflow] = useState<any>(null);
    const [autoAcceptChanges, setAutoAcceptChanges] = useState(true);
    const [outputSummary, setOutputSummary] = useState<any>(null);
    const [latestProgress, setLatestProgress] = useState<any>(null);
    const [isResumable, setIsResumable] = useState(false);
    const [lastRunTokenId, setLastRunTokenId] = useState<string | null>(null);
    // Store snapshot of steps when a run fails, to detect which steps were modified
    const stepsSnapshotOnFailure = useRef<any[] | null>(null);

    useEffect(() => {
        if (currentExecutionId) {
            socket.emit('join-room', `execution-${currentExecutionId}`);
            console.log('joined room', `execution-${currentExecutionId}`);


            socket.on('connect', () => {
                socket.emit('join-room', `execution-${currentExecutionId}`);
            });

            return () => {
                socket.emit('leave-room', `execution-${currentExecutionId}`);
            }
        }
    }, [currentExecutionId]);

    const getAutoFixMessage = () => {
        if (lastRunResult.current?.latestLogs?.length > 0) {
            const latestLogs = lastRunResult.current.latestLogs;
            const debugMessage = [
                'The script is not working as expected. Here are the latest logs:',
                ...latestLogs,
                'Please rewrite the code in the editor to fix the errors. If the issue is something I need to check outside of code, please let me know.'
            ].join('\n');

            return debugMessage;
        }

        return false;
    }

    // Determine if resume should be true based on which steps were modified
    const shouldResumeFromFailure = (): boolean => {
        // Only for v3 mode with steps
        if (!automationRef.current?.v3Steps || automationRef.current.v3Steps.length === 0) {
            return false;
        }

        // If no snapshot stored, can't determine - default to false (start fresh)
        if (!stepsSnapshotOnFailure.current || stepsSnapshotOnFailure.current.length === 0) {
            return false;
        }

        // If no latestProgress, can't determine failed step - default to false
        if (!latestProgress?.steps || latestProgress.steps.length === 0) {
            return false;
        }

        // Find the failed step index
        const failedStep = latestProgress.steps.find((s: any) => {
            const status = (s?.status || '').toLowerCase();
            return ['failed', 'error', 'errored'].includes(status);
        });

        if (!failedStep?.stepId) {
            // No failed step found - default to false
            return false;
        }

        // Find the index of the failed step in current steps
        const currentSteps = automationRef.current.v3Steps;
        const failedStepIndex = currentSteps.findIndex((s: any) => s.id === failedStep.stepId);
        
        if (failedStepIndex === -1) {
            // Failed step not found in current steps - might have been deleted/modified
            return false;
        }

        // Compare current steps with snapshot to find modified steps
        const snapshotSteps = stepsSnapshotOnFailure.current;
        const modifiedIndices: number[] = [];

        // Check each step for modifications
        for (let i = 0; i < Math.max(currentSteps.length, snapshotSteps.length); i++) {
            const currentStep = currentSteps[i];
            const snapshotStep = snapshotSteps[i];

            // Step was added or removed
            if (!currentStep || !snapshotStep) {
                modifiedIndices.push(i);
                continue;
            }

            // Step ID changed (step was replaced)
            if (currentStep.id !== snapshotStep.id) {
                modifiedIndices.push(i);
                continue;
            }

            // Step code was modified
            if (currentStep.code !== snapshotStep.code) {
                modifiedIndices.push(i);
                continue;
            }

            // Step name was modified (might indicate logic change)
            if (currentStep.name !== snapshotStep.name) {
                modifiedIndices.push(i);
                continue;
            }
        }

        // If no modifications, safe to resume
        if (modifiedIndices.length === 0) {
            return true;
        }

        // Check if all modifications are at or after the failed step index
        const allModificationsAfterFailure = modifiedIndices.every(idx => idx >= failedStepIndex);

        // If modifications are only at failed step and onwards, resume is safe
        // If modifications are before failed step, need to start fresh
        return allModificationsAfterFailure;
    }

    const autopilotInterval = useRef<NodeJS.Timeout | null>(null);
    useEffect(() => {
        // Clear any existing interval first
        if (autopilotInterval.current) {
            clearInterval(autopilotInterval.current);
            autopilotInterval.current = null;
        }

        if (autoPilot === true) {
            if (readyToTest === true || readyToFix === true) {
                // Reset countdown to 5 when starting
                setAutopilotCountdown(5);
                
                autopilotInterval.current = setInterval(() => {
                    setAutopilotCountdown((c) => {
                        if (c <= 1) {
                            // Clear interval when countdown reaches 0
                            if (autopilotInterval.current) {
                                clearInterval(autopilotInterval.current);
                                autopilotInterval.current = null;
                            }
                            
                            // Execute auto pilot action
                            if (readyToTest === true) {
                                // Smart resume logic: only resume if fix impacts only failed step and onwards
                                const shouldResume = shouldResumeFromFailure();
                                runCode(true, undefined, undefined, shouldResume);
                            } 
                            
                            if (readyToFix === true) {
                                const debugMessage = getAutoFixMessage();
                                if (debugMessage) {
                                    exposedFunctions.handleSend(undefined, debugMessage);
                                    setReadyToFix(false);
                                }
                            }
                            
                            return 0;
                        }
                        return c - 1;
                    });
                }, 1000);
            }
        } else {
            // If auto pilot is turned off, clear countdown
            setAutopilotCountdown(5);
        }

        // Cleanup function
        return () => {
            if (autopilotInterval.current) {
                clearInterval(autopilotInterval.current);
                autopilotInterval.current = null;
            }
        };
    }, [readyToTest, readyToFix, autoPilot]);

    const finalWorkflow = useMemo(() => {
        return updatedWorkflow || workflow || automationRef?.current?.workflow;
    }, [automationRef?.current, workflow, updatedWorkflow]);

    const lastRunResult = useRef<any>(null);
    const { canRunCode } = useUserCapabilities();
    const { handleApiError } = useUpgrade();

    const automationVersion = useMemo(() => {
        const version = automationRef?.current?.version;
        return (version === '3' || version === 3) ? '3' : '2';
    }, [automationRef?.current?.version]);

    const getOutputSummary = async (executionHistoryId: string, latestLogs: string[]) => {
        try {
            const res = await fetch(`/api/run/execution-history/${executionHistoryId}/summary?automationId=${params?.id}`, {
                method: 'GET',
                // body: JSON.stringify({ automationId: params?.id })
            });
            const data = await res.json();
            setOutputSummary(data);
        } catch(e) {}
    }

    const temporaryRunTokenId = useRef<string | null>(null);
    const runCode = async (waitForResult: boolean = false, inputFiles?: string[], showRunInfoPopup = false, resume: boolean = false, runFromStepId?: string, runOne: boolean = false) => {
        // Check if user has run code capability
        if (!canRunCode) {
            toast.error("Error",'Code execution capability is currently disabled for your account. Please contact your administrator.');
            return;
        }

        // Check if there are unsaved changes (auto-accept OFF mode)
        // If user has pending changes in diff mode, save them before running
        // This ensures the latest code is executed, not stale code
        const hasPendingChanges = await new Promise<boolean>((resolve) => {
            // Emit event to check if code editor has unsaved changes
            let hasChanges = false;
            const unsubscribe = eventsEmitter.on('code-editor:has-differences-response', (response: boolean) => {
                hasChanges = response;
                unsubscribe();
                resolve(hasChanges);
            });

            // Request check from code editor
            eventsEmitter.emit('code-editor:check-has-differences');

            // Timeout fallback - assume no changes after 500ms
            setTimeout(() => {
                unsubscribe();
                resolve(false);
            }, 500);
        });

        if (hasPendingChanges) {
            // Accept changes to trigger save
            eventsEmitter.emit('code-editor:accept-changes-before-run');

            // Wait for save to complete
            toast.info('Saving changes before execution...');
            await new Promise(resolve => setTimeout(resolve, 1500)); // Wait for debounced save (1000ms) + buffer
        }

        let result: any = undefined;
        // Check environment variables
        const missingEnvironmentVariables = environmentVariables.some((env: any) => {
          // If it has a valueFile, it's a file type - check if valueFile exists
          if (env.valueFile) {
            return false; // File is uploaded, so it's not empty
          }
          // For regular variables, check if value is empty
          return Boolean(env.value) === false;
        });
        if (missingEnvironmentVariables === true) {
            setActiveTab('env');
            setEnableContinue('env-var');

            await new Promise<void>((resolve) => {
                continueCallbackRef.current = () => {
                    setActiveTab('automations');
                    setEnableContinue('');
                    resolve();
                };
            });
        } else {
            setActiveTab('automations')
        }

        setIsTesting(true);
        
        // Cancel auto pilot countdown if running (user clicked Test Now manually)
        if (autopilotInterval.current) {
            clearInterval(autopilotInterval.current);
            autopilotInterval.current = null;
            setAutopilotCountdown(5); // Reset countdown
        }
        
        // Reset UI states for both new runs and resumes
        setReadyToTest(false); // Reset "Test Now" button state
        setReadyToFix(false); // Reset "Fix with AI" button state
        setResponseStatusMessage(''); // Reset chat status message (e.g., "Generating...")
        
        // Clear last run result for both new runs and resumes to prevent stale error states
        lastRunResult.current = null;
        
        // Always clear any previous End step summary before starting
        setOutputSummary(null);
        
        // Reset previous run state at the start of a new run
        if (resume === false) {
            setLatestProgress(null);
            try {
                if (automationRef.current?.v3Steps?.length > 0) {
                    automationRef.current.v3Steps = automationRef.current.v3Steps.map((s: any) => ({
                        ...s,
                        status: 'pending',
                        explanation: undefined // Clear cached step summaries on new run
                    }));
                    setDocVersion((d) => d + 1);
                }
            } catch (e) {
                // non-fatal; best-effort reset
            }
        } else {
            console.log('Resume is true');
            if (runFromStepId) {
                console.log('Run from step id', runFromStepId, automationRef.current?.v3Steps?.length);
                if (latestProgress) {
                    setLatestProgress((p: any) => {
                        return {
                            ...p,
                            steps: p.steps.map((s: any) => {
                                if (s.stepId === runFromStepId) {
                                    return {
                                        ...s,
                                        status: 'running',
                                        explanation: undefined // Clear cached step summaries on new run
                                    }
                                }
                                return s;
                            }),
                        }
                    });
                }
            }
        }

        try {
            if (showRunInfoPopup) {
                toast.info('Executing your automation');
            }
            const dId = await getDeviceId();

            if (terminal.current) {
                terminal.current.clear();
            }

            setScreenshots([]);

            setUpdatedWorkflow((d: any) => (d?.steps?.length > 0 ? {
                steps: d.steps.map((step: any) => ({
                    ...step,
                    status: 'pending',
                    explanation: undefined
                }))
            } : d));

            // Force resume to false if no last run token id
            if (!lastRunTokenId) {
                resume = false;
            }

            temporaryRunTokenId.current = (new Date()).valueOf().toString();

            const res = await fetch(`/api/run/executions`, {
                method: 'post',
                body: JSON.stringify({ dId, automationId: params?.id as any, inputFiles, resume, runTokenId: lastRunTokenId || undefined, runFromStepId, runOne, temporaryRunTokenId: temporaryRunTokenId.current })
            });

            if (!res.ok) {
                const errorData = await res.json();
                throw errorData; // Throw the full error object to preserve upgradeAction
            }

            const data = await res.json();

            const latestWorkflow = data.workflow;
            const executionId = data.executionId;
                
            setCurrentExecutionId(data.executionId);
            setWorkflow(data.workflow);
            setUpdatedWorkflow({
                ...data.workflow,
                steps: data.workflow.steps.map((step: any) => ({
                    ...step,
                    status: 'pending'
                }))
            });

            //toast.info('Run triggered');

            if (waitForResult === true) {
                result = await new Promise((resolve) => {
                    const checkResult = () => {
                        fetchTestResult(data.executionId)
                        .then((data) => {
                            // Check if exit code 137 (stopped) is in the logs
                            const hasExitCode137 = data.latestLogs?.some((log: string) => 
                                log.includes('Run complete with exit code 137')
                            );
                            
                            // If stopped, update the running step to stopped status
                            if (hasExitCode137 || data.errorCode === 137) {
                                setLatestProgress((prev: any) => {
                                    if (!prev || !prev.steps) return prev;
                                    return {
                                        ...prev,
                                        steps: prev.steps.map((step: any) => 
                                            step.status === 'running' ? { ...step, status: 'stopped' } : step
                                        )
                                    };
                                });
                            }
                            
                            if (data.latestLogs?.length > 0 && data.hasFinished === true) {
                                eventsEmitter.emit('run:finished', data);
                                getOutputSummary(data.executionHistoryId, data.latestLogs || []);

                                if (automationVersion === '3') {
                                    resolve(data)
                                } else {
                                    return fetch(`/api/logs/workflow-updates`, {
                                        method: 'POST',
                                        body: JSON.stringify({ finalWorkflow: latestWorkflow, automationId: params?.id, logs: data.latestLogs, executionStatus: data.hasFinished === true ? 'Script has finished running' : 'Script still running' })
                                    })
                                        .then((res) => res.json())
                                        .then((_data) => {
                                            setUpdatedWorkflow(_data);
                                        })
                                        .catch(console.error)
                                        .finally(() => resolve(data));
                                }
                            } else {
                                if (automationVersion === '3') {
                                    // Check if exit code 137 (stopped) is in the logs
                                    const hasExitCode137 = data.latestLogs?.some((log: string) => 
                                        String(log).includes('Run complete with exit code 137')
                                    );
                                    
                                    fetch(`/api/run/latest-progress`, {
                                        method: 'POST',
                                        body: JSON.stringify({ executionId, temporaryRunTokenId: temporaryRunTokenId.current })
                                    })
                                        .then((res) => res.json())
                                        .then((_data) => {
                                            if (_data) {
                                                let progress = _data?.progress;
                                                
                                                // If stopped (exit code 137), update running steps to stopped
                                                if (hasExitCode137 || data.errorCode === 137) {
                                                    if (progress && progress.steps) {
                                                        progress = {
                                                            ...progress,
                                                            steps: progress.steps.map((step: any) => 
                                                                step.status === 'running' ? { ...step, status: 'stopped' } : step
                                                            )
                                                        };
                                                    }
                                                    // Also mark as finished so it stops polling
                                                    if (hasExitCode137) {
                                                        setIsTesting(false);
                                                    }
                                                }
                                                
                                                setLatestProgress(progress);
                                            }
                                        })
                                        .catch(console.error)
                                        .finally(() => {
                                            // Only continue polling if not stopped
                                            if (!hasExitCode137 && data.errorCode !== 137) {
                                                setTimeout(() => {
                                                    checkResult();
                                                }, 500);
                                            }
                                        })
                                } else {
                                    return fetch(`/api/logs/workflow-updates`, {
                                        method: 'POST',
                                        body: JSON.stringify({ finalWorkflow: latestWorkflow, automationId: params?.id, logs: data.latestLogs, executionStatus: data.hasFinished === true ? 'Script has finished running' : 'Script still running' })
                                    })
                                        .then((res) => res.json())
                                        .then((_data) => {
                                            setUpdatedWorkflow(_data);
                                        })
                                        .catch(console.error)
                                        .finally(() => {
                                            setTimeout(() => {
                                                checkResult();
                                            }, 500);
                                        })
                                }
                            }
                        })
                        .catch((e) => {
                            console.error(e);
                        });
                    }
                    
                    checkResult();
                });
            }

            // Check resumability after run completion
            await checkResumability();
        } catch (e: any) {
            console.error('Error running automation:', e);
            
            // Try to handle upgrade action first
            if (handleApiError(e)) {
                return; // Upgrade modal was shown, don't show additional error message
            }
            
            // Extract error message - check both error.error (from API response) and error.message
            const errorMessage = e?.error || e?.message || 'Unknown error occurred';
            toast.error("Error", errorMessage);
        } finally {
            setIsTesting(false);
            setReadyToTest(false);
            setIsStoppingAutomation(false);
            // Reset readyToFix in finally to ensure it's cleared even if run completes
            // It will be set again below if there's actually an error
            setReadyToFix(false);
        }

        lastRunResult.current = result;

        if (result) {
            if (result.isErrored === true && result.errorCode !== 137) {
                setReadyToFix(true);
                setLastErrorCode(result.errorCode);
                // Store snapshot of current steps when failure occurs
                // This allows us to detect which steps were modified after the fix
                if (automationRef.current?.v3Steps && automationRef.current.v3Steps.length > 0) {
                    stepsSnapshotOnFailure.current = JSON.parse(JSON.stringify(automationRef.current.v3Steps));
                } else {
                    stepsSnapshotOnFailure.current = null;
                }
            } else {
                setReadyToFix(false);
                setLastErrorCode(0);
                // Clear snapshot on successful run
                stepsSnapshotOnFailure.current = null;
            }
        } else {
            // If no result (e.g., resume that doesn't wait or fails), ensure readyToFix is cleared
            setReadyToFix(false);
            setLastErrorCode(0);
            stepsSnapshotOnFailure.current = null;
        }

        return result;
    }

    const stopAutomation = async () => {
        setIsStoppingAutomation(true);
        try {
            const dId = await getDeviceId();
            const res = await fetch(`/api/run/executions/stop`, {
                method: 'post',
                body: JSON.stringify({ dId, automationId: params?.id })
            });
            
            const data = await res.json();

            if (data.stopped === true) {
                setIsTesting(false);
                setReadyToTest(false);
                setIsStoppingAutomation(false);
                toast.success('Execution stopped successfully');
            } else {
                toast.success('Execution stop requested');
            }
        } catch (error) {
            toast.error("Error",'Failed to stop execution');
        }
    }

    const checkResumability = useCallback(async () => {
        try {
            const dId = await getDeviceId();
            const automationId = params?.id as string;
            
            if (!automationId) {
                console.log('No automationId to check resumability');
                setIsResumable(false);
                setLastRunTokenId(null);
                return;
            }

            const res = await fetch(`/api/workflows-v3/can-resume?automationId=${automationId}&deviceId=${dId}`);
            
            if (res.ok) {
                const data = await res.json();
                setIsResumable(data.resumable);
                setLastRunTokenId(data.lastRunTokenId);
            } else {
                setIsResumable(false);
                setLastRunTokenId(null);
            }
        } catch (error) {
            console.error('Error checking resumability:', error);
            setIsResumable(false);
            setLastRunTokenId(null);
        }
    }, [params?.id]);

    const fetchTestResult = useCallback((executionId: string) => {
        return new Promise<any>((resolve, reject) => {
            fetch(`/api/run/latest-logs?executionId=${executionId}`)
            .then((res) => res.json())
            .then((json) => {
                resolve(json);
            })
            .catch((e) => reject(e));
        });
    }, []);

    // Normalize environment variables from GET API response
    // Converts both old and new formats to consistent format for frontend use
    const normalizeEnvironmentVariablesFromAPI = (envVars: any[]) => {
        if (!envVars || !Array.isArray(envVars)) {
            return envVars;
        }

        return envVars.map((env: any) => {
            const normalized: any = {
                ...env
            };

            // Remove any env property
            delete normalized.env;

            // Remove flat value.dev, value.test, value.production properties if they exist
            delete normalized['value.dev'];
            delete normalized['value.test'];
            delete normalized['value.production'];

            // Multi-env: value is object with dev/test/production
            if (env.value && typeof env.value === 'object' && !Array.isArray(env.value)) {
                if (env.value.dev !== undefined || env.value.test !== undefined || env.value.production !== undefined) {
                    // Keep multi-environment structure as-is
                    normalized.value = env.value;
                    delete normalized.values;
                    return normalized;
                }
            }

            // Any: value is string (applies to all environments)
            if (env.value !== undefined && typeof env.value === 'string') {
                // Keep Any as string - DO NOT convert to multi-env!
                normalized.value = env.value;
                delete normalized.values;
                return normalized;
            }

            // Fallback
            delete normalized.values;
            return normalized;
        });
    };

    // Transform environment variables to use only value property
    // Support both: only value AND value.dev, value.test, value.production
    // Handle Any automations: convert single value to multi-environment format
    const transformEnvironmentVariables = (envVars: any[], runtimeEnvironment?: string) => {
        if (!envVars || !Array.isArray(envVars)) {
            return envVars;
        }
        
        // Default to "dev" if runtimeEnvironment is not set
        const defaultStrategy = runtimeEnvironment || 'dev';
        
        return envVars.map((env: any) => {
            const transformed: any = {
                ...env
            };
            
            // Remove any env property
            delete transformed.env;
            
            // Remove flat value.dev, value.test, value.production properties if they exist
            delete transformed['value.dev'];
            delete transformed['value.test'];
            delete transformed['value.production'];
            
            // Multi-env: value is object with dev/test/production
            if (env.value && typeof env.value === 'object' && !Array.isArray(env.value)) {
                if (env.value.dev !== undefined || env.value.test !== undefined || env.value.production !== undefined) {
                    // Keep multi-env structure
                    transformed.value = {
                        ...(env.value.dev !== undefined && { dev: env.value.dev }),
                        ...(env.value.test !== undefined && { test: env.value.test }),
                        ...(env.value.production !== undefined && { production: env.value.production })
                    };
                    delete transformed.values;
                    return transformed;
                }
            }

            // Any: value is string (applies to all environments)
            if (env.value !== undefined && typeof env.value === 'string') {
                // Keep Any as string - DO NOT convert!
                transformed.value = env.value;
                delete transformed.values;
                return transformed;
            }

            // Fallback
            delete transformed.values;
            return transformed;
        });
    };

    useEffect(() => {
        if (hasInitialised === true) {
            const debounceTimer = setTimeout(async () => {
                try {
                    setIsSaving(true);
                    // Get the current v3 steps if in v3 mode
                    const v3Steps = automationRef.current?.v3Steps;
                    const isV3Mode = automationRef.current?.version === '3' || automationRef.current?.version === 3;
                    let _envVariables = environmentVariables;
                    if (automationRef.current.isEnvUpdated) {
                        _envVariables = automationRef.current.environmentVariables;
                        setEnvironmentVariables(_envVariables);
                        automationRef.current.isEnvUpdated = undefined;
                    }
                    // Get runtimeEnvironment, default to "dev" if not set
                    const envStrategy = automationRef.current?.runtimeEnvironment || 'dev';
                    
                    // Transform environment variables before sending to API
                    const transformedEnvVariables = transformEnvironmentVariables(_envVariables, envStrategy);
                    // Prepare payload with v3 steps if in v3 mode
                    const payload = {
                        ...automationRef.current,
                        environmentVariables: transformedEnvVariables,
                        dependencies,
                        // Ensure runtimeEnvironment is set (default to "dev")
                        runtimeEnvironment: envStrategy,
                        ...(isV3Mode && v3Steps ? { v3Steps } : { code: currentCode })
                    };
                    const res = await fetch(`/api/automations`, {
                        method: 'PUT',
                        body: JSON.stringify({
                            payload,
                            automationId: automationRef.current._id
                        })
                    });

                    if (res.status !== 200) {
                        const data = await res.json();
                        throw new Error(data?.error || 'unknown error');
                    }

                    try {
                        await onceCallbacksRef.current?.['after-save']()
                    } catch (e) {
                        // Do nothing
                    }
                } catch (e: any) {
                    console.error(e);
                    toast.error("Error",e?.message || 'unknown error');
                } finally {
                    setIsSaving(false);
                }
            }, 1000);

            return () => {
                clearTimeout(debounceTimer);
                setIsSaving(false);
            };
        }
    }, [currentCode, docVersion, environmentVariables, dependencies]);

    const generateWorkflow = useCallback(async (id: string, code: string) => {
        try {
            const workflow = await fetch(`/api/gen/workflow`, {
                method: 'POST',
                body: JSON.stringify({ automationId: id, code: code })
            });
            const workflowData = await workflow.json();
            return workflowData.workflow;
        } catch (e) {
            console.error(e);
            return null;
        }
    }, []);

    const load = useCallback(async (id: string) => {
        const response = await fetch(`/api/automations/${id}`);
        const data = await response.json();
        if (!data?.workflow) {
            data.workflow = await generateWorkflow(id, data?.code);
        }

        // Set default runtimeEnvironment to "dev" if not present (for old automations)
        if (!data.runtimeEnvironment) {
            data.runtimeEnvironment = 'dev';
        }

        // Normalize environment variables from API response to handle both old and new formats
        // Backend already handles fetching from workspace for null values
        const normalizedEnvVars = normalizeEnvironmentVariablesFromAPI(data?.environmentVariables || []);

        automationRef.current = data;
        setCurrentCode(data?.code || '');
        setEnvironmentVariables(normalizedEnvVars);
        setDependencies(data?.dependencies || []);
        setDocVersion((d) => d + 1);
        setIsLoading(false);
        setHasInitialised(true);
    }, [generateWorkflow]);

    const writeTerminalLine = useCallback((line: string) => {
        if (!terminal.current) {
            console.log('Terminal not ready, queuing log:', line);
            logQueue.current.push(line);
            return;
        }
        
        // Process any queued logs first
        while (logQueue.current.length > 0) {
            const queuedLine = logQueue.current.shift();
            if (queuedLine) {
                if (queuedLine === 'clear') {
                    terminal.current.clear();
                } else {
                    terminal.current.writeln(queuedLine);
                }
            }
        }
        
        // Write the current line
        if (line === 'clear') {
            terminal.current.clear();
        } else {
            terminal.current.writeln(line);
        }
        fitAddon.current.fit();
    }, [terminal.current]);

    const executeUploadFiles = useCallback(async (files: any[], envName?: string, automationId?: string, userId?: string, uploadMode?: string) => {
        const formData = new FormData();

        if (userId) {
            formData.append('userId', userId);
        }
        for (const file of files) {
            formData.append('file', file.originFileObj);
        }

        if (envName) {
            formData.append('varriableName', envName);
        }
        
        if (automationId) {
            formData.append('automationId', automationId)
        }

        if (uploadMode) {
            formData.append('uploadMode', uploadMode);
        }

        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
        });
        const data = await res.json();
        return data;
    }, []);

    
    const fetchStepSummary = async (stepId: string, stepStatus: string) => {
        try {
            // Construct the API URL with all required parameters
            const executionId = currentExecutionId;
            const automationId = params?.id;
            const runTokenId = lastRunTokenId || latestProgress?.runTokenId;

            // Only fetch if we have executionId and automationId (runTokenId is optional)
            if (!executionId || !automationId) {
                console.log('Skipping step summary fetch - missing required parameters:', { executionId, automationId });
                return null;
            }

            // Build URL with optional runTokenId
            let apiUrl = `/api/run/execution-history/${executionId}/step-summary?automationId=${automationId}&stepId=${stepId}&stepStatus=${stepStatus}`;
            if (runTokenId) {
                apiUrl += `&runTokenId=${runTokenId}`;
            }

            const response = await fetch(apiUrl);
            if (!response.ok) {
                console.error('Failed to fetch step summary:', response.statusText);
                return null;
            }

            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Failed to fetch step summary:', error);
            return null;
        }
    }


    const api: AutomationEditor = {
        load,
        isLoading,
        automationRef,
        docVersion,
        setDocVersion,
        fitAddon,
        terminal,
        writeTerminalLine,
        currentCode,
        setCurrentCode,
        environmentVariables,
        setEnvironmentVariables,
        isSaving,
        dependencies,
        setDependencies,
        currentExecutionId,
        setCurrentExecutionId,
        planToAutomate,
        automationChangeVersion,
        activeTab,
        setActiveTab,
        enableContinue,
        setEnableContinue,
        continueCallbackRef,
        runCode,
        isTesting,
        fetchTestResult,
        automationState,
        setAutomationState,
        onceCallbacksRef,
        autoPilot,
        setAutoPilot,
        readyToTest,
        setReadyToTest,
        autopilotCountdown,
        readyToFix,
        getAutoFixMessage,
        setReadyToFix,
        responseStatusMessage,
        setResponseStatusMessage,
        showBrowserScreen,
        setShowBrowserScreen,
        showChatWindow,
        setShowChatWindow,
        lastErrorCode,
        screenshots,
        setScreenshots,
        uploadModalState,
        setUploadModalState,
        executeUploadFiles,
        activeOutputTab,
        setActiveOutputTab,
        stopAutomation,
        isStoppingAutomation,
        showScheduleAutomationModal,
        setShowScheduleAutomationModal,
        editorRef,
        chatLoading,
        setChatLoading,
        logExplanation,
        setLogExplanation,
        workflow,
        finalWorkflow,
        autoAcceptChanges,
        setAutoAcceptChanges,
        generateWorkflow,
        setUpdatedWorkflow,
        setWorkflow,
        outputSummary,
        latestProgress,
        isResumable,
        setIsResumable,
        lastRunTokenId,
        setLastRunTokenId,
        checkResumability,
        fetchStepSummary
    }

    useEffect(() => {
        let isMounted = true;
        async function loadXterm() {
            if (typeof window !== 'undefined') {
                const { FitAddon } = await import('@xterm/addon-fit');
                const { Terminal } = await import('@xterm/xterm');
                // @ts-ignore
                await import('@xterm/xterm/css/xterm.css');
                if (isMounted) {
                    fitAddon.current = new FitAddon();
                    terminal.current = new Terminal({ 
                        theme: terminalTheme,
                        scrollback: 100000 // Increase scrollback to allow viewing all logs
                    });
                    
                    // Process any queued logs now that terminal is ready
                    while (logQueue.current.length > 0) {
                        const queuedLine = logQueue.current.shift();
                        if (queuedLine) {
                            if (queuedLine === 'clear') {
                                terminal.current.clear();
                            } else {
                                terminal.current.writeln(queuedLine);
                            }
                        }
                    }
                }
            }
        }
        loadXterm();
        return () => { isMounted = false; };
    }, []);

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('autoPilot');
            setAutoPilot(stored === null ? true : stored === 'true');
            
            const storedAutoAccept = localStorage.getItem('autoAcceptChanges');
            setAutoAcceptChanges(storedAutoAccept === null ? true : storedAutoAccept === 'true');
        }
    }, []);


    return api;
}

// @ts-ignore
export const AutomationEditorContext = createContext<AutomationEditor>(null);

export default function useAutomationEditor(): AutomationEditor {
    return useContext(AutomationEditorContext);
}