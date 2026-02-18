"use client";

import React, { useState, useEffect } from 'react';
import { Modal, Button, Input, Select, Space, Typography, Spin, Alert } from 'antd';
import { GithubOutlined, LinkOutlined, PlusOutlined, DisconnectOutlined, CloseOutlined } from '@ant-design/icons';
import eventsEmitter from '@/lib/events-emitter';
import { toast } from '@/hooks/use-toast';

const { Text, Title } = Typography;
const { Option } = Select;

interface GitHubIntegrationPanelProps {
  automationId: string;
  automationName: string;
  visible: boolean;
  onClose: () => void;
}

export default function GitHubIntegrationPanel({
  automationId,
  automationName,
  visible,
  onClose
}: GitHubIntegrationPanelProps) {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<any>(null);
  const [mode, setMode] = useState<'main' | 'create' | 'connect'>('main');

  // Create repo state
  const [repoName, setRepoName] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);

  // Connect repo state
  const [repos, setRepos] = useState<any[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string>('');
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [showDisconnectWarning, setShowDisconnectWarning] = useState(false);

  useEffect(() => {
    if (visible) {
      loadStatus();
      // Auto-generate repo name from automation name
      const sanitizedName = automationName
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/--+/g, '-')
        .replace(/^-|-$/g, '');
      setRepoName(sanitizedName || `automation-${automationId.substring(0, 8)}`);
    }
  }, [visible, automationId, automationName]);

  const loadStatus = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/automations/${automationId}/github/status`);
      if (response.ok) {
        const data = await response.json();
        console.log('GitHub Status:', data);
        setStatus(data);
      }
    } catch (error) {
      console.error('Error loading GitHub status:', error);
    } finally {
      setLoading(false);
    }
  };

  const connectGitHub = async () => {
    setLoading(true);
    try {
      // Redirect to GitHub OAuth
      window.location.href = '/api/auth/github';
    } catch (error: any) {
      console.error('Error connecting to GitHub:', error);
      toast.error("Error",error.message || "Failed to connect to GitHub");
    } finally {
      setLoading(false);
    }
  };

  const loadRepos = async () => {
    setLoadingRepos(true);
    try {
      const response = await fetch('/api/admin/integrations/github/repos');
      if (response.ok) {
        const data = await response.json();
        setRepos(data.repos || []);
      } else {
        throw new Error('Failed to load repositories');
      }
    } catch (error: any) {
      console.error('Error loading repos:', error);
      toast.error("Error", error.message || "Failed to load repository");

    } finally {
      setLoadingRepos(false);
    }
  };

  const createRepo = async () => {
    if (!repoName.trim()) {
      toast.error("Error","Please enter a repository name");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/automations/${automationId}/github/create-repo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoName: repoName.trim(),
          description,
          isPrivate
        })
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(`Repository ${data.repo.fullName} created successfully!`);
        await loadStatus();
        setMode('main');
        eventsEmitter.emit('github:connected'); // Notify parent to refresh
      } else {
        throw new Error(data.error || 'Failed to create repository');
      }
    } catch (error: any) {
      console.error('Error creating repo:', error);
      toast.error("Error", error.message || "Failed to create repository");
    } finally {
      setLoading(false);
    }
  };

  const connectRepo = async () => {
    if (!selectedRepo) {
      toast.error("Error","Please select a repository");
      return;
    }

    const [owner, name] = selectedRepo.split('/');
    const repo = repos.find(r => r.owner === owner && r.name === name);

    setLoading(true);
    try {
      const response = await fetch(`/api/automations/${automationId}/github/connect-repo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repoOwner: owner,
          repoName: name,
          branch: repo?.defaultBranch || 'main'
        })
      });

      const data = await response.json();

      if (response.ok) {
        toast.success(`Connected to ${data.repo.fullName}!`);
        await loadStatus();
        setMode('main');
        eventsEmitter.emit('github:connected'); // Notify parent to refresh
      } else {
        throw new Error(data.error || 'Failed to connect repository');
      }
    } catch (error: any) {
      console.error('Error connecting repo:', error);
      toast.error("Error", error.message || "Failed to connect repository");
    } finally {
      setLoading(false);
    }
  };

  const disconnectRepo = async () => {
    setShowDisconnectWarning(true);
  };

  const confirmDisconnect = async () => {
        setLoading(true);
        try {
          const response = await fetch(`/api/automations/${automationId}/github/disconnect`, {
            method: 'POST'
          });

          if (response.ok) {
            toast.success("Repository has been disconnected successfully");
            await loadStatus();
        setShowDisconnectWarning(false);
          } else {
            throw new Error('Failed to disconnect');
          }
        } catch (error: any) {
          console.error('Error disconnecting:', error);
          toast.error("Error", error.message || "Failed to disconnect repository");
        } finally {
          setLoading(false);
        }
  };

  const cancelDisconnect = () => {
    setShowDisconnectWarning(false);
  };

  const handleClose = () => {
    setMode('main');
    onClose();
  };

  if (loading && !status) {
    return (
      <Modal open={visible} onCancel={handleClose} footer={null}>
        <div style={{ textAlign: 'center', padding: '40px' }}>
          <Spin size="large" />
        </div>
      </Modal>
    );
  }

  return (
    <>
      {/* Backdrop overlay for create mode */}
      {mode === 'create' && (
        <div style={{
          position: 'fixed',
          width: '1729px',
          height: '1117px',
          left: '-1px',
          top: '0px',
          background: 'rgba(0, 0, 0, 0.25)',
          zIndex: 1000,
          pointerEvents: 'none'
        }} />
      )}
      
      {/* Custom Modal for GitHub not connected */}
      {(!status || !status.hasGlobalConnection) && visible && (
        <div key="custom-github-modal" style={{
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
            {/* Header with GitHub icon and close button */}
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '0px',
              gap: '24px',
              width: '100%',
              height: '24px'
            }}>
              {/* GitHub icon and title */}
              <div style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                padding: '0px',
                gap: '12px'
              }}>
                <h2 style={{
                  fontFamily: 'DM Sans',
                  fontSize: '24px',
                  fontWeight: 400,
                  color: 'var(--card-title-color)',
                  margin: 0,
                  letterSpacing: '-0.02em',
                  lineHeight: '24px',
                  height: '24px'
                }}>
                  Connect GitHub
                </h2>
              </div>

              {/* Close button */}
              <button
                onClick={handleClose}
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
              width: '100%',
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
              width: '100%',
              height: '40px'
            }}>
              <button
                onClick={handleClose}
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
                onClick={connectGitHub}
                disabled={loading}
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
                  cursor: loading ? 'not-allowed' : 'pointer',
                  opacity: loading ? 0.6 : 1
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
                    {loading ? 'Connecting...' : 'Connect'}
                  </span>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Ant Design Modal for other cases */}
      {status && status.hasGlobalConnection && (
        <Modal
          key="antd-github-modal"
          open={visible}
          onCancel={handleClose}
          footer={null}
          width={557}
          centered
          closable={true}
          closeIcon={(
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
          )}
          maskClosable={true}
          styles={{
            body: {
              padding: '24px 0px 0px 0px',
              background: 'var(--modal-background-color)',
              borderRadius: '12px'
            },
            content: {
              background: 'var(--modal-background-color)',
              borderRadius: '12px',
              boxShadow: '0px 6px 16px rgba(0, 0, 0, 0.08), 0px 3px 6px -4px rgba(0, 0, 0, 0.04), 0px 9px 28px 8px rgba(0, 0, 0, 0.05)'
            },
            header: {
              padding: '16px 0px 16px 0px',
              borderBottom: '1px solid var(--border-default)',
              marginBottom: '0px',
              display: 'flex',
              alignItems: 'center',
              height: '56px',
              background: 'var(--modal-background-color)'
            }
          }}
          title={
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'flex-start',
              gap: '12px',
              fontSize: '18px',
              fontWeight: '500',
              height: '22px',
              lineHeight: '22px',
              width: '100%',
              paddingLeft: '0px'
            }}>
              <div style={{ 
                width: '24px', 
                height: '24px',
                background: '#0277FF',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                {React.createElement(GithubOutlined, { style: { fontSize: '14px', color: '#FFFFFF' } }) as any}
              </div>
              <span style={{
                height: '22px',
                lineHeight: '22px',
                display: 'flex',
                alignItems: 'center',
                color: 'var(--card-title-color)'
              }}>
                {mode === 'create' ? 'Create New Repository' : mode === 'connect' ? 'Connect Existing Repository' : 'Create New Repository'}
              </span>
            </div>
          }
        >
      <div style={{ padding: '0px 24px 0px 0px', background: 'var(--modal-background-color)' }}>

      {/* Main view - Connected */}
      {mode === 'main' && status?.automation?.isConnected && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          padding: '24px',
          gap: '24px',
          width: '493px',
          minHeight: '160px',
          border: '1px solid var(--border-default)',
          borderRadius: '12px',
          marginBottom: '24px'
        }}>
          {/* Chat message - AI */}
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'flex-start',
            padding: '0px',
            gap: '16px',
            width: '445px',
            minHeight: '112px'
          }}>
            {/* Icon / CheckCircleFilled */}
            <div style={{
              width: '32px',
              height: '32px',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <div style={{
                position: 'absolute',
                left: '6.25%',
                right: '6.25%',
                top: '6.25%',
                bottom: '6.25%',
                background: '#3C9F53',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <div style={{
                  width: '12px',
                  height: '8px',
                  borderLeft: '2px solid #FFFFFF',
                  borderBottom: '2px solid #FFFFFF',
                  transform: 'rotate(-45deg)',
                  marginTop: '-2px'
                }} />
              </div>
            </div>
            
            {/* Content Frame */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'flex-start',
              padding: '4px 0px 0px',
              gap: '8px',
              width: '397px',
              minHeight: '112px',
              flex: 1
            }}>
              {/* Repository Connected */}
              <div style={{
                width: '397px',
                height: '22px',
                fontFamily: 'DM Sans',
                fontStyle: 'normal',
                fontWeight: 500,
                fontSize: '15px',
                lineHeight: '22px',
                color: 'var(--card-title-color)'
              }}>
                Repository Connected
              </div>
              
              {/* Details Frame */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '0px',
                gap: '4px',
                width: '397px',
                minHeight: '48px'
              }}>
                {/* Syncing to: */}
                <div style={{
                  width: '100%',
                  fontFamily: 'DM Sans',
                  fontStyle: 'normal',
                  fontWeight: 400,
                  fontSize: '15px',
                  lineHeight: '22px',
                  color: 'var(--card-text-color)',
                  wordBreak: 'break-all',
                  overflowWrap: 'break-word'
                }}>
                  Syncing to: {status.automation.repo.repoFullName}
                </div>
                
                {/* Branch: */}
                <div style={{
                  width: '100%',
                  fontFamily: 'DM Sans',
                  fontStyle: 'normal',
                  fontWeight: 400,
                  fontSize: '15px',
                  lineHeight: '22px',
                  color: 'var(--primary-text-color)'
                }}>
                  Branch: {status.automation.repo.branch}
                </div>
              </div>
              
              {/* View on GitHub link */}
              <div style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                padding: '0px',
                gap: '6px',
                width: '130px',
                height: '22px'
              }}>
                <a 
                  href={status.automation.repo.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  style={{
                    width: '108px',
                    height: '22px',
                    fontFamily: 'DM Sans',
                    fontStyle: 'normal',
                    fontWeight: 400,
                    fontSize: '15px',
                    lineHeight: '22px',
                    color: '#1A8AF2',
                    textDecoration: 'none'
                  }}
                >
                  View on GitHub
                </a>
                <LinkOutlined style={{ 
                  width: '16px', 
                  height: '16px',
                  color: '#1A8AF2'
                }} />
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Disconnect Warning */}
      {mode === 'main' && status?.automation?.isConnected && showDisconnectWarning && (
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'flex-start',
          padding: '16px',
          gap: '0px',
          width: '493px',
          height: '94px',
          background: 'rgba(250, 173, 20, 0.1)',
          borderRadius: '8px',
          marginBottom: '16px'
        }}>
          
          {/* Content Frame */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            padding: '0px',
            gap: '8px',
            width: '427px',
            height: '62px',
            flex: 1
          }}>
            {/* Disconnect GitHub Repository */}
            <div style={{
              width: '215px',
              height: '22px',
              fontFamily: 'DM Sans',
              fontStyle: 'normal',
              fontWeight: 500,
              fontSize: '15px',
              lineHeight: '22px',
              color: 'var(--primary-text-color)'
            }}>
              Disconnect GitHub Repository
            </div>
            
            {/* Description */}
            <div style={{
              width: '427px',
              height: '32px',
              fontFamily: 'DM Sans',
              fontStyle: 'normal',
              fontWeight: 400,
              fontSize: '12px',
              lineHeight: '16px',
              color: 'var(--primary-text-color)'
            }}>
              Are you sure you want to disconnect this repository? This will stop automatic syncing.
            </div>
          </div>
        </div>
      )}
      
      {/* Disconnect Button */}
      {mode === 'main' && status?.automation?.isConnected && (
        <div style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'flex-end',
          alignItems: 'flex-start',
          padding: '0px',
          gap: '8px',
          width: '493px',
          height: '40px'
        }}>
          {!showDisconnectWarning ? (
          <Button
              size="large"
              style={{
                width: '209px',
                height: '40px',
                background: '#FFFFFF',
                border: '1px solid #D13036',
                borderRadius: '99px',
                padding: '0px 15px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            onClick={disconnectRepo}
            loading={loading}
            >
              <DisconnectOutlined style={{ width: '16px', height: '16px', color: '#D13036' }} />
              <span style={{
                fontFamily: 'DM Sans',
                fontSize: '15px',
                lineHeight: '22px',
                color: '#D13036'
              }}>
            Disconnect Repository
              </span>
            </Button>
          ) : (
            <>
              <Button
                size="large"
                style={{
                  height: '40px',
                  background: '#FFFFFF',
                  border: '1px solid var(--border-default)',
                  borderRadius: '99px',
                  padding: '0px 15px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  minWidth: 'auto',
                  width: 'auto'
                }}
                onClick={cancelDisconnect}
                disabled={loading}
              >
                <span style={{
                  fontFamily: 'DM Sans',
                  fontSize: '15px',
                  lineHeight: '22px',
                  color: 'rgba(0, 0, 0, 0.9)'
                }}>
                  Cancel
                </span>
              </Button>
              
              <Button
                size="large"
                style={{
                  height: '40px',
                  background: '#D13036',
                  borderRadius: '99px',
                  padding: '0px 15px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  minWidth: 'auto',
                  width: 'auto'
                }}
                onClick={confirmDisconnect}
                loading={loading}
              >
                <DisconnectOutlined style={{ width: '16px', height: '16px', color: '#FFFFFF' }} />
                <span style={{
                  fontFamily: 'DM Sans',
                  fontSize: '15px',
                  lineHeight: '22px',
                  color: '#FFFFFF'
                }}>
                  Yes, disconnect
                </span>
          </Button>
            </>
          )}
        </div>
      )}

      {/* Main view - Not connected */}
      {mode === 'main' && !status?.automation?.isConnected && status?.hasGlobalConnection && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: '24px',
          width: '100%'
        }}>
          <div style={{
            width: '100%',
            fontFamily: 'DM Sans',
            fontStyle: 'normal',
            fontWeight: 400,
            fontSize: '15px',
            lineHeight: '22px',
            color: 'var(--primary-text-color)',
            textAlign: 'left'
          }}>
            Connect this automation to a GitHub repository to automatically sync code versions.
          </div>
          
          {/* Actions Wrapper */}
          <div style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'flex-start',
            alignItems: 'center',
            padding: '0px',
            gap: '12px',
            width: '100%',
            height: '40px'
          }}>
            <Button
              size="large"
              style={{
                width: '240px',
                height: '40px',
                background: '#FFFFFF',
                border: '1px solid #D9D9D9',
                borderRadius: '99px',
                padding: '0px 15px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
              onClick={() => {
                setMode('connect');
                loadRepos();
              }}
            >
              <LinkOutlined style={{ width: '16px', height: '16px' }} />
              <span style={{
                fontFamily: 'DM Sans',
                fontSize: '15px',
                lineHeight: '22px',
                color: 'rgba(0, 0, 0, 0.9)'
              }}>
                Connect Existing Repository
              </span>
            </Button>
            
            <Button
              size="large"
              style={{
                width: '240px',
                height: '40px',
                background: '#1A8AF2',
                border: 'none',
                borderRadius: '99px',
                padding: '0px 15px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
              onClick={() => setMode('create')}
            >
              <PlusOutlined style={{ width: '16px', height: '16px', color: '#FFFFFF' }} />
              <span style={{
                fontFamily: 'DM Sans',
                fontSize: '15px',
                lineHeight: '22px',
                color: '#FFFFFF'
              }}>
                Create New Repository
              </span>
            </Button>
          </div>
        </div>
      )}

      {/* Create repo mode */}
      {mode === 'create' && (
        <div>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Text strong>Repository Name *</Text>
              <Input
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                placeholder="my-automation"
                disabled={loading}
              />
            </div>
            <div>
              <Text strong>Description</Text>
              <Input.TextArea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Automation for..."
                rows={3}
                disabled={loading}
              />
            </div>
            <div>
              <Text strong>Visibility</Text>
              <Select
                value={isPrivate}
                onChange={setIsPrivate}
                style={{ width: '100%' }}
                disabled={loading}
              >
                <Option value={true}>Private (Recommended)</Option>
                <Option value={false}>Public</Option>
              </Select>
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'flex-end',
              alignItems: 'center',
              padding: '0px',
              gap: '12px',
              width: '100%',
              height: '40px'
            }}>
              <Button
                size="large"
                style={{
                  height: '40px',
                  background: '#FFFFFF',
                  border: '1px solid var(--border-default)',
                  borderRadius: '99px',
                  padding: '0px 15px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  minWidth: 'auto',
                  width: 'auto'
                }}
                onClick={() => setMode('main')}
                disabled={loading}
              >
                <span style={{
                  fontFamily: 'DM Sans',
                  fontSize: '15px',
                  lineHeight: '22px',
                  color: 'rgba(0, 0, 0, 0.9)'
                }}>
                  Back
                </span>
              </Button>
              
              <Button
                size="large"
                style={{
                  height: '40px',
                  background: '#1A8AF2',
                  border: 'none',
                  borderRadius: '99px',
                  padding: '0px 15px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  minWidth: 'auto',
                  width: 'auto'
                }}
                onClick={createRepo}
                loading={loading}
              >
                <PlusOutlined style={{ width: '16px', height: '16px', color: '#FFFFFF' }} />
                <span style={{
                  fontFamily: 'DM Sans',
                  fontSize: '15px',
                  lineHeight: '22px',
                  color: '#FFFFFF'
                }}>
                Create New Repository
                </span>
              </Button>
            </div>
          </Space>
        </div>
      )}

      {/* Connect repo mode */}
      {mode === 'connect' && (
        <div>
          <Space direction="vertical" style={{ width: '100%' }} size="middle">
            <div>
              <Text strong>Select Repository *</Text>
              {loadingRepos ? (
                <div style={{ textAlign: 'center', padding: 20 }}>
                  <Spin />
                </div>
              ) : (
                <Select
                  value={selectedRepo}
                  onChange={setSelectedRepo}
                  style={{ width: '100%' }}
                  placeholder="Select a repository..."
                  disabled={loading}
                  showSearch
                  optionFilterProp="children"
                >
                  {repos.map(repo => (
                    <Option key={repo.id} value={`${repo.owner}/${repo.name}`}>
                      {repo.fullName} {repo.private ? '(Private)' : '(Public)'}
                    </Option>
                  ))}
                </Select>
              )}
            </div>
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'flex-end',
              alignItems: 'center',
              padding: '0px',
              gap: '12px',
              width: '100%',
              height: '40px'
            }}>
              <Button
                size="large"
                style={{
                  height: '40px',
                  background: '#FFFFFF',
                  border: '1px solid var(--border-default)',
                  borderRadius: '99px',
                  padding: '0px 15px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  minWidth: 'auto',
                  width: 'auto'
                }}
                onClick={() => setMode('main')}
                disabled={loading}
              >
                <span style={{
                  fontFamily: 'DM Sans',
                  fontSize: '15px',
                  lineHeight: '22px',
                  color: 'rgba(0, 0, 0, 0.9)'
                }}>
                  Back
                </span>
              </Button>
              
              <Button
                size="large"
                style={{
                  height: '40px',
                  background: '#1A8AF2',
                  border: 'none',
                  borderRadius: '99px',
                  padding: '0px 15px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  minWidth: 'auto',
                  width: 'auto'
                }}
                onClick={connectRepo}
                loading={loading}
              >
                <LinkOutlined style={{ width: '16px', height: '16px', color: '#FFFFFF' }} />
                <span style={{
                  fontFamily: 'DM Sans',
                  fontSize: '15px',
                  lineHeight: '22px',
                  color: '#FFFFFF'
                }}>
                Connect Repository
                </span>
              </Button>
            </div>
          </Space>
        </div>
      )}
      </div>
        </Modal>
      )}
    </>
  );
}
