"use client";
import { Button, Col, message, Modal, Progress, Row, Upload, Select, Space, Typography, Tooltip } from "antd";
import { toast } from '@/hooks/use-toast';
import { FolderOpenIcon, TrashIcon, FileArchiveIcon, FileIcon } from "lucide-react";
import { useState } from "react";
import { debounce } from "lodash";
import useAutomationEditor from "../hooks/automation-editor";
import { useAuth } from "@/app/authentication";

const { Dragger } = Upload;
const { Option } = Select;
const { Text } = Typography;

const UploadEnvironmentFilesModal = ({
  open,
  onClose,
  onUploadFilesSuccess,
  envName,
  automationId,
}: {
  open: boolean;
  onClose: () => void;
  onUploadFilesSuccess: (uploadedFiles: any[]) => any;
  envName: string;
  automationId: string;
}) => {
  const automationEditor = useAutomationEditor();
  const { currentUser } = useAuth();

  const [uploadModalState, setUploadModalState] = useState<{
    uploadStatus: "initial" | "pending" | "success";
    fileList: any[];
    uploadMode: "single" | "multiple" | "zip";
  }>({
    uploadStatus: "initial",
    fileList: [],
    uploadMode: "single",
  });

  const onSelectFiles = async (filesList: any[]) => {
    const duplicateRemovedFiles = filesList.filter(
      (file, index, self) =>
        index === self.findIndex((f) => f.name === file.name)
    );
    const filesToUpload = duplicateRemovedFiles.filter((file) => !file.status);

    if (filesToUpload.length === 0) {
      return;
    }

    // Validate upload mode constraints
    if (uploadModalState.uploadMode === "single" && filesToUpload.length > 1) {
      toast.warning("Single file mode selected. Please select only one file.");
      return;
    }

    if (uploadModalState.uploadMode === "zip") {
      const hasNonZipFiles = filesToUpload.some(file => !file.name.toLowerCase().endsWith('.zip'));
      if (hasNonZipFiles) {
        toast.warning("Zip mode selected. Please select only ZIP files.");
        return;
      }
    }

    setUploadModalState({
      ...uploadModalState,
      fileList: duplicateRemovedFiles.map((file) => ({
        ...file,
        status: file.status,
      })),
    });
  };

  const uploadFiles = async () => {
    try {
      setUploadModalState({
        ...uploadModalState,
        uploadStatus: "pending",
      });
      const res = await automationEditor.executeUploadFiles(
        uploadModalState.fileList,
        envName,
        automationId,
        currentUser?._id,
        uploadModalState.uploadMode
      );

      if (res?.filesUploaded?.length) {
        onUploadFilesSuccess(res?.filesUploaded);
        toast.success("Files uploaded successfully");
        setUploadModalState({
          ...uploadModalState,
          uploadStatus: "success",
        });
      } else {
        setUploadModalState({
          ...uploadModalState,
          uploadStatus: "initial",
        });
        toast.error("Error","Error uploading file");
      }
    } catch (error) {
      setUploadModalState({
        ...uploadModalState,
        uploadStatus: "initial",
      });
      toast.error("Error","Error uploading file");
    }
  };

  return (
    <Modal
      okButtonProps={{
        disabled: !uploadModalState.fileList?.length,
      }}
      okText="Upload files"
      title="Upload files"
      className="default-modal"
      open={open}
      onCancel={() => {
        onClose();
        setUploadModalState({
          fileList: [],
          uploadStatus: "initial",
          uploadMode: "single",
        });
      }}
      destroyOnHidden
      onOk={async () => {
        uploadFiles();
        // setUploadModalState({
        //   isOpen: false,
        //   fileList: [],
        //   uploadStatus: "initial",
        // });
        // runCode(true, uploadedFileIds);
        // setUploadedFileIds([]);
      }}
      footer={uploadModalState.uploadStatus !== "initial" ? <></> : undefined}
      closeIcon={uploadModalState.uploadStatus !== "initial" ? <></> : true}
      maskClosable={false}
    >
      {uploadModalState.uploadStatus === "initial" && (
        <div className="upload-modal-content" style={{ overflow: 'hidden', position: 'relative' }}>
          <Select
            value={uploadModalState.uploadMode}
            onChange={(value) => {
              setUploadModalState({
                ...uploadModalState,
                uploadMode: value,
                fileList: [], // Clear file list when mode changes
              });
            }}
            style={{ width: '100%', marginBottom: 16 }}
            size="large"
          >
            <Option value="single">
              <Space>
                <FileIcon size={16} />
                Single File
              </Space>
            </Option>
            <Option value="multiple">
              <Space>
                <FolderOpenIcon size={16} />
                Multiple Files
              </Space>
            </Option>
            <Option value="zip">
              <Space>
                <FileArchiveIcon size={16} />
                ZIP File
              </Space>
            </Option>
          </Select>

          <div style={{ overflow: 'hidden', position: 'relative' }}>
          {uploadModalState.fileList.length === 0 && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                const files = Array.from(e.dataTransfer.files);
                const fileList = files.map((file: any, index) => ({
                  uid: `${Date.now()}-${index}`,
                  name: file.name,
                  size: file.size,
                  type: file.type,
                  originFileObj: file,
                }));
                onSelectFiles(fileList);
              }}
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.multiple = uploadModalState.uploadMode !== "single";
                input.accept = uploadModalState.uploadMode === "zip" ? ".zip" : "*";
                input.onchange = (e: any) => {
                  const files = Array.from(e.target.files || []);
                  const fileList = files.map((file: any, index) => ({
                    uid: `${Date.now()}-${index}`,
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    originFileObj: file,
                  }));
                  onSelectFiles(fileList);
                };
                input.click();
              }}
              style={{
                width: "100%",
                height: 165,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px",
                background: 'var(--background-color)',
                border: '1px solid var(--border-default)',
                borderRadius: '8px',
                cursor: 'pointer',
                transition: 'border-color 0.3s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#4096FF';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-default)';
              }}
            >
              <div className="text-gray-400 mb-4">
                {uploadModalState.uploadMode === "single" && <FileIcon strokeWidth={1} size={50} />}
                {uploadModalState.uploadMode === "multiple" && <FolderOpenIcon strokeWidth={1} size={50} />}
                {uploadModalState.uploadMode === "zip" && <FileArchiveIcon strokeWidth={1} size={50} />}
              </div>
              <div className="text-gray-600 dark:text-gray-400 text-center mb-2">
                {uploadModalState.uploadMode === "single" && "Drag and drop a single file or"}
                {uploadModalState.uploadMode === "multiple" && "Drag and drop multiple files or"}
                {uploadModalState.uploadMode === "zip" && "Drag and drop a ZIP file or"}
              </div>
              <span className="text-blue-500 dark:text-blue-400 font-medium">
                {uploadModalState.uploadMode === "single" && "browse to upload"}
                {uploadModalState.uploadMode === "multiple" && "browse to upload"}
                {uploadModalState.uploadMode === "zip" && "browse to upload"}
              </span>
            </div>
          )}
          {uploadModalState.fileList.map((file: any, i: any) => (
            <Row
              key={file.uid}
              className="file-name-wrapper mt-3 mb-3 pb-3"
              justify="space-between"
              align="middle"
              style={{
                borderBottom: "1px solid var(--border-default)",
                padding: "8px 12px",
                backgroundColor: "var(--background-color)",
                borderRadius: "6px",
                border: "1px solid var(--border-default)"
              }}
            >
              <Col style={{ maxWidth: "80%", display: "flex", alignItems: "center" }}>
                <div className="flex items-center gap-2">
                  {file.name.toLowerCase().endsWith('.zip') ? (
                    <FileArchiveIcon size={16} color="#6c757d" />
                  ) : (
                    <FileIcon size={16} color="#6c757d" />
                  )}
                  <span className="text-color font-medium">{file.name}</span>
                  <span className="text-xs text-gray-500">
                    ({(file.size / 1024).toFixed(1)} KB)
                  </span>
                </div>
              </Col>
              <Col>
                {file.status === "uploading" ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
                    <span className="text-sm text-gray-600">Uploading...</span>
                  </div>
                ) : (
                  <Tooltip title="Remove file">
                    <TrashIcon
                      size={16}
                      color="#dc3545"
                      className="cursor-pointer hover:opacity-70 transition-opacity"
                      onClick={() => {
                        setUploadModalState({
                          ...uploadModalState,
                          fileList: uploadModalState.fileList.filter(
                            (v, index) => index !== i
                          ),
                        });
                      }}
                    />
                  </Tooltip>
                )}
              </Col>
            </Row>
          ))}
          </div>
        </div>
      )}

      {(uploadModalState.uploadStatus === "pending" ||
        uploadModalState.uploadStatus === "success") && (
        <div>
          <Progress
            status="active"
            percent={uploadModalState.uploadStatus === "pending" ? 50 : 100}
          />
          {uploadModalState.uploadStatus === "pending" && (
            <div>Uploading files...</div>
          )}
          {uploadModalState.uploadStatus === "success" && (
            <div>Files uploaded successfully</div>
          )}
        </div>
      )}
      {uploadModalState.uploadStatus === "success" && (
        <Button
          className="mt-2"
          type="primary"
          onClick={() => {
            onClose();
            setUploadModalState({
              fileList: [],
              uploadStatus: "initial",
              uploadMode: "single",
            });
          }}
        >
          Done
        </Button>
      )}
    </Modal>
  );
};

export default UploadEnvironmentFilesModal;
