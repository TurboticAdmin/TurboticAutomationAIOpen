"use client";

import { CaretRightFilled, MoreOutlined } from "@ant-design/icons";
import { Button, Checkbox, Tooltip, Typography, Input, App, Dropdown } from "antd";
import { EyeIcon, Trash2, Edit3, Copy } from "lucide-react";
import { GithubOutlined, CloseOutlined } from "@ant-design/icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import "@ant-design/v5-patch-for-react-19";
import { AutomationStatusBadge } from "@/components/AutomationStatusBadge";
import { useState, useEffect } from "react";
import eventsEmitter from '@/lib/events-emitter';
import { toast } from '@/hooks/use-toast';
import GitHubIntegrationPanel from "@/app/canvas/[id]/components/github-integration-panel";
import { useAuth } from "@/app/authentication";

interface Automation {
  id: string;
  title: string;
  status: "live" | "draft" | "not_in_use";
  lastRun: string;
  successRate: number;
  totalRuns: number;
  triggers: number;
  description: string;
  cost?: number;
  currency?: string;
  successfulRuns?: number;
  totalCostSaved?: number;
  scheduleCount?: number;
  environmentVariables?: { name: string; value?: string }[];
  canEdit?: boolean;
  includeEnvironmentVariables?: boolean;
  adminUserIds?: string[];
  createdBy?: string;
  isOwner?: boolean;
  isCollaborating?: boolean;
  collaborators?: Array<{
    userId: string;
    email: string;
    canEdit: boolean;
    includeEnvironmentVariables: boolean;
  }>;
  marketplaceSource?: {
    listingId: string;
    listingSlug: string;
    publisherId: string;
    installedVersion: string;
    installedAt: Date;
  };
}

interface AutomationCardProps {
  automation: Automation;
  onEdit?: (automationId: string) => void;
  onRun?: (automationId: string) => void;
  onClone?: (automation: Automation) => void;
  onConfigure?: (automationId: string) => void;
  onDelete?: (automationId: string, automationTitle: string) => void;
  isSelected?: boolean;
  onSelectionChange?: (automationId: string, selected: boolean) => void;
  page?: "landing" | "automations"
}

const currencySymbols: Record<string, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  SEK: "kr",
  JPY: "¥",
  AUD: "A$",
  CAD: "C$",
  CHF: "Fr.",
  CNY: "¥",
  INR: "₹",
};

