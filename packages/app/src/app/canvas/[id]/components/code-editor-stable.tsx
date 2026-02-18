'use client';

import { ArrowRightOutlined, QuestionCircleOutlined, CloseOutlined, CheckOutlined, SwapOutlined, EyeOutlined, EyeInvisibleOutlined } from "@ant-design/icons";
import { toast } from '@/hooks/use-toast';
import Editor from "@monaco-editor/react";
import { DiffEditor } from "@monaco-editor/react";
import { Alert, App, Button, Col, Input, Modal, Row, Space, Tooltip, Typography, Checkbox, Tabs, Select, Popover } from "antd";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import useAutomationEditor from "../hooks/automation-editor";
import RunCodeModal from "./run-code-modal";
import OutputController from "./output-controller";
import Automation from "./automation";
import { Copy, Trash2, Upload, Brain, X, Download, PanelLeft } from "lucide-react";
import { SquareSplitHorizontalIcon } from "@/components/CustomIcons";
import UploadEnvironmentFilesModal from "./upload-environment-files-modal";
import useTerminalSelection from "@/hooks/useSelectionRect";
import eventsEmitter from "@/lib/events-emitter";
import { LogExplanationModal } from "@/components/LogExplanationModal";
import { CodeExplanationButton } from "@/components/CodeExplanationButton";
import { useTheme } from "@/contexts/ThemeContext";
import JSZip from 'jszip';

interface MonacoEditorClientProps {
  value: string;
  language?: string;
  onChange?: (value: string | undefined) => void;
}

const currentValue = {
  value: ''
}

export function getCurrentCodeValue() {
  return currentValue.value;
}

