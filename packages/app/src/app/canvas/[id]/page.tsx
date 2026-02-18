"use client";
import React, { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useResizable } from "react-resizable-layout";
import "./style.scss";
import ChatWindow from "./components/chat-window";
import {
  Breadcrumb,
  Button,
  Dropdown,
  Modal,
  Spin,
  Switch,
  Tooltip,
  App as AntdApp,
  Input,
} from "antd";

import useAutomationEditor, {
  AutomationEditorContext,
  createAutomationEditor,
} from "./hooks/automation-editor";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import CodeEditor from "./components/code-editor-stable";
import eventsEmitter from "@/lib/events-emitter";
import "@ant-design/v5-patch-for-react-19";
import { useAuth } from "@/app/authentication";
import { createPortal } from "react-dom";
import BrowserScreen from "./components/browser-screen";
import { EyeOutlined, LoadingOutlined, MoreOutlined, CloseOutlined } from "@ant-design/icons";
import EditAutomationModal from "./components/edit-automation-modal";
import Link from "next/link";
import { Clock3Icon, PanelLeft, Lock, Play, Pause, Copy, Edit3, Trash2, Rocket } from "lucide-react";
import { SquareSplitHorizontalIcon } from "@/components/CustomIcons";
import ScheduleAutomationModal from "./components/schedule-automation-modal";
import VersionHistoryDrawer from "./components/version-history-drawer";
import { exposedFunctions } from "./components/chat-window";
import { AutomationStatusBadge } from '@/components/AutomationStatusBadge';
import { OnboardingTour } from "@/components/OnboardingTour";
import GitHubIntegrationPanel from "./components/github-integration-panel";
import { GithubOutlined } from "@ant-design/icons";
import TurboticIcon from "@/components/TurboticIcon";
import { useTheme } from "@/contexts/ThemeContext";
import { toast } from '@/hooks/use-toast';
import GlobalLoading from "@/components/GlobalLoading";