const AutomationCard = ({
  automation,
  onEdit,
  onRun,
  onClone,
  onConfigure,
  onDelete,
  isSelected = false,
  onSelectionChange,
  page="automations"
}: AutomationCardProps) => {
  const { title, description, totalRuns, cost, totalCostSaved, scheduleCount } = automation;
  const canEdit = automation.canEdit !== false;
  const router = useRouter();
  const { currentUser } = useAuth();
  const [githubRepoInfo, setGithubRepoInfo] = useState<any>(null);
  const [hasGlobalGitHubConnection, setHasGlobalGitHubConnection] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [showGitHubPanel, setShowGitHubPanel] = useState(false);
  const [showGitHubConnectModal, setShowGitHubConnectModal] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const { modal } = App.useApp();

  // Check if current user is in adminUserIds or is the creator
  // Handle both string and ObjectId formats
  const isAdmin = currentUser && (
    (automation.adminUserIds && Array.isArray(automation.adminUserIds) && (
      automation.adminUserIds.includes(String(currentUser._id)) ||
      automation.adminUserIds.some((id: any) => String(id) === String(currentUser._id))
    )) ||
    automation.createdBy === String(currentUser._id) ||
    automation.isOwner === true
  );

  // Load GitHub status
  const loadGitHubStatus = async () => {
    try {
      const response = await fetch(`/api/automations/${automation.id}/github/status`);
      if (response.ok) {
        const data = await response.json();
        setHasGlobalGitHubConnection(data.hasGlobalConnection || false);
        if (data.automation?.isConnected) {
          setGithubRepoInfo(data.automation.repo);
        } else {
          setGithubRepoInfo(null);
        }
      } else {
        // Non-200 response - silently handle (not critical)
        setGithubRepoInfo(null);
      }
    } catch (error) {
      setGithubRepoInfo(null);
    }
  };

  // Load API key - only for users with edit access
  const loadApiKey = async (): Promise<string | null> => {
    if (!canEdit) {
      toast.warning('You do not have permission to view the API key');
      return null;
    }

    try {
      const response = await fetch(`/api/automations/${automation.id}`);
      if (response.ok) {
        const data = await response.json();
        // Verify user has access and is admin
        if (data.adminUserIds && Array.isArray(data.adminUserIds)) {
          // API key should only be accessible to admins
          // Backend should filter this, but we verify on frontend too
          if (data.apiKey) {
            setApiKey(data.apiKey);
            return data.apiKey;
          } else {
            toast.warning('API key not available for this automation');
            return null;
          }
        } else {
          toast.warning('You do not have permission to view the API key');
          return null;
        }
      } else if (response.status === 403 || response.status === 401) {
        toast.warning('You do not have permission to view the API key');
        return null;
      } else {
        toast.error("Error",'Failed to load API key');
        return null;
      }
    } catch (error) {
      console.error('Error loading API key:', error);
      toast.error("Error",'Failed to load API key');
      return null;
    }
  };

  // Load GitHub status on mount
  useEffect(() => {
    if (canEdit) {
      loadGitHubStatus();
    }
    
    // Listen for GitHub connection changes
    const unsubscribe = eventsEmitter.on('github:connected', () => {
      loadGitHubStatus();
    });
    
    return () => {
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [automation.id, canEdit]);


  // Clear sensitive data on unmount
  useEffect(() => {
    return () => {
      // Clear API key from memory when component unmounts
      setApiKey(null);
      setGithubRepoInfo(null);
    };
  }, []);

  const handleCloneClick = async () => {
    if (!isAdmin) {
      toast.error("Error", "You do not have permission to clone this automation");
      return;
    }
    
    setIsCloning(true);
    try {
      await onClone?.(automation);
    } catch (error) {
      console.error('Error cloning automation:', error);
    } finally {
      setIsCloning(false);
    }
  };

  const onClickApiKey = async (automation: Automation) => {
    // Only load API key when button is clicked (lazy loading for security)
    const loadedApiKey = await loadApiKey();
    if (!loadedApiKey) {
      // Error message already shown by loadApiKey
      return;
    }
    
    // Create a closure to store the current API key
    let currentApiKey = loadedApiKey;
    
    // Store modal instance
    let modalInstance: ReturnType<typeof modal.info> | null = null;
    
    const createModalContent = (apiKeyValue: string) => (
      <div style={{ marginTop: 16 }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 8, color: 'var(--text-color)' }}>API Key</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Input.Password
              value={apiKeyValue}
              readOnly
              style={{ flex: 1, wordBreak: 'break-all' }}
              className="dark:bg-gray-800 dark:border-gray-600 dark:text-white"
            />
            <Button onClick={() => {
              navigator.clipboard.writeText(apiKeyValue);
              toast.success('API key copied!');
            }}>
              Copy
            </Button>
            <Button 
              variant="outlined"
              onClick={async () => {
                try {
                  const response = await fetch(`/api/automations/${automation.id}/regenerate-api-key`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' }
                  });
                  
                  if (response.ok) {
                    const data = await response.json();
                    currentApiKey = data.apiKey;
                    setApiKey(data.apiKey);
                    toast.success('API key regenerated!');
                    // Destroy current modal and recreate with new API key
                    if (modalInstance) {
                      modalInstance.destroy();
                    }
                    modalInstance = modal.info({
                      title: 'API Key & Usage',
                      width: 600,
                      content: createModalContent(data.apiKey),
                      closable: true,
                      okText: 'Close',
                      onOk: () => {
                        setApiKey(null);
                      },
                      afterClose: () => {
                        setApiKey(null);
                      }
                    });
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
                
                const sample = `curl --location '${baseUrl}/api/automations/${automation.id}/trigger' \\
--header 'turbotic-api-key: ${apiKeyValue}' \\
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

return `curl --location '${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}/api/automations/${automation.id}/trigger' \\
--header 'turbotic-api-key: ${apiKeyValue}' \\
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
                const logsSample = `curl --location '${baseUrl}/api/automations/${automation.id}/logs' \\
--header 'Content-Type: application/json' \\
--header 'turbotic-api-key: ${apiKeyValue}' \\
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
{`curl --location '${window.location.protocol}//${window.location.hostname}${window.location.port ? ':' + window.location.port : ''}/api/automations/${automation.id}/logs' \\
--header 'Content-Type: application/json' \\
--header 'turbotic-api-key: ${apiKeyValue}' \\
--data '{
"executionHistoryId": "YOUR_EXECUTION_HISTORY_ID"
}'`}
          </pre>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-secondary)', fontStyle: 'italic' }}>
            Note: Replace "YOUR_EXECUTION_HISTORY_ID" with the executionHistoryId returned from the trigger API response.
          </div>
        </div>
      </div>
    );
    
    modalInstance = modal.info({
      title: 'API Key & Usage',
      width: 600,
      content: createModalContent(currentApiKey),
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
      okText: 'Close',
      onOk: () => {
        // Clear API key from memory when modal closes
        setApiKey(null);
      },
      afterClose: () => {
        // Clear API key from memory after modal is fully closed
        setApiKey(null);
        modalInstance = null;
      }
    });
  }

  return (
    <div className="p-5 rounded-[16px] list-item-background-color flex gap-[20px] hover:shadow-[0_4px_25px_0_#0000001A] transition-all duration-300 mb-2 flex-col">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-2 items-center min-w-0 flex-1">
          {page !== "landing" && <Checkbox
            checked={isSelected}
            onChange={(e) => onSelectionChange?.(automation.id, e.target.checked)}
            className="flex-shrink-0"
          />}
          <Link href={`/canvas/${automation.id}`} className="hover:opacity-80 transition-opacity min-w-0 flex-shrink">
            <Typography.Paragraph
              className="ai-gradient-text !text-[20px] !mb-0 cursor-pointer"
              ellipsis={{ rows: 1, tooltip: true }}
            >
              {title}
            </Typography.Paragraph>
          </Link>
          <AutomationStatusBadge 
            status={automation.status}
            isScheduled={false} // Don't show schedule status in list view
            scheduleEnabled={false}
          />
        </div>
        {page !== "landing" && <div className="flex gap-3 justify-end flex-shrink-0">
          {/* Edit Automation */}
          <Tooltip title="Edit automation">
            {canEdit && (
              <Button
                icon={<Edit3 size={18} className="mt-[5px]" />}
                type="text"
                shape="circle"
                onClick={() => {
                  onEdit?.(automation.id);
                }}
              />
            )}
          </Tooltip>
          {/* Delete Automation */}
          <Tooltip title="Delete automation">
            {canEdit && (
              <Button
                icon={<Trash2 size={18} className="mt-[5px]" />}
                type="text"
                shape="circle"
                onClick={() => {
                  onDelete?.(automation.id, automation.title);
                }}
              />
            )}
          </Tooltip>
          {/* Preview/View Automation */}
          <Tooltip title="View automation">
            <Link href={`/canvas/${automation.id}`}>
              <Button
                icon={<EyeIcon size={18} className="mt-[5px]" />}
                type="text"
                shape="circle"
                onClick={() => {
                }}
              />
            </Link>
          </Tooltip>
          {/* GitHub Integration */}
          {canEdit && (
            <>
              <Tooltip title={!hasGlobalGitHubConnection ? "Connect GitHub Account" : githubRepoInfo ? "GitHub Sync On" : "No repository connected"}>
                <Button
                  onClick={async () => {
                    await loadGitHubStatus();
                    if (!hasGlobalGitHubConnection) {
                      // Show custom GitHub connection modal
                      setShowGitHubConnectModal(true);
                    } else {
                      setShowGitHubPanel(true);
                    }
                  }}
                  type="text"
                  shape="circle"
                  icon={
                    <div className="relative">
                      <GithubOutlined style={{ fontSize: 18, marginTop: 5 }} />
                      {githubRepoInfo ? (
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-600 rounded-full"></div>
                      ) : (
                        <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-600 rounded-full"></div>
                      )}
                    </div>
                  }
                />
              </Tooltip>
              <GitHubIntegrationPanel
                automationId={automation.id}
                automationName={automation.title}
                visible={showGitHubPanel}
                onClose={() => {
                  setShowGitHubPanel(false);
                  loadGitHubStatus(); // Refresh status when panel closes
                }}
              />
            </>
          )}
          {/* API Key Button */}
          {canEdit && (
            <Tooltip title="API Key & Usage">
              <Button
                onClick={() => onClickApiKey(automation)}
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
          )}
          {/* Clone Automation - Only visible to admins */}
          {isAdmin && (
            <Tooltip title={isCloning ? "Cloning automation..." : "Clone automation"}>
              <Button
                icon={isCloning ? (
                  <div className="w-[18px] h-[18px] border-2 border-white border-t-transparent rounded-full animate-spin" style={{ marginTop: 5 }} />
                ) : (
                  <Copy size={18} style={{ marginTop: 5 }} />
                )}
                type="primary"
                shape="circle"
                onClick={handleCloneClick}
                loading={isCloning}
                disabled={isCloning}
              />
            </Tooltip>
          )}
        </div>}
        <div>
          <Dropdown
            menu={{
              items: [
                {
                  label: 'Edit',
                  key: 'edit',
                  icon: <Edit3 size={18} />,  
                  onClick: () => {
                    onEdit?.(automation.id);
                  },
                  style: {
                    display: canEdit ? undefined : 'none',
                  }
                },
                {
                  label: 'Delete',
                  key: 'delete',
                  icon: <Trash2 size={18} />,
                  onClick: () => {
                    onDelete?.(automation.id, automation.title);
                  },
                  style: {
                    display: canEdit ? undefined : 'none',
                  }
                },
                {
                  label: 'View',
                  key: 'view',
                  icon: <EyeIcon size={18} />,
                  onClick: () => router.push(`/canvas/${automation.id}`),
                },
                {
                  label:!hasGlobalGitHubConnection ? "Connect GitHub Account" : githubRepoInfo ? "GitHub Sync On" : "No repository connected",
                  key: 'github',
                  icon: <GithubOutlined style={{ fontSize: 18 }} />,
                  onClick:async () => {
                    await loadGitHubStatus();
                    if (!hasGlobalGitHubConnection) {
                      // Show custom GitHub connection modal
                      setShowGitHubConnectModal(true);
                    } else {
                      setShowGitHubPanel(true);
                    }
                  },
                  style: {
                    display: canEdit ? undefined : 'none',
                  }
                },
                {
                  label: 'API Key & Usage',
                  key: 'api-key',
                  style: {
                    display: canEdit ? undefined : 'none',
                  },
                  icon: (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="7" cy="7" r="4"/>
                      <path d="M7 7v6"/>
                      <path d="M7 13h4"/>
                      <path d="M11 13v4"/>
                      <path d="M11 17h2"/>
                      <path d="M13 17v2"/>
                      <path d="M13 19h2"/>
                    </svg>
                  )
                },
                {
                  label: 'Clone',
                  key: 'clone',
                  icon: <Copy size={18} />,
                  onClick: () => handleCloneClick(),
                  style: {
                    display: isAdmin ? undefined : 'none',
                  }
                },
              ],  
            }}
            trigger={['click']}
            placement="bottomRight"
          >
            <Button icon={<MoreOutlined size={20} rotate={90} />} type="text" shape="circle" />
          </Dropdown>
        </div>
      </div>
      <div className="flex items-end justify-between gap-2">
        <Typography.Paragraph
          className="!m-0 secondary-text"
          ellipsis={{ rows: 2, tooltip: true }}
        >
          {description}
        </Typography.Paragraph>
        {page !== "landing" && <div
          className="flex gap-[20px] justify-end font-normal text-color"
          style={{ whiteSpace: "pre" }}
        >
          <span>Total runs: {totalRuns}</span>
          <span>Schedules: {scheduleCount || 0}</span>
          <span>
            Cost Saved: {currencySymbols[automation.currency || ""] || "$"}
            {(() => {
              const totalCost = automation.totalCostSaved;
              if (
                totalCost === undefined ||
                totalCost === null ||
                isNaN(totalCost) ||
                !isFinite(totalCost)
              ) {
                return "0";
              }
              if (totalCost === 0) {
                return "0";
              }
              return totalCost % 1 === 0
                ? totalCost.toFixed(0)
                : totalCost.toFixed(2);
            })()}
          </span>
        </div>}
      </div>
      {/* <div className="w-[50%]">
        <Typography.Paragraph
          className="ai-gradient-text !text-[20px] !mb-[16px]"
          ellipsis={{ rows: 1, tooltip: true }}
        >
          {title}
        </Typography.Paragraph>
        <Typography.Paragraph
          className="!m-0 secondary-text"
          ellipsis={{ rows: 2, tooltip: true }}
        >
          {description}
        </Typography.Paragraph>
      </div>
      <div className="w-[50%] flex flex-col justify-between">
        <div className="flex gap-3 justify-end">
          <Tooltip title="Delete automation">
            {canEdit && (
              <Button
                icon={<Trash2 size={18} className="mt-[5px]" />}
                type="text"
                shape="circle"
                onClick={() => onDelete?.(automation.id, automation.title)}
              />
            )}
          </Tooltip>
          <Tooltip title="View automation">
            <Link href={`/canvas/${automation.id}`}>
              <Button
                icon={<EyeIcon size={18} className="mt-[5px]" />}
                type="text"
                shape="circle"
                // onClick={onEdit}
              />
            </Link>
          </Tooltip>
        </div>
        <div className="flex gap-2 justify-end">
          <span>Total runs: {totalRuns}</span>
          <span>Schedules: {scheduleCount || 0}</span>
          <span>
            Cost Saved: {currencySymbols[automation.currency || ""] || "$"}
            {(() => {
              const totalCost = automation.totalCostSaved;
              if (
                totalCost === undefined ||
                totalCost === null ||
                isNaN(totalCost) ||
                !isFinite(totalCost)
              ) {
                return "0";
              }
              if (totalCost === 0) {
                return "0";
              }
              return totalCost % 1 === 0
                ? totalCost.toFixed(0)
                : totalCost.toFixed(2);
            })()}
          </span>
        </div>
      </div> */}
      
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
                    // Return to the automations page after connection (not canvas)
                    const returnUrl = '/automations';
                    
                    const response = await fetch('/api/admin/integrations/github/connect', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ returnUrl })
                    });
                    if (response.ok) {
                      const data = await response.json();
                      window.location.href = data.authUrl;
                    } else {
                      toast.error("Error", "Failed to initiate GitHub connection");
                    }
                  } catch (error) {
                    toast.error("Error", "Failed to connect to GitHub");
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
    </div>
  );
};

export default AutomationCard;
