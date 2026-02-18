import React from "react";
import { toast } from '@/hooks/use-toast';
import { useState } from "react";
import { Typography, Button, Empty, Spin, Modal, App, Alert } from "antd";
import {
  DownloadOutlined,
  FileOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  CheckOutlined,
  FullscreenOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  CheckCircleFilled,
} from "@ant-design/icons";
import TurboticIcon from "@/components/TurboticIcon";

const { Text } = Typography;

interface OutputFile {
  fileName: string;
  fileId: string;
}

interface OutputSummaryProps {
  outputSummary: {
    summary?: string;
    outputFiles?: OutputFile[];
    executionHistoryId?: string;
    automationId?: string;
  } | null;
  loading?: boolean;
  selectedStep?: {
    id?: string;
    status?: 'failed' | 'error' | 'errored' | 'running' | 'completed' | string;
    title?: string;
    label?: string;
    isLastStep?: boolean;
    explanation?: string;
  };
  onFullScreen?: () => void;
  isFullScreen?: boolean;
}

export default function OutputSummary({
  outputSummary,
  loading = false,
  selectedStep,
  onFullScreen,
  isFullScreen,
}: OutputSummaryProps) {
  const { summary, outputFiles = [] } = outputSummary || {};
  const [isDownloadModalOpen, setIsDownloadModalOpen] = useState(false);
  const { message } = App.useApp();

  // Helpers for file download actions used in the modal
  const handleDownloadFile = (file: OutputFile) => {
    const link = document.createElement('a');
    link.href = `/api/files/${file.fileId}`;
    link.download = file.fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDownloadAll = () => {
    toast.info('Downloaded '+ outputFiles.length + ' files')

    outputFiles.forEach((f) => handleDownloadFile(f));
  };

  const getAlertType = () => {
    if (selectedStep?.status === "stopped") {
      return "warning";
    } else if (selectedStep?.status === "failed"|| selectedStep?.status === "error" || selectedStep?.status === "errored") {
      return "error";
    } else if (selectedStep?.status === "running") {
      return "info";
    } else if (selectedStep?.status === "completed") {
      return "success";
    } else {
      return "info";
    }
  }

  // ?.explanation && selectedStep?.id !== 'final-summary'
  if (!selectedStep) {
    return null;
  }

  return (
    <div
      style={{
        height: isFullScreen ? '100%' : undefined,
        width: isFullScreen ? '100%' : undefined,
        display: isFullScreen ? 'flex' : undefined,
        flexDirection: isFullScreen ? 'column' : undefined,
      }}
      className="output-summary-container"
    >
      <div
        className={`summary-header flex justify-between items-center  p-5 ${selectedStep?.status} `}
        style={{
          // background:
          //   selectedStep?.status === "failed"
          //     ? "#fef2f2"
          //     : selectedStep?.status === "running"
          //     ? "#eff6ff"
          //     : "#effaf3",
          borderRadius: "12px",
        }}
      >
        <div className="flex items-center gap-2">
          <TurboticIcon  />
          {/* <span
            className={`inline-flex items-center justify-center h-[30px] w-[30px] rounded-full p-1 text-xl ${
              selectedStep?.status === "failed" || selectedStep?.status === "error" || selectedStep?.status === "errored"
                ? "bg-red-600"
                : selectedStep?.status === "running"
                ? "bg-blue-600"
                : selectedStep?.status === "completed"
                ? "bg-green-600"
                : "bg-success bg-green-600"
            }`}
          >
            {selectedStep?.status === "failed" || selectedStep?.status === "error" || selectedStep?.status === "errored" ? (
              <CloseCircleOutlined className="!text-white" />
            ) : selectedStep?.status === "running" ? (
              <LoadingOutlined className="!text-white" spin />
            ) : selectedStep?.status === "completed" ? (
              <CheckCircleOutlined className="!text-white" />
            ) : (
              <CheckCircleOutlined className="!text-white" />
            )}
          </span> */}
          <div>
            <div className="text-color text-[18px] font-bold">
              {selectedStep
                ? selectedStep.title || selectedStep.label || "Selected Step"
                : "Start workflow"}
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {outputFiles.length > 0 && (
            <Button
              icon={<DownloadOutlined />} 
              onClick={() => setIsDownloadModalOpen(true)}
              shape="round"
            >
              Download Files ({outputFiles.length})
            </Button>
          )}
          {!isFullScreen && <Button type="text" icon={<FullscreenOutlined />} onClick={onFullScreen}></Button>}
        </div>
      </div>
      <div className="p-5 pt-0 text-left" style={{ 
        flex: isFullScreen ? 1 : undefined,
        overflowY: 'auto',
        overflowX: 'hidden',
        maxHeight: isFullScreen ? 'none' : 202, 
        paddingBottom: isFullScreen ? '16px' : '20px', 
        width: isFullScreen ? '100%' : undefined,
        minHeight: 0
      }}>
        {/* <div
          className="mb-3"
          style={{
            color:
              selectedStep?.status === "failed" || selectedStep?.status === "error" || selectedStep?.status === "errored"
                ? "var(--progress-indicator-red)"
                : selectedStep?.status === "running"
                ? "var(--primary-color)"
                : "var(--progress-indicator-green)",
          }}
        >
          {selectedStep?.status === "failed" || selectedStep?.status === "error" || selectedStep?.status === "errored" ? (
            <>
              <ExclamationCircleOutlined className="mr-1" /> Failed
            </>
          ) : selectedStep?.status === "running" ? (
            <>
              <LoadingOutlined className="mr-1" spin /> Running
            </>
          ) : selectedStep?.status === "completed" ? (
            <>
              <CheckOutlined className="mr-1" /> Completed
            </>
          ) : (
            <>
              <CheckOutlined className="mr-1" /> Success
            </>
          )}
        </div> */}
        <Alert message={selectedStep?.status === "stopped" ? (
            <>
              <ExclamationCircleOutlined className="mr-1" style={{ color: '#ffc107' }} /> Stopped
            </>
          ) : selectedStep?.status === "failed" || selectedStep?.status === "error" || selectedStep?.status === "errored" ? (
            <>
              <ExclamationCircleOutlined className="mr-1" /> Failed
            </>
          ) : selectedStep?.status === "running" ? (
            <>
              <LoadingOutlined className="mr-1" spin /> Running
            </>
          ) : selectedStep?.status === "completed" ? (
            <>
              <CheckCircleFilled className="mr-1" style={{ color: 'var(--progress-indicator-green)' }} />
              Completed
            </>
          ) : (
            <>
              <CheckOutlined className="mr-1" style={{ color: 'var(--progress-indicator-green)' }} /> Success
            </>
          )} type={getAlertType()} className="!py-[16px]" />
        <div
          style={{
            whiteSpace: "pre-wrap",
            borderRadius: 10,
            borderColor: "var(--border-default)",
          }}
          className="p-3 border font-medium mt-3"
        >
          <div>
            {/* <div className="mb-2">
              <strong>Step:</strong> {selectedStep.title || selectedStep.label || 'Unknown Step'}
            </div>
            <div className="mb-2">
              <strong>Status:</strong> {selectedStep.status || 'Unknown'}
            </div> */}
            <div>
              <strong>Description:</strong>
              <Typography.Paragraph
                ellipsis={
                  isFullScreen
                    ? false
                    : {
                        rows: 3,
                        symbol: () => <span>Read More</span>,
                        expandable: true,
                      }
                }
                style={{ whiteSpace: "pre-wrap" }}
              >
                {loading ? (
                  <div className="flex items-center gap-2">
                    <LoadingOutlined spin />
                    <span>Generating ...</span>
                  </div>
                ) : (
                  selectedStep?.id === 'final-summary'
                    ? summary || "Loading..."
                    : selectedStep?.explanation || "Loading..."
                )}
              </Typography.Paragraph>
            </div>
          </div>
        </div>
      </div>
      {/* Panel Header */}
      {/* <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 20px",
          borderBottom: "1px solid #f0f0f0",
          backgroundColor: "#fafafa",
          borderRadius: "12px 12px 0 0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center" }}>
          <CheckCircleOutlined
            style={{ color: "#52c41a", fontSize: "18px", marginRight: "12px" }}
          />
          <div>
            <Text
              style={{
                fontSize: "16px",
                fontWeight: "600",
                color: "#262626",
                display: "block",
              }}
            >
              Execution Summary
            </Text>
            <Text
              style={{ fontSize: "12px", color: "#8c8c8c", display: "block" }}
            >
              Automation execution completed successfully
            </Text>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <Button size="small" style={{ borderRadius: "6px" }}>
            Full Screen
          </Button>
          <Button type="text" size="small" style={{ padding: "4px" }}>
            ↑
          </Button>
        </div>
      </div> */}

      {/* Panel Content */}
      {/* <div style={{ padding: "20px" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBottom: "16px",
            padding: "12px 16px",
            backgroundColor: "#f6ffed",
            border: "1px solid #b7eb8f",
            borderRadius: "8px",
          }}
        >
          <CheckCircleOutlined
            style={{ color: "#52c41a", fontSize: "16px", marginRight: "8px" }}
          />
          <Text
            style={{ fontSize: "14px", fontWeight: "500", color: "#52c41a" }}
          >
            Success
          </Text>
        </div>

        <div style={{ marginBottom: "20px" }}>
          <Text
            style={{
              fontSize: "14px",
              color: "#595959",
              display: "block",
              marginBottom: "4px",
            }}
          >
            Workflow initialized successfully
          </Text>
          <Text
            style={{
              fontSize: "12px",
              color: "#8c8c8c",
              display: "block",
              marginBottom: "2px",
            }}
          >
            Timestamp: {new Date().toLocaleString()}
          </Text>
          <Text
            style={{ fontSize: "12px", color: "#8c8c8c", display: "block" }}
          >
            Session ID: ws-abc-123
          </Text>
        </div> */}

      {/* Generated Files */}
      {/* {outputFiles.length > 0 && (
                    <div>
                        <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            marginBottom: '12px' 
                        }}>
                            <FileOutlined style={{ color: '#1890ff', fontSize: '14px', marginRight: '8px' }} />
                            <Text style={{ fontSize: '14px', fontWeight: '500', color: '#262626' }}>
                                Generated Files ({outputFiles.length})
                            </Text>
                        </div>
                        <div style={{ marginLeft: '22px' }}>
                            {outputFiles.map((file, index) => (
                                <div key={index} style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    padding: '8px 12px',
                                    backgroundColor: '#fafafa',
                                    borderRadius: '6px',
                                    marginBottom: '6px',
                                    border: '1px solid #f0f0f0'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center' }}>
                                        {getFileIcon(file.fileName)}
                                        <Text style={{ 
                                            fontSize: '13px', 
                                            color: '#262626',
                                            marginLeft: '8px'
                                        }}>
                                            {file.fileName}
                                        </Text>
                                    </div>
                                    <Button
                                        type="primary"
                                        size="small"
                                        icon={<DownloadOutlined />}
                                        onClick={() => downloadFile(file)}
                                        style={{
                                            borderRadius: '4px',
                                            fontSize: '11px',
                                            height: '24px',
                                            padding: '0 8px'
                                        }}
                                    >
                                        Download
                                    </Button>
                                </div>
                            ))}
                        </div>
                    </div>
                )} */}
      {/* </div> */}
      
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
              {outputFiles.map((file) => (
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
              <Button type="primary" icon={<DownloadOutlined />} onClick={handleDownloadAll}>
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