function AutomationNameWithTooltip({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  const { theme } = useTheme();
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const [needsScroll, setNeedsScroll] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const showTooltip = () => {
    // Clear any pending hide timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    
    if (ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setCoords({
        left: rect.left + rect.width / 2,
        top: rect.top,
        width: rect.width,
      });
      setVisible(true);
    }
  };
  
  const hideTooltip = () => {
    // Add a small delay before hiding to allow mouse to move to tooltip
    hideTimeoutRef.current = setTimeout(() => {
      setVisible(false);
      setNeedsScroll(false);
      hideTimeoutRef.current = null;
    }, 100);
  };

  const cancelHideTooltip = () => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  // Check if content overflows and needs scrollbar
  useEffect(() => {
    if (visible && tooltipRef.current) {
      // Use a small timeout to ensure the element is fully rendered
      const checkScroll = setTimeout(() => {
        if (tooltipRef.current) {
          const element = tooltipRef.current;
          // Check if content height exceeds maxHeight (400px)
          const needsScrollbar = element.scrollHeight > 400;
          setNeedsScroll(needsScrollbar);
        }
      }, 10);
      return () => clearTimeout(checkScroll);
    } else {
      setNeedsScroll(false);
    }
  }, [visible, description]);

  return (
    <>
      <span
        ref={ref}
        className="font-medium dark:text-slate-300 cursor-help overflow-hidden text-ellipsis whitespace-nowrap ai-gradient-text"
        style={{
          transition: "all 0.2s ease",
          position: "relative",
          zIndex: 2,
          fontSize: 24,
          // display: 'inline-block',
          // textOverflow: 'ellipsis',
          // whiteSpace: 'nowrap',
        }}
        tabIndex={0}
        onMouseEnter={showTooltip}
        onMouseLeave={hideTooltip}
        onFocus={showTooltip}
        onBlur={hideTooltip}
        aria-describedby="automation-desc-tooltip"
      >
        {title}
      </span>
      {/* <Typography.Paragraph
        ellipsis={{ rows: 1, tooltip: <div>{description}</div> }}
        style={{ }}
      >
        {title}
      </Typography.Paragraph> */}

      {visible &&
        coords &&
        createPortal(
          <div
            id="automation-desc-tooltip"
            ref={tooltipRef}
            style={{
              position: "fixed",
              left: coords.left,
              top: coords.top + 32,
              transform: "translate(-50%, 0)",
              background: theme === 'dark' 
                ? "#4E5052"
                : "#ffffff",
              color: theme === 'dark' ? "#c9d1d9" : "#000000",
              padding: "12px 16px",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 500,
              lineHeight: 1.6,
              maxWidth: 600,
              minWidth: 200,
              maxHeight: 400,
              textAlign: "left",
              boxShadow: theme === 'dark' 
                ? "0 8px 25px rgba(0, 0, 0, 0.3)"
                : "0 8px 25px rgba(0, 0, 0, 0.15)",
              border: theme === 'dark' 
                ? "1px solid #8b949e"
                : "1px solid rgba(0, 0, 0, 0.1)",
              backdropFilter: "blur(8px)",
              zIndex: 99999,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              overflowWrap: "break-word",
              overflowY: needsScroll ? "auto" : "hidden",
              pointerEvents: "auto",
              transition: "opacity 0.2s, transform 0.2s",
            }}
            role="tooltip"
            onMouseEnter={cancelHideTooltip}
            onMouseLeave={hideTooltip}
          >
            {description || "No description available"}
            <span
              style={{
                position: "absolute",
                left: "50%",
                bottom: "100%",
                transform: "translateX(-50%)",
                width: 0,
                height: 0,
                borderLeft: "8px solid transparent",
                borderRight: "8px solid transparent",
                borderBottom: theme === 'dark' ? "8px solid #4E5052" : "8px solid #ffffff",
              }}
            />
          </div>,
          document.body
        )}
    </>
  );
}

function AppContent() {
  const automationEditor = useAutomationEditor();
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { currentUser, hasInitialised } = useAuth();
  const { theme } = useTheme();
  const [hydrated, setHydrated] = useState(false);
  const [outputHeight, setOutputHeight] = useState<number | null>(null);

  const [showEditAutomationModal, setShowEditAutomationModal] = useState(false);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [showGitHubPanel, setShowGitHubPanel] = useState(false);
  const [showGitHubConnectModal, setShowGitHubConnectModal] = useState(false);
  const [githubRepoInfo, setGithubRepoInfo] = useState<any>(null);
  const [hasGlobalGitHubConnection, setHasGlobalGitHubConnection] = useState<boolean>(false);
  const [isCloning, setIsCloning] = useState(false);

  // Load initial chat width from localStorage if available, otherwise use default
  const getInitialChatWidth = () => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem("chatWindowWidth");
      return saved ? parseInt(saved, 10) : 450;
    }
    return 450;
  };

  const [chatWidth, setChatWidth] = useState(getInitialChatWidth());
  const { modal, message } = AntdApp.useApp();
  const canvasWrapperRef = useRef<HTMLDivElement>(null);

  const contentAreaRef = useRef<HTMLDivElement>(null);
  // Use default height for SSR, actual height after hydration
  const outputAreaResizable = useResizable({
    axis: "y",
    initial: outputHeight !== null ? outputHeight : 300,
    containerRef: contentAreaRef as any,
    reverse: true,
    onResizeEnd(args) {
      if (automationEditor.fitAddon.current) {
        automationEditor.fitAddon.current.fit();
      }
      // Save the new height to localStorage
      if (hydrated) {
        localStorage.setItem("outputAreaHeight", String(args.position));
      }
    },
  });

  // Authentication check - redirect to home if not authenticated
  useEffect(() => {
    if (hasInitialised && !currentUser) {
      router.push("/");
    }
  }, [hasInitialised, currentUser, router]);

  // Load GitHub repository info
  useEffect(() => {
    const loadGitHubStatus = async () => {
      if (!params?.id) return;
      try {
        const response = await fetch(`/api/automations/${params.id}/github/status`);
        if (response.ok) {
          const data = await response.json();
          setHasGlobalGitHubConnection(data.hasGlobalConnection || false);
          if (data.automation?.isConnected) {
            setGithubRepoInfo(data.automation.repo);
          } else {
            setGithubRepoInfo(null);
          }
        }
      } catch (error) {
        console.error('Error loading GitHub status:', error);
      }
    };

    loadGitHubStatus();

    // Check if GitHub was just connected
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('githubConnected') === 'true') {
      // Remove the parameter from URL without reload
      const newUrl = window.location.pathname;
      window.history.replaceState({}, '', newUrl);
      
      // Show success toast
      toast.success("Your GitHub account has been connected.");
      
      // Reload GitHub status
      loadGitHubStatus();
      
      // Close the connect modal if it's open
      setShowGitHubConnectModal(false);
    }

    // Refresh GitHub status when panel closes (in case user connected a repo)
    const handlePanelClose = () => {
      loadGitHubStatus();
    };

    // Listen for GitHub connection changes
    const unsubscribe = eventsEmitter.on('github:connected', handlePanelClose);

    return () => {
      unsubscribe();
    };
  }, [params?.id]);


  useEffect(() => {
    const unsubscribe = eventsEmitter.on(
      "automation-editor:code-change",
      (code: string) => {
        automationEditor.setCurrentCode(code);
      }
    );

    const updateChatWidth = () => {
      const chatWidth = window ? parseInt(getComputedStyle(document.documentElement).getPropertyValue('--chat-window-width')) : 500;
      setChatWidth(chatWidth);
    };

    updateChatWidth();
    
    window.addEventListener('resize', updateChatWidth);

    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    setHydrated(true);
    // Load saved height from localStorage after hydration
    const savedHeight = localStorage.getItem("outputAreaHeight");
    setOutputHeight(savedHeight ? parseInt(savedHeight, 10) : 300);
    // Initialize CSS variable with current chat width
    document.documentElement.style.setProperty('--chat-window-width', `${chatWidth}px`);
  }, []);

  useEffect(() => {
    if (params?.id) {
      automationEditor.load(params.id as string);
      // Only set active tab to 'status' if no tab is currently active and we're not in the middle of loading
      // Add a small delay to ensure the automation editor has fully initialized
      setTimeout(() => {
        if (
          (!automationEditor.activeTab || automationEditor.activeTab === "") &&
          !automationEditor.isLoading
        ) {
          automationEditor.setActiveTab("status");
        }
      }, 100);
    }
  }, [params?.id]);

  // Handle run=true query parameter
  useEffect(() => {
    const shouldRun = searchParams?.get("run") === "true";
    if (shouldRun) {
      console.log("[Canvas] Run parameter detected, checking conditions...");
      console.log("[Canvas] hasInitialised:", hasInitialised);
      console.log(
        "[Canvas] automationRef.current:",
        !!automationEditor.automationRef.current
      );
      console.log("[Canvas] isLoading:", automationEditor.isLoading);
      console.log("[Canvas] currentCode:", !!automationEditor.currentCode);

      let retryCount = 0;
      const maxRetries = 20; // 10 seconds max wait time

      // Wait for automation to be fully loaded
      const checkAndRun = () => {
        retryCount++;
        console.log(
          `[Canvas] Attempt ${retryCount}/${maxRetries} - checking conditions...`
        );

        if (
          hasInitialised &&
          automationEditor.automationRef.current &&
          !automationEditor.isLoading &&
          automationEditor.currentCode
        ) {
          console.log("[Canvas] All conditions met, starting automation...");

          // Show message that automation is being run
          toast.info("Starting automation from dashboard...");

          // Clean up the URL by removing the run=true parameter
          const url = new URL(window.location.href);
          url.searchParams.delete("run");
          window.history.replaceState({}, "", url.toString());

          // Run the automation
          automationEditor.runCode();
        } else if (retryCount >= maxRetries) {
          console.warn(
            "[Canvas] Max retries reached, attempting to run anyway..."
          );

          // Try to run anyway as a fallback
          toast.info("Starting automation from dashboard...");

          // Clean up the URL
          const url = new URL(window.location.href);
          url.searchParams.delete("run");
          window.history.replaceState({}, "", url.toString());

          // Attempt to run
          automationEditor.runCode();
        } else {
          console.log(
            `[Canvas] Conditions not met yet, retrying in 500ms... (${retryCount}/${maxRetries})`
          );
          // Retry after a short delay
          setTimeout(checkAndRun, 500);
        }
      };

      // Start checking immediately
      checkAndRun();
    }
  }, [
    searchParams,
    hasInitialised,
    automationEditor.automationRef.current,
    automationEditor.isLoading,
    automationEditor.currentCode,
  ]);


  const canEdit = automationEditor.automationRef.current?.canEdit !== false;

  // Check if current user is admin
  const automation = automationEditor.automationRef.current;
  const isAdmin = currentUser && automation && (
    (automation.adminUserIds && Array.isArray(automation.adminUserIds) && (
      automation.adminUserIds.includes(String(currentUser._id)) ||
      automation.adminUserIds.some((id: any) => String(id) === String(currentUser._id))
    )) ||
    automation.createdBy === String(currentUser._id) ||
    automation.isOwner === true
  );

  // Edit automation function
  const handleEditAutomation = () => {
    setShowEditAutomationModal(true);
  };

  // Clone automation function
  const handleCloneAutomation = async () => {
    
    if (!isAdmin) {
      toast.error("Error", "You do not have permission to clone this automation");
      return;
    }

    if (!automation) {
      toast.error("Error", "Automation not found");
      return;
    }

    setIsCloning(true);
    try {
      const response = await fetch('/api/automations', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          automationId: automation._id
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to clone automation' }));
        throw new Error(errorData.error || 'Failed to clone automation');
      }

      const data = await response.json();
      
      toast.success(`Automation "${automation.title}" cloned successfully`);
      
      // Redirect to the new automation
      router.push(`/canvas/${data.automationId}`);
    } catch (error) {
      toast.error("Error", error instanceof Error ? error.message : 'Failed to clone automation');
    } finally {
      setIsCloning(false);
    }
  };

  // Set status to Live function
  const handleSetToLive = async () => {
    const automation = automationEditor.automationRef.current;
    if (!automation) {
      toast.error("Error", "Automation not found");
      return;
    }

    try {
      const response = await fetch(`/api/automations/${automation._id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "live",
        }),
      });

      if (response.ok) {
        automation.status = "live";
        automation.isPublished = true;
        toast.success("Automation status set to Live!");
        // Refresh the page to update the status badge
        router.refresh();
      } else {
        toast.error("Error", "Failed to update automation status");
      }
    } catch (error) {
      toast.error("Error", "Failed to update automation status");
    }
  };

  // Show loading while checking authentication
  if (!hasInitialised || !currentUser) {
    return <GlobalLoading />;
  }

  return (
    <div ref={canvasWrapperRef} className="flex overflow-hidden canvas-wrapper">
      <OnboardingTour page="canvas" />
      {automationEditor.showBrowserScreen === true ? <BrowserScreen /> : null}
      {automationEditor.showChatWindow && (
        <>
          <div
            className="chat-window-area"
            data-tour="chat-window"
            style={{ width: `${chatWidth}px`, flexShrink: 0, display: automationEditor.showChatWindow ? "block" : "none" }}
          >
            <ChatWindow />
          </div>
          <div
            className="chat-resizer"
            style={{
              width: '3px',
              height: '100%',
              backgroundColor: 'transparent',
              cursor: 'col-resize',
              userSelect: 'none',
              flexShrink: 0,
              zIndex: 10,
              position: 'relative',
            }}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const startX = e.clientX;
              const startWidth = chatWidth;
              
              const handleMouseMove = (e: MouseEvent) => {
                const diff = e.clientX - startX;
                const newWidth = Math.max(300, Math.min(800, startWidth + diff));
                document.documentElement.style.setProperty('--chat-window-width', `${newWidth}px`);
                setChatWidth(newWidth);
              };
              
              const handleMouseUp = () => {
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
                localStorage.setItem("chatWindowWidth", String(chatWidth));
              };
              
              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }}
          />
        </>
      )}
      <div
        className="output-wrapper flex-1"
        style={{
          flex: '1 1 auto',
          minWidth: 0,
          width: automationEditor.showChatWindow ? `calc(100% - ${chatWidth}px - 3px)` : "100%",
        }}
      >
        <div
          className="flex items-center justify-between px-[40px] py-[20px] gap-4 title-wrapper"
          // style={{ borderBottom: "1px solid var(--border-default)" }}
        >
          <div className="overflow-hidden text-ellipsis">
            <div className="flex items-center gap-3">
              <AutomationNameWithTooltip
                title={
                  automationEditor.automationRef.current?.title ||
                  "Untitled Automation"
                }
                description={
                  automationEditor.automationRef.current?.description || ""
                }
              />
              <AutomationStatusBadge 
                status={automationEditor.automationRef.current?.status || 'draft'}
                isScheduled={false} // Don't show schedule icon here since it exists elsewhere
                scheduleEnabled={false}
              />
            </div>
            <div className={"tertiary-text text-[12px]"}>
              {automationEditor.automationRef.current?.triggerMode ===
              "time-based" ? (
                <ScheduleInfo
                  automationId={params?.id as string}
                  enabled={automationEditor.automationRef.current?.triggerEnabled === true}
                />
              ) : (
                "No scheduling"
              )}
            </div>
          </div>
          <div className="inline-flex items-center gap-2">
            <span className="tertiary-text">
              {automationEditor.isSaving ? "Saving..." : "Saved"}
            </span>
            {canEdit && (
              <Dropdown
                menu={{
                  items: [
                    {
                      key: "1",
                      label: (
                        <span className="flex items-center gap-2" data-tour="edit-automation">
                          <Edit3 size={16} />
                          Edit Automation
                        </span>
                      ),
                      onClick: () => handleEditAutomation(),
                    },
                    ...(isAdmin ? [{
                      key: "clone",
                      label: (
                        <span className="flex items-center gap-2">
                          {isCloning ? (
                            <>
                              <LoadingOutlined className="animate-spin" />
                              Cloning...
                            </>
                          ) : (
                            <>
                              <Copy size={16} />
                              Clone Automation
                            </>
                          )}
                        </span>
                      ),
                      onClick: () => handleCloneAutomation(),
                      disabled: isCloning,
                    }] : []),
                    {
                      key: "delete",
                      label: (
                        <span className="flex items-center gap-2">
                          <Trash2 size={16} />
                          Delete Automation
                        </span>
                      ),
                      onClick: () => {
                        
                        Modal.confirm({
                          title: (
                            <div className="flex items-start gap-3">
                              <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                                <span className="text-white text-sm font-bold">!</span>
                              </div>
                              <div>
                                <div className="text-lg font-semibold text-color">Delete Automation</div>
                                <div className="secondary-text mt-2">
                                  Are you sure you want to delete "{automationEditor.automationRef.current?.title || "Untitled Automation"}"? This action cannot be undone.
                                </div>
                              </div>
                            </div>
                          ),
                          content: null,
                          icon: null,
                          className: theme === 'dark' ? 'dark-modal' : '',
                          closable: true,
                          okText: "Delete",
                          cancelText: "Cancel",
                          okButtonProps: {
                            className: 'bg-white border border-red-500 text-red-500 hover:bg-red-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
                          },
                          cancelButtonProps: {
                            className: 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'
                          },
                          onOk: async () => {
                            try {
                              const automation =
                                automationEditor.automationRef.current;
                              if (!automation) return;

                              const response = await fetch(
                                `/api/automations/${automation._id}`,
                                {
                                  method: "DELETE",
                                  headers: {
                                    "Content-Type": "application/json",
                                  },
                                }
                              );

                              if (response.ok) {
                                
                                toast.success("Automation deleted successfully!");
                                router.replace("/automations");
                              } else {
                                toast.error("Error", "Failed to delete automation");
                              }
                            } catch (error) {
                              console.error(
                                "Error deleting automation:",
                                error
                              );
                              toast.error("Error", "Failed to delete automation");
                            }
                          },
                        });
                      },
                    },
                  ],
                }}
                placement="bottomRight"
              >
                <Tooltip title="More options">
                  <Button
                    className="mt-[5px]"
                    data-tour="more-actions"
                    type="text"
                    icon={<MoreOutlined rotate={90} className="!text-[26px]" />}
                  />
                </Tooltip>
              </Dropdown>
            )}
            {/* {automationEditor.automationRef.current?.triggerMode ===
            "time-based" ? (
              <div>
                <label style={{ marginRight: 8 }}>{`Schedule: ${
                  (automationEditor.automationRef.current.triggerEnabled ===
                  true
                    ? automationEditor.automationRef.current
                        ?.cronExpressionFriendly
                    : "Disabled") || "Not set"
                }`}</label>
                <Switch
                  checked={
                    automationEditor.automationRef.current?.triggerEnabled ===
                    true
                  }
                  onChange={(checked) => {
                    automationEditor.automationRef.current.triggerEnabled =
                      checked;
                    automationEditor.setDocVersion((v) => v + 1);
                  }}
                />
              </div>
            ) : null} */}
            <Tooltip title={automationEditor.showBrowserScreen ? "Close browser preview" : "Open browser preview"}>
              <Button
                onClick={() => {
                  automationEditor.setShowBrowserScreen(!automationEditor.showBrowserScreen);
                }}
                className="mt-[5px] !w-[30px]"
                type={automationEditor.showBrowserScreen ? "default" : "text"}
                shape="round"
                icon={<EyeOutlined className="!text-[20px]" />}
              />
            </Tooltip>
            {/* GitHub Integration */}
            <Tooltip title={!hasGlobalGitHubConnection ? "Connect GitHub Account" : githubRepoInfo ? "GitHub Sync On" : "No repository connected"}>
              <Button
                onClick={async () => {
                  if (!hasGlobalGitHubConnection) {
                    // Show custom GitHub connection modal
                    setShowGitHubConnectModal(true);
                  } else {
                    setShowGitHubPanel(true);
                  }
                }}
                className="ml-[-5px] mt-[5px] !w-[30px]"
                type="text"
                shape="round"
                icon={
                  <div className="relative">
                    <GithubOutlined style={{ fontSize: 18 }} />
                    {githubRepoInfo ? (
                      <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-600 rounded-full"></div>
                    ) : (
                      <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-600 rounded-full"></div>
                    )}
                  </div>
                }
              />
            </Tooltip>
            {/* API Key Button */}
            <Tooltip title="API Key & Usage">
              <Button
                onClick={() => {
                  const automation = automationEditor.automationRef.current;
                  if (!automation?.apiKey) {
                    toast.warning('No API key available for this automation');
                    return;
                  }
                  
                  // Create a modal with API information
                  modal.info({
                    title: 'API Key & Usage',
                    width: 600,
                    closable: true,
                    closeIcon: (
                      <button
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          width: '24px',
                          height: '24px',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          padding: 0,
                          color: 'var(--tertiary-text)',
                          opacity: 0.7,
                          transition: 'opacity 0.2s'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.opacity = '1';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.opacity = '0.7';
                        }}
                      >
                        <CloseOutlined style={{ fontSize: 12 }} />
                      </button>
                    ),
                    content: (
                      <div style={{ marginTop: 16 }}>
                        <div style={{ marginBottom: 16 }}>
                          <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8, color: 'var(--text-color)' }}>API Key</label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Input.Password
                              value={automation.apiKey}
                              readOnly
                              style={{ flex: 1, wordBreak: 'break-all' }}
                              className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
                            />
                            <Button onClick={() => {
                              navigator.clipboard.writeText(automation.apiKey);
                              toast.success('API key copied!');
                            }}>
                              Copy
                            </Button>
                            <Button 
                              variant="outlined" 
                              onClick={async () => {
                                try {
                                  const response = await fetch(`/api/automations/${automation._id}/regenerate-api-key`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' }
                                  });
                                  
                                  if (response.ok) {
                                    const data = await response.json();
                                    automation.apiKey = data.apiKey;
                                    toast.success('API key regenerated!');
                                    // Close the modal by triggering a re-render
                                    window.location.reload();
                                  } else {
                                    throw new Error('Failed to regenerate API key');
                                  }
                                } catch (error) {
                                  toast.error("Error",'Failed to regenerate API key');
                                }
                              }}
                            >
                              Regenerate
                            </Button>
                          </div>
                        </div>
                        
                        <div>
                          <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8, color: 'var(--text-color)' }}>Usage Example</label>
                          <div style={{ marginBottom: 8 }}>
                            <Button 
                              onClick={() => {
                                const protocol = window.location.protocol;
                                const hostname = window.location.hostname;
                                const port = window.location.port;
                                const baseUrl = `${protocol}//${hostname}${port ? ':' + port : ''}`;
                                // Generate environment variables object from automation
                                const envVarsObj: Record<string, string> = {};
                                if (automation.environmentVariables && automation.environmentVariables.length > 0) {
                                  automation.environmentVariables.forEach((env: any) => {
                                    envVarsObj[env.name] = ""; // Empty value for security
                                  });
                                }
                                
                                // Build FormData format
                                const formDataParts = [];
                                for (const [key, value] of Object.entries(envVarsObj)) {
                                  formDataParts.push(`-F 'environmentVariables[${key}]=${value}'`);
                                }
                                
                                const sample = `curl --location '${baseUrl}/api/automations/${automation._id}/trigger' \\
--header 'turbotic-api-key: ${automation.apiKey}' \\
${formDataParts.join(' \\\n')}`;
                                navigator.clipboard.writeText(sample);
                                toast.success('Usage example copied!');
                              }}
                              variant="outlined"
                            >
                              Copy Example
                            </Button>
                          </div>
                          <pre style={{ 
                            backgroundColor: 'var(--background-color)', 
                            color: 'var(--text-color)',
                            border: '1px solid var(--border-default)',
                            padding: 12, 
                            borderRadius: 6, 
                            fontSize: 12, 
                            overflowX: 'auto',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all'
                          }}>
{(() => {
  const formDataParts = automation.environmentVariables && automation.environmentVariables.length > 0
    ? automation.environmentVariables.map((env: any) => `-F 'environmentVariables[${env.name}]='`)
    : [];
  
  return `curl --location '${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}/api/automations/${automation._id}/trigger' \\
--header 'turbotic-api-key: ${automation.apiKey}' \\
${formDataParts.join(' \\\n')}`;
})()}
                          </pre>
                        </div>
                        
                        <div style={{ marginTop: 20 }}>
                          <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8, color: 'var(--text-color)' }}>Get Execution Logs</label>
                          <div style={{ marginBottom: 8 }}>
                            <Button 
                              onClick={() => {
                                const protocol = window.location.protocol;
                                const hostname = window.location.hostname;
                                const port = window.location.port;
                                const baseUrl = `${protocol}//${hostname}${port ? ':' + port : ''}`;
                                const logsSample = `curl --location '${baseUrl}/api/automations/${automation._id}/logs' \\
--header 'Content-Type: application/json' \\
--header 'turbotic-api-key: ${automation.apiKey}' \\
--data '{
  "executionHistoryId": "YOUR_EXECUTION_HISTORY_ID"
}'`;
                                navigator.clipboard.writeText(logsSample);
                                toast.success('Logs example copied!');
                              }}
                              variant="outlined"
                            >
                              Copy Logs Example
                            </Button>
                          </div>
                          <pre style={{ 
                            backgroundColor: 'var(--background-color)', 
                            color: 'var(--text-color)',
                            border: '1px solid var(--border-default)',
                            padding: 12, 
                            borderRadius: 6, 
                            fontSize: 12, 
                            overflowX: 'auto',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-all'
                          }}>
{`curl --location '${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}/api/automations/${automation._id}/logs' \\
--header 'Content-Type: application/json' \\
--header 'turbotic-api-key: ${automation.apiKey}' \\
--data '{
  "executionHistoryId": "YOUR_EXECUTION_HISTORY_ID"
}'`}
                          </pre>
                          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
                            Note: Replace "YOUR_EXECUTION_HISTORY_ID" with the executionHistoryId returned from the trigger API response.
                          </div>
                        </div>
                      </div>
                    ),
                    okText: 'Close'
                  });
                }}
                className="ml-[-5px] mt-[5px] !w-[30px]"
                type="text"
                shape="round"
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="7" cy="7" r="4"/>
                    <path d="M7 7v6"/>
                    <path d="M7 13h4"/>
                    <path d="M11 13v4"/>
                    <path d="M11 17h2"/>
                    <path d="M13 17v2"/>
                    <path d="M13 19h2"/>
                  </svg>
                }
              />
            </Tooltip>
            {/* Version history icon removed on canvas (available in chat only) */}
            {automationEditor.automationRef.current?.triggerMode ===
              "time-based" && (
              <Tooltip title={automationEditor.automationRef.current?.triggerEnabled ? "Schedule is enabled" : "Schedule is disabled"}>
                <Dropdown
                  menu={{
                    items: [
                      {
                        key: 'edit',
                        label: 'Edit Schedule',
                        onClick: () => {
                          automationEditor.setShowScheduleAutomationModal(true);
                        }
                      },
                      {
                        key: 'delete',
                        label: 'Delete Schedule',
                        danger: true,
                        onClick: () => {
                          Modal.confirm({
                            title: (
                              <div className="flex items-start gap-3">
                                <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                                  <span className="text-white text-sm font-bold">!</span>
                                </div>
                                <div>
                                  <div className="text-lg font-semibold text-color">Delete Schedule</div>
                                  <div className="secondary-text mt-2">
                                    Are you sure you want to delete the schedule? This action cannot be undone.
                                  </div>
                                </div>
                              </div>
                            ),
                            content: null,
                            icon: null,
                            closable: true,
                            okText: 'Delete',
                            okButtonProps: { danger: true },
                            cancelText: 'Cancel',
                            onOk: () => {
                              // Send message to chat
                              if (exposedFunctions.handleSend) {
                                exposedFunctions.handleSend(undefined, "Please remove the schedule");
                              }
                            },
                            width: 500,
                            centered: true,
                          });
                        }
                      }
                    ]
                  }}
                  trigger={['click']}
                  placement="bottomRight"
                >
                  <Button
                    className="ml-[-5px] mt-[5px] !w-[30px]"
                    data-tour="schedule-button"
                    type="text"
                    shape="round"
                    icon={
                      <div className="relative">
                        <Clock3Icon size={18} />
                        {automationEditor.automationRef.current?.triggerEnabled ? (
                          <Play className="absolute -bottom-1 -right-1 w-3 h-3 text-green-600 bg-white rounded-full" />
                        ) : (
                          <Pause className="absolute -bottom-1 -right-1 w-3 h-3 text-red-600 bg-white rounded-full" />
                        )}
                      </div>
                    }
                  />
                </Dropdown>
              </Tooltip>
            )}
            {!automationEditor.isTesting && (
              <div className="flex gap-2">
                {automationEditor.isResumable ? (
                  <>
                    <Button
                      type="primary"
                      shape="round"
                      data-tour="resume-button"
                      onClick={() => automationEditor.runCode(true, undefined, undefined, true)}
                      disabled={automationEditor.isSaving || automationEditor.chatLoading}
                      loading={automationEditor.isSaving || automationEditor.chatLoading}
                    >
                      {automationEditor.isSaving ? "Saving..." : automationEditor.chatLoading === true ? 'Generating...' : "Resume"}
                    </Button>
                    <Button
                      type="default"
                      shape="round"
                      data-tour="run-button"
                      onClick={() => automationEditor.runCode(true)}
                      disabled={automationEditor.isSaving || automationEditor.chatLoading}
                      loading={automationEditor.isSaving || automationEditor.chatLoading}
                    >
                      Run Automation
                    </Button>
                  </>
                ) : (
                  <Button
                    type="primary"
                    shape="round"
                    data-tour="run-button"
                    onClick={() => automationEditor.runCode(true)}
                    disabled={automationEditor.isSaving || automationEditor.chatLoading}
                    loading={automationEditor.isSaving || automationEditor.chatLoading}
                  >
                    {automationEditor.isSaving ? "Saving..." : automationEditor.chatLoading === true ? 'Generating...' : "Run Automation"}
                  </Button>
                )}
                {canEdit && automationEditor.automationRef.current && automationEditor.automationRef.current.status !== 'live' && (
                  <Tooltip title="Set automation status to Live">
                    <Button
                      type="default"
                      shape="round"
                      icon={<Rocket size={16} />}
                      onClick={handleSetToLive}
                      disabled={automationEditor.isSaving}
                    >
                      Publish
                    </Button>
                  </Tooltip>
                )}
              </div>
            )}
            {automationEditor.isTesting && (
              <Button
                type="primary"
                shape="round"
                className="!bg-black !text-white !shadow-none"
                onClick={async () => {
                  const confirmed = await modal.confirm({
                    title: "Stop automation",
                    content: "Do you want to stop the automation?",
                    closable: true,
                    okText: "Stop",
                  });
                  if (confirmed) {
                    automationEditor.stopAutomation();
                  }
                }}
                disabled={automationEditor.isStoppingAutomation}
                loading={automationEditor.isStoppingAutomation}
              >
                {automationEditor.isStoppingAutomation
                  ? "Stopping..."
                  : "Stop automation"}
              </Button>
            )}
          </div>
        </div>

        <div className="h-[100%] code-editor-wrapper" data-tour="code-editor">
          {Boolean(automationEditor.automationRef.current) ? (
            <CodeEditor
              value={automationEditor.currentCode}
              onChange={(value) => {
                automationEditor.setCurrentCode(value as any);
                automationEditor.setDocVersion((v) => v + 1);
              }}
            />
          ) : (
            <div className="steps-editor-wrapper-loading">
              <Spin />
            </div>
          )}
        </div>
      </div>

      {document.getElementById("dynamic-content")
        ? createPortal(
            <div
              className="flex items-center gap-2"
              style={{
                marginLeft: automationEditor.showChatWindow ? chatWidth - 180 : "20px",
              }}
            >
              {automationEditor.showChatWindow && (
                <SquareSplitHorizontalIcon
                  className="cursor-pointer"
                  onClick={() => {
                    automationEditor.setShowChatWindow(
                      !automationEditor.showChatWindow
                    );
                  }}
                />
              )}
              {!automationEditor.showChatWindow && (
                <PanelLeft
                  size={20}
                  className="cursor-pointer"
                  onClick={() => {
                    automationEditor.setShowChatWindow(
                      !automationEditor.showChatWindow
                    );
                  }}
                />
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Breadcrumb
                  style={{ lineHeight: "22px" }}
                  items={[
                    {
                      title: (
                        <Link className="text-[15px]" href="/automations">
                          Automations
                        </Link>
                      )
                    },
                    {
                      title: (
                        <span className="ai-gradient-text text-[15px]">
                          {automationEditor.automationRef.current?.title ||
                            "Untitled Automation"}
                        </span>
                      )
                    }
                  ]}
                />
                {githubRepoInfo && (
                  <a
                    href={githubRepoInfo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title={`${githubRepoInfo.repoOwner}/${githubRepoInfo.repoName}`}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium max-w-[200px] whitespace-nowrap overflow-hidden transition-all duration-200 bg-gray-100 hover:bg-gray-200 text-gray-600 border border-gray-300 hover:border-gray-400 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-100 dark:border-gray-500 dark:hover:border-gray-400"
                  >
                    <GithubOutlined style={{ fontSize: '12px', flexShrink: 0 }} />
                    <span className="overflow-hidden text-ellipsis whitespace-nowrap ai-gradient-text">
                      {githubRepoInfo.repoOwner}/{githubRepoInfo.repoName}
                    </span>
                  </a>
                )}
              </div>
            </div>,
            document.getElementById("dynamic-content") as Element
          )
        : null}
      {/* Edit Automation Modal */}
      <EditAutomationModal
        showEditAutomationModal={showEditAutomationModal}
        onClose={() => setShowEditAutomationModal(false)}
      />
      <ScheduleAutomationModal />
      <GitHubIntegrationPanel
        automationId={params?.id as string}
        automationName={automationEditor.automationRef.current?.title || "Untitled Automation"}
        visible={showGitHubPanel}
        onClose={() => setShowGitHubPanel(false)}
      />
      
      {/* Custom GitHub Connection Modal */}
      {showGitHubConnectModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            width: '479px',
            height: '236px',
            background: 'var(--modal-background-color)',
            borderRadius: '12px',
            boxShadow: '0px 6px 16px rgba(0, 0, 0, 0.08), 0px 3px 6px -4px rgba(0, 0, 0, 0.04), 0px 9px 28px 8px rgba(0, 0, 0, 0.05)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            padding: '32px',
            gap: '32px',
            position: 'relative'
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0px',
              gap: '24px',
              width: '415px',
              height: '24px'
            }}>
              {/* Title */}
              <div style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                padding: '0px',
                gap: '12px',
                width: 'auto',
                height: '24px'
              }}>
                <h2 style={{
                  fontFamily: 'DM Sans',
                  fontSize: '24px',
                  fontWeight: 400,
                  lineHeight: '100%',
                  letterSpacing: '-0.02em',
                  color: 'var(--card-title-color)',
                  margin: 0,
                  width: '174px',
                  height: '24px'
                }}>
                  Connect GitHub
                </h2>
              </div>

              {/* Close button */}
              <button
                onClick={() => setShowGitHubConnectModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 0,
                  color: 'var(--tertiary-text)',
                  opacity: 0.7,
                  transition: 'opacity 0.2s'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.opacity = '1';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.opacity = '0.7';
                }}
              >
                <CloseOutlined style={{ fontSize: 12 }} />
              </button>
            </div>
            
            {/* Description */}
            <div style={{
              width: '415px',
              height: '44px',
              fontFamily: 'DM Sans',
              fontSize: '15px',
              lineHeight: '22px',
              color: 'var(--card-text-color)',
              display: 'flex',
              alignItems: 'flex-start',
              textAlign: 'left'
            }}>
              Connect your GitHub account to enable version control for this automation.
            </div>

            {/* Buttons */}
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'flex-start',
              alignItems: 'flex-start',
              padding: '0px',
              gap: '8px',
              width: '415px',
              height: '40px'
            }}>
              <button
                onClick={() => setShowGitHubConnectModal(false)}
                style={{
                  width: '78px',
                  height: '40px',
                  background: 'var(--modal-background-color)',
                  border: '1px solid var(--border-default)',
                  borderRadius: '99px',
                  padding: '0px 15px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer'
                }}
              >
                <div style={{
                  display: 'flex',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: '0px',
                  gap: '8px',
                  width: '48px',
                  height: '40px'
                }}>
                  <span style={{
                    width: '48px',
                    height: '22px',
                    fontFamily: 'DM Sans',
                    fontSize: '15px',
                    lineHeight: '22px',
                    color: 'var(--primary-text-color)',
                    textAlign: 'center'
                  }}>
                    Cancel
                  </span>
                </div>
              </button>

              <button
                onClick={async () => {
                  try {
                    // Get the current automation ID from the URL
                    const automationId = params?.id;
                    const returnUrl = `/canvas/${automationId}`;
                    
                    const response = await fetch('/api/admin/integrations/github/connect', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ returnUrl })
                    });
                    if (response.ok) {
                      const data = await response.json();
                      window.location.href = data.authUrl;
                    } else {
                      toast.error("Error",'Failed to initiate GitHub connection');
                    }
                  } catch (error) {
                    toast.error("Error",'Failed to connect to GitHub');
                  }
                }}
                style={{
                  width: '90px',
                  height: '40px',
                  background: '#1A8AF2',
                  border: 'none',
                  borderRadius: '99px',
                  padding: '0px 15px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'center',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer'
                }}
              >
                <div style={{
                  display: 'flex',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: '0px',
                  gap: '8px',
                  width: '60px',
                  height: '40px'
                }}>
                  <span style={{
                    width: '60px',
                    height: '22px',
                    fontFamily: 'DM Sans',
                    fontSize: '15px',
                    lineHeight: '22px',
                    color: '#FFFFFF',
                    textAlign: 'center'
                  }}>
                    Connect
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
      <VersionHistoryDrawer
        open={showVersionHistory}
        onClose={() => setShowVersionHistory(false)}
        automationId={params?.id as string}
        onRollback={async (version: string, code: string, deps: any[], envVars: any[], files?: any[]) => {
          // Get the old code/files before rollback
          const oldCode = automationEditor.currentCode || '';
          const oldFiles = automationEditor.automationRef?.current?.v3Steps || [];

          // Apply rollback through automation editor
          // Handle both single-file mode (code) and multi-file mode (files)
          if (files && files.length > 0) {
            // Multi-file mode: restore all files by updating automationRef directly
            if (automationEditor.automationRef?.current) {
              console.log('[Rollback] Restoring', files.length, 'files:', files.map((f: any) => ({ id: f.id, name: f.name })));

              automationEditor.automationRef.current.v3Steps = files;
              automationEditor.setDocVersion((d: number) => d + 1); // Trigger re-render

              // Emit update events for ALL files to refresh the editor in real-time
              files.forEach((file: any) => {
                console.log('[Rollback] Emitting step-code-updated for:', file.id);
                eventsEmitter.emit('code-editor:step-code-updated', {
                  stepId: file.id,
                  code: file.code
                });
              });

              // Also emit a global refresh event to ensure all editor states are updated
              eventsEmitter.emit('code-editor:refresh-all-files');
            }
          } else {
            // Single-file mode: restore code
            console.log('[Rollback] Single-file mode, setting code length:', code?.length || 0);
            automationEditor.setCurrentCode(code);
          }

          automationEditor.setDependencies(deps);
          // NOTE: Don't restore envVars - they only contain names (not values) for security
          // Keep the current environment variables as they have the actual encrypted values

          const rollbackMessage = `Rolled back to ${version}`;

          // If auto-accept is enabled, commit the rollback immediately
          if (automationEditor.autoAcceptChanges) {
            try {
              // Wait a moment for state to update
              await new Promise(resolve => setTimeout(resolve, 100));
              // Commit the rollback with current env vars (which have actual values)
              await exposedFunctions.commitCodeToGitHub(
                oldCode,
                code || '',
                automationEditor.environmentVariables, // Use current env vars, not the name-only ones from history
                deps || [],
                rollbackMessage
              );

              toast.success(`Rolled back to ${version} and committed`);

              // Emit event to refresh version history
              eventsEmitter.emit('version-control:version-created');
            } catch (error) {
              toast.error("Error",`Rolled back to ${version} but failed to commit`);
            }
          } else {
            // Store the rollback message scoped to this automation to avoid cross-user contamination
            eventsEmitter.setPendingCommitMessage(params?.id as string, rollbackMessage);

            toast.info(`Rolled back to ${version}. Review changes and click "Accept" to save.`);
          }

          // Keep drawer open to show the new version (if auto-accept) or pending state (if manual)
        }}
      />
    </div>
  );
}

