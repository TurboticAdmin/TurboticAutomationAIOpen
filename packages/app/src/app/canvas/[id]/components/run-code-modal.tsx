"use client";
import { Col, Modal, Row, Upload } from "antd";
import { FolderOpenIcon, TrashIcon } from "lucide-react";
import useAutomationEditor from "../hooks/automation-editor";
import { useState } from "react";
import { debounce } from "lodash";

const { Dragger } = Upload;

const RunCodeModal = () => {
  const { uploadModalState, setUploadModalState, executeUploadFiles, runCode } =
    useAutomationEditor();
  const [uploadedFileIds, setUploadedFileIds] = useState<string[]>([]);


  const onSelectFiles = async (filesList: any[]) => {
    try {
      const duplicateRemovedFiles = filesList.filter(
        (file, index, self) =>
          index === self.findIndex((f) => f.name === file.name)
      );
      const filesToUpload = duplicateRemovedFiles.filter(
        (file) => !file.status
      );

      if (filesToUpload.length === 0) {
        return;
      }

      setUploadModalState({
        ...uploadModalState,
        fileList: duplicateRemovedFiles.map((file) => ({
          ...file,
          status: file.status || "uploading",
        })),
      });
      const data = await executeUploadFiles(filesToUpload);
      setUploadedFileIds((oldIds) => [...oldIds, ...(data?.filesUploaded || [])]);
      setUploadModalState({
        ...uploadModalState,
        fileList: duplicateRemovedFiles.map((file) => {
          if (filesToUpload.find((f) => f.name === file.name)) {
            return {
              ...file,
              status: "success",
            };
          }
          return file;
        }),
      });
    } catch (error) {}
  };


  return (
    <Modal
      okText="Run Code"
      title="Run code"
      className="default-modal"
      open={uploadModalState.isOpen}
      onCancel={() =>
        setUploadModalState({
          isOpen: false,
          fileList: [],
          uploadStatus: "initial",
        })
      }
      destroyOnHidden
      onOk={() => {
        setUploadModalState({
          isOpen: false,
          fileList: [],
          uploadStatus: "initial",
        })
        runCode(true, uploadedFileIds);
        setUploadedFileIds([]);
      }}
      footer={uploadModalState.uploadStatus !== "initial" ? <></> : undefined}
      closeIcon={uploadModalState.uploadStatus !== "initial" ? false : true}
      maskClosable={false}
    >
      {uploadModalState.uploadStatus === "initial" && (
        <div>
          <Dragger
            className="mb-1"
            showUploadList={false}
            fileList={uploadModalState.fileList}
            beforeUpload={() => false}
            onChange={debounce((info) => {
              onSelectFiles(info.fileList);
            }, 100)}
            onRemove={(file) => {
              setUploadModalState({
                ...uploadModalState,
                fileList: uploadModalState.fileList.filter(
                  (f) => f.uid !== file.uid
                ),
              });
            }}
            multiple
          >
            <Row
              align="middle"
              justify="center"
              style={{
                width: "100%",
                height: 165,
                flexDirection: "column",
              }}
            >
              <FolderOpenIcon size={50} />
              <div>Drag and drop your files or</div>
              <span className="text-blue-400">Upload files</span>
              {/* <Col>
        </Col> */}
            </Row>
          </Dragger>
          {uploadModalState.fileList.map((file: any, i: any) => (
            <Row
              className="file-name-wrapper mt-2 mb-2"
              justify="space-between"
              align="middle"
            >
              <Col style={{ maxWidth: "80%", display: "flex" }}>
                <span className="text-gray-400">{file.name}</span>
              </Col>
              <Col>
                {file.status === "uploading" ? (
                  <>Uploading...</>
                ) : (
                  <TrashIcon
                    size={16}
                    color="gray"
                    className="cursor-pointer"
                    //   className="tertinary-text"
                    onClick={() => {
                      setUploadModalState({
                        ...uploadModalState,
                        fileList: uploadModalState.fileList.filter(
                          (v, index) => index !== i
                        ),
                      });
                      setUploadedFileIds((oldIds) =>
                        oldIds.filter((id, index) => index !== i)
                      );
                    }}
                  />
                )}
              </Col>
            </Row>
          ))}
        </div>
      )}

      {(uploadModalState.uploadStatus === "pending" ||
        uploadModalState.uploadStatus === "success") && (
        <div>
          {/* <Progress percent={uploadModalState.uploadStatus === "pending" ? 50 : 100} /> */}
          {uploadModalState.uploadStatus === "pending" && (
            <div>Uploading files...</div>
          )}
          {uploadModalState.uploadStatus === "success" && (
            <div>Files uploaded successfully</div>
          )}
        </div>
      )}
    </Modal>
  );
};

export default RunCodeModal;
