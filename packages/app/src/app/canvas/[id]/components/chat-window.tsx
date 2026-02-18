import { Button, Input, Tag, Tooltip, Typography, Modal, Space, Collapse, Steps, Card, App } from "antd";
import { useParams } from "next/navigation";
import useAutomationEditor, { DeserialiseChunk, getModel } from "../hooks/automation-editor";
import { concat } from "@langchain/core/utils/stream";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Markdown from "markdown-to-jsx";
import { cloneDeep } from 'lodash'
import { ArrowLeftOutlined, LoadingOutlined } from "@ant-design/icons";
import 'github-markdown-css/github-markdown-dark.css';
import eventsEmitter from "@/lib/events-emitter";
import { toast } from '@/hooks/use-toast';
import hljs from 'highlight.js';
import { applyCodeEdits, convertAIMessageToString, getLabel } from "@/lib/utils";
import { useAuth } from '@/app/authentication';
import { useUpgrade } from '@/contexts/UpgradeContext';
import GradientButton from "@/components/GradientButton";
import { Check, Square, History, Copy, CheckCircle, ArrowUp, Paperclip, X } from "lucide-react";
import { useUserCapabilities } from '@/hooks/useUserCapabilities';
import VersionHistoryDrawer from './version-history-drawer';
import dynamic from 'next/dynamic';

// Dynamically import speech recognition components with SSR disabled
const SpeechRecognitionButton = dynamic(
  () => import('@/components/SpeechRecognitionButton'),
  { ssr: false }
);
// import { ThemeToggle } from '@/components/ThemeToggle';

function CopyButton({ messageText }: { messageText: string }) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(messageText);
            setCopied(true);
            toast.success('Message copied to clipboard');
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            toast.error("Error",'Failed to copy message');
        }
    };

    return (
        <Tooltip title={copied ? "Copied!" : "Copy message"}>
            <Button
                type="text"
                size="small"
                icon={copied ? <CheckCircle size={14} style={{ color: '#52c41a' }} /> : <Copy size={14} />}
                onClick={handleCopy}
                style={{
                    opacity: 0.6,
                    transition: 'opacity 0.2s',
                    height: 'auto',
                    minWidth: 'auto',
                    padding: 0,
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.opacity = '1';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.opacity = '0.6';
                }}
            />
        </Tooltip>
    );
}

function AttachedImagePreview({ 
    file, 
    previewUrl, 
    onRemove, 
    isDarkTheme 
}: { 
    file: File; 
    previewUrl: string; 
    onRemove: () => void; 
    isDarkTheme: boolean;
}) {
    const [showRemove, setShowRemove] = useState(false);

    return (
        <div 
            style={{ 
                position: 'relative',
                display: 'inline-block'
            }}
            onMouseEnter={() => setShowRemove(true)}
            onMouseLeave={() => setShowRemove(false)}
        >
            <img
                src={previewUrl}
                alt={file.name}
                style={{
                    width: 60,
                    height: 60,
                    objectFit: 'cover',
                    borderRadius: 4,
                    border: `1px solid ${isDarkTheme ? '#30363d' : '#d0d7de'}`
                }}
            />
            {showRemove && (
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onRemove();
                    }}
                    style={{
                        position: 'absolute',
                        top: -4,
                        right: -4,
                        width: 20,
                        height: 20,
                        backgroundColor: '#ef4444',
                        borderRadius: '50%',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        padding: 2
                    }}
                >
                    <X size={12} color="white" />
                </button>
            )}
            <div style={{ 
                fontSize: '11px',
                marginTop: 4,
                maxWidth: 60,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: isDarkTheme ? '#8b949e' : '#656d76'
            }}>
                {file.name.length > 10 ? `${file.name.substring(0, 10)}...` : file.name}
            </div>
        </div>
    );
}

function AIMessage(props: any) {
    const { isLast, messageText, showCopyButton = true } = props;
    const [minHeight, setMinHeight] = useState<string | undefined>(undefined);
    
    // Check if message text starts with tool-call to hide copy button
    const shouldShowCopyButton = useMemo(() => {
        return showCopyButton && messageText && !messageText?.trim()?.startsWith('```tool-call');
    }, [showCopyButton, messageText]);
    
    useEffect(() => {   
        if (isLast) {
            setMinHeight('calc(100% - 30px)');
        } else {
            setMinHeight(undefined);
        }
    }, [isLast]);
    return (
        <div className="ai-message-container relative" style={{ minHeight }}>
            <div style={{ width: 40, height: 40, flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
                <img 
                    src="/images/logo-mark-blue.png" 
                    alt="Turbotic" 
                    className="ai-message-avatar"
                    style={{ width: 32, height: 32, objectFit: 'contain' }}
                />
            </div>
            <div className="ai-message-content" style={{ marginLeft: 10, fontSize: 12, overflow: 'hidden', flex: 1 }}>
                {props.children}
                {shouldShowCopyButton && (
                    <div style={{ display: 'flex', justifyContent: 'flex-start', position: 'absolute' }}>
                        <CopyButton messageText={messageText} />
                    </div>
                )}
            </div>
        </div>
    )
}

function UserMessage(props: any) {
    const { isLast, messageText } = props;
    const { currentUser } = useAuth();
    const [minHeight, setMinHeight] = useState<string | undefined>(undefined);
    useEffect(() => {
        if (isLast) {
            setMinHeight('calc(100% - 30px)');
        } else {
            setMinHeight('10px');
        }
    }, [isLast]);
    
    return (
        <div className="user-message-container" style={{ minHeight }}>
            <div className="user-message-wrapper">
                <div className="user-message-content">
                    {props.children}
                </div>
                <div className="flex justify-end">
                    <CopyButton messageText={messageText} />
                </div>
            </div>
            {/* <div style={{ width: 40, height: 40, backgroundColor: '#2563eb', borderRadius: 20, flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
                {currentUser?.avatarDataUrl ? (
                    <img 
                        src={currentUser.avatarDataUrl} 
                        alt="avatar" 
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                ) : (
                    <span style={{ color: '#ffffff', fontSize: 16, fontWeight: 'bold' }}>
                        {getInitials(currentUser)}
                    </span>
                )}
            </div> */}
        </div>
    )
}

function MarkdownCode(props: any) {
    const { msgId } = props;

    const isToolCall = useMemo(() => {
        return String(props?.className).includes('tool-call');
    }, [props.className]);

    const isPlan = useMemo(() => {
        return String(props?.className).includes('plan-json');
    }, [props.className]);

    const data = useMemo(() => {
        // Only try to parse JSON if this is a tool-call or plan-json
        if (!isToolCall && !isPlan) {
            return null;
        }
        
        try {
            if (!props?.children || typeof props.children !== 'string') {
                return { error: 'Invalid input', r: props?.children };
            }
            return JSON.parse(props.children);
        } catch (e) {
            // Only log errors for tool-call or plan-json, not regular code blocks
            if (isToolCall || isPlan) {
                console.error('JSON parse error in MarkdownCode:', e, 'Input:', props?.children?.substring(0, 100));
            }
            return {
                error: e, 
                r: props?.children
            }
        }
    }, [props?.children, isToolCall, isPlan]);

    const isJavascript = useMemo(() => {
        return String(props?.className).includes('javascript');
    }, [props.className]);

    
    if (isToolCall === true) {
        // If data is null or has an error, just render as regular code
        if (!data || data.error) {
            return <code {...props} />
        }
        
        return (
            <Collapse
                items={[
                    {
                        label: (
                            <Typography.Paragraph
                                className="!mb-0 mr-2 w-[calc(100%-20px)]"
                                ellipsis={{ rows: 1, tooltip: true, }}
                            >
                                {data.label}
                            </Typography.Paragraph>
                        ),
                        extra: (
                            <Space>
                                {
                                    data.status === 'pending' ? <LoadingOutlined /> : (
                                        <>
                                            {
                                                data.name === 'write-code-in-monaco-editor' ? <Button shape="round" size="small" onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    exposedFunctions.applyCodeByToolCallid(data.id);
                                                }}>Apply Again</Button> : null
                                            }
                                            <Check size={16} style={{ color: 'var(--progress-indicator-green)'}} />
                                        </>
                                    )
                                }
                                {
                                    data.stepId ? (
                                        <Tooltip title="View code">
                                            <Button
                                                type="text"
                                                size="small"
                                                icon={<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    eventsEmitter.emit('code-editor:open-step', { stepId: data.stepId });
                                                }}
                                            />
                                        </Tooltip>
                                    ) : null
                                }
                            </Space>
                        ),
                        children: (
                            <code style={{ maxHeight: 200, overflow: 'auto', display: 'block' }}>{decodeURIComponent(data.response)}</code>
                        )
                    }
                ]}
                className="chat-collapse"
            />
        )
    }

    if (isPlan === true) {
        // If data is null or has an error, just render as regular code
        if (!data || data.error) {
            return <code {...props} />
        }
        
        if (Array.isArray(data)) {
            return (
                <Collapse
                    items={[
                        {
                            label: (
                                <div style={{ 
                                    fontSize: '14px', 
                                    fontWeight: '600', 
                                    color: '#495057', 
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '8px'
                                }}>
                                    <span>📋</span>
                                    <span>Plan ({data.length} items)</span>
                                </div>
                            ),
                            children: (
                                <div className="plan-checklist-container" style={{ 
                                    backgroundColor: '#f8f9fa', 
                                    border: '1px solid #e9ecef', 
                                    borderRadius: '8px', 
                                    padding: '16px', 
                                    margin: '8px 0',
                                    maxWidth: '100%',
                                    overflow: 'hidden'
                                }}>
                                    <div className="plan-items" style={{ maxWidth: '100%' }}>
                                        {data.map((item, index) => (
                                            <Tooltip 
                                                key={index} 
                                                title={item.title} 
                                                placement="topLeft"
                                                overlayStyle={{ maxWidth: '400px' }}
                                            >
                                                <div className="plan-item" style={{ 
                                                    display: 'flex', 
                                                    alignItems: 'flex-start', 
                                                    gap: '12px', 
                                                    marginBottom: '8px',
                                                    padding: '8px',
                                                    backgroundColor: '#ffffff',
                                                    borderRadius: '6px',
                                                    border: '1px solid #e9ecef',
                                                    maxWidth: '100%',
                                                    cursor: 'pointer'
                                                }}>
                                                    <div className="plan-checkbox" style={{ 
                                                        width: '18px', 
                                                        height: '18px', 
                                                        border: '2px solid #6c757d', 
                                                        borderRadius: '3px', 
                                                        marginTop: '2px',
                                                        flexShrink: 0,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        backgroundColor: '#ffffff'
                                                    }}>
                                                        {/* Empty checkbox - can be made interactive later */}
                                                    </div>
                                                    <div className="plan-text" style={{ 
                                                        flex: 1, 
                                                        fontSize: '14px', 
                                                        color: '#495057',
                                                        lineHeight: '1.4',
                                                        whiteSpace: 'normal',
                                                        wordBreak: 'break-word',
                                                        overflowWrap: 'break-word'
                                                    }}>
                                                        <div style={{ 
                                                            fontWeight: '500', 
                                                            marginBottom: '2px',
                                                            whiteSpace: 'normal',
                                                            wordBreak: 'break-word'
                                                        }}>
                                                            {item.title}
                                                        </div>
                                                        {item.api && (
                                                            <div style={{ 
                                                                fontSize: '12px', 
                                                                color: '#6c757d',
                                                                fontStyle: 'italic',
                                                                whiteSpace: 'normal',
                                                                wordBreak: 'break-word'
                                                            }}>
                                                                API: {item.api}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </Tooltip>
                                        ))}
                                    </div>
                                </div>
                            )
                        }
                    ]}
                    className="chat-collapse"
                    defaultActiveKey={['1']}
                />
            )
        }
        
        return <code {...props} />
    }

    return (
        <div>
            <code {...props}/>
            {
                isJavascript === true ? (
                    <Button onClick={() => {
                        eventsEmitter.emit('automation-editor:code-change', props.children);
                        toast.info('Code moved to editor');
                    }} style={{ marginTop: 10 }} icon={<ArrowLeftOutlined />} block type="dashed" size="large">
                        Accept this code
                    </Button>
                ) : null
            }
        </div>
    )
} 

function AIMessageRenderer(props: { messages: any[] }) {
    const divRef = useRef<HTMLDivElement>(null);

    let firstIgnored = useRef<boolean>(false);
    useEffect(() => {
        if (divRef.current) {
            if (firstIgnored.current === false) {
                firstIgnored.current = true;
                return;
            }

        }
    }, [props.messages]);

    if (props.messages.length < 1) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                Generating...
            </div>
        )
    }
    return (
        <div ref={divRef}>
            {
                props.messages.map((m) => {
                    switch (m.type) {
                        case 'human': {

                            // If content is multimodal array, render text + images
                            if (Array.isArray(m?.data?.content)) {
                                return (
                                    <div key={m.data.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        {m.data.content.map((part: any, idx: number) => {
                                            if (part?.type === 'text') {
                                                return <span key={idx} style={{ fontSize: 12 }} className="break-words">{part.text}</span>;
                                            }
                                            if (part?.type === 'image_url') {
                                                const url = part?.image_url?.url;
                                                return (
                                                    <img key={idx} src={url} alt="attachment" style={{ maxWidth: 320, borderRadius: 6 }} />
                                                );
                                            }
                                            return null;
                                        })}
                                    </div>
                                )
                            }

                            if (m.processedText?.startsWith('Create a new step with id')) {
                                return (
                                    <div key={m.data.id}>
                                        <span style={{ fontSize: 12 }} className="break-words">Create a new step</span>
                                    </div>
                                )
                            }

                            if (m.processedText?.startsWith('The script is not working as expected. Here are the latest logs:')) {
                                return (
                                        <div key={m.data.id}>
                                            <Collapse
                                                items={[
                                                    {
                                                        label: (
                                                            <Typography.Paragraph
                                                                className="!mb-0 mr-2 w-[calc(100%-20px)]"
                                                                ellipsis={{ rows: 1, tooltip: true, }}
                                                            >
                                                                The script is not working as expected.
                                                            </Typography.Paragraph>
                                                        ),
                                                        children: (
                                                            <code style={{ maxHeight: 200, overflow: 'auto', display: 'block' }}>{m.processedText}</code>
                                                        )
                                                    }
                                                ]}
                                                className="chat-collapse"
                                            />
                                    </div>
                                )
                            }

                            return (
                                <div key={m.data.id}>
                                    {
                                        m.processedText ? (
                                            <span style={{ fontSize: 12 }} className="break-words">{m.processedText}</span>
                                        ) : null
                                    }
                                </div>
                            )
                        }
                        case 'ai': {
                            if (!m.processedText?.trim()) {
                                return (
                                    <div key={m.data.id} className="mt-2"> 
                                        <span className="ai-gradient-text animate">Generating...</span>
                                    </div>
                                )
                            }
                            return (
                                <div key={m.data.id}>
                                    {
                                        m.processedText ? (
                                            <Markdown options={{
                                                overrides: {
                                                    code: MarkdownCode,
                                                    a: (props) => {
                                                        const { href, children } = props;
                                                        return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
                                                    }
                                                }
                                            }} className='markdown-body' style={{ padding: 0 }}>{m.processedText}</Markdown>
                                        ) : null
                                    }
                                </div>
                            )
                        }
                        case 'tool':
                            return (
                                <div style={{ marginTop: 10 }}>
                                    <Markdown options={{
                                        overrides: {
                                            code: MarkdownCode
                                        }
                                    }} className='markdown-body'>{`Tool response: ${m.processedText}`}</Markdown>
                                </div>
                            )
                    }
                })
            }
        </div>
    )
}