function EnvironmentVariablesTab() {
  const automationEditor = useAutomationEditor();
  const { theme } = useTheme();
  const [visiblePasswords, setVisiblePasswords] = useState<{ [key: string]: boolean }>({});
  const [globalVisibility, setGlobalVisibility] = useState(false);
  const [uploadModal, setShowUploadModal] = useState({
    envName: '',
    open: false,
    id: '',
  });
  const [runtimeEnvironment, setRuntimeEnvironment] = useState<string>('dev');
  const [viewingEnvironment, setViewingEnvironment] = useState<string>('dev'); // For UI viewing/editing
  const [isLoadingEnv, setIsLoadingEnv] = useState(false);
  const [useMultiEnv, setUseMultiEnv] = useState(false);
  const [renderKey, setRenderKey] = useState(0); // Force re-render on checkbox toggle
  const fetchControllerRef = useRef<AbortController | null>(null);
  const originalEnvVarsRef = useRef<any[]>([]); // Store original loaded env vars from API

  const { modal } = App.useApp();

  // Cleanup fetch on unmount
  useEffect(() => {
    return () => {
      if (fetchControllerRef.current) {
        fetchControllerRef.current.abort();
        fetchControllerRef.current = null;
      }
    };
  }, []);

  // Sync runtimeEnvironment and useMultiEnv from automation ref when automation loads
  useEffect(() => {
    if (!automationEditor.isLoading && automationEditor.automationRef.current) {
      const strategy = automationEditor.automationRef.current?.runtimeEnvironment;
      if (strategy) {
        setRuntimeEnvironment(strategy);
      } else {
        setRuntimeEnvironment('dev');
      }

      // Store original env vars from API (deep copy)
      if (automationEditor.environmentVariables.length > 0) {
        originalEnvVarsRef.current = JSON.parse(JSON.stringify(automationEditor.environmentVariables));
      }

      // Load useMultiEnv preference from automation document
      const useMultiEnvPref = automationEditor.automationRef.current?.useMultiEnv;
      if (useMultiEnvPref !== undefined) {
        setUseMultiEnv(useMultiEnvPref);
      } else {
        // No saved preference - detect from structure
        if (automationEditor.environmentVariables.length > 0) {
          const allVarsAreMultiEnv = automationEditor.environmentVariables.every((env: any) =>
            env.value && typeof env.value === 'object' && !Array.isArray(env.value) &&
            (env.value.dev !== undefined || env.value.test !== undefined || env.value.production !== undefined)
          );
          setUseMultiEnv(allVarsAreMultiEnv);
        }
      }
    }
  }, [automationEditor.docVersion, automationEditor.isLoading]);

  // Initialize viewing environment - only on initial load, don't sync with runtime changes
  useEffect(() => {
    // Only set viewing environment on initial load
    if (!automationEditor.isLoading && automationEditor.automationRef.current) {
      const initialRuntime = automationEditor.automationRef.current?.runtimeEnvironment || 'dev';
      // Only set if viewingEnvironment hasn't been manually changed (still at default)
      if (viewingEnvironment === 'dev' && initialRuntime !== 'dev') {
        setViewingEnvironment(initialRuntime);
      }
    }
  }, [automationEditor.isLoading]);

  // Detect if ALL variables are multi-env format and set checkbox accordingly
  // This runs whenever environment variables change to keep checkbox state in sync
  // Only check when environmentVariables actually change, not when docVersion changes
  // IMPORTANT: Only update if there's no saved preference - saved preference takes precedence
  useEffect(() => {
    // Skip if there's a saved preference - it takes precedence
    const savedPreference = automationEditor.automationRef.current?.useMultiEnv;
    if (savedPreference !== undefined) {
      // Keep the saved preference, don't override it
      return;
    }
    
    // No saved preference - detect from structure
    if (automationEditor.environmentVariables.length === 0) {
      setUseMultiEnv(false);
      return;
    }

    const allVarsAreMultiEnv = automationEditor.environmentVariables.every((env: any) =>
      env.value && typeof env.value === 'object' && !Array.isArray(env.value) &&
      (env.value.dev !== undefined || env.value.test !== undefined || env.value.production !== undefined)
    );

    // Update checkbox state to match the actual structure
    // Only update if it's different to prevent unnecessary re-renders
    setUseMultiEnv((prev) => {
      if (prev !== allVarsAreMultiEnv) {
        return allVarsAreMultiEnv;
      }
      return prev;
    });
  }, [automationEditor.environmentVariables]);

  const togglePasswordVisibility = (id: string) => {
    setVisiblePasswords(prev => {
      const newState = {
        ...prev,
        [id]: !prev[id]
      };
      
      // Check if all are visible or all are hidden to update global state
      const allVisible = Object.values(newState).every(visible => visible);
      const allHidden = Object.values(newState).every(visible => !visible);
      
      if (allVisible) {
        setGlobalVisibility(true);
      } else if (allHidden) {
        setGlobalVisibility(false);
      } else {
        // Mixed state - don't change global state
      }
      
      return newState;
    });
  };

  const toggleGlobalVisibility = () => {
    const newGlobalVisibility = !globalVisibility;
    setGlobalVisibility(newGlobalVisibility);
    
    // Update all individual visibility states
    const newVisiblePasswords: { [key: string]: boolean } = {};
    automationEditor.environmentVariables.forEach(item => {
      newVisiblePasswords[item.id] = newGlobalVisibility;
    });
    setVisiblePasswords(newVisiblePasswords);
  };

  // Helper function to get the value for the current environment
  // Handles both single string values (Any - applies to all environments) and multi-environment object values
  const getValueForEnvironment = (item: any): string => {
    // Handle null or undefined values
    if (item.value === null || item.value === undefined) {
      return '';
    }

    // Any: value is a string - return same for all environments
    if (typeof item.value === 'string') {
      return item.value;
    }

    // Multi-env: value is an object with dev/test/production keys
    // Handle null case - null is typeof 'object' but not a valid object
    if (typeof item.value === 'object' && item.value !== null && !Array.isArray(item.value)) {
      if (item.value.dev !== undefined || item.value.test !== undefined || item.value.production !== undefined) {
        // If useMultiEnv is enabled, use viewing environment for display
        // If useMultiEnv is disabled but data is multi-env, always show dev value
        const envToUse = useMultiEnv ? viewingEnvironment : 'dev';
        const value = item.value[envToUse];
        // Return the value if it exists (even if empty string), otherwise empty string
        return value !== undefined ? value : '';
      }
    }

    // Fallback to empty string (handles null, undefined, or invalid structures)
    return '';
  };

  // Helper function to get valueFile for the current environment
  const getValueFileForEnvironment = (item: any) => {
    if (!item.valueFile) return undefined;
    
    // Check if it's the new multi-environment structure
    if (typeof item.valueFile === 'object' && !Array.isArray(item.valueFile)) {
      if (item.valueFile.dev || item.valueFile.test || item.valueFile.production) {
        // Multi-environment structure - use viewing environment for display
        return item.valueFile[viewingEnvironment];
      }
    }
    // Any structure: single file or array (applies to all environments)
    return item.valueFile;
  };

  // Helper function to set valueFile for the current environment
  const setValueFileForEnvironment = (index: number, files: any) => {
    const newEnvironmentVariables = [...automationEditor.environmentVariables];
    const item = newEnvironmentVariables[index];
    
    // Initialize valueFile structure if needed
    if (!item.valueFile || typeof item.valueFile !== 'object' || Array.isArray(item.valueFile)) {
      // Convert old structure to new multi-environment structure
      item.valueFile = {
        dev: undefined,
        test: undefined,
        production: undefined
      };
    }
    
    // Set files for the viewing environment
    item.valueFile[viewingEnvironment] = files.length === 1 ? files[0] : files;
    
    automationEditor.setEnvironmentVariables(newEnvironmentVariables);
  };

  // Helper function to remove valueFile for the current environment
  const removeValueFileForEnvironment = (index: number) => {
    const newEnvironmentVariables = [...automationEditor.environmentVariables];
    const item = newEnvironmentVariables[index];
    
    if (item.valueFile && typeof item.valueFile === 'object' && !Array.isArray(item.valueFile)) {
      if (item.valueFile.dev || item.valueFile.test || item.valueFile.production) {
        // Multi-environment structure - delete from viewing environment
        delete item.valueFile[viewingEnvironment];
        
        // If no files remain in any environment, remove the entire valueFile
        if (!item.valueFile.dev && !item.valueFile.test && !item.valueFile.production) {
          item.valueFile = undefined;
        }
      } else {
        // Old structure
        item.valueFile = undefined;
      }
    } else {
      item.valueFile = undefined;
    }
    
    automationEditor.setEnvironmentVariables(newEnvironmentVariables);
  };

  return (
    <div style={{ padding: 10 }}>
      {
        automationEditor.enableContinue === 'env-var' ? (
          <Row>
            <Col span={24} style={{ padding: 12 }}>
              <Alert
                message="Waiting for your input"
                description="Please fill in the necessary environment variables and click 'Continue'"
                type="warning"
                style={theme === 'dark' ? {
                  background: '#21262d',
                  border: '1px solid #8b949e',
                  color: '#c9d1d9'
                } : undefined}
                action={
                  <Space direction="vertical">
                    <Button disabled={automationEditor.isSaving === true} onClick={() => {
                      automationEditor?.continueCallbackRef?.current && automationEditor.continueCallbackRef.current()
                    }} type="primary" icon={<ArrowRightOutlined />} loading={automationEditor.isSaving === true} >
                      {automationEditor.isSaving === true ? 'Saving...': 'Continue'}
                    </Button>
                  </Space>
                }
              />
            </Col>
          </Row>
        ) : null
      }
      <Row style={{ marginBottom: 16 }}>
        <Col span={24} style={{ padding: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Checkbox
              checked={useMultiEnv}
              onChange={async (e) => {
                const checked = e.target.checked;

                // Store preference in automation document
                if (automationEditor.automationRef.current) {
                  automationEditor.automationRef.current.useMultiEnv = checked;
                }

                setUseMultiEnv(checked);

                // Toggle between multi-env and single value view
                if (checked) {
                  // Restore original multi-env data
                  if (originalEnvVarsRef.current.length > 0) {
                    automationEditor.setEnvironmentVariables(JSON.parse(JSON.stringify(originalEnvVarsRef.current)));
                  }
                } else {
                  // Preserve multi-env data before converting
                  const hasMultiEnv = automationEditor.environmentVariables.some((env: any) =>
                    env.value && typeof env.value === 'object' && !Array.isArray(env.value)
                  );
                  if (hasMultiEnv) {
                    originalEnvVarsRef.current = JSON.parse(JSON.stringify(automationEditor.environmentVariables));
                  }

                  // DO NOT convert to string - preserve object structure even when useMultiEnv is false
                  // The UI will display value.dev via getValueForEnvironment function
                  // This ensures the API receives the full object structure
                }

                // Force re-render by incrementing key
                setRenderKey(prev => prev + 1);
              }}
            >
              <span className="text-color">Use multiple environments</span>
            </Checkbox>

            {useMultiEnv && (
              <>
                <label className="text-color" style={{ minWidth: 80, marginLeft: 16 }}>View/Edit:</label>
                <Select
                  value={viewingEnvironment}
                  onChange={(value) => {
                    // Simply update the viewing environment - don't fetch from API
                    // This preserves user edits and prevents overwriting unsaved changes
                    // The getValueForEnvironment function will handle displaying the correct value
                    setViewingEnvironment(value);
                  }}
                  style={{ minWidth: 150 }}
                  size="large"
                  options={[
                    { label: 'Dev', value: 'dev' },
                    { label: 'Test', value: 'test' },
                    { label: 'Production', value: 'production' }
                  ]}
                />
                <label className="text-color" style={{ minWidth: 140, marginLeft: 16 }}>Runtime Environment:</label>
                <Select
                  value={runtimeEnvironment}
                  onChange={(value) => {
                    setRuntimeEnvironment(value);
                    if (automationEditor.automationRef.current) {
                      automationEditor.automationRef.current.runtimeEnvironment = value;
                      // Trigger save by updating doc version
                      automationEditor.setDocVersion((d) => d + 1);
                    }
                  }}
                  style={{ minWidth: 150 }}
                  size="large"
                  options={[
                    { label: 'Dev', value: 'dev' },
                    { label: 'Test', value: 'test' },
                    { label: 'Production', value: 'production' }
                  ]}
                />
              </>
            )}
          </div>
        </Col>
      </Row>
      <Row>
        <Col span={10} style={{ padding: 6 }}>
          <label className="text-color">Variable Name</label>
        </Col>
        <Col span={10} style={{ padding: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <label className="text-color">Variable Value</label>
            {automationEditor.environmentVariables.length > 0 && (
              <Button
                type="text"
                size="small"
                icon={globalVisibility ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                onClick={toggleGlobalVisibility}
                style={{
                  color: globalVisibility ? '#1890ff' : '#8c8c8c',
                  fontSize: '12px'
                }}
              >
                {globalVisibility ? 'Hide All' : 'Show All'}
              </Button>
            )}
          </div>
        </Col>
        <Col span={2}></Col>
        <Col span={2}></Col>
      </Row>
      {
        automationEditor.environmentVariables.map((item, index) => (
          <Row key={item.id}>
            <Col span={10} style={{ padding: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Input
                  value={item.name}
                  onChange={(e) => {
                    const newEnvironmentVariables = [
                      ...automationEditor.environmentVariables,
                    ];
                    newEnvironmentVariables[index].name = e.target.value;
                    automationEditor.setEnvironmentVariables(
                      newEnvironmentVariables
                    );
                  }}
                  placeholder="Variable Name"
                  style={{
                    borderColor: "#6b7280 !important",
                    flex: 1
                  }}
                  className="!border-0 h-[40px]"
                  size="large"
                  autoComplete="new-password"
                  name={item.id + '-name'}
                  key={item.id + '-name'}
                  data-lpignore="true"
                />
                <Tooltip title={`Ask TurboticAI how to setup ${item.name}`}>
                  <Button
                    type="text"
                    icon={<QuestionCircleOutlined />}
                    size="small"
                    onClick={() => {
                      if (item.name && (window as any).exposedFunctions && typeof (window as any).exposedFunctions.sendMessageDirectly === 'function') {
                        const msg = `Show me how to find/setup the  ${item.name}`;
                        (window as any).exposedFunctions.sendMessageDirectly(msg);
                      }
                    }}
                    style={{
                      color: '#6b7280',
                      border: 'none',
                      padding: '4px 8px',
                      height: '40px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  />
                </Tooltip>
              </div>
            </Col>
            <Col span={10} style={{ padding: 6 }}>
              {!getValueFileForEnvironment(item) && <div className="flex gap-2 items-center" key={`${item.name}-${useMultiEnv}-${viewingEnvironment}-${renderKey}`}>
                <Input.Password
                  value={getValueForEnvironment(item)}
                  onChange={(e) => {
                    const newEnvironmentVariables = [...automationEditor.environmentVariables];
                    const currentItem = { ...newEnvironmentVariables[index] }; // Create new object for the item

                    if (useMultiEnv) {
                      // Multi-env mode: update only the viewing environment
                      // Ensure value is an object structure
                      if (typeof currentItem.value !== 'object' || currentItem.value === null || Array.isArray(currentItem.value)) {
                        // Convert string to multi-env object structure
                        const stringValue = typeof currentItem.value === 'string' ? currentItem.value : '';
                        currentItem.value = {
                          dev: stringValue,
                          test: stringValue,
                          production: stringValue
                        };
                      } else {
                        // Create new object for value to ensure React detects the change
                        currentItem.value = {
                          ...currentItem.value,
                          [viewingEnvironment]: e.target.value
                        };
                      }
                    } else {
                      // useMultiEnv is false: preserve object structure but update only dev value
                      // This ensures the API receives the full object structure
                      if (typeof currentItem.value === 'object' && currentItem.value !== null && !Array.isArray(currentItem.value)) {
                        // Preserve object structure, update dev value
                        currentItem.value = {
                          ...currentItem.value,
                          dev: e.target.value
                        };
                      } else if (typeof currentItem.value === 'string') {
                        // If it's a string, convert to object structure with dev value
                        currentItem.value = {
                          dev: e.target.value,
                          test: currentItem.value, // Preserve existing value for other envs
                          production: currentItem.value
                        };
                      } else {
                        // Initialize as object structure
                        currentItem.value = {
                          dev: e.target.value,
                          test: undefined,
                          production: undefined
                        };
                      }
                    }

                    // Replace the item in the array with the new object
                    newEnvironmentVariables[index] = currentItem;
                    automationEditor.setEnvironmentVariables(newEnvironmentVariables);

                    // Trigger autosave
                    automationEditor.setDocVersion((v) => v + 1);
                  }}
                  placeholder="Variable Value"
                  visibilityToggle={{
                    visible: visiblePasswords[item.id] || false,
                    onVisibleChange: () => togglePasswordVisibility(item.id)
                  }}
                  style={{
                    borderColor: '#6b7280 !important'
                  }}
                  className="!border-0 h-[40px]"
                  size="large"
                  autoComplete="new-password-test"
                  name={item.id + '-value'}
                  id={item.id + '-value'}
                  key={item.id + '-value'}
                  data-lpignore="true"
                />
                <Upload className="ml-1 cursor-pointer" size={16} onClick={() => {
                  setShowUploadModal({
                    envName: item.name,
                    open: true,
                    id: item.id
                  })
                }} />
              </div>}
              {getValueFileForEnvironment(item) && <div className="flex gap-2 items-center h-full">
                {(() => {
                  const currentValueFile = getValueFileForEnvironment(item);
                  return Array.isArray(currentValueFile) ? (
                    <div className="w-full flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Typography.Paragraph className="!m-0 !text-sm font-medium" ellipsis={{ rows: 1, tooltip: true }}>
                          {currentValueFile.length} file{currentValueFile.length !== 1 ? 's' : ''} uploaded ({viewingEnvironment})
                        </Typography.Paragraph>
                        <Popover 
                          content={
                            <div className="max-w-xs">
                              {currentValueFile.map((file: any, fileIndex: number) => (
                                <div key={fileIndex} className="flex items-center justify-between py-1 px-2 hover:bg-gray-100 rounded mb-1 last:mb-0">
                                  <span className="text-sm text-gray-700 flex-1 truncate mr-2">{file.fileName}</span>
                                  <CloseOutlined
                                    className="text-gray-400 hover:text-red-500 cursor-pointer flex-shrink-0"
                                    onClick={() => {
                                      modal.confirm({
                                        title: 'Remove file',
                                        content: `Do you want to remove "${file.fileName}" from this environment variable?`,
                                        icon: null,
                                        closable: true,
                                        onOk(...args) {
                                          const newEnvironmentVariables = [...automationEditor.environmentVariables];
                                          const item = newEnvironmentVariables[index];
                                          const currentFiles = getValueFileForEnvironment(item);
                                          
                                          if (Array.isArray(currentFiles) && currentFiles.length === 1) {
                                            // If it's the last file, remove the entire valueFile for this environment
                                            removeValueFileForEnvironment(index);
                                          } else if (Array.isArray(currentFiles)) {
                                            // Remove just this file
                                            const updatedFiles = currentFiles.filter(
                                              (f: any) => f.fileName !== file.fileName
                                            );
                                            setValueFileForEnvironment(index, updatedFiles);
                                          } else {
                                            // Single file, remove it
                                            removeValueFileForEnvironment(index);
                                          }
                                        },
                                      });
                                    }}
                                  />
                                </div>
                              ))}
                            </div>
                          }
                          placement="top"
                          trigger="hover"
                        >
                          <QuestionCircleOutlined className="text-gray-400 hover:text-gray-600 cursor-help" />
                        </Popover>
                      </div>
                      <Tooltip title="Remove all files">
                        <CloseOutlined
                          className="text-gray-400 hover:text-red-500 cursor-pointer"
                          onClick={() => {
                            modal.confirm({
                              title: 'Remove all files',
                              content: `Do you want to remove all files from this environment variable for ${viewingEnvironment}?`,
                              icon: null,
                              closable: true,
                              onOk(...args) {
                                removeValueFileForEnvironment(index);
                              },
                            });
                          }}
                        />
                      </Tooltip>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between w-full">
                      <Typography.Paragraph className="!m-0 !text-sm" ellipsis={{ rows: 1, tooltip: true }}>
                        {currentValueFile?.fileName} ({viewingEnvironment})
                      </Typography.Paragraph>
                      <Tooltip title="Remove file">
                        <CloseOutlined
                          className="text-gray-400 hover:text-red-500 cursor-pointer ml-2"
                          onClick={() => {
                            modal.confirm({
                              title: 'Remove file',
                              content: `Do you want to remove the file from this environment variable for ${viewingEnvironment}?`,
                              icon: null,
                              closable: true,
                              onOk(...args) {
                                removeValueFileForEnvironment(index);
                              },
                            });
                          }}
                        />
                      </Tooltip>
                    </div>
                  );
                })()}
              </div>}
            </Col>
            <Col span={2} style={{ padding: 6 }}>
              <Button
                onClick={() => {
                  Modal.confirm({
                    title: (
                      <div className="text-gray-900 dark:text-white">
                        Are you sure you want to delete this environment variable?
                      </div>
                    ),
                    content: null,
                    className: theme === 'dark' ? 'dark-modal' : '',
                    closable: true,
                    okText: 'OK',
                    cancelText: 'Cancel',
                    okButtonProps: {
                      className: 'bg-blue-600 hover:bg-blue-700 text-white'
                    },
                    cancelButtonProps: {
                      className: theme === 'dark' 
                        ? 'bg-gray-700 hover:bg-gray-600 border-gray-600 text-gray-200' 
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    },
                    onOk: () => {
                      const newEnvironmentVariables = [
                        ...automationEditor.environmentVariables,
                      ];
                      newEnvironmentVariables.splice(index, 1);
                      automationEditor.setEnvironmentVariables(
                        newEnvironmentVariables
                      );
                    },
                  });
                }}
                size="large"
                className="dark-input !border-0 h-[40px]"
              >
                <Trash2 size={16} />
              </Button>
            </Col>
          </Row>
        ))
      }
      <Row>
        <Col span={12} style={{ padding: 10 }}>
          <Button
            onClick={() => {
              const newEnvironmentVariables = [...automationEditor.environmentVariables];
              newEnvironmentVariables.push({ name: '', value: '', id: `${(new Date()).getTime()}`, source: 'user' });
              automationEditor.setEnvironmentVariables(newEnvironmentVariables);
            }}
            shape="round"
            size="large"
          >
            Add Environment Variable
          </Button>
        </Col>
      </Row>

      <UploadEnvironmentFilesModal
        open={uploadModal.open}
        onClose={() => {
          setShowUploadModal({
            envName: '',
            open: false,
            id: '',
          })
        }}
        onUploadFilesSuccess={async (uploadedFiles) => {
          const variableIndex = automationEditor.environmentVariables.findIndex(v => v.id === uploadModal.id);
          if (variableIndex !== -1) {
            setValueFileForEnvironment(variableIndex, uploadedFiles);
          }
        }}
        automationId={automationEditor.automationRef.current._id}
        envName={uploadModal.envName}
      />
    </div>
  )
}

function DependenciesTab() {
  const automationEditor = useAutomationEditor();
  const { theme } = useTheme();

  return (
    <div style={{ padding: 10 }}>
      <Row>
         <Col span={12} style={{ padding: 6 }}>
           <label className="text-color">Dependency Name</label>
         </Col>
         <Col span={10} style={{ padding: 6 }}>
           <label className="text-color">Dependency Version</label>
         </Col>
         <Col span={2}></Col>
      </Row>
      {
        automationEditor.dependencies.map((item, index) => (
          <Row key={item.id}>
            <Col span={12} style={{ padding: 6 }}>
                             <Input value={item.name} onChange={(e) => {
                 const newDependencies = [...automationEditor.dependencies];
                 newDependencies[index].name = e.target.value;
                 automationEditor.setDependencies(newDependencies);
               }} placeholder="Dependency Name"
                 style={{
                   borderColor: '#6b7280 !important'
                 }}
                 className="!border-0 h-[40px]" />
            </Col>
            <Col span={10} style={{ padding: 6 }}>
                             <Input value={item.version} onChange={(e) => {
                 const newDependencies = [...automationEditor.dependencies];
                 newDependencies[index].version = e.target.value;
                 automationEditor.setDependencies(newDependencies);
               }} placeholder="Dependency Version"
                 style={{
                   borderColor: '#6b7280 !important'
                 }}
                 className="!border-0 h-[40px]"
                 size="large" />
            </Col>
            <Col span={2} style={{ padding: 6 }}>
              <Button
                size="large"
                onClick={() => {
                  Modal.confirm({
                    title: (
                      <div className="text-gray-900 dark:text-white">
                        Are you sure you want to delete this dependency?
                      </div>
                    ),
                    content: null,
                    className: theme === 'dark' ? 'dark-modal' : '',
                    closable: true,
                    okText: 'OK',
                    cancelText: 'Cancel',
                    okButtonProps: {
                      className: 'bg-blue-600 hover:bg-blue-700 text-white'
                    },
                    cancelButtonProps: {
                      className: theme === 'dark' 
                        ? 'bg-gray-700 hover:bg-gray-600 border-gray-600 text-gray-200' 
                        : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                    },
                    onOk: () => {
                      const newDependencies = [...automationEditor.dependencies];
                      newDependencies.splice(index, 1);
                      automationEditor.setDependencies(newDependencies);
                    }
                  })
                }}
                className="dark-input !border-0 h-[40px]"
              >
                <Trash2 size={16} />
              </Button>
            </Col>
          </Row>
        ))
      }
      <Row>
        <Col span={12} style={{ padding: 10 }}>
          <Button
            onClick={() => {
              const newDependencies = [...automationEditor.dependencies];
              newDependencies.push({ name: '', version: 'latest', id: `${(new Date()).getTime()}`, source: 'user' });
              automationEditor.setDependencies(newDependencies);
            }}
            shape="round"
            size="large"
          >
             Add Dependency
           </Button>
        </Col>
      </Row>
    </div>
  )
}

const MonacoEditorClientStable = ({
    value,
    language = "javascript",
    onChange,
}: MonacoEditorClientProps) => {
  const automationEditor = useAutomationEditor();
  const { activeTab, setActiveTab, isTesting, isSaving, runCode, environmentVariables, editorRef, terminal, autoAcceptChanges, setAutoAcceptChanges } = automationEditor;
  const { theme } = useTheme();

  // Multi-file state for v3 steps
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [openTabs, setOpenTabs] = useState<string[]>([]); // Track which files are open as tabs
  const [fileContents, setFileContents] = useState<Map<string, string>>(new Map());
  const [originalContentsForDiff, setOriginalContentsForDiff] = useState<Map<string, string>>(new Map());
  const [diffModes, setDiffModes] = useState<Map<string, boolean>>(new Map());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<Map<string, boolean>>(new Map()); // Track files with unsaved changes
  
  // Refs to access current state values in event handlers
  const fileContentsRef = useRef<Map<string, string>>(new Map());
  const originalContentsForDiffRef = useRef<Map<string, string>>(new Map());
  const openTabsRef = useRef<string[]>([]);
  const activeFileIdRef = useRef<string | null>(null);
  
  // Keep refs in sync with state
  useEffect(() => {
    fileContentsRef.current = fileContents;
  }, [fileContents]);
  
  useEffect(() => {
    originalContentsForDiffRef.current = originalContentsForDiff;
  }, [originalContentsForDiff]);
  
  useEffect(() => {
    openTabsRef.current = openTabs;
  }, [openTabs]);
  
  useEffect(() => {
    activeFileIdRef.current = activeFileId;
  }, [activeFileId]);

  // Get v3 steps
  const v3Steps = automationEditor.automationRef.current?.v3Steps || [];
  const isV3Mode = v3Steps.length > 0;

  // Diff state with proper refs to prevent infinite loops
  const [originalContentForDiff, setOriginalContentForDiff] = useState<string>('');
  const [diffMode, setDiffMode] = useState<boolean>(false);
  const [showSideBySide, setShowSideBySide] = useState<boolean>(true); // Default to side-by-side like version control
  const [forceRemount, setForceRemount] = useState<number>(0);
  const isUpdatingRef = useRef(false);
  const lastValueRef = useRef(value);
  const diffEditorRef = useRef<any>(null);
  const mainEditorRef = useRef<any>(null);
  const autoAcceptTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const savedCursorPositionRef = useRef<any>(null);
  const savedSelectionRef = useRef<any>(null);
  const manualTypingDetectedRef = useRef<boolean>(false);
  const lastTypingTimeRef = useRef<number>(0);
  const isTypingRef = useRef<boolean>(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastDiffContentUpdateRef = useRef<string>('');
  const diffDecorationsRef = useRef<string[]>([]);

  currentValue.value = value;

  // Update Monaco editor theme when theme changes
  useEffect(() => {
    if (mainEditorRef.current) {
      const monaco = (window as any).monaco;
      if (monaco && monaco.editor) {
        monaco.editor.setTheme(theme === 'dark' ? 'dark-custom' : 'light-custom');
      }
    }
    if (diffEditorRef.current) {
      const monaco = (window as any).monaco;
      if (monaco && monaco.editor) {
        monaco.editor.setTheme(theme === 'dark' ? 'dark-custom' : 'light-custom');
      }
    }
  }, [theme]);

  // Initialize file contents from v3 steps
  useEffect(() => {
    if (isV3Mode && v3Steps.length > 0) {
      setFileContents(prevFileContents => {
        const newFileContents = new Map<string, string>();

        v3Steps.forEach((step: any) => {
          const stepCode = step.code || `// Step: ${step.name}\n// Add your code here`;
          newFileContents.set(step.id, stepCode);
        });

        return newFileContents;
      });

      setOriginalContentsForDiff(prevOriginalContents => {
        const newOriginalContents = new Map<string, string>();

        v3Steps.forEach((step: any) => {
          const stepCode = step.code || `// Step: ${step.name}\n// Add your code here`;

          // Preserve existing original content if in diff mode, otherwise sync to current
          const isInDiffMode = diffModes.get(step.id) || false;
          if (isInDiffMode && prevOriginalContents.has(step.id)) {
            // Keep the existing original content to preserve the diff baseline
            newOriginalContents.set(step.id, prevOriginalContents.get(step.id)!);
          } else {
            // Sync original to current (normal state or after accepting/rejecting)
            newOriginalContents.set(step.id, stepCode);
          }
        });

        return newOriginalContents;
      });

      // Don't auto-open any files - user must click to open
    }
  }, [isV3Mode, v3Steps.length, automationEditor.docVersion, diffModes]);

  // Get current file content and functions
  // Helper function to get all terminal buffer lines (including scrollback)
  const getAllTerminalBufferLines = useCallback(() => {
    try {
      if (!terminal.current) return [];
      
      const buffer = terminal.current.buffer.active;
      if (!buffer) return [];
      
      const lines: string[] = [];
      const lineCount = buffer.length;
      
      // Iterate through all lines in the buffer (including scrollback)
      for (let i = 0; i < lineCount; i++) {
        const line = buffer.getLine(i);
        if (line) {
          // translateToString(true) strips formatting and returns plain text
          const lineText = line.translateToString(true);
          if (lineText.trim() !== '' && lineText.trim() !== 'Terminal ready - logs will appear here') {
            lines.push(lineText);
          }
        }
      }
      
      return lines;
    } catch (error) {
      console.error('Error getting terminal buffer:', error);
      return [];
    }
  }, []);

  const getCurrentFileContent = useCallback(() => {
    if (isV3Mode && activeFileId) {
      return fileContents.get(activeFileId) || '';
    }
    return value;
  }, [isV3Mode, activeFileId, fileContents, value]);

  const updateFileContent = useCallback((stepId: string, content: string, triggerSave: boolean = false) => {
    setFileContents(prev => {
      const newMap = new Map(prev);
      newMap.set(stepId, content);
      return newMap;
    });

    // Also update the step in automationRef
    if (automationEditor.automationRef.current?.v3Steps) {
      automationEditor.automationRef.current.v3Steps = automationEditor.automationRef.current.v3Steps.map((step: any) =>
        step.id === stepId ? { ...step, code: content } : step
      );

      // Only trigger save when explicitly requested (e.g., accepting changes, not during typing)
      if (triggerSave) {
        automationEditor.setDocVersion((d) => d + 1);
      }
    }
  }, [automationEditor]);

  const getCurrentDiffMode = useCallback(() => {
    if (isV3Mode && activeFileId) {
      return diffModes.get(activeFileId) || false;
    }
    return diffMode;
  }, [isV3Mode, activeFileId, diffModes, diffMode]);

  const setCurrentDiffMode = useCallback((mode: boolean) => {
    if (isV3Mode && activeFileId) {
      setDiffModes(prev => {
        const newMap = new Map(prev);
        newMap.set(activeFileId, mode);
        return newMap;
      });
    } else {
      setDiffMode(mode);
    }
  }, [isV3Mode, activeFileId]);

  const getCurrentOriginalContent = useCallback(() => {
    if (isV3Mode && activeFileId) {
      return originalContentsForDiff.get(activeFileId) || '';
    }
    return originalContentForDiff;
  }, [isV3Mode, activeFileId, originalContentsForDiff, originalContentForDiff]);

  const setCurrentOriginalContent = useCallback((content: string) => {
    if (isV3Mode && activeFileId) {
      setOriginalContentsForDiff(prev => {
        const newMap = new Map(prev);
        newMap.set(activeFileId, content);
        return newMap;
      });
    } else {
      setOriginalContentForDiff(content);
    }
  }, [isV3Mode, activeFileId]);

  // Handle opening a file (like browser tabs)
  const openFile = useCallback((stepId: string) => {
    // Use functional update to ensure we check the latest state and prevent duplicates
    setOpenTabs(prev => {
      // Only add if not already in the array
      if (!prev.includes(stepId)) {
        return [...prev, stepId];
      }
      return prev;
    });
    // Set as active file
    setActiveFileId(stepId);
  }, []);

  // Open a specific step in the editor when requested externally
  useEffect(() => {
    const unsubscribe = eventsEmitter.on('code-editor:open-step', (data: { stepId: string }) => {
      try {
        if (data?.stepId) {
          // Switch to code tab and open the step file
          setActiveTab('main');
          openFile(data.stepId);
        }
      } catch (e) {
        // no-op
      }
    });
    return () => unsubscribe();
  }, [openFile, setActiveTab]);

  // Handle closing a tab
  const closeTab = useCallback((stepId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }

    // Remove from open tabs
    setOpenTabs(prev => {
      const newTabs = prev.filter(id => id !== stepId);

      // If closing the active tab, switch to another tab
      if (stepId === activeFileId) {
        const closingIndex = prev.indexOf(stepId);
        if (newTabs.length > 0) {
          // Switch to the tab to the left, or the first tab if we're closing the leftmost
          const newActiveIndex = closingIndex > 0 ? closingIndex - 1 : 0;
          setActiveFileId(newTabs[newActiveIndex]);
        } else {
          // No tabs left open
          setActiveFileId(null);
        }
      }

      return newTabs;
    });
  }, [activeFileId]);

  // Apply inline diff decorations (VS Code style) without switching editors
  const applyInlineDiffDecorations = useCallback((editor: any, originalContent: string, modifiedContent: string) => {
    if (!editor) return;

    // NEVER apply decorations while user is actively typing - this can cause cursor issues
    if (isTypingRef.current) {
      console.log('[CodeEditor] Skipping decoration application - user is typing');
      return;
    }

    try {
      // Clear previous decorations
      if (diffDecorationsRef.current.length > 0) {
        editor.deltaDecorations(diffDecorationsRef.current, []);
        diffDecorationsRef.current = [];
      }

      // Calculate line-by-line differences
      const originalLines = originalContent.split('\n');
      const modifiedLines = modifiedContent.split('\n');
      const decorations: any[] = [];

      // Simple line-by-line comparison (can be enhanced with proper diff algorithm)
      const maxLines = Math.max(originalLines.length, modifiedLines.length);

      for (let i = 0; i < maxLines; i++) {
        const originalLine = originalLines[i] || '';
        const modifiedLine = modifiedLines[i] || '';

        if (originalLine !== modifiedLine) {
          const lineNumber = i + 1;

          if (i >= originalLines.length) {
            // Line was added (green background)
            decorations.push({
              range: {
                startLineNumber: lineNumber,
                startColumn: 1,
                endLineNumber: lineNumber,
                endColumn: modifiedLine.length + 1
              },
              options: {
                isWholeLine: true,
                className: 'diff-line-added',
                marginClassName: 'diff-margin-added',
                glyphMarginClassName: 'diff-glyph-added',
                linesDecorationsClassName: 'diff-lines-decoration-added'
              }
            });
          } else if (i >= modifiedLines.length) {
            // Line was deleted (red background) - but we can't show it since it's not in current content
            // Skip for now
          } else {
            // Line was modified (yellow/blue background)
            decorations.push({
              range: {
                startLineNumber: lineNumber,
                startColumn: 1,
                endLineNumber: lineNumber,
                endColumn: modifiedLine.length + 1
              },
              options: {
                isWholeLine: true,
                className: 'diff-line-modified',
                marginClassName: 'diff-margin-modified',
                glyphMarginClassName: 'diff-glyph-modified',
                linesDecorationsClassName: 'diff-lines-decoration-modified'
              }
            });
          }
        }
      }

      // Apply new decorations
      if (decorations.length > 0) {
        diffDecorationsRef.current = editor.deltaDecorations([], decorations);
      }
    } catch (error) {
      console.error('[CodeEditor] Error applying diff decorations:', error);
    }
  }, []);

  // Clear inline diff decorations
  const clearInlineDiffDecorations = useCallback((editor: any) => {
    if (!editor) return;

    try {
      if (diffDecorationsRef.current.length > 0) {
        editor.deltaDecorations(diffDecorationsRef.current, []);
        diffDecorationsRef.current = [];
      }
    } catch (error) {
      console.error('[CodeEditor] Error clearing diff decorations:', error);
    }
  }, []);

  // Function to detect manual typing
  const detectManualTyping = useCallback(() => {
    // Mark that user is actively typing
    isTypingRef.current = true;

    // Clear existing typing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set a timeout to mark typing as stopped after 1 second of no input
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;

      // When typing stops, apply inline diff decorations (VS Code style)
      const currentContent = getCurrentFileContent();
      const previousContent = isV3Mode && activeFileId
        ? originalContentsForDiff.get(activeFileId) || ''
        : lastValueRef.current;

      // If content has changed, show inline diff decorations WITHOUT switching editors
      if (currentContent !== previousContent && mainEditorRef.current) {
        // Set the original content for diff baseline
        setCurrentOriginalContent(previousContent);

        // Apply inline decorations to show changes (like VS Code)
        applyInlineDiffDecorations(mainEditorRef.current, previousContent, currentContent);

        // Mark that we're showing diffs (for UI buttons), but DON'T switch to DiffEditor
        // NOTE: This state is only used to show Accept/Reject buttons, NOT to switch editors
        setCurrentDiffMode(true);
      }
    }, 1000);

    // Only detect manual typing if auto-accept is enabled
    if (!autoAcceptChanges) {
      return;
    }

    const now = Date.now();
    const timeSinceLastTyping = now - lastTypingTimeRef.current;

    // If typing happened within the last 2 seconds AND we have a previous typing time, consider it manual
    if (timeSinceLastTyping < 2000 && lastTypingTimeRef.current > 0) {
      const wasAlreadyDetected = manualTypingDetectedRef.current;
      manualTypingDetectedRef.current = true;

      // Switch to manual mode (disable auto-accept) but show diff immediately
      if (!wasAlreadyDetected) {
        setAutoAcceptChanges(false);
        localStorage.setItem('autoAcceptChanges', 'false');
        toast.info('Manual typing detected - switched to manual review mode. Changes will be shown in diff view.');

        // Immediately show diff for current changes
        // This will be triggered by the auto-diff effect since autoAcceptChanges is now false
      }
    }

    lastTypingTimeRef.current = now;
  }, [autoAcceptChanges, setAutoAcceptChanges, getCurrentFileContent, isV3Mode, activeFileId, originalContentsForDiff, setCurrentOriginalContent, setCurrentDiffMode, applyInlineDiffDecorations]);

  // Function to detect AI/programmatic input (not manual typing)
  const detectAIInput = useCallback(() => {
    // Reset manual typing detection when AI input is detected
    manualTypingDetectedRef.current = false;
    lastTypingTimeRef.current = 0;
  }, []);

  // Function to reset manual typing detection
  const resetManualTypingDetection = useCallback(() => {
    manualTypingDetectedRef.current = false;
    lastTypingTimeRef.current = 0;
  }, []);

  // Reset manual typing detection after 10 seconds of inactivity
  useEffect(() => {
    const resetTimeout = setTimeout(() => {
      const now = Date.now();
      const timeSinceLastTyping = now - lastTypingTimeRef.current;
      
      // If no typing for 10 seconds, reset the detection
      if (timeSinceLastTyping >= 10000) {
        resetManualTypingDetection();
      }
    }, 10000);

    return () => clearTimeout(resetTimeout);
  }, [resetManualTypingDetection]);

  // Reset manual typing detection when auto-accept is turned off or on
  useEffect(() => {
    // Always reset detection when auto-accept state changes
    resetManualTypingDetection();
  }, [autoAcceptChanges, resetManualTypingDetection]);

  const hasEmptyEnvVariables = useMemo(() => {
    return environmentVariables?.some((item: any) => {
      if (item.valueFile) {
        return false;
      }
      return item.value === '';
    });
  }, [environmentVariables]);

  const { x, y, text, show, close } = useTerminalSelection(terminal);
  const [showExplanationModal, setShowExplanationModal] = useState(false);

  // Cleanup effect for component unmount
  useEffect(() => {
    return () => {
      // Cleanup auto-accept timeout
      if (autoAcceptTimeoutRef.current) {
        clearTimeout(autoAcceptTimeoutRef.current);
        autoAcceptTimeoutRef.current = null;
      }

      // Cleanup diff editor on unmount
      // Note: We don't manually dispose the diff editor as it's managed by the @monaco-editor/react library
      // The library will handle disposal automatically when the component unmounts
      if (diffEditorRef.current) {
        // Just clear the ref - React/Monaco will handle the actual disposal
        diffEditorRef.current = null;
      }

      // Cleanup main editor on unmount
      if (mainEditorRef.current) {
        // Let @monaco-editor/react handle disposal to avoid model reset races
        mainEditorRef.current = null;
      }
    };
  }, []);

  // Immediate auto-diff activation on any change
  useEffect(() => {
    const currentDiffMode = getCurrentDiffMode();
    if (isUpdatingRef.current || currentDiffMode) return;

    const currentContent = getCurrentFileContent();
    const previousContent = isV3Mode && activeFileId
      ? originalContentsForDiff.get(activeFileId) || ''
      : lastValueRef.current;

    if (currentContent !== previousContent) {
      // Check if manual typing was detected recently
      const now = Date.now();
      const timeSinceLastTyping = now - lastTypingTimeRef.current;
      const isRecentManualTyping = timeSinceLastTyping < 2000 && lastTypingTimeRef.current > 0;

      // If auto-accept is enabled and no recent manual typing, automatically accept changes with debouncing
      if (autoAcceptChanges && !isRecentManualTyping) {
        // Clear any existing timeout
        if (autoAcceptTimeoutRef.current) {
          clearTimeout(autoAcceptTimeoutRef.current);
        }

        // Debounce auto-accept to prevent rapid-fire updates
        autoAcceptTimeoutRef.current = setTimeout(() => {
          setCurrentOriginalContent(currentContent);
          if (!isV3Mode) {
            lastValueRef.current = currentContent;
          }

          // NOTE: Don't emit 'code-editor:changes-accepted' here
          // The commit is already handled by chat-window.tsx after AI generates code
          // Only emit from manual accept to avoid duplicate commits
        }, 300); // 300ms delay

        return;
      }

      // For manual typing or when auto-accept is off, WAIT until user stops typing
      // Don't activate diff mode while actively typing to prevent cursor jumping
      if (isTypingRef.current) {
        // User is actively typing - don't activate diff mode yet
        // The typing timeout will trigger diff mode activation when they stop
        return;
      }

      // User has stopped typing - safe to activate diff mode
      setCurrentOriginalContent(previousContent);
      if (mainEditorRef.current) {
        savedCursorPositionRef.current = mainEditorRef.current.getPosition();
        savedSelectionRef.current = mainEditorRef.current.getSelection();

        // Apply inline diff decorations to show changes (VS Code style)
        applyInlineDiffDecorations(mainEditorRef.current, previousContent, currentContent);
      }

      setCurrentDiffMode(true);
      // setActiveTab('main');

      // DON'T update baseline here - only update when user accepts/rejects changes
      // This ensures hasDifferences remains true and Accept/Reject buttons are shown
      // if (!isV3Mode) {
      //   lastValueRef.current = currentContent;
      // }

      // Reset manual typing detection for AI/programmatic changes
      detectAIInput();
    }
    // NOTE: fileContents and value are intentionally NOT in dependencies
    // They're accessed via getCurrentFileContent(), and adding them causes
    // the effect to fire during typing (when updateFileContent updates state),
    // which can interrupt the user and cause cursor jumping during backspace
  }, [getCurrentFileContent, getCurrentDiffMode, isV3Mode, activeFileId, originalContentsForDiff, setActiveTab, autoAcceptChanges, detectAIInput, getCurrentOriginalContent, setCurrentOriginalContent, setCurrentDiffMode, applyInlineDiffDecorations]);

  // Force remount when switching between side-by-side and unified
  useEffect(() => {
    if (diffMode) {
      // setForceRemount(prev => prev + 1); // Disabled to prevent infinite loop
    }
  }, [showSideBySide, diffMode]);

  // Force side-by-side editor to update when switching modes
  useEffect(() => {
    if (diffMode && diffEditorRef.current) {
      setTimeout(() => {
        const editor = diffEditorRef.current;
        if (editor) {
          // Force layout
          editor.layout();

          // Update options based on current mode
          editor.updateOptions({
            renderSideBySide: showSideBySide,
            enableSplitViewResizing: showSideBySide
          });

          // Force another layout after option update
          setTimeout(() => {
            editor.layout();
          }, 100);
        }
      }, 100);
    }
  }, [showSideBySide, diffMode]);

  useEffect(() => {
    // Handle AI-generated code - update file content first, then let diff mode show changes
    const unsubscribe = eventsEmitter.on('code-editor:ai-code-generated', (code: string) => {
      // Switch to code tab to show the changes
      if (activeTab !== 'main') {
        setActiveTab('main');
      }
      
      // Save original content before updating (for diff highlighting)
      const currentContent = getCurrentFileContent();
      
      // Set original content as baseline for diff BEFORE updating
      if (isV3Mode && activeFileId) {
        setCurrentOriginalContent(currentContent);
      } else {
        setOriginalContentForDiff(currentContent);
        lastValueRef.current = currentContent;
      }
      
      // Update the file content
      if (isV3Mode && activeFileId) {
        updateFileContent(activeFileId, code);
      } else {
        // Legacy single-file mode
        onChange?.(code);
      }

      // Activate diff mode to highlight differences (unless auto-accept is enabled)
      if (!autoAcceptChanges) {
        // Activate diff mode to show changes
        setTimeout(() => {
          setCurrentDiffMode(true);
          // Apply inline diff decorations if not in diff editor mode
          if (mainEditorRef.current && !getCurrentDiffMode()) {
            applyInlineDiffDecorations(mainEditorRef.current, currentContent, code);
          }
        }, 100);
      }

      // If in diff mode, also update the diff editor's modified side
      if (getCurrentDiffMode() && diffEditorRef.current) {
        const editor = diffEditorRef.current.getModifiedEditor?.();
        if (editor) {
          editor.setValue(code);
        }
      }

      // If not in diff mode, update main editor
      if (!getCurrentDiffMode() && mainEditorRef.current) {
        const position = mainEditorRef.current.getPosition();
        const scrollTop = mainEditorRef.current.getScrollTop();

        isUpdatingRef.current = true;
        mainEditorRef.current.setValue(code);

        // Restore cursor position
        if (position) {
          mainEditorRef.current.setPosition(position);
          mainEditorRef.current.setScrollTop(scrollTop);
        }

        setTimeout(() => {
          isUpdatingRef.current = false;
        }, 100);
      }
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [isV3Mode, activeFileId, updateFileContent, onChange, getCurrentDiffMode, autoAcceptChanges, getCurrentFileContent, setCurrentOriginalContent, setOriginalContentForDiff, setCurrentDiffMode, applyInlineDiffDecorations, activeTab, setActiveTab]);

  // Handle refresh all files event (e.g., when restoring a version)
  useEffect(() => {
    const unsubscribe = eventsEmitter.on('code-editor:refresh-all-files', () => {
      console.log('[CodeEditor] Received refresh-all-files event, isV3Mode:', isV3Mode);
      // Force a complete refresh of all file contents from automationRef
      if (isV3Mode && automationEditor.automationRef.current?.v3Steps) {
        const steps = automationEditor.automationRef.current.v3Steps;
        console.log('[CodeEditor] Refreshing', steps.length, 'files');
        const newFileContents = new Map<string, string>();

        steps.forEach((step: any) => {
          if (step.id && step.code !== undefined) {
            newFileContents.set(step.id, step.code);
            console.log('[CodeEditor] Set file content for:', step.id, 'length:', step.code.length);
          }
        });

        // Update file contents first
        setFileContents(newFileContents);
        console.log('[CodeEditor] Updated fileContents state');

        // Also update original contents to match restored code (reset baseline for diff)
        setOriginalContentsForDiff(prev => {
          const newOriginalContents = new Map(prev);
          steps.forEach((step: any) => {
            if (step.id && step.code !== undefined) {
              newOriginalContents.set(step.id, step.code);
            }
          });
          return newOriginalContents;
        });

        // Exit diff mode if active, since we're restoring to a known good state
        setDiffModes(prev => {
          const newDiffModes = new Map(prev);
          steps.forEach((step: any) => {
            if (step.id) {
              newDiffModes.set(step.id, false);
            }
          });
          return newDiffModes;
        });

        // Force update the visible editor AFTER state updates
        // Use setTimeout to ensure state has propagated
        setTimeout(() => {
          console.log('[CodeEditor] Forcing editor update for active file:', activeFileId);
          if (activeFileId) {
            const currentStep = steps.find((s: any) => s.id === activeFileId);
            if (currentStep && currentStep.code !== undefined) {
              console.log('[CodeEditor] Found step for active file, code length:', currentStep.code.length);

              // Clear any inline diff decorations first
              if (mainEditorRef.current) {
                clearInlineDiffDecorations(mainEditorRef.current);
              }

              // Update main editor if it exists
              if (mainEditorRef.current) {
                console.log('[CodeEditor] Updating main editor with new code');
                const currentEditorContent = mainEditorRef.current.getValue();

                // Only update if content is actually different
                if (currentEditorContent !== currentStep.code) {
                  isUpdatingRef.current = true;

                  // Save scroll position
                  const scrollTop = mainEditorRef.current.getScrollTop();

                  // Update editor content
                  mainEditorRef.current.setValue(currentStep.code || '');

                  // Restore scroll position
                  mainEditorRef.current.setScrollTop(scrollTop);

                  // Update internal refs to prevent re-triggering
                  lastEditorContentRef.current = currentStep.code;
                  lastExternalContentRef.current = currentStep.code;

                  setTimeout(() => {
                    isUpdatingRef.current = false;
                    console.log('[CodeEditor] Main editor update complete');
                  }, 100);
                } else {
                  console.log('[CodeEditor] Editor content already matches, skipping update');
                }
              }

              // Also update diff editor if it exists (though we're exiting diff mode above)
              if (diffEditorRef.current) {
                const modifiedEditor = diffEditorRef.current.getModifiedEditor?.();
                if (modifiedEditor) {
                  console.log('[CodeEditor] Also updating diff editor modified side');
                  const currentDiffContent = modifiedEditor.getValue();

                  if (currentDiffContent !== currentStep.code) {
                    isUpdatingRef.current = true;
                    modifiedEditor.setValue(currentStep.code || '');
                    setTimeout(() => {
                      isUpdatingRef.current = false;
                    }, 100);
                  }
                }
              }
            } else {
              console.log('[CodeEditor] Could not find step for active file ID:', activeFileId);
            }
          } else {
            console.log('[CodeEditor] No active file to update');
          }
        }, 150); // Give React time to update state
      } else {
        console.log('[CodeEditor] Not in v3 mode or no v3Steps available');
      }
    });

    return () => unsubscribe();
  }, [isV3Mode, activeFileId, automationEditor.automationRef, clearInlineDiffDecorations]);

  // Handle real-time step code updates during streaming (v3 mode)
  useEffect(() => {
    const unsubscribe = eventsEmitter.on('code-editor:step-code-updated', (data: { stepId: string; code: string }) => {
      // Switch to code tab to show the changes
      if (activeTab !== 'main') {
        setActiveTab('main');
      }
      
      // Open the file if not already open
      // Use functional update pattern to prevent race conditions when multiple files update
      setOpenTabs(prev => {
        if (!prev.includes(data.stepId)) {
          // Update ref immediately to prevent duplicate opens from subsequent events
          openTabsRef.current = [...prev, data.stepId];
          return [...prev, data.stepId];
        }
        return prev;
      });
      
      // Set as active file (use ref for current value)
      if (activeFileIdRef.current !== data.stepId) {
        setActiveFileId(data.stepId);
        activeFileIdRef.current = data.stepId;
      }

      // Check if we already have an original content saved for diff
      const existingOriginal = originalContentsForDiffRef.current.get(data.stepId);
      
      // Get current content from fileContents (this should have the original code before first update)
      // fileContents is initialized from v3Steps when component loads, so it should have the original code
      // IMPORTANT: Use the ref to get the CURRENT value at the time of the event
      const currentContent = fileContentsRef.current.get(data.stepId);
      
      // If fileContents doesn't have it yet (newly created step), we can't preserve original
      // In that case, the "original" is empty, and we'll just show the new code
      // Only capture original content on FIRST update (when it hasn't been set yet)
      // AND only if we have existing content (not a brand new step)
      if (!existingOriginal && currentContent && currentContent.trim() !== '') {
        // Save the original code as the baseline for diff
        // This captures the code that existed BEFORE streaming started
        setOriginalContentsForDiff(prev => {
          const newMap = new Map(prev);
          newMap.set(data.stepId, currentContent);
          return newMap;
        });
        // Update ref immediately so subsequent updates use the correct original
        originalContentsForDiffRef.current.set(data.stepId, currentContent);
      }
      
      // Use existing original or the one we just captured (or empty if new step)
      const originalForDiff = existingOriginal || currentContent || '';

      // Update the file content in state
      updateFileContent(data.stepId, data.code);

      // Activate diff mode to highlight differences (unless auto-accept is enabled)
      if (!autoAcceptChanges && originalForDiff && originalForDiff !== data.code) {
        // Activate diff mode for this file
        setDiffModes(prev => {
          const newMap = new Map(prev);
          newMap.set(data.stepId, true);
          return newMap;
        });
        
        // Apply inline diff decorations if main editor is active
        setTimeout(() => {
          if (activeFileIdRef.current === data.stepId && mainEditorRef.current) {
            const original = originalContentsForDiffRef.current.get(data.stepId) || originalForDiff;
            applyInlineDiffDecorations(mainEditorRef.current, original, data.code);
          }
        }, 100);
      }

      // If this is the active file, update the editor immediately for real-time streaming
      if (data.stepId === activeFileIdRef.current) {
        // DON'T update editor if user is actively typing - prevents character loss and cursor jumping
        if (isTypingRef.current) {
          console.log('[CodeEditor] Skipping step-code-updated because user is typing');
          return;
        }

        const editor = mainEditorRef.current || diffEditorRef.current?.getModifiedEditor?.();
        if (!editor) return;

        // Only update if the new code is actually different from current editor content
        const currentEditorContent = editor.getValue();
        if (currentEditorContent === data.code) {
          return;
        }

        // Save cursor position
        const position = editor.getPosition();
        const scrollTop = editor.getScrollTop();

        isUpdatingRef.current = true;
        editor.setValue(data.code);

        // Only scroll to bottom if this looks like AI streaming (content is growing)
        // Don't scroll if content is similar length (likely a rollback or manual edit)
        const isAIStreaming = data.code.length > currentEditorContent.length + 10;

        if (isAIStreaming) {
          // Scroll to bottom to show new content being generated by AI
          setTimeout(() => {
            const lineCount = editor.getModel()?.getLineCount();
            if (lineCount) {
              editor.revealLine(lineCount);
            }
          }, 10);
        } else {
          // Restore cursor position for non-streaming updates (like rollback)
          setTimeout(() => {
            if (position) {
              editor.setPosition(position);
            }
            if (scrollTop !== undefined) {
              editor.setScrollTop(scrollTop);
            }
          }, 10);
        }

        setTimeout(() => {
          isUpdatingRef.current = false;
        }, 100);
      }
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [isV3Mode, updateFileContent, getCurrentDiffMode, setActiveFileId, setOriginalContentsForDiff, setDiffModes, autoAcceptChanges, applyInlineDiffDecorations, activeTab, setActiveTab, automationEditor.automationRef]);

  // Track the last known external content to avoid unnecessary updates
  const lastExternalContentRef = useRef<string>('');
  const lastEditorContentRef = useRef<string>('');

  // Update editor content when file tab changes (not during typing)
  useEffect(() => {
    if (!mainEditorRef.current || isUpdatingRef.current) {
      return;
    }

    // NEVER update editor content while user is typing - this causes cursor jumping
    if (isTypingRef.current) {
      console.log('[CodeEditor] Skipping file content update - user is typing');
      return;
    }

    const currentContent = getCurrentFileContent();

    // Only update when switching files (activeFileId changes), not during typing
    if (currentContent !== lastEditorContentRef.current) {
      lastExternalContentRef.current = currentContent;
      lastEditorContentRef.current = currentContent;

      // Save cursor position
      const position = mainEditorRef.current.getPosition();
      const scrollTop = mainEditorRef.current.getScrollTop();

      // Update value
      isUpdatingRef.current = true;
      mainEditorRef.current.setValue(currentContent);

      // Restore cursor position
      if (position) {
        mainEditorRef.current.setPosition(position);
        mainEditorRef.current.setScrollTop(scrollTop);
      }

      setTimeout(() => {
        isUpdatingRef.current = false;
      }, 100);
    }
  }, [activeFileId]); // Only trigger on file switch, not on content changes

  // Start diff mode with proper cleanup
  const startDiffMode = useCallback(() => {
    // Check if already in diff mode
    if (getCurrentDiffMode()) {
      toast.info('Diff mode is already active.');
      return;
    }

    // Save cursor position and selection from main editor before entering diff mode
    if (mainEditorRef.current) {
      savedCursorPositionRef.current = mainEditorRef.current.getPosition();
      savedSelectionRef.current = mainEditorRef.current.getSelection();
    }

    // Clear existing diff editor ref (let React handle disposal)
    if (diffEditorRef.current) {
      // Don't manually dispose - React will handle it through component unmount
      diffEditorRef.current = null;
    }

    // Get original and current content using the proper helpers
    const currentContent = getCurrentFileContent();
    const originalContent = getCurrentOriginalContent();

    // If no original content set, use current content as baseline
    if (!originalContent) {
      setCurrentOriginalContent(currentContent);
    }

    // Activate diff mode using the proper helper
    setCurrentDiffMode(true);
    // setActiveTab('main');

    if (originalContent === currentContent) {
      toast.info('Diff mode activated. Make changes to see differences.');
    } else {
      toast.info('Diff mode activated - changes detected!');
    }
  }, [getCurrentDiffMode, getCurrentFileContent, getCurrentOriginalContent, setCurrentOriginalContent, setCurrentDiffMode, setActiveTab]);

  // Exit diff mode with proper cleanup
  const exitDiffMode = useCallback(() => {
    // Save cursor position and selection from diff editor before exiting
    if (diffEditorRef.current) {
      try {
        const modifiedEditor = diffEditorRef.current.getModifiedEditor?.();
        if (modifiedEditor) {
          savedCursorPositionRef.current = modifiedEditor.getPosition();
          savedSelectionRef.current = modifiedEditor.getSelection();
        }
      } catch (error) {
        console.warn('Error saving cursor position from diff editor:', error);
      }

      // Dispose the diff editor instance gracefully and let Monaco clean up the models.
      try {
        diffEditorRef.current.dispose();
      } catch (error) {
        console.warn('Error disposing diff editor instance:', error);
      } finally {
        diffEditorRef.current = null;
      }
    }

    // Exit diff mode for the current file FIRST (before disposing)
    if (isV3Mode && activeFileId) {
      setDiffModes(prev => {
        const newMap = new Map(prev);
        newMap.set(activeFileId, false);
        return newMap;
      });
    } else {
      setDiffMode(false);
      // Update the baseline to current content when exiting diff mode
      setOriginalContentForDiff(value);
      lastValueRef.current = value;
    }

    // Clear diff editor ref AFTER state change and disposal
    setTimeout(() => {
      // Just clear the ref - we already disposed the models above
      diffEditorRef.current = null;

      // Restore cursor position and selection in main editor
      if (mainEditorRef.current && (savedCursorPositionRef.current || savedSelectionRef.current)) {
        if (savedCursorPositionRef.current) {
          mainEditorRef.current.setPosition(savedCursorPositionRef.current);
          mainEditorRef.current.revealLine(savedCursorPositionRef.current.lineNumber);
        }
        if (savedSelectionRef.current) {
          mainEditorRef.current.setSelection(savedSelectionRef.current);
        }
        mainEditorRef.current.focus();
      }
    }, 100);
  }, [isV3Mode, activeFileId, value]);

  useEffect(() => {
    const unsubscribe = eventsEmitter.on('code-editor:diff-mode', (diffMode: boolean) => {
      setDiffMode(diffMode === true);
      if (diffMode) {
        startDiffMode();
      } else {
        setOriginalContentForDiff(value);
        lastValueRef.current = value;
        exitDiffMode();
      }
    });
    return () => unsubscribe();
  }, [value, exitDiffMode, startDiffMode]);

  // Accept changes in diff mode
  const acceptDiffChanges = useCallback(() => {
    const currentContent = getCurrentFileContent();

    // Ensure we have content before proceeding
    if (!currentContent) {
      toast.error("Error",'No content to accept');
      return;
    }

    // Clear inline diff decorations
    if (mainEditorRef.current) {
      clearInlineDiffDecorations(mainEditorRef.current);
    }

    // Update v3 steps in automationRef if in v3 mode
    if (isV3Mode && activeFileId) {
      updateFileContent(activeFileId, currentContent);
    }

    // Update the original content to the current state for future diffs
    setCurrentOriginalContent(currentContent);
    if (!isV3Mode) {
      lastValueRef.current = currentContent;
    }

    // Exit diff mode after updating the baseline
    exitDiffMode();

    // Trigger save by incrementing docVersion for v3 mode
    if (isV3Mode && activeFileId) {
      automationEditor.setDocVersion((d) => d + 1);
    }

    // Emit event for version control with code and automation ID
    // The event handler will check for pending commit message scoped to this automation
    eventsEmitter.emit('code-editor:changes-accepted', {
      code: currentContent
    });

    toast.success('Changes accepted');
  }, [getCurrentFileContent, setCurrentOriginalContent, isV3Mode, activeFileId, exitDiffMode, automationEditor, updateFileContent, clearInlineDiffDecorations]);

  // Reject changes in diff mode
  const rejectDiffChanges = useCallback(() => {
    isUpdatingRef.current = true;
    const originalContent = getCurrentOriginalContent();

    // Ensure we have content before proceeding
    if (!originalContent) {
      toast.error("Error",'No original content to restore');
      isUpdatingRef.current = false;
      return;
    }

    if (isV3Mode && activeFileId) {
      // Restore original content for this file
      updateFileContent(activeFileId, originalContent);
    } else {
      // Legacy single file mode
      onChange?.(originalContent);
    }

    // Important: Update lastValueRef to the rejected content so next auto-diff works correctly
    setTimeout(() => {
      if (!isV3Mode) {
        lastValueRef.current = originalContent;
      }
      isUpdatingRef.current = false;
    }, 200);

    exitDiffMode();
    toast.success('Changes rejected');
  }, [getCurrentOriginalContent, isV3Mode, activeFileId, updateFileContent, onChange, exitDiffMode]);

  // Handle main editor changes - let auto-diff effect handle the detection
  const handleMainEditorChange = useCallback((newValue: string | undefined) => {
    if (newValue !== undefined && !isUpdatingRef.current) {
      // Track this as the last external content to prevent loops
      lastExternalContentRef.current = newValue;
      lastEditorContentRef.current = newValue;

      // Use a small debounce to batch rapid changes while typing
      if (isTypingRef.current) {
        // Clear any existing timeout
        if (autoAcceptTimeoutRef.current) {
          clearTimeout(autoAcceptTimeoutRef.current);
        }

        // Debounce updates while typing
        autoAcceptTimeoutRef.current = setTimeout(() => {
          if (isV3Mode && activeFileId) {
            // Update file content for specific step
            updateFileContent(activeFileId, newValue);
          } else {
            // Legacy single file mode
            onChange?.(newValue);
          }
        }, 150); // Small debounce while typing
      } else {
        // Not typing - update immediately
        if (isV3Mode && activeFileId) {
          // Update file content for specific step
          updateFileContent(activeFileId, newValue);
        } else {
          // Legacy single file mode
          onChange?.(newValue);
        }
      }
      // Don't update lastValueRef here - let the auto-diff effect handle it
    }
  }, [onChange, isV3Mode, activeFileId, updateFileContent]);

  
  const editorBeforMount = (monaco: any) => {
    // Define custom theme for light mode with white background
    monaco.editor.defineTheme('light-custom', {
        base: 'vs',
        inherit: true,
        rules: [],
        colors: {
        'editor.background': '#FFFFFF',
        'editor.foreground': '#000000',
        'editorLineNumber.foreground': '#999999',
        'editorLineNumber.activeForeground': '#000000',
        'editor.lineHighlightBackground': '#F5F5F5',
        'editorCursor.foreground': '#000000',
        'editor.selectionBackground': '#ADD6FF',
        'editor.inactiveSelectionBackground': '#E5EBF1'
        }
    });

    // Define custom theme for dark mode
    monaco.editor.defineTheme('dark-custom', {
        base: 'vs-dark',
        inherit: true,
        rules: [],
        colors: {
        'editor.background': '#0d1117',
        'editor.foreground': '#c9d1d9',
        'editorLineNumber.foreground': '#6e7681',
        'editorLineNumber.activeForeground': '#c9d1d9',
        'editor.lineHighlightBackground': '#161b22',
        'editorCursor.foreground': '#c9d1d9',
        'editor.selectionBackground': '#264f78',
        'editor.inactiveSelectionBackground': '#1c2c3d'
        }
    });
  }
  // Handle diff editor mount with debouncing
  const handleDiffEditorMount = useCallback((editor: any, monaco: any) => {
    diffEditorRef.current = editor;

    // Initialize diff editor

    // Force layout refresh - Monaco Editor best practice
    setTimeout(() => {
      if (!editor) return; // Safety check
      
      editor.layout();
      
      // Restore cursor position and selection after diff editor is ready
      if (savedCursorPositionRef.current || savedSelectionRef.current) {
        const modifiedEditor = editor.getModifiedEditor?.();
        if (modifiedEditor) {
          if (savedCursorPositionRef.current) {
            modifiedEditor.setPosition(savedCursorPositionRef.current);
            modifiedEditor.revealLine(savedCursorPositionRef.current.lineNumber);
          }
          if (savedSelectionRef.current) {
            modifiedEditor.setSelection(savedSelectionRef.current);
          }
          // Focus the modified editor to ensure cursor is visible
          modifiedEditor.focus();
        }
      } else {
        // If no saved position, just focus the modified editor
        const modifiedEditor = editor.getModifiedEditor?.();
        if (modifiedEditor) {
          modifiedEditor.focus();
        }
      }
    }, 100);

    // Additional layout call for side-by-side mode
    if (!automationEditor.showChatWindow) {
      setTimeout(() => {
        editor.layout();
        
        // Force side-by-side options
        editor.updateOptions({
          renderSideBySide: true,
          enableSplitViewResizing: true
        });
        
        // Simplified DOM setup - let Monaco handle layout
        setTimeout(() => {
          editor.layout();
        }, 50);
        
        // Force another layout after DOM manipulation
        setTimeout(() => {
          editor.layout();
          
          // Try to force Monaco to recreate the split view
          editor.updateOptions({
            renderSideBySide: true,
            enableSplitViewResizing: true,
            renderIndicators: true,
            ignoreTrimWhitespace: false,
            renderOverviewRuler: false
          });
          
          // Ensure original content is set
          const originalEditor = editor.getOriginalEditor?.();
          if (originalEditor) {
            const currentOriginalContent = originalEditor.getValue();
            const expectedOriginal = getCurrentOriginalContent();
            if (!currentOriginalContent || currentOriginalContent.length === 0) {
              originalEditor.setValue(expectedOriginal);
            }
          }
          
          // Force layout again after options update
          setTimeout(() => {
            editor.layout();
            
            // Layout verification complete
          }, 50);
        }, 100);
      }, 300);
    }

    // Listen for changes in modified editor with debouncing
    if (!editor) return; // Safety check
    
    const modifiedEditor = editor.getModifiedEditor?.();
    const originalEditor = editor.getOriginalEditor?.();
    
    if (modifiedEditor && originalEditor) {
      // Check if original editor has content
      const originalContent = originalEditor.getValue();
      const currentOriginal = getCurrentOriginalContent();
      if (!originalContent || originalContent.length === 0) {
        // Force set the original content
        const originalModel = originalEditor.getModel();
        if (originalModel) {
          originalModel.setValue(currentOriginal);
        }
      }
    }

    if (modifiedEditor) {
      let changeTimeout: NodeJS.Timeout;

      // Add keyboard event listeners to detect manual typing in diff editor
      modifiedEditor.onKeyDown((e: any) => {
        // Detect manual typing on regular keys (not special keys like Ctrl, Alt, etc.)
        if (e.keyCode >= 32 && e.keyCode <= 126) { // Printable characters
          detectManualTyping();
        }
      });

      modifiedEditor.onDidChangeModelContent(() => {
        if (isUpdatingRef.current) return;

        // Don't detect manual typing through content changes - only through keyboard events
        // This prevents AI input from being detected as manual typing

        clearTimeout(changeTimeout);
        changeTimeout = setTimeout(() => {
          const content = modifiedEditor.getValue();
          const currentContent = getCurrentFileContent();

          if (content !== currentContent) {
            if (isV3Mode && activeFileId) {
              // Update file content for specific step WITHOUT triggering saves
              updateFileContent(activeFileId, content);
            } else {
              // Legacy single file mode
              if (onChange) {
                onChange(content);
              }
            }
          }
        }, 150); // Reduced debounce for more responsive typing
      });
    }

    // Sync diff editor with current value when entering diff mode
    const currentDiffMode = getCurrentDiffMode();
    const currentContent = getCurrentFileContent();

    if (currentDiffMode && modifiedEditor) {
      const currentModifiedContent = modifiedEditor.getValue();
      if (currentModifiedContent !== currentContent) {
        isUpdatingRef.current = true;
        modifiedEditor.setValue(currentContent);
        setTimeout(() => {
          isUpdatingRef.current = false;
        }, 200);
      }
    }
  }, [getCurrentFileContent, getCurrentDiffMode, isV3Mode, activeFileId, updateFileContent, onChange, showSideBySide]);

  // Calculate diff stats
  // Check if there are differences between current and original content
  const hasDifferences = useMemo(() => {
    const currentContent = getCurrentFileContent();
    const currentOriginal = getCurrentOriginalContent();
    return currentOriginal !== currentContent;
  }, [getCurrentFileContent, getCurrentOriginalContent]);

  // Handle check for unsaved changes (for run/resume save-before-execute)
  useEffect(() => {
    const unsubscribeCheck = eventsEmitter.on('code-editor:check-has-differences', () => {
      const hasChanges = hasDifferences;
      eventsEmitter.emit('code-editor:has-differences-response', hasChanges);
    });

    const unsubscribeAccept = eventsEmitter.on('code-editor:accept-changes-before-run', () => {
      if (hasDifferences) {
        acceptDiffChanges();
      }
    });

    return () => {
      unsubscribeCheck();
      unsubscribeAccept();
    };
  }, [hasDifferences, acceptDiffChanges]);

  // Legacy: hasDiffChanges includes diff mode check for backward compatibility
  const hasDiffChanges = useMemo(() => {
    const currentDiffMode = getCurrentDiffMode();
    return currentDiffMode && hasDifferences;
  }, [getCurrentDiffMode, hasDifferences]);

  const diffStats = useMemo(() => {
    if (!hasDiffChanges) return null;

    const currentContent = getCurrentFileContent();
    const currentOriginal = getCurrentOriginalContent();
    const originalLines = currentOriginal.split('\n');
    const modifiedLines = currentContent.split('\n');

    return {
      originalLines: originalLines.length,
      modifiedLines: modifiedLines.length,
      different: currentOriginal !== currentContent
    };
  }, [hasDiffChanges, getCurrentFileContent, getCurrentOriginalContent]);

  // Get stable modified content for DiffEditor
  // Only update when not actively typing to prevent cursor jumping
  const diffEditorModifiedContent = useMemo(() => {
    // If typing, don't update the prop - let the editor's internal change handler manage updates
    // This prevents React from passing new props that would reset the cursor
    if (isTypingRef.current) {
      return lastDiffContentUpdateRef.current || getCurrentFileContent();
    }

    const content = getCurrentFileContent();
    lastDiffContentUpdateRef.current = content;
    return content;
  }, [getCurrentFileContent()]);

  return (
    <>
      <Tabs 
        className="canvas-tabs"
        items={[
          { key: 'automations', label: 'Automations', },
          {
            key: "main",
            label: (
              <span className="flex items-center gap-2">
                Code Editor
                {hasDiffChanges && <span
                  className="inline-flex w-[20px] h-[20px] justify-center items-center rounded-full text-white text-xs"
                  style={{ backgroundColor: '#52c41a' }}
                >
                  !
                </span>}
              </span>
            )
          },
          {
            key: "env",
            label: (
              <span className="flex items-center gap-2">
                Environment Variables
                {hasEmptyEnvVariables && <span
                  className="inline-flex w-[20px] h-[20px] justify-center items-center rounded-full text-white pl-[1px]"
                  style={{ backgroundColor: 'var(--progress-indicator-yellow)' }}
                >
                  !
                </span>}
              </span>
            )
          },
          { key: "dependencies", label: "Dependencies" },
          { key: "logs", label: "Logs" },
        ]}
        activeKey={activeTab}
        onChange={(key: string) => {
          setActiveTab(key);
        }}
      />
      {/*  ${activeTab === 'automations' ? 'height-full' : ''}*/}
      <div style={{ height: 'calc(100% - 155px)' }} className={`px-[40px]`}>
        {/* <Segmented
          className="output-tabs"
          size="large"
          shape="round"
          options={[
            { value: 'automations', label: 'Automations' },
            {
              value: "main",
              label: (
                <span className="flex items-center gap-2">
                  Code Editor
                  {hasDiffChanges && <span
                    className="inline-flex w-[20px] h-[20px] justify-center items-center rounded-full text-white text-xs"
                    style={{ backgroundColor: '#52c41a' }}
                  >
                    !
                  </span>}
                </span>
              )
            },
            {
              value: "env",
              label: (
                <span className="flex items-center gap-2">
                  Environment Variables
                  {hasEmptyEnvVariables && <span
                    className="inline-flex w-[20px] h-[20px] justify-center items-center rounded-full text-white pl-[1px]"
                    style={{ backgroundColor: 'var(--progress-indicator-yellow)' }}
                  >
                    !
                  </span>}
                </span>
              )
            },
            { value: "dependencies", label: "Dependencies" },
            { value: "logs", label: "Logs" },
          ]}
          onChange={(value) => {
            setActiveTab(value);
          }}
          value={activeTab}
        /> */}


      <div style={{ width: '100%', height: 'calc(100%)', display: activeTab === 'automations' ? 'block' : 'none', overflowY: 'auto' }}>
        <Automation />
      </div>

      <div className="list-item-background-color" style={{ borderRadius: '12px', width: '100%', height: 'calc(100% - 20px)', display: activeTab === 'main' ? 'flex' : 'none', flexDirection: 'row' }}>
        {/* Files Sidebar for V3 Mode */}
        {isV3Mode && v3Steps.length > 0 && (
          <div className="editor-files-sidebar">
            {/* Files Header */}
            <div className="editor-files-sidebar-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="editor-files-sidebar-header-title">
                Files
              </span>
              <Tooltip title="Download files">
                <Button
                  type="text"
                  size="small"
                  icon={<Download size={16} />}
                  onClick={async () => {
                    const automation = automationEditor.automationRef.current;
                    if (!automation) return;

                    try {
                      const zip = new JSZip();
                      const automationTitle = (automation.title || 'automation').replace(/[^a-z0-9]/gi, '_');

                      if (isV3Mode && v3Steps.length > 0) {
                        // Add all files to zip in v3 mode
                        v3Steps.forEach((step: any) => {
                          const content = fileContents.get(step.id) || step.code || '';
                          const fileName = `${step.name}.js`;
                          zip.file(fileName, content);
                        });
                      } else {
                        // Add single file to zip in non-v3 mode
                        const content = value || automation.code || '';
                        const fileName = `${automationTitle}.js`;
                        zip.file(fileName, content);
                      }

                      // Generate zip file
                      const zipBlob = await zip.generateAsync({ type: 'blob' });
                      const url = URL.createObjectURL(zipBlob);
                      const link = document.createElement('a');
                      link.href = url;
                      link.download = `${automationTitle}.zip`;
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                      URL.revokeObjectURL(url);
                      
                      const fileCount = isV3Mode && v3Steps.length > 0 ? v3Steps.length : 1;
                      toast.success(`Downloaded ${fileCount} file(s) as ${automationTitle}.zip`);
                    } catch (error) {
                      toast.error('Failed to download files');
                    }
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: '28px',
                    width: '28px',
                    padding: 0
                  }}
                />
              </Tooltip>
            </div>

            {/* File List */}
            <div className="editor-files-sidebar-file-list">
              {v3Steps.map((step: any, index: number) => {
                const isOpen = openTabs.includes(step.id);
                const isActive = activeFileId === step.id;
                const stepDiffMode = diffModes.get(step.id) || false;
                // Show change indicator whenever content differs from original, regardless of diff mode
                const hasChanges = originalContentsForDiff.get(step.id) !== fileContents.get(step.id);

                return (
                  <div
                    key={step.id}
                    onClick={() => openFile(step.id)}
                    className="editor-files-sidebar-file-list-item"
                    style={{
                      background: isActive ? 'var(--tertiary-background-color)' : undefined,
                    }}
                  >
                    {/*  style={{
                      color: theme === 'dark' ? '#c9d1d9' : '#000000',
                      fontFamily: "'DM Sans'",
                      fontStyle: 'normal',
                      fontWeight: 400,
                      fontSize: '14px',
                      lineHeight: '15px',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }} */}
                    <span className="editor-files-sidebar-file-list-item-title">
                      {step.name}.js
                    </span>
                    {hasChanges && (
                      <span style={{
                        position: 'absolute',
                        right: '10px',
                        width: '6px',
                        height: '6px',
                        background: '#52c41a',
                        borderRadius: '50%'
                      }} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Editor Area */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          height: '100%',
          overflow: 'hidden'
        }}>
          {/* File Tabs - Only show open tabs */}
          {isV3Mode && openTabs.length > 0 && (
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-start',
              padding: '0px',
              gap: '10px',
              width: '100%',
              height: '36px',
              background: theme === 'dark' ? '#000000' : '#E5E9F0',
              flexShrink: 0,
              borderTopRightRadius: '12px',
            }}>
              <div style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                padding: '0px',
                height: '36px',
                overflowX: 'auto',
                flex: 1
              }}>
                {openTabs.map((stepId: string) => {
                  const step = v3Steps.find((s: any) => s.id === stepId);
                  if (!step) return null;

                  const isActive = activeFileId === stepId;

                  return (
                    <div
                      key={stepId}
                      onClick={() => setActiveFileId(stepId)}
                      style={{
                        display: 'flex',
                        flexDirection: 'row',
                        justifyContent: 'center',
                        alignItems: 'center',
                        padding: '0px 12px',
                        gap: '8px',
                        minWidth: '123px',
                        height: '36px',
                        background: isActive
                          ? 'var(--list-item-background-color)'
                          : 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <span className="text-color" style={{
                        fontWeight: isActive ? 500 : 400,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {step.name}.js
                      </span>
                      <X
                        style={{
                          width: '14px',
                          height: '14px',
                          flexShrink: 0,
                          cursor: 'pointer',
                          color: theme === 'dark' ? '#8b949e' : '#57606a'
                        }}
                        onClick={(e) => closeTab(stepId, e)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Editor Controls */}
          <div className="editor-controls">
            {/* Auto Accept Checkbox */}
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '6px'
            }}>
              {automationEditor.showChatWindow && (
                <Tooltip title="Hide chat window">
                  <SquareSplitHorizontalIcon
                    className="cursor-pointer mr-[10px]"
                    onClick={() => {
                      automationEditor.setShowChatWindow(
                        !automationEditor.showChatWindow
                      );
                    }}
                  />
                </Tooltip>
              )}
              {!automationEditor.showChatWindow && (
                <Tooltip title="Show chat window">
                  <PanelLeft
                    size={20}
                    className="cursor-pointer mr-[10px]"
                    onClick={() => {
                      automationEditor.setShowChatWindow(
                        !automationEditor.showChatWindow
                      );
                    }}
                  />
                </Tooltip>
              )}
              <Tooltip title={manualTypingDetectedRef.current ? "Manual typing detected - you can still enable auto-accept if desired" : "When enabled, automatically accepts all code changes without showing diff mode"}>
                <Checkbox
                  checked={autoAcceptChanges}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setAutoAcceptChanges(checked);
                    localStorage.setItem('autoAcceptChanges', checked.toString());
                    // Set original content when enabling auto-accept
                    // Disable diff mode when enabling auto-accept
                    if (checked && getCurrentDiffMode()) {
                      const currentContent = getCurrentFileContent();
                      setCurrentOriginalContent(currentContent);
                      if (!isV3Mode) {
                        lastValueRef.current = currentContent;
                      }
                      exitDiffMode();
                    }
                  }}
                />
              </Tooltip>
              <span style={{
                fontFamily: "'DM Sans'",
                fontStyle: 'normal',
                fontWeight: 500,
                fontSize: '14px',
                lineHeight: '22px',
                color: theme === 'dark' ? '#c9d1d9' : '#000000'
              }}>
                Auto accept changes {manualTypingDetectedRef.current && <span className="text-orange-500">(Manual typing detected)</span>}
              </span>
            </div>

            {/* Show Diff Button - Hidden, always show diff */}
            {/* <div style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer',
              position: 'relative'
            }}
            onClick={() => {
              if (getCurrentDiffMode()) {
                exitDiffMode();
              } else {
                startDiffMode();
              }
            }}
            >
              <SwapOutlined style={{
                fontSize: '16px',
                color: theme === 'dark' ? '#8b949e' : '#57606a'
              }} />
              <span style={{
                color: theme === 'dark' ? '#c9d1d9' : '#000000',
                fontFamily: "'DM Sans'",
                fontStyle: 'normal',
                fontWeight: 500,
                fontSize: '14px',
                lineHeight: '22px'
              }}>
                {getCurrentDiffMode() ? 'Hide Diff' : 'Show Diff'}
              </span>
              {hasDifferences && !getCurrentDiffMode() && (
                <span style={{
                  position: 'absolute',
                  top: '-4px',
                  right: '-8px',
                  width: '8px',
                  height: '8px',
                  background: '#ff4d4f',
                  borderRadius: '50%',
                  border: `2px solid ${theme === 'dark' ? '#0d1117' : '#FFFFFF'}`
                }} />
              )}
            </div> */}

            {/* Code Explanation Button */}
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}>
              <CodeExplanationButton
                automationId={automationEditor.automationRef.current?._id || ''}
                automationTitle={automationEditor.automationRef.current?.title}
                variant="outline"
                size="sm"
                className="px-[8px] py-[0px] h-[28px]"
              />
            </div>

            {/* Accept/Reject Buttons - Show when there are differences, even if diff view is hidden */}
            {hasDifferences && !autoAcceptChanges && (
              <>
                <div style={{ flex: 1 }} />
                <Space size="small">
                  <Button
                    type="primary"
                    size="small"
                    icon={<CheckOutlined />}
                    onClick={acceptDiffChanges}
                    disabled={isTesting}
                  >
                    Accept All
                  </Button>
                  <Button
                    size="small"
                    onClick={rejectDiffChanges}
                    disabled={isTesting}
                  >
                    Reject All
                  </Button>
                </Space>
              </>
            )}
          </div>

          {/* Editor Container */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            padding: '20px 20px 20px 16px',
            gap: '16px',
            flex: 1,
            overflow: 'hidden',
            // background: theme === 'dark' ? '#0d1117' : '#FFFFFF'
          }}>
            {/* Show empty state when no tabs are open */}
            {isV3Mode && openTabs.length === 0 && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100%',
                gap: '16px'
              }}>
                <span className="tertiary-text text-[16px]">
                  Select a file from the sidebar to start editing
                </span>
              </div>
            )}

            {/* Editor with Line Numbers */}
            {(!isV3Mode || (isV3Mode && openTabs.length > 0 && activeFileId)) && (
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-start',
              gap: '16px',
              width: '100%',
              height: '100%',
              overflow: 'hidden'
            }}>
          <style>{`
            /* Monaco Editor Sash Styles - Required for side-by-side view */
            :root {
              --sash-size: 4px;
            }
            .monaco-sash.vertical {
              cursor: ew-resize;
              top: 0;
              width: var(--sash-size);
              height: 100%;
              background-color: #e1e1e1;
              z-index: 35;
            }
            .monaco-sash.horizontal {
              cursor: ns-resize;
              left: 0;
              width: 100%;
              height: var(--sash-size);
              background-color: #e1e1e1;
              z-index: 35;
            }
            .monaco-sash.vertical:hover {
              background-color: #007acc;
            }
            .monaco-sash.horizontal:hover {
              background-color: #007acc;
            }
            /* Ensure diff editor containers are properly sized */
            .monaco-diff-editor {
              width: 100% !important;
              height: 100% !important;
            }
            .monaco-diff-editor .monaco-editor {
              width: 100% !important;
              height: 100% !important;
            }
            /* Force side-by-side layout */
            .monaco-diff-editor .split-view-view {
              display: flex !important;
              width: 100% !important;
              height: 100% !important;
              flex-direction: row !important;
            }
            .monaco-diff-editor .split-view-view .monaco-editor {
              flex: 1 !important;
              min-width: 0 !important;
              width: 50% !important;
            }
            /* Ensure split view container is visible */
            .monaco-diff-editor .split-view-view .split-view-view {
              display: flex !important;
              width: 100% !important;
              height: 100% !important;
            }
            /* Force original and modified editors to be side by side */
            .monaco-diff-editor .original-editor {
              display: block !important;
              width: 50% !important;
              float: left !important;
            }
            .monaco-diff-editor .modified-editor {
              display: block !important;
              width: 50% !important;
              float: right !important;
            }
          `}</style>
          {!getCurrentDiffMode() ? (
            <Editor
              key={isV3Mode ? activeFileId : 'single-file'}
              height="100%"
              defaultLanguage={language}
              defaultValue={getCurrentFileContent()}
              onChange={handleMainEditorChange}
              theme={theme === 'dark' ? 'vs-dark' : 'vs'}
              options={{
                fontSize: 14,
                minimap: { enabled: false },
                scrollbar: {
                  verticalScrollbarSize: 10,
                  horizontalScrollbarSize: 10
                },
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,
                overviewRulerBorder: false
              }}
              beforeMount={editorBeforMount}
              onMount={(_editor: any, monaco: any) => {
                // Set the custom theme based on current theme
                monaco.editor.setTheme(theme === 'dark' ? 'dark-custom' : 'light-custom');

                editorRef.current = _editor;
                mainEditorRef.current = _editor;

                // DON'T call setValue here - we're using defaultValue prop
                // Calling setValue here would reset content and move cursor

                // Add keyboard event listeners to detect manual typing
                _editor.onKeyDown((e: any) => {
                  // Detect manual typing on regular keys (not special keys like Ctrl, Alt, etc.)
                  if (e.keyCode >= 32 && e.keyCode <= 126) { // Printable characters
                    detectManualTyping();
                  }
                });

                // Don't detect manual typing through content changes - only through keyboard events
                // This prevents AI input from being detected as manual typing
                _editor.onDidChangeModelContent(() => {
                  // Content changes are handled by the auto-diff effect
                });
              }}
            />
          ) : !automationEditor.showChatWindow ? (
            <DiffEditor
              key={`side-by-side-editor-${isV3Mode ? activeFileId : 'single'}`}
              height="100%"
              language={language}
              original={getCurrentOriginalContent()}
              modified={diffEditorModifiedContent || getCurrentFileContent()}
              theme={theme === 'dark' ? 'dark-custom' : 'light-custom'}
              beforeMount={editorBeforMount}
              onMount={(editor: any, monaco: any) => {
                // Set the custom theme
                monaco.editor.setTheme(theme === 'dark' ? 'dark-custom' : 'light-custom');
                diffEditorRef.current = editor;
                handleDiffEditorMount(editor, monaco);
              }}
              options={{
                // Force true side-by-side mode
                renderSideBySide: true,
                enableSplitViewResizing: true,
                ignoreTrimWhitespace: false,
                renderIndicators: true,
                // Disable inline/unified mode completely
                renderOverviewRuler: false,
                // Force side-by-side layout
                fixedOverflowWidgets: true,
                originalEditable: false,
                readOnly: false,
                fontSize: 14,
                minimap: { enabled: false },
                automaticLayout: true,
                wordWrap: 'off',
                scrollBeyondLastLine: true,
                diffCodeLens: true,
                diffAlgorithm: 'advanced',
                // Additional options to force side-by-side
                folding: true,
                lineNumbers: 'on',
                glyphMargin: true,
                foldingStrategy: 'indentation'
              }}
            />
          ) : (
            <DiffEditor
              key={`unified-editor-${isV3Mode ? activeFileId : 'single'}`}
              height="100%"
              language={language}
              original={getCurrentOriginalContent()}
              modified={diffEditorModifiedContent || getCurrentFileContent()}
              theme={theme === 'dark' ? 'dark-custom' : 'light-custom'}
              beforeMount={editorBeforMount}
              onMount={(editor: any, monaco: any) => {
                // Set the custom theme
                monaco.editor.setTheme(theme === 'dark' ? 'dark-custom' : 'light-custom');
                handleDiffEditorMount(editor, monaco);
              }}
              options={{
                // Explicitly force unified/inline
                renderSideBySide: false,
                ignoreTrimWhitespace: false,
                renderIndicators: true,
                originalEditable: false,
                readOnly: false,
                fontSize: 14,
                minimap: { enabled: false },
                automaticLayout: true,
                wordWrap: 'off',
                scrollBeyondLastLine: true,
                renderOverviewRuler: false,
                enableSplitViewResizing: false,
                diffCodeLens: false,
                diffAlgorithm: 'advanced'
              }}
              // onChange={handleMainEditorChange}
            />
          )}
            </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ width: '100%', height: 'calc(100% - 20px)', display: activeTab === 'env' ? 'block' : 'none', overflow: 'auto' }}>
          <EnvironmentVariablesTab />
      </div>
      <div style={{ width: '100%', height: 'calc(100% - 20px)', display: activeTab === 'dependencies' ? 'block' : 'none', overflow: 'auto' }}>
        <DependenciesTab />
      </div>
      <div className="log-container" data-tour="output-panel" style={{ display: activeTab === 'logs' ? 'block' : 'none', position: 'relative' }}>
        <Copy
          className="log-copy-icon"
          size={34}
          onClick={() => {
            const allLines = getAllTerminalBufferLines();
            const terminalBuffer = allLines.join("\n");
            navigator.clipboard.writeText(terminalBuffer.trim() || "");
            toast.success("Log copied!");
          }}
        />
        <Button
          type="primary"
          shape="round"
          size="small"
          className="log-explain-button"
          onClick={() => {
            setShowExplanationModal(true);
          }}
          disabled={(() => {
            try {
              const terminalBuffer = getAllTerminalBufferLines();
              return terminalBuffer.length === 0;
            } catch {
              return true;
            }
          })()}
        >
          Explain Logs
        </Button>
        <OutputController />
        {show && (
          <div
            className="select-text-menu"
            style={{ top: y, left: x, }}
          >
            <button
              onClick={() =>  {
                navigator.clipboard.writeText(text || "");
                toast.success("Copied!");
                close();
              }}
            >
              Copy
            </button>
            <button
              onClick={() => {
                eventsEmitter.emit('automation-editor:update-message', text)
                close();
              }}
            >
              Add to chat
            </button>
          </div>
        )}
      </div>

      <LogExplanationModal
        isOpen={showExplanationModal}
        onClose={() => setShowExplanationModal(false)}
        logs={(() => {
          try {
            return getAllTerminalBufferLines();
          } catch {
            return [];
          }
        })()}
      />

      <RunCodeModal />
    </div>
    </>

  );
};

export default MonacoEditorClientStable;