import React, { useState, useEffect } from 'react';
import { Modal, Button, Space, Spin } from 'antd';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertCircle, Clock, Copy, Download } from 'lucide-react';
import { showSuccessToast, showErrorToast } from '@/components/ui/toasts';
import { LogExplanationModal } from './LogExplanationModal';
import { LoadingOutlined } from '@ant-design/icons';

interface LogsModalProps {
  isOpen: boolean;
  onClose: () => void;
  executionId: string | null;
}

interface LogsData {
  logs: string[];
  execution: {
    id: string;
    automationId: string;
    status: string;
    startedAt: Date;
    endedAt?: Date;
    duration?: number;
    exitCode?: number;
    errorMessage?: string;
  };
}


export function LogsModal({ isOpen, onClose, executionId }: LogsModalProps) {
  const [logsData, setLogsData] = useState<LogsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [showExplanationModal, setShowExplanationModal] = useState(false);

  useEffect(() => {
    if (isOpen && executionId) {
      fetchLogs();
    }
  }, [isOpen, executionId]);

  const fetchLogs = async () => {
    if (!executionId) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/run/executions/${executionId}/logs`);
      if (!response.ok) {
        throw new Error('Failed to fetch logs');
      }
      const data = await response.json();
      setLogsData(data);
    } catch (error) {
      console.error('Error fetching logs:', error);
      showErrorToast('Failed to load logs');
    } finally {
      setLoading(false);
    }
  };

  const copyLogs = async () => {
    if (!logsData?.logs) return;
    
    try {
      await navigator.clipboard.writeText(logsData.logs.join('\n'));
      showSuccessToast('Logs copied to clipboard');
    } catch (error) {
      showErrorToast('Failed to copy logs');
    }
  };

  const downloadLogs = () => {
    if (!logsData?.logs) return;
    
    const blob = new Blob([logsData.logs.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `execution-logs-${executionId}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showSuccessToast('Logs downloaded');
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'failed': return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'running': return <Clock className="w-4 h-4 text-blue-500 animate-spin" />;
      default: return <Clock className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400';
      case 'failed': return 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400';
      case 'running': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const formatDuration = (durationMs?: number) => {
    if (!durationMs) return 'N/A';
    const seconds = Math.floor(durationMs / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds}s`;
  };

  const formatDateTime = (date: Date | string) => {
    const dateObj = date instanceof Date ? date : new Date(date);
    return dateObj.toLocaleString();
  };

  return (
    <Modal
      open={isOpen}
      onCancel={onClose}
      footer={null}
      width="90vw"
      title={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {getStatusIcon(logsData?.execution.status || 'unknown')}
            <span>Execution Logs</span>
          </div>
          <Space>
            <Button
              onClick={() => {
                console.log('Explain button clicked, logs:', logsData?.logs);
                setShowExplanationModal(true);
              }}
              className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:hover:bg-blue-900/30 dark:text-blue-400 
                dark:border-blue-800"
              // style={{ backgroundColor: '#e6f4ff', borderColor: '#91caff', color: '#1890ff' }}
            >
              🧠 Explain
            </Button>
            <Button
              onClick={copyLogs}
              disabled={!logsData?.logs}
              icon={<Copy className="w-3.5 h-3.5" />}
            >
              Copy
            </Button>
            <Button
              onClick={downloadLogs}
              disabled={!logsData?.logs}
              icon={<Download className="w-3.5 h-3.5" />}
              className="mr-6"
            >
              Download
            </Button>
          </Space>
        </div>
      }
    >

        {loading ? (
          <div className="flex-1 flex items-center justify-center min-h-[400px]">
            <div className="text-center">
            <Spin
              indicator={<LoadingOutlined spin style={{ fontSize: 48 }} />}
              size="large"
            />
              <p>Loading logs...</p>
            </div>
          </div>
        ) : logsData ? (
          <div className="flex-1 flex flex-col gap-4" style={{ minHeight: 0 }}>
            {/* Execution Info */}
            <div 
              className="flex-shrink-0 p-4 rounded-lg"
              style={{ border: '1px solid var(--border-default)' }}
            >
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="font-semibold text-color">Status:</span>
                  <Badge className={`ml-2 ${getStatusBadge(logsData.execution.status)}`}>
                    {logsData.execution.status}
                  </Badge>
                </div>
                <div>
                  <span className="font-semibold text-color">Duration:</span>
                  <span className="ml-2 secondary-text">{formatDuration(logsData.execution.duration)}</span>
                </div>
                <div>
                  <span className="font-semibold text-color">Started:</span>
                  <span className="ml-2 secondary-text">{formatDateTime(logsData.execution.startedAt)}</span>
                </div>
                {logsData.execution.endedAt && (
                  <div>
                    <span className="font-semibold text-color">Ended:</span>
                    <span className="ml-2 secondary-text">{formatDateTime(logsData.execution.endedAt)}</span>
                  </div>
                )}
              </div>
              {logsData.execution.errorMessage && (
                <div className="mt-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md">
                  <div className="font-semibold text-red-800 dark:text-red-300 mb-1">Error:</div>
                  <pre className="text-sm text-red-700 dark:text-red-400 whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
                    {logsData.execution.errorMessage}
                  </pre>
                </div>
              )}
            </div>

            {/* Logs */}
            <div className="flex-1 rounded-lg" style={{ minHeight: 0,  border: '1px solid var(--border-default)' }}>
              <div className="h-full overflow-y-auto rounded-lg" style={{ maxHeight: 'calc(90vh - 300px)' }}>
                <div className="p-4 dark:bg-black bg-[#dcfce76b]  dark:text-green-400 text-green-700  font-mono text-xs leading-relaxed">
                  {logsData.logs.length > 0 ? (
                    logsData.logs.map((log, index) => (
                      <div key={index} className="whitespace-pre-wrap break-all">
                        {log}
                      </div>
                    ))
                  ) : (
                    <div className="secondary-text">No logs available</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center min-h-[400px]">
            <div className="text-center text-slate-500 dark:text-gray-500">
              <AlertCircle className="w-8 h-8 mx-auto mb-2" />
              <p>No logs found</p>
            </div>
          </div>
        )}
      
      {/* Log Explanation Modal */}
      <LogExplanationModal
        isOpen={showExplanationModal}
        onClose={() => setShowExplanationModal(false)}
        logs={logsData?.logs || []}
        executionStatus={logsData?.execution.status}
        errorMessage={logsData?.execution.errorMessage}
      />
    </Modal>
  );
} 