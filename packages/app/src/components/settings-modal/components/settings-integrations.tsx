"use client";
import { useAuth } from "@/app/authentication";
import { toast } from '@/hooks/use-toast';
import { App, Button, Col, Row, Space, Spin, Tabs, Typography, Modal, Select } from "antd";

import { useEffect, useState, useRef } from "react";

interface MicrosoftIntegration {
  _id?: string;
  userId: string;
  app: string;
  source: string;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: Date;
  isConnected: boolean;
  lastSync?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface GitHubIntegration {
  _id?: string;
  userId: string;
  app: string;
  source: string;
  accessToken?: string;
  isConnected: boolean;
  githubUsername?: string;
  repoOwner?: string;
  repoName?: string;
  defaultBranch?: string;
  lastSync?: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface AppIntegrations {
  outlook?: MicrosoftIntegration;
  teams?: MicrosoftIntegration;
  calendar?: MicrosoftIntegration;
  sharepoint?: MicrosoftIntegration;
}

const SettingsIntegrations = () => {
  const { currentUser } = useAuth();

  const { modal, message } = App.useApp();
  const [connecting, setConnecting] = useState({
    loading: false,
    app: "",
  });
  const [loadingIntegration, setLoadingIntegration] = useState(false);

  const [appIntegrations, setAppIntegrations] = useState<AppIntegrations>({});
  const [githubIntegration, setGithubIntegration] = useState<GitHubIntegration | null>(null);

  const t = (s: string, text: string) => {
    return text;
  };

  const connectSharePoint = () => {
    // window.location.replace(
    //   `/api/v1/sharepoint/login/initiate?workspaceid=${getWorkspaceId()}`
    // );
  };

  const loadMicrosoftIntegration = async () => {
    if (!currentUser?.email) return;

    setLoadingIntegration(true);
    try {
      const response = await fetch("/api/admin/integrations/microsoft", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        setAppIntegrations(data.integration);
      } else if (response.status === 404) {
        setAppIntegrations({});
      } else {
        throw new Error("Failed to load integration");
      }
    } catch (error) {
      console.error("Error loading Microsoft integration:", error);
      toast.error("Error","Failed to load Microsoft integration status");
    } finally {
      setLoadingIntegration(false);
    }
  };

  const connectMicrosoft = async (app: string) => {
    setConnecting({
      loading: true,
      app: app,
    });
    try {
      const response = await fetch(
        "/api/admin/integrations/microsoft/connect",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ app }),
        }
      );

      if (response.ok) {
        const data = await response.json();
        // Redirect to Microsoft OAuth
        window.location.href = data.authUrl;
      } else {
        // Try to get error message from response
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || `Failed to initiate Microsoft ${app} connection`;
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      console.error("Error connecting to Microsoft:", error);
      const errorMessage = error.message || `Failed to initiate Microsoft ${app} connection`;
      toast.error("Error", errorMessage);
    } finally {
      setConnecting({
        loading: false,
        app: "",
      });
    }
  };