function ScheduleInfo({ automationId, enabled }: { automationId: string; enabled: boolean }) {
  const [scheduleData, setScheduleData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchScheduleInfo() {
      try {
        // Add cache-busting parameter to ensure fresh data
        const cacheBuster = Date.now();
        const response = await fetch(`/api/schedules-v2?automationId=${automationId}&_t=${cacheBuster}`, {
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache'
          }
        });
        const schedules = await response.json();

        if (schedules && schedules.length > 0) {
          const schedule = schedules[0]; // Get the first schedule for this automation

          // Calculate next run time using cron-parser
          try {
            const parser = require('cron-parser');
            const interval = parser.parseExpression(schedule.cronExpression, {
              tz: schedule.timezone || 'UTC'
            });
            const nextRun = interval.next().toDate();

            setScheduleData({
              ...schedule,
              nextRun: nextRun
            });
          } catch (cronError) {
            console.error('Error parsing cron expression:', cronError);
            setScheduleData(schedule);
          }
        } else {
          setScheduleData(null);
        }
      } catch (error) {
        console.error('Error fetching schedule info:', error);
      } finally {
        setLoading(false);
      }
    }

    if (automationId) {
      fetchScheduleInfo();
    }

    // Listen for schedule updates from chat
    const unsubscribe = eventsEmitter.on('schedule-updated', (updatedAutomationId: string) => {
      if (updatedAutomationId === automationId) {
        // Force refresh by clearing state first, then fetching
        setScheduleData(null);
        setLoading(true);
        // Add small delay to ensure backend has updated
        setTimeout(() => {
          fetchScheduleInfo();
        }, 100);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [automationId]);

  if (loading) {
    return <span>Loading schedule...</span>;
  }

  if (!scheduleData) {
    return <span>No scheduling</span>;
  }

  return (
    <div className="space-y-1">
      <span
        className={enabled ? "ai-gradient-text block" : "block"}
      >
        {scheduleData.cronExpressionFriendly}
      </span>
      <div className="text-[10px] opacity-75">
        <div>
          Timezone: {scheduleData.timezone || 'UTC'}
          {enabled ? (
            scheduleData.nextRun && (
              <span> • Next run: {scheduleData.nextRun.toLocaleString(undefined, {
                timeZone: scheduleData.timezone || 'UTC'
              })}</span>
            )
          ) : (
            <span> • Next run: N/A (Schedule is Disabled)</span>
          )}
        </div>
      </div>
    </div>
  );
}

function App() {
  return (
    <Suspense fallback={<GlobalLoading />}>
      <AppContent />
    </Suspense>
  );
}

export default function Canvas() {
  const automationEditor = createAutomationEditor();

  // Assign automationEditor to window for global access
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as any).automationEditor = automationEditor;
    }
  }, [automationEditor]);

  return (
    <AutomationEditorContext.Provider value={automationEditor}>
      <App />
    </AutomationEditorContext.Provider>
  );
}