export const exposedFunctions: { [key: string]: any } = {
    handleSend: null,
    applyCodeByToolCallid: null,
    sendMessageDirectly: null,
    commitCodeToGitHub: null,
    generateCodeSummary: null
}

const model = getModel();

let alreadyInitialChatTriggered = false;

const ChatInput = ({
    disabled, 
    onPaste,
    handleSend,
    canChat,
    messageRef
}: {
    disabled: boolean, 
    onPaste: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void,
     handleSend: () => void,
     canChat: boolean,
     messageRef: React.RefObject<string>
    }) => {
    const [message, setMessage] = useState<string>('');
    useEffect(() => {
        const sub = eventsEmitter.on('set-chat-input', (value: string) => {
            setMessage(value);
        })
        return () => {
            sub();
        }
    }, [])
    return (
        <Input.TextArea
            defaultValue=""
            data-tour="chat-input-canvas"
            disabled={disabled}
            onPaste={onPaste}
            onChange={(e) =>{ setMessage(e.target.value); messageRef.current = e.target.value;}}
            value={message}
            onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                }
            }}
            placeholder={!canChat ? "Chat is currently disabled" : "Type your message here..."}
            autoSize={{ minRows: 1, maxRows: 5 }}
            id="chat-input"
        />
    )
}

export default function ChatWindow() {
    const params = useParams();
    const [messages, setMessages] = useState<any[]>([]);
    // const [message, setMessage] = useState<string>('');
    const [attachedImages, setAttachedImages] = useState<File[]>([]);
    const [imagePreviews, setImagePreviews] = useState<string[]>([]);
    const [showVersionHistory, setShowVersionHistory] = useState(false);
    const [isDarkTheme, setIsDarkTheme] = useState(false);
    const divRef = useRef<HTMLDivElement>(null);
    const shouldAutoScrollRef = useRef<boolean>(true);
    const { canChat } = useUserCapabilities();
    const { handleApiError } = useUpgrade();
    const { currentUser, getCurrentUser } = useAuth();
    const { message: antdMessage } = App.useApp();
    const {
        setCurrentCode, currentCode, dependencies,
        setDependencies, environmentVariables,
        setEnvironmentVariables, readyToTest, autopilotCountdown,
        autoPilot, isTesting, runCode, setAutoPilot, readyToFix,
        setReadyToTest, getAutoFixMessage, setReadyToFix,
        responseStatusMessage, setResponseStatusMessage,
        automationRef, setDocVersion,
        lastErrorCode, editorRef,
        chatLoading, setChatLoading,
        isSaving, generateWorkflow,
        setUpdatedWorkflow, setWorkflow,
        autoAcceptChanges
    } = useAutomationEditor();
    const stopChatRef = useRef<boolean>(false);
    const abortControllerRef = useRef<AbortController | null>(null);
    const isUpgradingRef = useRef<boolean>(false);
    const messageRef = useRef<string>('');
    // Track placeholder rejections per step to enable automatic retry
    const placeholderRejectionsRef = useRef<Map<string, { count: number; lastMessage: string; stepName: string }>>(new Map());
    const setMessage = useCallback((value: string) => {
        eventsEmitter.emit('set-chat-input', value);
        messageRef.current = value;
    }, []);
    // Track theme changes to style popups accordingly
    useEffect(() => {
        if (typeof document === 'undefined') return;
        const computeIsDark = () => {
            const bodyHas = document.body?.classList?.contains('dark');
            const htmlHas = document.documentElement?.classList?.contains('dark');
            const htmlAttr = document.documentElement?.getAttribute?.('data-theme') === 'dark';
            return Boolean(bodyHas || htmlHas || htmlAttr);
        };
        const updateTheme = () => setIsDarkTheme(computeIsDark());
        updateTheme();
        const observer = new MutationObserver(updateTheme);
        observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-theme'] });
        return () => observer.disconnect();
    }, []);

    // Listen for upgrade events
    useEffect(() => {
        const handleUpgradeStart = (data: { automationId: string }) => {
            // Only set upgrade flag if this automation matches
            if (automationRef.current?._id === data.automationId) {
                isUpgradingRef.current = true;
            }
        };

        const cleanup = eventsEmitter.on('upgrade:v2-to-v3-started', handleUpgradeStart);
        return cleanup;
    }, [automationRef.current?._id]);

    const applyCodeByToolCallid = useCallback((toolCallId: string) => {
        let toolCall;
        
        for (const msg of messages) {
            if (msg.data?.tool_calls?.length > 0) {
                for (const c of msg.data.tool_calls) {
                    if (c.id === toolCallId) {
                        toolCall = c;
                        break;
                    }
                }
            }
        }

        if (toolCall?.args) {
            setCurrentCode(toolCall.args.code);
            applyEnvVariablesAndDependencies(toolCall.args.dependenciesUsed, toolCall.args.environmentVariablesUsed);
        }
    }, [messages]);

    exposedFunctions.applyCodeByToolCallid = applyCodeByToolCallid;

    // Track ongoing commits to prevent duplicates
    const commitInProgressRef = useRef<Set<string>>(new Set());

    // Generate AI summary of code changes
    const generateCodeSummary = async (oldCode: string, newCode: string): Promise<string> => {
        try {
            const response = await fetch('/api/code-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ oldCode, newCode }),
            });
            const data = await response.json();
            const summary = data.summary || 'Code updated';
            // If summary says "No changes detected" but we're committing, use a generic update message
            if (summary.toLowerCase().includes('no changes detected')) {
                return 'Code updated';
            }
            return summary;
        } catch (error) {
            console.error('Error generating code summary:', error);
            return 'Code updated';
        }
    };

    // Helper function to determine if an error should trigger a retry
    const shouldRetry = (error: any): boolean => {
        const errorMessage = error.message || '';

        // Retry on network errors, timeouts, and 5xx server errors
        if (errorMessage.includes('HTTP 5') ||
            errorMessage.includes('NetworkError') ||
            errorMessage.includes('timeout') ||
            errorMessage.includes('Failed to fetch')) {
            return true;
        }

        // Don't retry on client errors (4xx) except 429 (rate limit)
        if (errorMessage.includes('HTTP 4') && !errorMessage.includes('HTTP 429')) {
            return false;
        }

        // Retry on rate limits
        if (errorMessage.includes('HTTP 429')) {
            return true;
        }

        return false;
    };

    // Commit code to version control (MongoDB + optional GitHub sync) with retry logic
    const commitCodeToGitHub = async (oldCode: string, newCode: string, envVars: any[], deps: any[], changeDescription: string, retryCount = 0) => {
        const maxRetries = 3;
        const retryDelay = 1000 * (retryCount + 1); // Exponential backoff: 1s, 2s, 3s

        // Check if v3 mode is active
        const isV3Mode = automationRef.current?.v3Steps && automationRef.current.v3Steps.length > 0;

        // IMPORTANT: Always use current automation state for deps & env vars
        // This ensures every version captures the COMPLETE automation state, not just what changed.
        // For example: When adding a new step without deps, we still want to save existing deps
        // This creates a complete snapshot like Git commits (all files, all deps, all env vars)
        const currentDeps = dependencies || deps || [];
        const currentEnvVars = environmentVariables || envVars || [];

        // Add commit deduplication - prevent multiple commits for the same code change
        const commitKey = `${params?.id}_${oldCode.length}_${newCode.length}_${changeDescription}`;
        if (commitInProgressRef.current.has(commitKey)) {
            return;
        }
        commitInProgressRef.current.add(commitKey);

        try {
            // For multi-file mode, generate message based on file changes, not code diff
            let finalChangeDescription = changeDescription;
            if (!finalChangeDescription && isV3Mode) {
                // In multi-file mode, use a generic message - backend will track actual file changes
                finalChangeDescription = 'Updated workflow steps';
            } else if (!finalChangeDescription) {
                // Single file mode: generate summary from code diff
                finalChangeDescription = await generateCodeSummary(oldCode, newCode);
            }

            // Prepare request body based on mode
            const requestBody: any = {
                automationId: params?.id,
                dependencies: currentDeps,
                environmentVariables: currentEnvVars,
                changeDescription: finalChangeDescription,
            };

            // Add code or files based on mode
            if (isV3Mode) {
                // V3 mode: send ALL current files (GitHub-like complete snapshot)
                // The backend will handle change detection by comparing with previous version
                const allFiles = automationRef.current?.v3Steps?.map((step: any, index: number) => ({
                    id: step.id,
                    name: step.name,
                    code: step.code,
                    order: index // Preserve workflow order (0-based)
                })) || [];

                requestBody.files = allFiles;
            } else {
                // Legacy single file mode
                requestBody.code = newCode;
            }

            const response = await fetch('/api/code-versions/commit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || `HTTP ${response.status}: ${response.statusText}`);
            }

            if (data.success) {
                toast.success(`${data.version} saved`);

                // Emit event to refresh version history drawer if open
                eventsEmitter.emit('version-control:version-created');
            } else {
                throw new Error(data.error || 'Unknown error');
            }
        } catch (error: any) {
            // Categorize error and decide whether to retry
            if (retryCount < maxRetries && shouldRetry(error)) {
                setTimeout(() => {
                    commitCodeToGitHub(oldCode, newCode, currentEnvVars, currentDeps, changeDescription, retryCount + 1);
                }, retryDelay);
            } else {
                // Final failure - show user-friendly error
                if (error.message.includes('HTTP 403')) {
                    toast.error("Error",'Permission denied - check your access permissions');
                } else if (error.message.includes('HTTP 429')) {
                    toast.warning('Rate limited - version will be saved when possible');
                } else if (error.message.includes('HTTP 5')) {
                    toast.error("Error",'Server error - please try again later');
                } else {
                    toast.error("Error",`Failed to save version: ${error.message}`);
                }
            }
        } finally {
            // Clean up commit key to allow future commits
            commitInProgressRef.current.delete(commitKey);
        }
    };

    // Helper function to convert base64 data URL to File object
    const base64ToFile = (dataUrl: string, filename: string = 'image'): File => {
        const arr = dataUrl.split(',');
        const mimeMatch = arr[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
            u8arr[n] = bstr.charCodeAt(n);
        }
        const extension = mime.split('/')[1] || 'jpg';
        return new File([u8arr], `${filename}.${extension}`, { type: mime });
    };

    // Handle paste events to capture images from clipboard
    const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        const items = e.clipboardData?.items;
        if (!items) return;

        const imageFiles: File[] = [];
        
        // Check each item in the clipboard
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            // Check if the item is an image
            if (item.type.indexOf('image') !== -1) {
                const blob = item.getAsFile();
                if (blob) {
                    // Convert blob to File with a proper name
                    const timestamp = Date.now();
                    const fileExtension = blob.type.split('/')[1] || 'png';
                    const fileName = `pasted-image-${timestamp}.${fileExtension}`;
                    const file = new File([blob], fileName, { type: blob.type });
                    imageFiles.push(file);
                }
            }
        }

        // If images were found, add them to attached images
        if (imageFiles.length > 0) {
            e.preventDefault(); // Prevent pasting the image data as text
            setAttachedImages((prevImages) => {
                // Create a Set of existing file names + sizes to check for duplicates
                const existingFiles = new Set(
                    prevImages.map(f => `${f.name}-${f.size}-${f.lastModified}`)
                );
                
                // Filter out duplicates based on name, size, and lastModified
                const uniqueNewFiles = imageFiles.filter(f => {
                    const fileKey = `${f.name}-${f.size}-${f.lastModified}`;
                    return !existingFiles.has(fileKey);
                });
                
                // Combine existing files with new unique files
                const combinedFiles = [...prevImages, ...uniqueNewFiles];
                
                // Create previews only for new files
                const newPreviews = uniqueNewFiles.map((f) => URL.createObjectURL(f));
                
                // Update previews state by appending new previews
                setImagePreviews((prevPreviews) => [...prevPreviews, ...newPreviews]);
                
                return combinedFiles;
            });
            
            // Show a success message
            toast.success(`${imageFiles.length} image(s) pasted`);
        }
    };

    const loadChat = async () => {
        const res = await fetch(`/api/gen/chat?automationId=${params?.id}`);
        const data = await res.json();
        setMessages(data.messages);
        const fileObjects: File[] = [];
        const previewUrls: string[] = [];
        if (data.initialChatTriggered === false && alreadyInitialChatTriggered === false) {
            const images = data.initialImages;
        
            // Convert base64 images to File objects
            if (images?.length > 0) {
                
                images.forEach((imageData: string, index: number) => {
                    if (typeof imageData === 'string' && imageData.startsWith('data:')) {
                        const file = base64ToFile(imageData, `initial-image-${index}`);
                        fileObjects.push(file);
                        // Use the data URL directly as preview or create object URL
                        previewUrls.push(URL.createObjectURL(file));
                    }
                });
            }
            alreadyInitialChatTriggered = true;
            handleSend(data.initialPrompt, undefined, undefined, fileObjects?.length > 0 ? fileObjects : undefined, previewUrls?.length > 0 ? previewUrls : undefined);
        }
        setTimeout(() => {
            if (divRef.current) {   
                divRef.current.scrollTop = divRef.current.scrollHeight + 70;
            }
        }, 1);
    }

    useEffect(() => {
        loadChat();
        return () => {
            alreadyInitialChatTriggered = false;
        }
    }, []);

    let firstIgnored = useRef<boolean>(false);
    
    // Helper function to check if user is near the bottom
    const isNearBottom = (element: HTMLDivElement, threshold: number = 100): boolean => {
        const { scrollTop, scrollHeight, clientHeight } = element;
        return scrollHeight - scrollTop - clientHeight < threshold;
    };
    
    // Handle manual scroll - if user scrolls up, disable auto-scroll
    const handleScroll = () => {
        if (divRef.current) {
            shouldAutoScrollRef.current = isNearBottom(divRef.current);
        }
    };
    
    useEffect(() => {
        if (divRef.current) {
            if (firstIgnored.current === false) {
                firstIgnored.current = true;
                return;
            }
            // Scroll to bottom whenever messages update (response received) only if user is near bottom
            setTimeout(() => {
                if (divRef.current && shouldAutoScrollRef.current) {
                    divRef.current.scroll({
                        top: divRef.current.scrollHeight + 70,
                        behavior: 'smooth'
                    });
                }
            }, 100);
        }
    }, [messages]);

    const autoRetryTimer = useRef<NodeJS.Timeout | null>(null);
    const handleSend = async (invisibleMessage?: string, customMessage?: string, attempt: number = 1, images?: File[], previewUrls?: string[]) => {
        // Check if user has chat capability
        if (!canChat) {
            toast.error("Error",'Chat capability is currently disabled for your account. Please contact your administrator.');
            return;
        }

        if (autoRetryTimer.current) {
            clearInterval(autoRetryTimer.current);
            autoRetryTimer.current = null;
        }

        // Reset test/fix banners when a new chat message starts
        setReadyToTest(false);
        setReadyToFix(false);
        setResponseStatusMessage('');
        // Enable auto-scroll when user sends a message (they want to see the response)
        shouldAutoScrollRef.current = true;

        const messageToSend = customMessage || invisibleMessage || messageRef.current;
        if (messageToSend?.trim() === '' && attachedImages.length === 0) {
            toast.warning('Please enter a message');
            return;
        }

        if ((messageRef.current || customMessage) && !invisibleMessage) {
            setTimeout(() => {
                if (divRef.current) {   
                    divRef.current.scroll({
                        top: divRef.current.scrollHeight + 70,
                        behavior: 'smooth'
                    });
                }
            }, 100);
        }

        setResponseStatusMessage('Generating...');
        stopChatRef.current = false; // Reset stop flag
        
        // Create new AbortController for this request
        abortControllerRef.current = new AbortController();

        setChatLoading(true);
        const optimisticContent: any = ((images && images?.length > 0) || attachedImages.length > 0)
            ? [
                ...(messageToSend ? [{ type: 'text', text: messageToSend }] : []),
                ...(previewUrls && previewUrls?.length > 0 ? previewUrls : imagePreviews).map((url) => ({ type: 'image_url', image_url: { url } }))
              ]
            : messageToSend;
        const newMessages = [...messages, { type: 'human', data: { content: optimisticContent, id: Date.now().valueOf() } }];
        const cloneOfMessages = cloneDeep(newMessages);
        const cloneOfCurrentMessages = cloneDeep(messages);

        setMessages(newMessages);
        setMessage('');

        try {
            let res: Response | null = null;
            let retryCount = 0;
            while (true) {
                retryCount++;
                if (retryCount > 50) {
                    throw new Error('Server is busy, please try again later');
                }

                if ((images && images?.length > 0) || attachedImages.length > 0) {
                    const formData = new FormData();
                    formData.append('automationId', String(params?.id || ''));
                    formData.append('message', messageToSend);
                    formData.append('model', String(model || 'gpt-4o'));
                    formData.append('currentCode', String(currentCode || ''));
                    formData.append('version', '3');
                    (images || attachedImages).forEach((file) => formData.append('images', file));
                    res = await fetch(`/api/gen/chat`, {
                        method: 'POST',
                        body: formData,
                        signal: abortControllerRef.current?.signal
                    });
                } else {
                    res = await fetch(`/api/gen/chat`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            automationId: params?.id,
                            stepId: params?.stepId,
                            message: messageToSend,
                            model,
                            currentCode,
                            version: '3' // automationRef.current?.version
                        }),
                        signal: abortControllerRef.current?.signal
                    });
                }

                // If stopped, clean up and return early
                if (stopChatRef.current) {
                    stopChatRef.current = false;
                    throw {
                        message: '',
                        disableAutoRetry: true
                    }
                }

                if (res.status === 429) {  
                    console.log('Too many instances running, waiting for 300ms...');
                }

                if (res.status === 403) {
                    // Handle subscription limit exceeded
                    const errorData = await res.json();
                    throw errorData; // Throw the full error object to preserve upgradeAction
                }

                if (res.status === 400) {
                    // Handle 400 errors (including content filter)
                    const contentType = res.headers.get('content-type');
                    let errorMessage = 'Bad request';

                    if (contentType?.includes('application/json')) {
                        try {
                            const errorData = await res.json();
                            errorMessage = errorData.message || errorData.error || errorMessage;
                        } catch {
                            errorMessage = await res.text() || errorMessage;
                        }
                    } else {
                        errorMessage = await res.text() || errorMessage;
                    }

                    throw {
                        message: errorMessage,
                        disableAutoRetry: true
                    };
                }

                if (res.status === 200) {
                    break;
                }

                await new Promise((resolve) => setTimeout(resolve, 400));
            }

            const reader = res.body?.getReader();
            const decoder = new TextDecoder("utf-8");

            let done = false;

            let gathered: any[] = [];
            let finalData: any[] = [];
            const _currentCode = currentCode;

            let generatedEnvVars: any[] = [];
            let generatedDeps: any[] = [];
            let writtenNewCode = false;
            let updatedCode = '';
            let usedEnvironmentVariables: any[] = [];
            
            // Track processed step operations to avoid duplicates
            const processedStepOperations = new Set<string>();
            
            // Store mapping of stepId to stepName for UI display
            const stepNameMap = new Map<string, string>();
            
            // Buffer for incomplete JSON chunks that need to be reassembled
            let incompleteChunkBuffer = '';

            let buffer = '';

            while (!done && reader) {
                const { value, done: readerDone } = await reader.read();
                done = readerDone;
                // If stopped, clean up and return early
                if (stopChatRef.current) {
                    stopChatRef.current = false;
                    throw {
                        message: '',
                        propogate: true,
                        disableAutoRetry: true
                    }
                }

                if (value) {
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';

                    for (const chunkLine of lines) {
                        if (chunkLine?.trim() === '') {
                            continue;
                        }

                        const rawChunkString = chunkLine;
                        let parsedChunk: any;
                        let chunk: any = chunkLine;

                        // Only attempt to parse lines that look like JSON (start with { or [)
                        const trimmedChunk = chunk && typeof chunk === 'string' ? chunk?.trim() : '';
                        if (!trimmedChunk?.startsWith('{') && !trimmedChunk?.startsWith('[')) {
                            // Skip non-JSON content silently (might be partial chunks or other content)
                            continue;
                        }

                        let chunkProcessed = false;
                        try {
                            parsedChunk = JSON.parse(chunkLine);
                            chunkProcessed = true;

                            if (parsedChunk.ping === true) {
                                console.log('Ping receive from server');
                                continue;
                            }

                            if (parsedChunk.type === 'error') {
                                throw {
                                    message: parsedChunk.data.content,
                                    propogate: true,
                                    disableAutoRetry: true
                                }
                            }

                            if (parsedChunk.type === 'frequency-set') {
                                // Schedule data is now stored in schedules-v2 collection (single source of truth)
                                // Only update triggerMode and triggerEnabled in automation
                                automationRef.current.triggerMode = parsedChunk.data.triggerMode;
                                // Set triggerEnabled based on mode: true for time-based, false for manual
                                automationRef.current.triggerEnabled = parsedChunk.data.triggerMode === 'time-based';
                                setDocVersion((d) => d + 1);
                                // Emit event to notify schedule display components to refresh
                                eventsEmitter.emit('schedule-updated', params?.id);
                                continue;
                            }

                            if (parsedChunk.type === 'used-environment-variables') {
                                usedEnvironmentVariables = parsedChunk.data;
                                continue;
                            }

                            chunk = DeserialiseChunk(parsedChunk);
                        } catch (parseError: any) {
                            if (parseError?.propogate === true) {
                                throw parseError;
                            }

                            // Only log errors for chunks that looked like JSON but failed to parse
                            // This reduces noise from expected non-JSON content
                            if (trimmedChunk.startsWith('{') || trimmedChunk.startsWith('[')) {
                                // Check if it's likely an incomplete JSON (common in streaming)
                                const errorMessage = parseError.message || '';
                                const isLikelyIncomplete = (
                                    // Check for common incomplete JSON error patterns
                                    errorMessage.includes('Unterminated') ||
                                    (errorMessage.includes('Expected') && (
                                        errorMessage.includes('property') ||
                                        errorMessage.includes("'}'") ||
                                        errorMessage.includes("','")
                                    )) ||
                                    errorMessage.includes('Unexpected end') ||
                                    // Check if JSON structure appears incomplete
                                    (trimmedChunk.startsWith('{') && !trimmedChunk.endsWith('}')) ||
                                    (trimmedChunk.startsWith('[') && !trimmedChunk.endsWith(']'))
                                );

                                if (!isLikelyIncomplete) {
                                    // Only log if it's not an incomplete JSON error (which is expected in streaming)
                                    console.error('JSON parse error for chunk:', rawChunkString.substring(0, 100) + '...', parseError);
                                } else {
                                    // Buffer incomplete chunks to try reassembling with next chunk
                                    // Only buffer if it looks like it could be completed (has opening brace/bracket)
                                    // Limit buffer size to prevent memory issues (max 10KB)
                                    if ((trimmedChunk.startsWith('{') || trimmedChunk.startsWith('[')) && chunk.length < 10000) {
                                        incompleteChunkBuffer = (incompleteChunkBuffer ? incompleteChunkBuffer + '\n' : '') + chunk;
                                        continue;
                                    } else if (incompleteChunkBuffer) {
                                        // If buffer exists but this chunk doesn't look like a continuation, clear buffer
                                        // Try to parse buffer + chunk together as a last resort
                                        try {
                                            const combined = incompleteChunkBuffer + '\n' + chunk;
                                            parsedChunk = JSON.parse(combined);
                                            incompleteChunkBuffer = '';
                                            // Continue with normal processing
                                            if (parsedChunk.ping === true) {
                                                console.log('Ping receive from server');
                                                continue;
                                            }
                                            if (parsedChunk.type === 'error') {
                                                throw {
                                                    message: parsedChunk.data.content,
                                                    propogate: true,
                                                    disableAutoRetry: true
                                                }
                                            }
                                            if (parsedChunk.type === 'frequency-set') {
                                                automationRef.current.triggerMode = parsedChunk.data.triggerMode;
                                                automationRef.current.triggerEnabled = parsedChunk.data.triggerMode === 'time-based';
                                                setDocVersion((d) => d + 1);
                                                eventsEmitter.emit('schedule-updated', params?.id);
                                                continue;
                                            }
                                            if (parsedChunk.type === 'used-environment-variables') {
                                                usedEnvironmentVariables = parsedChunk.data;
                                                continue;
                                            }
                                            chunk = DeserialiseChunk(parsedChunk);
                                            chunkProcessed = true;
                                            incompleteChunkBuffer = '';
                                            // Fall through to continue processing the chunk
                                        } catch (e) {
                                            // Combined parse also failed, clear buffer and skip
                                            incompleteChunkBuffer = '';
                                            continue;
                                        }
                                    } else {
                                        continue;
                                    }
                                }
                            }
                            
                            // Skip malformed chunks that weren't processed
                            if (!chunkProcessed) {
                                continue;
                            }
                        }

                        // Skip if DeserialiseChunk returned undefined or chunk doesn't have an id property
                        if (!chunk || !chunk?.id) {
                            console.warn('[Chat] Skipping invalid chunk - DeserialiseChunk returned undefined or chunk missing id:', {
                                chunkType: parsedChunk?.type,
                                hasChunk: !!chunk,
                                hasId: chunk?.id ? true : false,
                                parsedChunk: parsedChunk,
                                rawChunk: rawChunkString.substring(0, 200)
                            });
                            continue;
                        }

                        if (gathered.length === 0) {
                            gathered.push(chunk);
                        } else {
                            const lastMessageId = gathered[gathered.length - 1]?.id;
                            if (chunk.id !== lastMessageId) {
                                gathered.push(chunk);
                            } else {
                                gathered[gathered.length - 1] = concat(gathered[gathered.length - 1], chunk);
                            }
                        }

                        finalData = gathered.map((c) => c.toDict());
                        
                        // Process step operations from tool responses and collect env vars/deps
                        // Also update tool call status to 'done' when responses are received
                        for (const message of finalData) {
                            if (message.type === 'tool' && message.data?.tool_call_id) {
                                // Update the corresponding tool call status to 'done'
                                const toolCallId = message.data.tool_call_id;
                                for (const aiMessage of finalData) {
                                    if (aiMessage.type === 'ai' && aiMessage.data?.tool_calls) {
                                        for (const toolCall of aiMessage.data.tool_calls) {
                                            if (toolCall.id === toolCallId && toolCall.status === 'pending') {
                                                toolCall.status = 'done';
                                            }
                                        }
                                    }
                                }
                                // Also check in cloneOfMessages for tool calls from previous messages
                                for (const aiMessage of cloneOfMessages) {
                                    if (aiMessage.type === 'ai' && aiMessage.data?.tool_calls) {
                                        for (const toolCall of aiMessage.data.tool_calls) {
                                            if (toolCall.id === toolCallId && toolCall.status === 'pending') {
                                                toolCall.status = 'done';
                                            }
                                        }
                                    }
                                }
                            }
                            
                            if (message.type === 'tool' && message.data?.content) {
                                try {
                                    const toolResponse = JSON.parse(message.data.content);
                                    
                                    // Create a unique key for this operation to prevent duplicates
                                    let operationKey = '';
                                    
                                    if (toolResponse.action === 'create-step') {
                                        // For create-step, use tempStepId as the key
                                        const stepId = toolResponse.tempStepId;
                                        operationKey = `create-${stepId}`;
                                        
                                        // Only process if not already processed
                                        if (!processedStepOperations.has(operationKey)) {
                                            const newStep = {
                                                id: stepId,
                                                name: toolResponse.stepName,
                                                code: '',
                                                status: 'pending'
                                            };
                                        
                                            if (!automationRef.current) {
                                                automationRef.current = { v3Steps: [], version: '3' };
                                            }
                                            if (!automationRef.current.v3Steps) {
                                                automationRef.current.v3Steps = [];
                                                automationRef.current.version = '3';
                                            }
                                        
                                            // Insert at the correct index (1-based, convert to 0-based for array)
                                            const insertIndex = toolResponse.index ? toolResponse.index - 1 : automationRef.current.v3Steps.length;
                                            
                                            // Ensure index is within bounds
                                            if (insertIndex < 0) {
                                                automationRef.current.v3Steps.unshift(newStep);
                                            } else if (insertIndex >= automationRef.current.v3Steps.length) {
                                                automationRef.current.v3Steps.push(newStep);
                                            } else {
                                                automationRef.current.v3Steps.splice(insertIndex, 0, newStep);
                                            }
                                            
                                            // Store step name mapping
                                            stepNameMap.set(stepId, toolResponse.stepName);
                                            
                                            processedStepOperations.add(operationKey);
                                        }
                                    } else if (toolResponse.action === 'update-step' || toolResponse.action === 'update-step-code') {
                                        // For update-step, use stepId as the key
                                        operationKey = `update-${toolResponse.stepId}`;

                                        if (automationRef.current?.v3Steps) {
                                            const step = automationRef.current.v3Steps.find((s: any) => s.id === toolResponse.stepId);
                                            if (step) {
                                                // Validate code for placeholders before applying
                                                const codeToApply = toolResponse.code || '';
                                                const placeholderPatterns = [
                                                    /\.\.\.\s*\(.*(?:rest of|remaining|unchanged).*\)/i,
                                                    /\/\*\s*\.\.\.\s*unchanged.*\*\//i,
                                                    /\/\/\s*\.\.\.\s*(?:unchanged|rest|remaining)/i, // More specific than just "// ..."
                                                    /\/\/\s*changed\s*$/im,  // Only at end of line
                                                    /\/\*\s*\.\.\.\s*\*\//i,  // /* ... */
                                                    /rest of the (?:original )?code (?:remains )?unchanged/i,
                                                    /remaining code stays the same/i,
                                                    /\bkeep\s+(?:the\s+)?rest\s+(?:of\s+(?:the\s+)?code)?\s+(?:as|the\s+same)/i,
                                                    /\.\.\.\s*\(.*unchanged.*\)/i,
                                                    /\/\/\s*rest of.*(?:unchanged|stays|remains)/i,
                                                    /existing code (?:remains|stays) (?:the same|unchanged)/i
                                                ];

                                                const hasPlaceholder = placeholderPatterns.some(pattern => pattern.test(codeToApply));
                                                
                                                if (hasPlaceholder) {
                                                    console.warn(`[Chat] Rejected code update for step ${toolResponse.stepId} - contains placeholders. Original code preserved.`);
                                                    // Track rejection for this step
                                                    const stepName = step.name || `Step ${toolResponse.stepId}`;
                                                    const rejectionKey = toolResponse.stepId;
                                                    const rejectionInfo = placeholderRejectionsRef.current.get(rejectionKey) || { count: 0, lastMessage: '', stepName };
                                                    rejectionInfo.count += 1;
                                                    rejectionInfo.stepName = stepName;
                                                    // Try to find the original user message that triggered this update
                                                    const originalUserMessage = cloneOfMessages.concat(finalData).reverse().find((m: any) => m.type === 'human');
                                                    rejectionInfo.lastMessage = originalUserMessage?.data?.content || messageRef.current || '';
                                                    placeholderRejectionsRef.current.set(rejectionKey, rejectionInfo);
                                                    
                                                    // Show user-friendly error message with retry option
                                                    const errorMsg = `Code update rejected for "${stepName}": AI used placeholders instead of full code.`;
                                                    setResponseStatusMessage(`⚠️ ${errorMsg} ${rejectionInfo.count > 1 ? `(Attempt ${rejectionInfo.count})` : ''}`);
                                                    
                                                    // Auto-retry with stronger prompt if this is the first or second rejection
                                                    if (rejectionInfo.count <= 2) {
                                                        setTimeout(() => {
                                                            const currentCodeLines = step.code?.split('\n').length || 0;
                                                            const currentCodePreview = step.code ? `\n\n**Current step code to modify (${currentCodeLines} lines):**\n\`\`\`javascript\n${step.code}\n\`\`\`\n` : '';

                                                            // Build a very explicit retry message WITH full current code
                                                            const retryMessage = `🔴 CRITICAL: Previous code update REJECTED due to placeholders.

Regenerate ONLY step "${stepName}" (stepId: ${toolResponse.stepId}) with COMPLETE code:
- This step currently has ${currentCodeLines} lines - you MUST return ALL ${currentCodeLines} lines
- NO placeholders like "...", "unchanged", "rest of code", etc.
- Copy every single line, then apply the changes
- The code must be 100% complete and self-contained
${currentCodePreview}
**User's original change request:** ${rejectionInfo.lastMessage}

**Instructions:** Modify the code above according to the user's request, but return the ENTIRE code block with ALL lines included. Do not omit anything.`;
                                                            handleSend(undefined, retryMessage);
                                                        }, 2000);
                                                        toast.warning('Auto-Retrying', `Regenerating code for "${stepName}" with full context (attempt ${rejectionInfo.count + 1}/3)...`);
                                                    } else {
                                                        // After 2 failed retries, show error with manual retry instructions
                                                        const currentCodeLines = step.code?.split('\n').length || 0;
                                                        const currentCodePreview = step.code ? `\n\n**Current step code (${currentCodeLines} lines):**\n\`\`\`javascript\n${step.code}\n\`\`\`\n` : '';

                                                        const manualRetryMsg = `🔴 Manual retry needed for "${stepName}":

Regenerate step (stepId: ${toolResponse.stepId}) with COMPLETE code:
- Currently has ${currentCodeLines} lines - return ALL lines
- NO placeholders: "...", "unchanged", etc.
${currentCodePreview}
**Original request:** ${rejectionInfo.lastMessage}

Return the ENTIRE code block.`;

                                                        toast.error('Code Update Rejected', `${errorMsg} Auto-retry limit reached. Click "Copy Message" button or manually request the full code.`);
                                                        // Store the manual retry message for easy copy
                                                        (window as any).__lastPlaceholderRetryMessage = manualRetryMsg;
                                                    }
                                                    // Don't update the code if it contains placeholders
                                                    // The step will keep its original code
                                                    continue;
                                                } else {
                                                    // Code was accepted, clear rejection tracking for this step
                                                    placeholderRejectionsRef.current.delete(toolResponse.stepId);
                                                    // Clear any placeholder-related status messages
                                                    if (responseStatusMessage?.includes('Code update rejected')) {
                                                        setResponseStatusMessage('');
                                                    }
                                                }

                                                // Store step name mapping immediately
                                                if (!stepNameMap.has(toolResponse.stepId)) {
                                                    stepNameMap.set(toolResponse.stepId, step.name);
                                                }

                                                // Attach stepName to the message for UI display immediately
                                                message.data.stepName = stepNameMap.get(toolResponse.stepId);

                                                // Update code
                                                step.code = toolResponse.code;
                                                step.status = 'pending';

                                                // Store environment variables used in this step
                                                // If provided, update; if explicitly provided as empty array, clear them
                                                if (toolResponse.environmentVariablesUsed !== undefined) {
                                                    if (Array.isArray(toolResponse.environmentVariablesUsed) && toolResponse.environmentVariablesUsed.length > 0) {
                                                        step.environmentVariablesUsed = toolResponse.environmentVariablesUsed;
                                                    } else {
                                                        // Clear env vars if empty array or not provided
                                                        delete step.environmentVariablesUsed;
                                                    }
                                                }

                                                // Update name if provided
                                                if (toolResponse.name) {
                                                    step.name = toolResponse.name;
                                                    stepNameMap.set(toolResponse.stepId, toolResponse.name);
                                                    message.data.stepName = toolResponse.name;
                                                }

                                                // ALWAYS emit event to update code editor in real-time during streaming
                                                // This enables real-time code streaming in the editor
                                                eventsEmitter.emit('code-editor:step-code-updated', {
                                                    stepId: toolResponse.stepId,
                                                    code: toolResponse.code
                                                });
                                            }
                                        }

                                        // Only process the rest once to avoid duplicates
                                        if (!processedStepOperations.has(operationKey)) {
                                            // Attach stepName to the message for UI display
                                            if (stepNameMap.has(toolResponse.stepId)) {
                                                message.data.stepName = stepNameMap.get(toolResponse.stepId);

                                                // Also update the tool call args in finalData if it exists
                                                for (const fmsg of finalData) {
                                                    if (fmsg.type === 'ai' && fmsg.data?.tool_calls) {
                                                        for (const tc of fmsg.data.tool_calls) {
                                                            if (tc.args?.stepId === toolResponse.stepId) {
                                                                tc.args.stepName = stepNameMap.get(toolResponse.stepId);
                                                            }
                                                        }
                                                    }
                                                }
                                            }

                                            processedStepOperations.add(operationKey);
                                        }
                                    } else if (toolResponse.action === 'delete-step') {
                                        // For delete-step, use stepId as the key
                                        operationKey = `delete-${toolResponse.stepId}`;
                                        
                                        // Only process if not already processed
                                        if (!processedStepOperations.has(operationKey)) {
                                            if (automationRef.current?.v3Steps) {
                                                const step = automationRef.current.v3Steps.find((s: any) => s.id === toolResponse.stepId);
                                                
                                                if (step) {
                                                    // Store step name mapping BEFORE deletion
                                                    stepNameMap.set(toolResponse.stepId, step.name);
                                                    
                                                    // Attach stepName to the message for UI display immediately
                                                    message.data.stepName = step.name;
                                                    
                                                    // Also update the tool call args in finalData if it exists
                                                    for (const fmsg of finalData) {
                                                        if (fmsg.type === 'ai' && fmsg.data?.tool_calls) {
                                                            for (const tc of fmsg.data.tool_calls) {
                                                                if (tc.args?.stepId === toolResponse.stepId) {
                                                                    tc.args.stepName = step.name;
                                                                }
                                                            }
                                                        }
                                                    }
                                                    
                                                    // Now delete the step from the array
                                                    if (automationRef.current?.v3Steps) {
                                                        automationRef.current.v3Steps = automationRef.current.v3Steps.filter(
                                                            (s: any) => s.id !== toolResponse.stepId
                                                        );
                                                    }
                                                }
                                            }
                                            processedStepOperations.add(operationKey);
                                        }
                                    }
                                } catch (e) {
                                    // Not a JSON response, ignore
                                }
                            }
                        }
                        
                        const [newCode, envVars, deps] = applyCodeEdits(_currentCode, finalData);

                        finalData = finalData.filter((m) => {
                            if (m.type === 'ai') {
                                if (m?.data?.tool_calls?.length > 0) {
                                    return m?.data?.tool_calls.some((tc: any) => tc.name === 'extract') === false;
                                }
                            }
                            
                            return true;
                        });

                        // Don't merge dependencies/env vars during streaming - wait for final data
                        // This prevents processing incomplete/duplicate data during streaming

                        // Check if steps were created/updated
                        const hasStepOperations = finalData.some((m: any) => 
                            m.type === 'tool' && m.data?.content && 
                            (m.data.content.includes('create-step') || 
                             m.data.content.includes('update-step') ||
                             m.data.content.includes('update-step-code') ||
                             m.data.content.includes('delete-step'))
                        );

                        if (hasStepOperations) {
                            // Steps were updated via tool responses, trigger doc version update
                            // This will trigger auto-save in the background
                            setDocVersion((d) => d + 1);
                            writtenNewCode = true;
                            updatedCode = automationRef.current?.code || '';
                            
                            // Determine step operation type for commit message
                            const stepOperationMessages: string[] = [];
                            for (const m of finalData) {
                                if (m.type === 'tool' && m.data?.content) {
                                    const content = m.data.content;
                                    if (content.includes('delete-step')) {
                                        try {
                                            const toolResponse = JSON.parse(content);
                                            if (toolResponse.action === 'delete-step' && toolResponse.stepId) {
                                                const step = automationRef.current?.v3Steps?.find((s: any) => s.id === toolResponse.stepId);
                                                if (step) {
                                                    stepOperationMessages.push(`Deleted step: ${step.name}`);
                                                }
                                            }
                                        } catch (e) {
                                            // Ignore parse errors
                                        }
                                    } else if (content.includes('create-step')) {
                                        try {
                                            const toolResponse = JSON.parse(content);
                                            if (toolResponse.action === 'create-step' && toolResponse.name) {
                                                stepOperationMessages.push(`Created step: ${toolResponse.name}`);
                                            }
                                        } catch (e) {
                                            // Ignore parse errors
                                        }
                                    }
                                }
                            }
                            
                            // Store step operation message for commit
                            if (stepOperationMessages.length > 0) {
                                const commitMessage = stepOperationMessages.join(', ');
                                eventsEmitter.setPendingCommitMessage(params?.id as string, commitMessage);
                            }
                        } else if (newCode) {
                            if (newCode === 'STEPS_UPDATED') {
                                // Legacy way - reload automation
                                // const response = await fetch(`/api/automations/${params?.id}`);
                                // const automationData = await response.json();
                                // setDocVersion((d) => d + 1);
                                // writtenNewCode = true;
                                // updatedCode = automationData.code || '';
                            } else {
                                // Legacy single code file
                                setCurrentCode(newCode as string);
                                updatedCode = newCode as string;
                                eventsEmitter.emit('code-editor:ai-code-generated', newCode);

                                if (editorRef.current) {
                                    const model = editorRef.current.getModel();
                                    const lastLineNumber = model?.getLineCount();
                                    if (lastLineNumber) {
                                        editorRef.current.revealLine(lastLineNumber);
                                    }
                                }
                                writtenNewCode = true;
                            }
                        }

                        if (finalData.length > 0) { 
                            const lastMessage = finalData[finalData.length - 1];
                            if (lastMessage.type === 'ai' && lastMessage.data?.tool_calls?.length > 0) { 
                                const allItems = [
                                    ...cloneOfMessages,
                                    ...finalData
                                ]
                                const toolCall = lastMessage.data.tool_calls[0];
                                const indexOfToolResponse = allItems.findIndex((item) => item?.data?.tool_call_id === toolCall.id);
                                // If we found a tool response, the tool call is done (regardless of position)
                                const status = indexOfToolResponse > -1 ? 'done' : 'pending';
                                const { label } = getLabel(toolCall.name, toolCall.args, status, automationRef.current?.v3Steps);
                                setResponseStatusMessage(label + '...');
                            } else {
                                setResponseStatusMessage('Generating...');
                            }
                        }

                        setMessages([
                            ...cloneOfMessages,
                            ...finalData
                        ]);
                        
                        // Scroll to bottom when response is received only if user is near bottom
                        setTimeout(() => {
                            if (divRef.current && shouldAutoScrollRef.current) {
                                divRef.current.scroll({
                                    top: divRef.current.scrollHeight + 70,
                                    behavior: 'smooth'
                                });
                            }
                        }, 100);
                    }
                }
            }
            
            // Process dependencies and environment variables from final data after streaming
            const finalToolResponses = gathered
                .map((c) => c.toDict())
                .filter((m) => m.type === 'tool' && m.data?.content)
                .map((m) => {
                    try {
                        return JSON.parse(m.data.content);
                    } catch (e) {
                        return null;
                    }
                })
                .filter((resp) => resp);
            
            // Collect all dependencies and env vars from final complete data
            for (const toolResponse of finalToolResponses) {
                // Handle update-step tool responses
                if (toolResponse.action === 'update-step') {
                    if (toolResponse.dependenciesUsed && Array.isArray(toolResponse.dependenciesUsed)) {
                        const newDeps = toolResponse.dependenciesUsed.map((d: any) => typeof d === 'string' ? d : d.name);
                        generatedDeps = [...new Set([...generatedDeps, ...newDeps])];
                    }
                }
            }
            
            // Aggregate environment variables from all steps
            // Collect all env vars used across all steps in v3Steps
            const allStepEnvVars = new Set<string>();
            if (automationRef.current?.v3Steps && Array.isArray(automationRef.current.v3Steps)) {
                for (const step of automationRef.current.v3Steps) {
                    if (step.environmentVariablesUsed && Array.isArray(step.environmentVariablesUsed)) {
                        for (const envVar of step.environmentVariablesUsed) {
                            const envVarName = typeof envVar === 'string' ? envVar : envVar.name;
                            if (envVarName) {
                                allStepEnvVars.add(envVarName);
                            }
                        }
                    }
                }
            }
            
            // Convert Set to array for generatedEnvVars
            generatedEnvVars = Array.from(allStepEnvVars);
            
            // Also handle dependencies from legacy write-code-in-monaco-editor if present
            const [newCode, envVars, deps] = applyCodeEdits(_currentCode, gathered.map((c) => c.toDict()));
            if (envVars && Array.isArray(envVars) && envVars.length > 0) {
                // For single-file code mode (not v3 multi-step), add to generatedEnvVars
                for (const envVar of envVars) {
                    const envVarName = typeof envVar === 'string' ? envVar : (envVar as any)?.name;
                    if (envVarName) {
                        allStepEnvVars.add(envVarName);
                    }
                }
                generatedEnvVars = Array.from(allStepEnvVars);
            }
            if (deps && Array.isArray(deps) && deps.length > 0) {
                generatedDeps = [...new Set([...generatedDeps, ...deps])];
            }
            
            let newVariables: any[] = [];
            let idPrefix: number = 0;

            setResponseStatusMessage('Reviewing environment variables...');
            // Create a set of all env var names used in steps (for filtering)
            const usedEnvVarNames = new Set<string>(generatedEnvVars || []);
            try {
                const r = await fetch(`/api/automations/${params?.id}/env`, {
                    method: 'POST',
                    body: JSON.stringify({
                        environmentVariables: generatedEnvVars
                    })
                });
                const data = await r.json();
                if (data?.length > 0) {
                    usedEnvironmentVariables = data;

                }
            } catch (e) {}

            // Only include env vars that are used in at least one step
            if (generatedEnvVars?.length > 0 || usedEnvironmentVariables?.length > 0) {
                // Use names from generatedEnvVars (collected from all steps) if available
                const envVarNames = generatedEnvVars?.length > 0 ? generatedEnvVars : usedEnvironmentVariables.map((e: any) => typeof e === 'string' ? e : e.name);
                
                for (const envVarName of envVarNames) {
                    const evName = typeof envVarName === 'string' ? envVarName : envVarName.name;

                    // Only process env vars that are used in steps
                    if (!usedEnvVarNames.has(evName) && generatedEnvVars?.length > 0) {
                        continue;
                    }

                    const alreadyExists = environmentVariables?.find((d: any) => d.name === evName);
                    
                    // Get value from usedEnvironmentVariables (backend) if available
                    const existing = usedEnvironmentVariables?.find((d: any) => d.name === evName);

                    if (alreadyExists) {
                        // Push existing env var (which should have value from workspace if it was loaded properly)
                        // If value is missing, we'll populate it later from workspace
                        newVariables.push(alreadyExists);
                    } else if (existing) {
                        idPrefix++;
                        newVariables.push({
                            ...existing,
                            source: 'ai',
                            id: `${(new Date()).getTime()}_${idPrefix}`
                        });
                    } else {
                        // New env var that doesn't exist in workspace yet
                        idPrefix++;
                        newVariables.push({
                            name: evName,
                            value: '', // Will be populated from workspace if it exists there
                            source: 'ai',
                            id: `${(new Date()).getTime()}_${idPrefix}`
                        });
                    }
                }
            }

            // Only keep existing environment variables that are still used in at least one step
            // This removes unused env vars from the automation
            const isV3Mode = automationRef.current?.v3Steps && automationRef.current.v3Steps.length > 0;
            
            if (isV3Mode && usedEnvVarNames.size > 0 && environmentVariables && environmentVariables.length > 0) {
                // In v3 mode with steps, only keep env vars used in steps
                for (const envVar of environmentVariables) {
                    if (usedEnvVarNames.has(envVar.name)) {
                        const alreadyInNew = newVariables.find((v: any) => v.name === envVar.name);
                        if (!alreadyInNew) {
                            newVariables.push(envVar);
                        }
                    }
                }
            } else if (isV3Mode && usedEnvVarNames.size === 0) {
                // In v3 mode but no steps use env vars, clear all env vars
                newVariables = [];
            } else if (!isV3Mode) {
                // Any single-file mode: keep existing behavior
                // Preserve existing env vars that aren't in newVariables yet
                const existingNames = new Set(newVariables.map((v: any) => v.name));
                for (const envVar of environmentVariables || []) {
                    if (!existingNames.has(envVar.name)) {
                        newVariables.push(envVar);
                    }
                }
            }

            // Populate missing environment variable values from workspace
            // ONLY for newly added env vars (not existing ones that user may have edited)
            try {
                const workspaceId = automationRef.current?.workspaceId;
                if (workspaceId && newVariables.length > 0) {
                    // Create a set of existing env var names to track which ones were already present
                    const existingEnvVarNames = new Set<string>();
                    environmentVariables?.forEach((env: any) => {
                        if (env.name) {
                            existingEnvVarNames.add(env.name);
                        }
                    });

                    // Only populate workspace values for NEWLY ADDED env vars (not in existingEnvVarNames)
                    // This ensures user edits are preserved and not overwritten
                    const newlyAddedEnvVars = newVariables.filter(envVar => !existingEnvVarNames.has(envVar.name));
                    
                    if (newlyAddedEnvVars.length > 0) {
                        // Check if any newly added env vars need workspace values
                        let needsWorkspaceFetch = false;
                        for (const envVar of newlyAddedEnvVars) {
                            const hasValue = envVar.value && (
                                (typeof envVar.value === 'string' && envVar.value?.trim()) ||
                                (typeof envVar.value === 'object' && envVar.value !== null && 
                                 (envVar.value.dev !== undefined || envVar.value.test !== undefined || envVar.value.production !== undefined))
                            );
                            if (!hasValue) {
                                needsWorkspaceFetch = true;
                                break;
                            }
                        }

                        let workspaceEnvVarsMap = new Map<string, any>();

                        // Fetch workspace values only if needed
                        if (needsWorkspaceFetch) {
                            try {
                                const workspaceEnvVarsResponse = await fetch(`/api/user-configurations`);
                                if (workspaceEnvVarsResponse.ok) {
                                    const workspaceData = await workspaceEnvVarsResponse.json();
                                    const workspaceConfigs = workspaceData?.configurations || [];
                                    
                                    // Create a map of workspace env vars for quick lookup
                                    workspaceConfigs.forEach((config: any) => {
                                        // Include configs that have 'value' property (can be string or object)
                                        if (config.name && config.value !== undefined) {
                                            workspaceEnvVarsMap.set(config.name, config);
                                        }
                                    });
                                }
                            } catch (error) {
                                console.error('Error fetching workspace configurations:', error);
                            }
                        }

                        // Populate missing values from workspace ONLY for newly added env vars
                        // When multi-env checkbox is not ticked, use 'dev' as default strategy
                        for (let i = 0; i < newVariables.length; i++) {
                            const envVar = newVariables[i];
                            const envVarName = envVar.name;

                            // Only process newly added env vars (not existing ones)
                            if (!existingEnvVarNames.has(envVarName)) {
                                // Check if env var doesn't have a value (handle both string and object cases)
                                const hasValue = envVar.value && (
                                    (typeof envVar.value === 'string' && envVar.value?.trim()) ||
                                    (typeof envVar.value === 'object' && envVar.value !== null && 
                                     (envVar.value.dev !== undefined || envVar.value.test !== undefined || envVar.value.production !== undefined))
                                );

                                if (!hasValue && workspaceEnvVarsMap.has(envVarName)) {
                                    const workspaceEnvVar = workspaceEnvVarsMap.get(envVarName);
                                    
                                    // Determine the value to use - always use 'dev' when multi-env is not enabled
                                    let valueToUse = '';
                                    
                                    // Check if workspace env var has multi-environment structure (value is an object)
                                    if (workspaceEnvVar.value && typeof workspaceEnvVar.value === 'object') {
                                        // Multi-environment structure with 'value' as object (from user configurations)
                                        // Always use 'dev' when multi-env checkbox is not ticked
                                        valueToUse = workspaceEnvVar.value.dev || workspaceEnvVar.value.test || workspaceEnvVar.value.production || '';
                                    } else if (workspaceEnvVar.value !== undefined && workspaceEnvVar.value !== null) {
                                        // Any single value structure (applies to all environments)
                                        if (typeof workspaceEnvVar.value === 'string') {
                                            valueToUse = workspaceEnvVar.value;
                                        }
                                    }
                                    
                                    // Set as single value (not multi-env object) when checkbox is not ticked
                                    if (valueToUse !== '') {
                                        newVariables[i] = {
                                            ...envVar,
                                            value: valueToUse, // Single value, not multi-env object
                                            // Preserve other properties like id, source, etc.
                                        };
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (error) {
                console.error('Error fetching workspace environment variables:', error);
                // Continue without workspace values - not critical
            }

            // if (usedEnvironmentVariables?.length > 0) {
            //     if (generatedEnvVars?.length > 0 || environmentVariables?.length > 0) {
            //         const tempVars: any[] = generatedEnvVars?.length > 0 ? generatedEnvVars : (environmentVariables || []);
            //         let idPrefix: number = 0;
            //         const newEnvVariables = tempVars.map((envVar) => {
            //             let ev;
            //             if (typeof envVar === 'string') {
            //                 ev = envVar;
            //             } else {
            //                 ev = envVar.name;
            //             }
            //             const alreadyExists = environmentVariables?.find((d: any) => ev === d.name);
            //             const existing = usedEnvironmentVariables?.find((d: any) => ev === d.name);
            //             if (alreadyExists) {
            //                 return alreadyExists;
            //             }
            //             if (existing) {
            //                 if (existing.id) {
            //                     return existing;
            //                 }
            //                 idPrefix++;
            //                 return {
            //                     ...existing,
            //                     source: 'ai',
            //                     id: `${(new Date()).getTime()}_${idPrefix}`
            //                 };
            //             }
            //             if (!existing) {
            //                 idPrefix++;
            //                 return {
            //                     ...envVar,
            //                     source: 'ai',
            //                     id: `${(new Date()).getTime()}_${idPrefix}`
            //                 };
            //             }
            //         });
            //         generatedEnvVars = newEnvVariables;
            //     } else {
            //         generatedEnvVars = usedEnvironmentVariables || [];
            //     }
            //     applyEnvVariablesAndDependencies(generatedDeps);
            //     setEnvironmentVariables(generatedEnvVars);
            // } else {
               
            //     applyEnvVariablesAndDependencies(generatedDeps, generatedEnvVars);
            // }
            applyEnvVariablesAndDependencies(generatedDeps);
            setEnvironmentVariables(newVariables);
            
            // Force a re-render to ensure the UI updates with the populated values
            // This is important when values are prefilled from workspace
            if (automationRef.current?._id) {
                setDocVersion((d) => d + 1);
            }

            if (writtenNewCode === true) {
                setReadyToTest(true);
                
                // Check if we're in the middle of an upgrade (using ref instead of version check)
                // This is more reliable since version might already be '3' by the time code is written
                if (isUpgradingRef.current && automationRef.current?._id) {
                    automationRef.current.version = '3';
                    isUpgradingRef.current = false; // Reset flag
                    setResponseStatusMessage('Updating automation...');
                    // Update version in database
                    try {
                        const response = await fetch('/api/automations', {
                            method: 'PUT',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                payload: {
                                    ...automationRef.current,
                                    version: '3'
                                },
                                automationId: automationRef.current._id
                            })
                        });
                        
                        if (response.ok) {
                            setDocVersion((d) => d + 1);
                            toast.success('Upgrade Successful - The automation has been upgraded to the latest version. The workflow will be recreated in the new format.');
                        } else {
                            console.error('[Upgrade] Failed to update version, response not ok:', response.status);
                            isUpgradingRef.current = false; // Reset on error
                        }
                    } catch (error) {
                        console.error('[Upgrade] Error updating version:', error);
                        isUpgradingRef.current = false; // Reset on error
                    }
                }
                
                setResponseStatusMessage('Updating workflow...');
                const workflow = await generateWorkflow(params?.id as string, updatedCode);
                if (automationRef.current) {
                    automationRef.current.workflow = workflow;
                    automationRef.current.finalWorkflow = workflow;
                }
                setDocVersion((d) => d + 1);
                setWorkflow(workflow);
                setUpdatedWorkflow((oldValue: any) => ({
                    ...oldValue,
                    steps: workflow?.steps?.map((step: any) => ({
                        ...step,
                        status: 'pending'
                    }))
                }));

                // Commit AI-generated code to version control (MongoDB + optional GitHub sync)
                // For AI-generated code: ALWAYS commit after generation completes
                // For manual user changes: Only commit when user clicks "Accept All Changes"
                if (writtenNewCode) {
                    // Check for pending commit message (e.g., from step operations)
                    const pendingMessage = eventsEmitter.getPendingCommitMessage(params?.id as string);
                    let summary: string;
                    
                    if (pendingMessage) {
                        summary = pendingMessage;
                        eventsEmitter.clearPendingCommitMessage(params?.id as string);
                    } else {
                        // Generate summary from code diff
                        summary = await generateCodeSummary(_currentCode, updatedCode);
                    }
                    
                    commitCodeToGitHub(_currentCode, updatedCode, newVariables, generatedDeps, summary);
                }
            }

            setChatLoading(false);
            setResponseStatusMessage('');
            // Clean up AbortController
            abortControllerRef.current = null;
            // Clear attachments after success
            setAttachedImages([]);
            setImagePreviews([]);
        } catch (e: any) {
            // Only log unexpected errors to console
            if (!e?.propogate && e?.name !== 'AbortError') {
                console.error('Error in chat:', e);
            }

            // Determine error type and set appropriate message/state
            const isNetworkError = e?.message?.includes('Failed to fetch') || (e?.name === 'TypeError' && e?.message?.includes('fetch'));
            const isUpgradeError = handleApiError(e);
            const isAbortError = e.name === 'AbortError';
            const isPropagatedError = e?.propogate && e?.message;

            // Extract error message - check both error.error (from API response) and error.message
            const apiErrorMessage = e?.error || e?.message;

            // Extract error message for use in retry logic
            let errorMessage: string = '';
            if (isNetworkError) {
                errorMessage = 'Network error. Please check your connection and try again.';
                setResponseStatusMessage(errorMessage);
                setMessages(cloneOfCurrentMessages);
            } else if (isUpgradeError) {
                // Upgrade modal shown, clean state
                errorMessage = '';
                setResponseStatusMessage(errorMessage);
                setMessages(cloneOfCurrentMessages);
            } else if (isAbortError) {
                errorMessage = '';
                setTimeout(() => setResponseStatusMessage(''), 1000);
                setMessages(cloneOfCurrentMessages);
            } else if (isPropagatedError) {
                errorMessage = e.message;
                setMessages(cloneOfMessages); // Keep user message
                setResponseStatusMessage(errorMessage);
            } else if (apiErrorMessage) {
                // Show the API error message (e.g., subscription payment failed)
                errorMessage = apiErrorMessage;
                setResponseStatusMessage(errorMessage);
                setMessages(cloneOfCurrentMessages);
            } else {
                errorMessage = 'Failure: Unable to generate response. Please try again.';
                setResponseStatusMessage(errorMessage);
                setMessages(cloneOfCurrentMessages);
            }

            // Common cleanup
            setChatLoading(false);
            setMessage(messageToSend);
            abortControllerRef.current = null;
            setAttachedImages([]);
            setImagePreviews([]);
            if (e?.disableAutoRetry === true || e.name === 'AbortError') {
                // do nothing
            } else {
                if (attempt < 2) {
                    let timerSeconds = 5;
                    setResponseStatusMessage(`${errorMessage} Trying again in ${timerSeconds} seconds...`);
    
                    autoRetryTimer.current = setInterval(() => {
                        timerSeconds--;
                        setResponseStatusMessage(`${errorMessage} Trying again in ${timerSeconds} seconds...`);
    
                        if (timerSeconds <= 0) {
                            if (autoRetryTimer.current) {
                                clearInterval(autoRetryTimer.current);
                            }
                            handleSend(invisibleMessage, customMessage, attempt + 1);
                        }
                    }, 1000);
                }
            }
        }
    }

    const cancelAutoRetry = () => {
        if (autoRetryTimer.current) {
            clearInterval(autoRetryTimer.current);
            autoRetryTimer.current = null;
        }

        setResponseStatusMessage('');
    }

    const stopChatGeneration = () => {
        stopChatRef.current = true;
        // Abort the current request if it exists
        if (abortControllerRef.current) {
            try {
                abortControllerRef.current.abort();
            } catch {}
        }
    }

    const applyEnvVariablesAndDependencies = (generatedDeps: any[], generatedEnvVars?: any[]) => {
        let idPrefix: number = 0;
            const newDeps = [...dependencies || []];
            for (const dep of generatedDeps) {
                // Handle both string names and objects with name property
                const depName = typeof dep === 'string' ? dep : dep.name;
                const alreadyExists = (dependencies || []).find((d: any) => d.name === depName);
                if (!Boolean(alreadyExists)) {
                    idPrefix++;

                    newDeps.push({
                        name: depName,
                        version: 'latest', // dep.version,
                        source: 'ai',
                        id: `${(new Date()).getTime()}_${idPrefix}`
                    });
                }
            }

            let needEnvVariable = false;

            if (generatedEnvVars) {
                const newEnvVariables = [...environmentVariables || []];
                for (const envVar of generatedEnvVars) {
                    let envVarName = typeof envVar === 'string' ? envVar : envVar?.name;
                    let envVarValue = envVar?.value || '';
                    const alreadyExists = (environmentVariables || []).find((d: any) => d.name === envVarName);
                    if (!Boolean(alreadyExists)) {
                        idPrefix++;
                        needEnvVariable = true;
                        newEnvVariables.push({
                            name: envVarName,
                            value: envVarValue,
                            source: 'ai',
                            id: `${(new Date()).getTime()}_${idPrefix}`
                        });
                    } else {
                        for (const e of newEnvVariables) {
                            if (envVarValue !== '') {
                                if (e.name === envVarName) {
                                    e.value = envVarValue;
                                    break;
                                }
                            }
                        }
                    }
                }

                setEnvironmentVariables(newEnvVariables);
            }
            setDependencies(newDeps);
    }

    exposedFunctions.handleSend = handleSend;
    exposedFunctions.sendMessageDirectly = handleSend;
    exposedFunctions.commitCodeToGitHub = commitCodeToGitHub;
    exposedFunctions.generateCodeSummary = generateCodeSummary;

    // Expose functions to window object for use by other components
    useEffect(() => {
        (window as any).exposedFunctions = exposedFunctions;
        return () => {
            delete (window as any).exposedFunctions;
        };
    }, []);

    const processedMessage = useMemo(() => {
        if (!messages || !Array.isArray(messages)) {
            return [];
        }
        return messages.filter((m) => m.type !== 'tool').map((m, index) => {
            return {
                ...m,
                processedText: convertAIMessageToString([m], messages, automationRef.current?.v3Steps)
            }
        })
    }, [messages]);

    useEffect(() => {
    const unsubscribe = eventsEmitter.on(
        "automation-editor:update-message",
        (message: string) => {
            setMessage(message)
        }
    );

    return () => {
        unsubscribe();
    };
    }, []);

    // Listen for code acceptance from the editor (both auto and manual)
    useEffect(() => {
        const unsubscribe = eventsEmitter.on(
            "code-editor:changes-accepted",
            async (data: string | { code: string }) => {
                // Support both string (old format) and object (new format)
                const acceptedCode = typeof data === 'string' ? data : data.code;

                // Check for automation-scoped pending commit message (e.g., from rollback)
                const pendingMessage = eventsEmitter.getPendingCommitMessage(params?.id as string);

                let summary: string;
                if (pendingMessage) {
                    summary = pendingMessage;
                    // Clear the pending message after use
                    eventsEmitter.clearPendingCommitMessage(params?.id as string);
                } else {
                    // For v3 mode, generate summary based on all files (use empty string for now)
                    // The actual comparison will happen in the commit function
                    const isV3Mode = automationRef.current?.v3Steps && automationRef.current.v3Steps.length > 0;
                    summary = isV3Mode
                        ? 'Updated workflow steps'
                        : await generateCodeSummary(currentCode, acceptedCode);
                }

                // Commit changes when user manually accepts
                // In v3 mode, commitCodeToGitHub will automatically read all files from automationRef.current.v3Steps
                commitCodeToGitHub(currentCode, acceptedCode, environmentVariables, dependencies, summary || 'Changes manually accepted by user');
            }
        );

        return () => unsubscribe();
    }, [autoAcceptChanges, currentCode, environmentVariables, dependencies, params?.id]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* <AutomationManager /> */}
            <div style={{ flex: 1, overflow: 'auto', padding: 10, paddingBottom: 50 }} ref={divRef} onScroll={handleScroll}>
                {
                    processedMessage.map((message, index) => {
                        switch (message.type) {
                            case 'human':
                                return (
                                    <UserMessage key={message.data.id} isLast={processedMessage.length - 1 === index} messageText={message.processedText}>
                                        <AIMessageRenderer messages={[message]} />
                                    </UserMessage>
                                )
                            default:
                                return (
                                    <AIMessage key={message.data.id} isLast={processedMessage.length - 1 === index} messageText={message.processedText}>
                                        <AIMessageRenderer messages={[message]} />
                                    </AIMessage>
                                )
                        }
                    })
                }
            </div>
            {
                readyToFix === true ? (
                    <div style={{
                        padding: 16,
                        height: 80,
                        backgroundColor: isDarkTheme 
                            ? (lastErrorCode === 2 ? '#21262d' : '#2d1b1b') 
                            : (lastErrorCode === 2 ? '#f6ffed' : '#fff2f0'),
                        borderBottom: isDarkTheme 
                            ? (lastErrorCode === 2 ? '1px solid #30363d' : '1px solid #8b949e') 
                            : (lastErrorCode === 2 ? '1px solid #b7eb8f' : '1px solid #ffccc7'),
                        zIndex: 1000,
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div style={{ flex: 1 }}>
                            <Typography.Paragraph
                                type={lastErrorCode === 2 ? undefined : 'danger'}
                                ellipsis={{ rows: 3, tooltip: true }}
                                style={{
                                    fontSize: 13,
                                    margin: 0,
                                    color: isDarkTheme 
                                        ? (lastErrorCode === 2 ? '#c9d1d9' : '#f85149') 
                                        : (lastErrorCode === 2 ? '#000' : undefined)
                                }}
                            >
                                {
                                    lastErrorCode === 2 ? (
                                        autoPilot === true ? `Autopilot will continue development in ${autopilotCountdown} seconds.` : 'Click Continue to resume development using AI.'
                                    ) : (
                                        autoPilot === true ? `Autopilot will fix in ${autopilotCountdown} seconds.` : 'Click fix to fix the errors using AI.'
                                    )
                                }
                            </Typography.Paragraph>
                        </div>
                        <div style={{ marginLeft: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <Button disabled={isTesting === true} loading={isTesting === true} data-tour="fix-button" onClick={() => {
                                const debugMessage = getAutoFixMessage();
                                if (debugMessage) {
                                    handleSend(undefined, debugMessage as any);
                                    setReadyToFix(false);
                                }
                            }} type="primary" danger={lastErrorCode !== 2}>
                                {
                                    lastErrorCode === 2 ? 'Continue Development' : 'Fix using AI'
                                }
                            </Button>
                            {
                                autoPilot === true ? (
                                    <Button onClick={() => setAutoPilot(false)} type="default" size="small" style={isDarkTheme ? { background: '#21262d', border: '1px solid #8b949e', color: '#c9d1d9' } : undefined}>
                                        Cancel Autopilot
                                    </Button>
                                ) : null
                            }
                            {autoPilot === false && lastErrorCode !== 2 && (
                                <Button onClick={() => setReadyToFix(false)}  type="default" size="small" style={isDarkTheme ? { background: '#21262d', border: '1px solid #8b949e', color: '#c9d1d9' } : undefined}>
                                    Close
                                </Button>
                            )}
                        </div>
                    </div>
                ) : null
            }
            {
                readyToTest === true ? (
                    <div style={{
                        padding: 16,
                        height: 80,
                        backgroundColor: isDarkTheme ? 'var(--container-background-color)' : '#f6ffed',
                        borderBottom: isDarkTheme ? '1px solid #30363d' : '1px solid #b7eb8f',
                        zIndex: 1000,
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div style={{ flex: 1 }}>
                            <Typography.Paragraph
                                ellipsis={{ rows: 3, tooltip: true }}
                                style={{
                                    fontSize: 13,
                                    margin: 0, color: isDarkTheme ? '#c9d1d9' : 'black'
                                }}
                            >
                                {
                                    isTesting === true ? (
                                        'Testing now...'
                                    ) : (
                                        <>
                                            {autoPilot === true ? `Code generated. Autopilot will test in ${autopilotCountdown} seconds.` : 'Code generated. Click test to run the code or enable autopilot to test automatically.'}
                                        </>
                                    )
                                }
                            </Typography.Paragraph>
                        </div>
                        <div style={{ marginLeft: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                            <Button
                                disabled={isTesting === true || isSaving || chatLoading}
                                loading={isTesting === true|| isSaving || chatLoading}
                                onClick={() => runCode(true)}
                                type="primary"
                                style={(isTesting === true || isSaving || chatLoading)
                                    ? (isDarkTheme
                                        ? { background: '#30363d', borderColor: '#3a3f46', color: '#c9d1d9' }
                                        : { background: '#e6f4ff', borderColor: '#91caff', color: '#1f1f1f' })
                                    : undefined}
                            >
                                {isTesting === true ? 'Testing...' : 'Test Now'}
                            </Button>
                            {
                                autoPilot === true && isTesting === false ? (
                                    <Button onClick={() => setAutoPilot(false)} type="default" size="small" style={isDarkTheme ? { background: '#21262d', border: '1px solid #8b949e', color: '#c9d1d9' } : undefined}>
                                        Cancel Autopilot
                                    </Button>
                                ) : null
                            }
                            {
                                autoPilot === false && isTesting === false ? (
                                    <Button onClick={() => setReadyToTest(false)} type="default" size="small" style={isDarkTheme ? { background: '#21262d', border: '1px solid #8b949e', color: '#c9d1d9' } : undefined}>
                                        Close
                                    </Button>
                                ) : null
                            }
                        </div>
                    </div>
                ) : null
            }
            {
                responseStatusMessage ? (
                    <div style={{
                        padding: 8,
                        backgroundColor: 'var(--container-background-color)',
                        zIndex: 1000,
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between'
                    }}>
                        <div style={{ flex: 1, flexDirection: 'row', display: 'flex', alignItems: 'center' }}>
                            <Typography.Paragraph
                                ellipsis={false}
                                style={{
                                    fontSize: 13,
                                    margin: 0,
                                    flex: 1
                                }}
                            >
                                <span className="ai-gradient-text animate">
                                    {responseStatusMessage}
                                </span>
                            </Typography.Paragraph>
                            {
                                autoRetryTimer.current ? (
                                    <Button onClick={cancelAutoRetry} type="default" size="small" style={isDarkTheme ? { background: '#21262d', borderColor: '#30363d', color: '#c9d1d9' } : undefined}>Cancel</Button>
                                ) : responseStatusMessage?.includes('Code update rejected') ? (
                                    <>
                                        <Button
                                            onClick={() => {
                                                // Find the last rejected step and retry
                                                const lastRejection = Array.from(placeholderRejectionsRef.current.entries())
                                                    .sort((a, b) => b[1].count - a[1].count)[0];
                                                if (lastRejection) {
                                                    const [stepId, info] = lastRejection;
                                                    const step = automationRef.current?.v3Steps?.find((s: any) => s.id === stepId);
                                                    const currentCodeLines = step?.code?.split('\n').length || 0;
                                                    const currentCodePreview = step?.code ? `\n\n**Current step code to modify (${currentCodeLines} lines):**\n\`\`\`javascript\n${step.code}\n\`\`\`\n` : '';

                                                    const retryMessage = `🔴 CRITICAL: Previous code update REJECTED due to placeholders.

Regenerate ONLY step "${info.stepName}" (stepId: ${stepId}) with COMPLETE code:
- This step currently has ${currentCodeLines} lines - you MUST return ALL ${currentCodeLines} lines
- NO placeholders like "...", "unchanged", "rest of code", etc.
- Copy every single line, then apply the changes
- The code must be 100% complete and self-contained
${currentCodePreview}
**User's original change request:** ${info.lastMessage}

**Instructions:** Modify the code above according to the user's request, but return the ENTIRE code block with ALL lines included. Do not omit anything.`;
                                                    handleSend(undefined, retryMessage);
                                                    setResponseStatusMessage('Retrying code generation...');
                                                }
                                            }}
                                            type="primary"
                                            size="small"
                                            disabled={chatLoading}
                                        >
                                            Retry
                                        </Button>
                                        <Button
                                            onClick={() => {
                                                // Copy the retry message to clipboard
                                                const retryMsg = (window as any).__lastPlaceholderRetryMessage;
                                                if (retryMsg) {
                                                    navigator.clipboard.writeText(retryMsg);
                                                    toast.success('Retry message copied!', 'You can now paste it in the chat to manually retry.');
                                                } else {
                                                    toast.info('No retry message available', 'Please use the Retry button instead.');
                                                }
                                            }}
                                            type="default"
                                            size="small"
                                            style={isDarkTheme ? { background: '#21262d', borderColor: '#30363d', color: '#c9d1d9' } : undefined}
                                        >
                                            Copy Message
                                        </Button>
                                    </>
                                ) : null
                            }
                        </div>
                    </div>
                ) : null
            }
            <div className="chat-input-area">
                {/* Display attached images */}
                {attachedImages.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-2 p-2 border rounded" style={{ 
                        borderColor: isDarkTheme ? '#30363d' : '#d0d7de',
                        backgroundColor: isDarkTheme ? '#161b22' : '#f6f8fa'
                    }}>
                        {attachedImages.map((file, index) => (
                            <AttachedImagePreview
                                key={index}
                                file={file}
                                previewUrl={imagePreviews[index]}
                                isDarkTheme={isDarkTheme}
                                onRemove={() => {
                                    const newFiles = attachedImages.filter((_, i) => i !== index);
                                    const newPreviews = imagePreviews.filter((_, i) => i !== index);
                                    setAttachedImages(newFiles);
                                    setImagePreviews(newPreviews);
                                    // Revoke the URL for the removed image
                                    URL.revokeObjectURL(imagePreviews[index]);
                                    // Reset the file input to allow selecting the same file again
                                    const input = document.getElementById('chat-image-input') as HTMLInputElement | null;
                                    if (input) {
                                        input.value = '';
                                    }
                                }}
                            />
                        ))}
                    </div>
                )}
                <div className="flex-1 mb-2">
                    <ChatInput 
                        disabled={!canChat || chatLoading || isTesting || isSaving}
                        onPaste={handlePaste}
                        handleSend={handleSend}
                        canChat={canChat}
                        messageRef={messageRef}
                    />
                    {/* <Input.TextArea
                        data-tour="chat-input-canvas"
                        disabled={!canChat || chatLoading || isTesting || isSaving}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        onPaste={handlePaste}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder={!canChat ? "Chat is currently disabled" : "Type your message her..."}
                        autoSize={{ minRows: 1, maxRows: 5 }}
                        id="chat-input"
                    /> */}
                </div>
                <div className="flex justify-between">
                    <div></div>
                    {
                        model === 'gpt-5' ? (
                            <div className="inline-flex gap-2">
                                Using GPT 5
                            </div>
                        ) : model === 'gpt-5.1-codex' ? (
                            <div className="inline-flex gap-2">
                                Using GPT 5.1 Codex
                            </div>
                        ) : null
                    }
                    <div className="inline-flex gap-2">
                        {/* Image attachments */}
                        <input
                            id="chat-image-input"
                            type="file"
                            accept="image/*"
                            multiple
                            style={{ display: 'none' }}
                            onChange={(e) => {
                                const newFiles = Array.from(e.target.files || []);
                                if (newFiles.length > 0) {
                                    setAttachedImages((prevImages) => {
                                        // Create a Set of existing file names + sizes to check for duplicates
                                        const existingFiles = new Set(
                                            prevImages.map(f => `${f.name}-${f.size}-${f.lastModified}`)
                                        );
                                        
                                        // Filter out duplicates based on name, size, and lastModified
                                        const uniqueNewFiles = newFiles.filter(f => {
                                            const fileKey = `${f.name}-${f.size}-${f.lastModified}`;
                                            return !existingFiles.has(fileKey);
                                        });
                                        
                                        // Combine existing files with new unique files
                                        const combinedFiles = [...prevImages, ...uniqueNewFiles];
                                        
                                        // Create previews only for new files
                                        const newPreviews = uniqueNewFiles.map((f) => URL.createObjectURL(f));
                                        
                                        // Update previews state by appending new previews
                                        setImagePreviews((prevPreviews) => [...prevPreviews, ...newPreviews]);
                                        
                                        return combinedFiles;
                                    });
                                }
                                // Reset input value to allow selecting the same file again
                                e.target.value = '';
                            }}
                        />
                        <Tooltip title={attachedImages.length > 0 ? `${attachedImages.length} image(s) attached` : 'Attach images'}>
                            <Button
                                onClick={() => {
                                    const input = document.getElementById('chat-image-input') as HTMLInputElement | null;
                                    if (input) {
                                        // Reset input value to ensure onChange fires even if same file is selected
                                        input.value = '';
                                        input.click();
                                    }
                                }}
                                className="!w-[32px]"
                                type="text"
                                shape="round"
                                icon={<Paperclip size={16} />}
                                style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                                disabled={!canChat || chatLoading || isTesting || isSaving}
                            />
                        </Tooltip>
                        <Tooltip title="Version history">
                            <Button
                                onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setShowVersionHistory(true);
                                }}
                                className="!w-[32px]"
                                type="text"
                                shape="round"
                                icon={<History size={16} />}
                                style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                                disabled={false}
                                data-tour="version-history-chat"
                            />
                        </Tooltip>
                        <GradientButton
                            onClick={() => {
                                setAutoPilot(!autoPilot);
                                // Also update localStorage to persist the setting
                                if (typeof window !== 'undefined') {
                                    localStorage.setItem('autoPilot', String(!autoPilot));
                                }

                            }}
                            state={autoPilot ? 'on' : 'off'}
                        >
                            Autopilot {autoPilot ? 'on' : 'off'}
                        </GradientButton>
                        <SpeechRecognitionButton
                            isAuthenticated={!!currentUser}
                            loading={chatLoading || isTesting || isSaving}
                            onTranscriptUpdate={setMessage}
                            onEnterCommand={handleSend}
                            message={antdMessage}
                            getCurrentUser={getCurrentUser}
                            canChat={canChat}
                        />
                        {chatLoading ? (
                            <Button
                                style={{
                                    height: 32,
                                    width: 32,
                                }}
                                shape="round"
                                type="primary"
                                icon={<Square size={16} className="mt-[6px]" style={{ fill: '#fff' }} />}
                                onClick={() => stopChatGeneration()}
                            />
                        ) : (
                            <Button
                                style={{
                                    height: 32,
                                    width: 32,
                                }}
                                shape="round"
                                type="primary"
                                icon={<ArrowUp size={18} />}
                                disabled={!canChat || chatLoading || isTesting || isSaving}
                                loading={chatLoading || isTesting || isSaving}
                                onClick={() => handleSend()}
                            />
                        )}
                    </div>
                </div>
            </div>
            {/* <div style={{ minHeight: 50, display: 'flex', flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', padding: '20px 10px' }}>
                <div style={{ flex: 1, marginRight: 10 }}>
                    
                </div>
                <div>
                    <Button size="large" disabled={chatLoading} loading={chatLoading} onClick={() => handleSend()} 
                        className="bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl border-0 shadow-none focus:ring-2 focus:ring-blue-400"
                        style={{ background: '#2563eb', color: '#fff', border: 'none' }}
                    >Send</Button>
                </div>
            </div> */}
            <VersionHistoryDrawer
                open={showVersionHistory}
                onClose={() => {
                    setShowVersionHistory(false);
                }}
                automationId={params?.id as string}
                currentCode={currentCode}
                currentFiles={automationRef.current?.v3Steps}
                onRollback={async (version: string, code: string, deps: any[], envVars: any[], files?: any[]) => {
                    // Get the old code before rollback
                    const oldCode = currentCode || '';

                    // Check if this is a v3 multi-file version or single-file
                    const isV3Rollback = files && files.length > 0;

                    if (isV3Rollback) {
                        // V3 multi-file rollback: restore all step files
                        // Update v3Steps with the restored files
                        if (automationRef.current) {
                            automationRef.current.v3Steps = files.map((file: any) => ({
                                id: file.id,
                                name: file.name,
                                code: file.code,
                                status: 'pending',
                                type: 'code'
                            }));
                        }
                    } else {
                        // Single file rollback
                        setCurrentCode(code);
                    }

                    if (deps) setDependencies(deps);
                    // NOTE: Don't restore envVars - they only contain names (not values) for security
                    // Keep the current environment variables as they have the actual encrypted values
                    setDocVersion((v) => v + 1);

                    // If auto-accept is enabled, commit the rollback to GitHub
                    if (autoAcceptChanges) {
                        try {
                            // Wait a moment for state to update
                            await new Promise(resolve => setTimeout(resolve, 100));

                            // Commit the rollback with current env vars (which have actual values)
                            const changeDescription = `Rolled back to ${version}`;
                            await commitCodeToGitHub(
                                oldCode,
                                code || '',
                                environmentVariables, // Use current env vars, not the name-only ones from history
                                deps || [],
                                changeDescription
                            );

                            toast.success(`Rolled back to ${version} and committed`);

                            // Emit event to refresh version history
                            eventsEmitter.emit('version-control:version-created');
                        } catch (error) {
                            console.error('Failed to commit rollback:', error);
                            toast.error("Error",`Rolled back to ${version} but failed to commit`);
                        }
                    } else {
                        // Store the rollback message scoped to this automation to avoid cross-user contamination
                        const rollbackMessage = `Rolled back to ${version}`;
                        eventsEmitter.setPendingCommitMessage(params?.id as string, rollbackMessage);

                        toast.info(`Rolled back to ${version}. Review changes and click "Accept" to save.`);
                    }

                    // Keep drawer open to show the new version (if auto-accept) or pending state (if manual)
                }}
            />
        </div>
    )
}