  const disconnectMicrosoft = async (app: string) => {
    modal.confirm({
      title: 'Disconnect '+ app,
      content: 'Are you sure do you want to disconnect '+ app + '?',
      icon: null,
      closable: true,
      onOk: async () => {
        try {
          const response = await fetch(
            "/api/admin/integrations/microsoft/disconnect",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ app }),
            }
          );

          if (response.ok) {
            // Remove the specific app integration from state
            setAppIntegrations((prev) => {
              const updated = { ...prev };
              delete updated[app as keyof AppIntegrations];
              return updated;
            });
            toast.success(`Microsoft ${app} integration disconnected successfully`);
          } else {
            throw new Error("Failed to disconnect Microsoft integration");
          }
        } catch (error) {
          console.error("Error disconnecting Microsoft integration:", error);
          toast.error("Error","Failed to disconnect Microsoft integration");
        }
      }
    })
  };

  const loadGitHubIntegration = async (retryCount = 0) => {
    if (!currentUser?.email) return;

    setLoadingIntegration(true);
    try {
      const response = await fetch("/api/admin/integrations/github", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        setGithubIntegration(data.integration);

        // Auto-load repos if connected
        if (data.integration?.isConnected) {
          loadGitHubRepos();
        }
      } else {
        throw new Error("Failed to load GitHub integration");
      }
    } catch (error) {
      // If this is a retry after GitHub connection, try again with delay
      if (retryCount < 2 && window.location.search.includes('success=GitHub')) {
        setTimeout(() => {
          loadGitHubIntegration(retryCount + 1);
        }, 1000 * (retryCount + 1)); // 1s, 2s delays
        return;
      }
      toast.error("Error","Failed to load GitHub integration status");
    } finally {
      setLoadingIntegration(false);
    }
  };

  const loadGitHubRepos = async () => {
    // This function is called when GitHub is connected but doesn't need to do anything
    // in the settings modal context - repos are managed per-automation
  };

  const connectGitHub = async () => {
    setConnecting({
      loading: true,
      app: "github",
    });
    try {
      // Include returnUrl to redirect back to settings modal after OAuth
      const returnUrl = '/?settingsModal=integrations';
      
      const response = await fetch("/api/admin/integrations/github/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ returnUrl }),
      });

      if (response.ok) {
        const data = await response.json();
        // Redirect to GitHub OAuth
        window.location.href = data.authUrl;
      } else {
        // Try to get error message from response
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = errorData.error || "Failed to initiate GitHub connection";
        throw new Error(errorMessage);
      }
    } catch (error: any) {
      console.error("Error connecting to GitHub:", error);
      const errorMessage = error.message || "Failed to initiate GitHub connection";
      toast.error("Error", errorMessage);
    } finally {
      setConnecting({
        loading: false,
        app: "",
      });
    }
  };

  const disconnectGitHub = async () => {
    modal.confirm({
      title: "Disconnect GitHub",
      content: "Are you sure you want to disconnect GitHub?",
      icon: null,
      closable: true,
      onOk: async () => {
        try {
          const response = await fetch(
            "/api/admin/integrations/github/disconnect",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
            }
          );

          if (response.ok) {
            setGithubIntegration(null);
            toast.success("GitHub integration disconnected successfully");

          } else {
            throw new Error("Failed to disconnect GitHub integration");
          }
        } catch (error) {
          toast.error("Error","Failed to disconnect GitHub integration");
        }
      },
    });
  };


  useEffect(() => {
    loadMicrosoftIntegration();
    loadGitHubIntegration();
    
      // Check for GitHub connection success from OAuth callback
      if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const githubConnected = urlParams.get('githubConnected');
      const success = urlParams.get('success');
      
      if (githubConnected === 'true' || (success && success.includes('GitHub'))) {
        // Show toast for both legacy and new parameter cases
        toast.success("Your GitHub account has been connected.");
        
        
        // Clear URL parameters
        let newUrl = window.location.pathname + window.location.search;
        newUrl = newUrl.replace(/[?&]githubConnected=true/, '').replace(/[?&]success=[^&]*/, '');
        newUrl = newUrl.replace(/^[?&]/, '?').replace(/\?$/, '');
        if (newUrl.endsWith('?')) newUrl = newUrl.slice(0, -1);
        window.history.replaceState({}, document.title, newUrl || window.location.pathname);
        // Reload GitHub integration status
        loadGitHubIntegration();
      }
      
      // Check for Microsoft integration connection success from OAuth callback
      const message = urlParams.get('message');
      if (message && message.includes('connected successfully')) {
        // Extract app name from message (e.g., "Microsoft Outlook connected successfully")
        const match = message.match(/Microsoft\s+(\w+)\s+connected/);
        if (match) {
          const appName = match[1];
        }
      }

      const error = urlParams.get('error');
      
      if (error) {
        toast.error("Error", error);
        // Clean URL
        const newUrl = window.location.pathname + (window.location.search.replace(/[?&]error=[^&]*/, '').replace(/^[?&]/, '?') || '');
        window.history.replaceState({}, document.title, newUrl);
      }
    }
  }, []);

  return (
    <div className="settings-integrations-container">
      <div className="title">
        {t("settingsModal.tabs.integrations", "Integrations")}
      </div>

      <Spin spinning={loadingIntegration}>
        <div>
          <Tabs
            items={[
              {
                key: "all-vendors",
                label: t(
                  "settingsModal.integrations.tabs.allVendors",
                  "All vendors"
                ),
                children: (
                  <Row gutter={[8, 8]}>
                    <Col span={12}>
                      <div className="card">
                        <Space align="center" size={16}>
                          <img
                            src="/images/vendor-logos/outlook-calendar.png"
                            alt="outlook logo"
                          />
                          <div>
                            <div className="name">Microsoft Outlook</div>
                            <Typography.Paragraph
                              style={{ margin: 0 }}
                              ellipsis={{ rows: 2, tooltip: true }}
                              className="secondary-text"
                            >
                              Connect to Microsoft Outlook to access emails,
                              send messages, and manage mailboxes.
                            </Typography.Paragraph>
                          </div>
                        </Space>
                        <Button
                          onClick={(e) => {
                            if (appIntegrations.outlook?.isConnected) {
                              disconnectMicrosoft("outlook");
                            } else {
                              connectMicrosoft("outlook");
                            }
                          }}
                          disabled={connecting.loading}
                          loading={connecting.app === "outlook"}
                        >
                          {appIntegrations.outlook?.isConnected
                            ? "Disconnect"
                            : "Connect"}
                        </Button>
                      </div>
                    </Col>
                    <Col span={12}>
                      <div className="card">
                        <Space align="center" size={16}>
                          <img
                            src="/images/vendor-logos/microsoft-teams.png"
                            alt="teams logo"
                          />
                          <div>
                            <div className="name">Microsoft Teams</div>
                            <Typography.Paragraph
                              style={{ margin: 0 }}
                              ellipsis={{ rows: 2, tooltip: true }}
                              className="secondary-text"
                            >
                              Connect to Microsoft Teams to access team
                              information, channels, and chat functionality.
                            </Typography.Paragraph>
                          </div>
                        </Space>
                        <Button
                          onClick={(e) => {
                            if (appIntegrations.teams?.isConnected) {
                              disconnectMicrosoft("teams");
                            } else {
                              connectMicrosoft("teams");
                            }
                          }}
                          disabled={connecting.loading}
                          loading={connecting.app === "teams"}
                        >
                          {appIntegrations.teams?.isConnected
                            ? "Disconnect"
                            : "Connect"}
                        </Button>
                      </div>
                    </Col>
                    <Col span={12}>
                      <div className="card">
                        <Space align="center" size={16}>
                          <img
                            src="/images/vendor-logos/microsoft-calendar.png"
                            alt="outlook logo"
                          />
                          <div>
                            <div className="name">Microsoft Calendar</div>
                            <Typography.Paragraph
                              style={{ margin: 0 }}
                              ellipsis={{ rows: 2, tooltip: true }}
                              className="secondary-text"
                            >
                              Connect to Microsoft Calendar to access and manage
                              your calendar events and schedules.
                            </Typography.Paragraph>
                          </div>
                        </Space>
                        <Button
                          onClick={(e) => {
                            if (appIntegrations.calendar?.isConnected) {
                              disconnectMicrosoft("calendar");
                            } else {
                              connectMicrosoft("calendar");
                            }
                          }}
                          disabled={connecting.loading}
                          loading={connecting.app === "calendar"}
                        >
                          {appIntegrations.calendar?.isConnected
                            ? "Disconnect"
                            : "Connect"}
                        </Button>
                      </div>
                    </Col>
                    <Col span={12}>
                      <div className="card">
                        <Space align="center" size={16}>
                          <img
                            src="/images/vendor-logos/sharepoint-logo.png"
                            alt="sharepoint logo"
                          />
                          <div>
                            <div className="name">Microsoft SharePoint</div>
                            <Typography.Paragraph
                              style={{ margin: 0 }}
                              ellipsis={{ rows: 2, tooltip: true }}
                              className="secondary-text"
                            >
                              Connect to Microsoft SharePoint to access
                              documents, sites, and file management.
                            </Typography.Paragraph>
                          </div>
                        </Space>
                        <Button
                          onClick={(e) => {
                            if (appIntegrations.sharepoint?.isConnected) {
                              disconnectMicrosoft("sharepoint");
                            } else {
                              connectMicrosoft("sharepoint");
                            }
                          }}
                          disabled={connecting.loading}
                          loading={connecting.app === "sharepoint"}
                        >
                          {appIntegrations.sharepoint?.isConnected
                            ? "Disconnect"
                            : "Connect"}
                        </Button>
                      </div>
                    </Col>
                    <Col span={12}>
                      <div className="card">
                        <Space align="center" size={16}>
                          <svg width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                          </svg>
                          <div style={{ flex: 1 }}>
                            <div className="name">GitHub</div>
                            <Typography.Paragraph
                              style={{ margin: 0 }}
                              ellipsis={{ rows: 2, tooltip: true }}
                              className="secondary-text"
                            >
                              Connect your GitHub account. Repository configuration is done per-automation in the automation canvas.
                            </Typography.Paragraph>
                            {githubIntegration?.isConnected && githubIntegration?.githubUsername && (
                              <Typography.Text type="secondary" style={{ fontSize: '12px', display: 'block', marginTop: '4px' }}>
                                Connected as: @{githubIntegration.githubUsername}
                              </Typography.Text>
                            )}
                          </div>
                        </Space>
                        <Button
                          onClick={(e) => {
                            if (githubIntegration?.isConnected) {
                              disconnectGitHub();
                            } else {
                              connectGitHub();
                            }
                          }}
                          disabled={connecting.loading}
                          loading={connecting.app === "github"}
                        >
                          {githubIntegration?.isConnected
                            ? "Disconnect"
                            : "Connect"}
                        </Button>
                      </div>
                    </Col>
                  </Row>
                ),
              },
            ]}
          />
        </div>
      </Spin>
    </div>
  );
};

export default SettingsIntegrations;
