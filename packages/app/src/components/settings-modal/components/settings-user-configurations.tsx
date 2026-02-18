"use client";
import { useAuth } from "@/app/authentication";
import { toast } from '@/hooks/use-toast';
import {
  App,
  Button,
  Card,
  Col,
  Form,
  Input,
  Modal,
  Row,
  Space,
  Spin,
  Table,
  Typography,
  message,
  Popconfirm,
  Select,
  Checkbox,
  Tag,
  Empty,
  Tooltip
} from "antd";
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  KeyOutlined,
  LinkOutlined,
  ApiOutlined,
  DatabaseOutlined,
  CopyOutlined
} from "@ant-design/icons";
import { Trash2 } from "lucide-react";
import { useEffect, useState, useMemo, useCallback } from "react";
import SearchInput from '@/components/ui/search-input';
import FilterDropdown from '@/components/ui/filter-dropdown';

const { TextArea } = Input;

interface UserConfiguration {
  id: string;
  name: string;
  value?: string | { // Can be a string (applies to all environments) or object (multi-environment)
    dev?: string | null;
    test?: string | null;
    production?: string | null;
  };
  source: string;
}

interface ExpandedConfigurationRow {
  id: string; // Unique row ID (configId-env or configId-any)
  configId: string; // Original config ID
  name: string;
  environment: 'dev' | 'test' | 'production' | 'any';
  value: string;
  source: string;
}

type ConfigurationType = 'api-key' | 'token' | 'webhook' | 'database' | 'other';

interface FilterState {
  search: string;
  types: ConfigurationType[];
  environments: ('dev' | 'test' | 'production')[];
}

const getConfigurationType = (name: string): ConfigurationType => {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('api') && lowerName.includes('key')) return 'api-key';
  if (lowerName.includes('token')) return 'token';
  if (lowerName.includes('webhook')) return 'webhook';
  if (lowerName.includes('database') || lowerName.includes('db')) return 'database';
  return 'other';
};

const getTypeIcon = (type: ConfigurationType) => {
  switch (type) {
    case 'api-key': return <KeyOutlined />;
    case 'token': return <ApiOutlined />;
    case 'webhook': return <LinkOutlined />;
    case 'database': return <DatabaseOutlined />;
    default: return <ApiOutlined />;
  }
};

const getTypeColor = (type: ConfigurationType) => {
  switch (type) {
    case 'api-key': return 'blue';
    case 'token': return 'green';
    case 'webhook': return 'orange';
    case 'database': return 'purple';
    default: return 'default';
  }
};

const getTypeLabel = (type: ConfigurationType) => {
  switch (type) {
    case 'api-key': return 'API Key';
    case 'token': return 'Token';
    case 'webhook': return 'Webhook';
    case 'database': return 'Database';
    default: return 'Other';
  }
};

const SettingsUserConfigurations = () => {
  const { currentUser } = useAuth();
  const { modal } = App.useApp();
  
  const [configurations, setConfigurations] = useState<UserConfiguration[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingConfig, setEditingConfig] = useState<UserConfiguration | null>(null);
  const [form] = Form.useForm();
  const [filters, setFilters] = useState<FilterState>({ search: '', types: [], environments: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [showValues, setShowValues] = useState<{ [key: string]: boolean }>({});
  const [pageSize, setPageSize] = useState(15);
  const [selectAllChecked, setSelectAllChecked] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [viewValueModalVisible, setViewValueModalVisible] = useState(false);
  const [viewingValue, setViewingValue] = useState<{ name: string; value: string; environment: string } | null>(null);

  const t = (s: string, text: string) => text;

  // Detect dark mode changes
  useEffect(() => {
    const checkDarkMode = () => {
      const isDark = document.documentElement.classList.contains('dark');
      setIsDarkMode(isDark);
    };

    checkDarkMode();

    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  // Transform configurations into expanded rows (one row per environment)
  const expandedRows = useMemo(() => {
    const rows: ExpandedConfigurationRow[] = [];
    
    configurations.forEach(config => {
      // Check if value is an object (multi-environment structure)
      if (config.value && typeof config.value === 'object') {
        // Multi-environment config: create one row per environment
        const valueObj = config.value as { dev?: string | null; test?: string | null; production?: string | null };
        if (valueObj.dev !== undefined && valueObj.dev !== null) {
          rows.push({
            id: `${config.id}-dev`,
            configId: config.id,
            name: config.name,
            environment: 'dev',
            value: String(valueObj.dev),
            source: config.source
          });
        }
        if (valueObj.test !== undefined && valueObj.test !== null) {
          rows.push({
            id: `${config.id}-test`,
            configId: config.id,
            name: config.name,
            environment: 'test',
            value: String(valueObj.test),
            source: config.source
          });
        }
        if (valueObj.production !== undefined && valueObj.production !== null) {
          rows.push({
            id: `${config.id}-production`,
            configId: config.id,
            name: config.name,
            environment: 'production',
            value: String(valueObj.production),
            source: config.source
          });
        }
      } else {
        // Any single-value config (applies to all environments): create one row
        rows.push({
          id: `${config.id}-any`,
          configId: config.id,
          name: config.name,
          environment: 'any',
          value: typeof config.value === 'string' ? config.value : '',
          source: config.source
        });
      }
    });
    
    return rows;
  }, [configurations]);

  const filteredConfigurations = useMemo(() => {
    return expandedRows.filter(row => {
      const matchesSearch = !filters.search ||
        row.name.toLowerCase().includes(filters.search.toLowerCase()) ||
        row.value.toLowerCase().includes(filters.search.toLowerCase());

      const configType = getConfigurationType(row.name);
      const matchesType = filters.types.length === 0 || filters.types.includes(configType);

      // Filter by environment: if filter is set, only show rows matching selected environments
      const matchesEnvironment = filters.environments.length === 0 || 
        (row.environment !== 'any' && filters.environments.includes(row.environment));

      return matchesSearch && matchesType && matchesEnvironment;
    });
  }, [expandedRows, filters]);

  const configurationsByType = useMemo(() => {
    const grouped = filteredConfigurations.reduce((acc, row) => {
      const type = getConfigurationType(row.name);
      if (!acc[type]) acc[type] = [];
      acc[type].push(row);
      return acc;
    }, {} as Record<ConfigurationType, ExpandedConfigurationRow[]>);

    return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredConfigurations]);

  const toggleValueVisibility = (id: string) => {
    setShowValues(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleViewValue = (record: ExpandedConfigurationRow) => {
    setViewingValue({
      name: record.name,
      value: record.value || '',
      environment: record.environment === 'any' ? 'Any' : record.environment === 'dev' ? 'Dev' : record.environment === 'test' ? 'Test' : 'Production'
    });
    setViewValueModalVisible(true);
  };

  const handleCopyValue = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success("Value copied to clipboard");
    } catch (error) {
      console.error('Failed to copy:', error);
      toast.error("Error", "Failed to copy value");
    }
  };

  // Handle select all functionality
  const handleSelectAll = useCallback(() => {
    if (selectAllChecked) {
      setSelectedRowKeys([]);
    } else {
      const visibleIds = filteredConfigurations.map(row => row.id);
      setSelectedRowKeys(visibleIds);
    }
    setSelectAllChecked(!selectAllChecked);
  }, [selectAllChecked, filteredConfigurations]);

  // Update select all state when selection changes
  useEffect(() => {
    const visibleIds = filteredConfigurations.map(row => row.id);
    const allVisible = visibleIds.length > 0 && visibleIds.every(id => selectedRowKeys.includes(id));
    setSelectAllChecked(allVisible);
  }, [selectedRowKeys, filteredConfigurations]);

  const handleBulkDelete = async () => {
    if (selectedRowKeys.length === 0) return;

    // Get unique config IDs from selected rows
    const uniqueConfigIds = [...new Set(selectedRowKeys.map(id => {
      const row = filteredConfigurations.find(r => r.id === id);
      return row?.configId;
    }).filter(Boolean))];

    modal.confirm({
      title: 'Delete Configurations',
      content: `Are you sure you want to delete ${uniqueConfigIds.length} configuration(s)?`,
      closable: true,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          await Promise.all(
            uniqueConfigIds.map(configId =>
              fetch(`/api/user-configurations/${configId}`, { method: 'DELETE' })
            )
          );
          toast.success(`${uniqueConfigIds.length} configuration(s) deleted successfully`);
          setSelectedRowKeys([]);
          loadConfigurations();
        } catch (error) {
          toast.error("Error",'Failed to delete configurations');
        }
      }
    });
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if the user is focused on a text input (textarea, input, or contenteditable)
      const activeElement = document.activeElement;
      const isTextInput = activeElement && (
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.tagName === 'INPUT' ||
        (activeElement instanceof HTMLElement && activeElement.isContentEditable) ||
        activeElement.getAttribute('contenteditable') === 'true'
      );

      // Ctrl+A or Cmd+A for select all
      if ((event.ctrlKey || event.metaKey) && event.key === 'a') {
        // Only prevent default and select all configurations if NOT in a text input
        if (!isTextInput) {
          event.preventDefault();
          handleSelectAll();
        }
        // If in a text input, let the browser handle Ctrl+A for text selection
      }
      
      // Delete key for bulk delete
      if (event.key === 'Delete' && selectedRowKeys.length > 0) {
        // Only prevent default if NOT in a text input
        if (!isTextInput) {
          event.preventDefault();
          handleBulkDelete();
        }
        // If in a text input, let the browser handle Delete/Backspace for text editing
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleSelectAll, selectedRowKeys, handleBulkDelete]);

  const loadConfigurations = async () => {
    if (!currentUser?.email) return;

    setLoading(true);
    try {
      const response = await fetch("/api/user-configurations", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        setConfigurations(data?.configurations || []);
      } else {
        throw new Error("Failed to load configurations");
      }
    } catch (error) {
      console.error("Error loading configurations:", error);
      toast.error("Error","Failed to load configurations");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setEditingConfig(null);
    form.resetFields();
    form.setFieldsValue({ useMultiEnv: false });
    setModalVisible(true);
  };

  const handleModalClose = () => {
    setModalVisible(false);
    setEditingConfig(null);
    form.resetFields();
  };

  const handleEdit = (row: ExpandedConfigurationRow) => {
    // Find the original configuration
    const config = configurations.find(c => c.id === row.configId);
    if (!config) return;
    
    setEditingConfig(config);
    // Check if value is an object (multi-environment structure)
    if (config.value && typeof config.value === 'object') {
      const valueObj = config.value as { dev?: string | null; test?: string | null; production?: string | null };
      form.setFieldsValue({
        name: config.name,
        useMultiEnv: true,
        values: {
          dev: valueObj.dev || '',
          test: valueObj.test || '',
          production: valueObj.production || ''
        }
      });
    } else {
      form.setFieldsValue({
        name: config.name,
        useMultiEnv: false,
        value: typeof config.value === 'string' ? config.value : ''
      });
    }
    setModalVisible(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/user-configurations/${id}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        toast.success("Configuration deleted successfully");
        loadConfigurations();
      } else {
        const error = await response.json();
        throw new Error(error.error || "Failed to delete configuration");
      }
    } catch (error) {
      console.error("Error deleting configuration:", error);
      toast.error("Error","Failed to delete configuration");
    }
  };

  const handleSubmit = async (values: any) => {
    try {
      const isEditing = !!editingConfig;
      const url = isEditing 
        ? `/api/user-configurations/${editingConfig.id}`
        : "/api/user-configurations";
      
      const method = isEditing ? "PUT" : "POST";

      // Prepare the payload - remove useMultiEnv checkbox value
      const { useMultiEnv, ...payload } = values;
      
      // Validate multi-environment values and convert to value property
      if (useMultiEnv && payload.values) {
        const hasAtLeastOneValue = payload.values.dev || payload.values.test || payload.values.production;
        if (!hasAtLeastOneValue) {
          toast.error("Error", "Please provide at least one environment value");
          return;
        }
        
        // Clean up empty strings - convert to undefined for optional values
        const cleanedValues: any = {};
        if (payload.values.dev !== '') cleanedValues.dev = payload.values.dev || undefined;
        if (payload.values.test !== '') cleanedValues.test = payload.values.test || undefined;
        if (payload.values.production !== '') cleanedValues.production = payload.values.production || undefined;
        
        // Convert values to value property (as object)
        payload.value = cleanedValues;
        delete payload.values;
      }
      
      // If useMultiEnv is false but values exist, use single value instead
      if (!useMultiEnv && payload.values) {
        // If editing and switching from multi-env to single, use the first available value
        if (editingConfig?.value && typeof editingConfig.value === 'object') {
          payload.value = payload.values.dev || payload.values.test || payload.values.production || '';
        }
        delete payload.values;
      }

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        toast.success(
          isEditing 
            ? "Configuration updated successfully" 
            : "Configuration created successfully"
        );
        handleModalClose();
        loadConfigurations();
      } else {
        const error = await response.json();
        throw new Error(error.error || "Failed to save configuration");
      }
    } catch (error) {
      console.error("Error saving configuration:", error);
      toast.error("Error","Failed to save configuration");
    }
  };


  const columns = [
    {
      title: 'Type',
      key: 'type',
      width: 100,
      render: (_: any, record: ExpandedConfigurationRow) => {
        const type = getConfigurationType(record.name);
        return (
          <Tag
            color={getTypeColor(type)}
            icon={getTypeIcon(type)}
            style={{ margin: 0 }}
          >
            {getTypeLabel(type)}
          </Tag>
        );
      },
    },
    {
      title: 'Name',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => (
        <Typography.Text strong style={{ fontSize: '14px' }}>
          {text}
        </Typography.Text>
      ),
    },
    {
      title: 'Environment',
      key: 'environment',
      width: 150,
      render: (_: any, record: ExpandedConfigurationRow) => {
        if (record.environment === 'any') {
          return <Typography.Text type="secondary" style={{ fontSize: '12px' }}>Any</Typography.Text>;
        }
        return (
          <Tag
            color={record.environment === 'dev' ? 'blue' : record.environment === 'test' ? 'orange' : 'red'}
            style={{ margin: 0 }}
          >
            {record.environment === 'dev' ? 'Dev' : record.environment === 'test' ? 'Test' : 'Prod'}
          </Tag>
        );
      },
    },
    {
      title: 'Value',
      dataIndex: 'value',
      key: 'value',
      render: (_: any, record: ExpandedConfigurationRow) => {
        const isVisible = showValues[record.id];
        const displayValue = record.value || '';
        
        // Always show first 4 + '••••' + last 4 chars (total 12 chars) for consistency
        let previewValue: string;
        if (displayValue.length >= 8) {
          // Value is long enough: show first 4 + dots + last 4
          previewValue = displayValue.substring(0, 4) + '••••' + displayValue.substring(displayValue.length - 4);
        } else if (displayValue.length > 0) {
          // Value is short: show the value padded with dots to make it 12 chars total
          const paddingNeeded = 12 - displayValue.length;
          previewValue = displayValue + '•'.repeat(Math.max(0, paddingNeeded));
        } else {
          // Empty value: show 12 dots
          previewValue = '••••••••••••';
        }

        return (
          <Space>
            <Typography.Text
              code
              style={{
                maxWidth: 200,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                fontFamily: 'monospace',
                fontSize: '12px',
                width: '144px', // Fixed width for consistent display (12 chars * ~12px per char)
                display: 'inline-block'
              }}
            >
              {isVisible ? displayValue : previewValue}
            </Typography.Text>
            <Tooltip title="View full value">
              <Button
                type="text"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => handleViewValue(record)}
                style={{ padding: '2px 4px' }}
              />
            </Tooltip>
            <Tooltip title="Copy value">
              <Button
                type="text"
                size="small"
                icon={<CopyOutlined />}
                onClick={() => handleCopyValue(displayValue)}
                style={{ padding: '2px 4px' }}
              />
            </Tooltip>
          </Space>
        );
      },
    },
    {
      title: 'Actions',
      key: 'actions',
      width: 200,
      render: (_: any, record: ExpandedConfigurationRow) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Tooltip title="Edit">
            <button
              className="figma-action-btn figma-edit-btn"
              onClick={() => handleEdit(record)}
              style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '0px 16px',
                gap: '8px',
                borderRadius: '400px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                width: '80px',
                height: '40px'
              }}
            >
              <EditOutlined style={{ fontSize: '16px', color: isDarkMode ? '#FFFFFF' : '#111827' }} />
              <span style={{ color: isDarkMode ? '#FFFFFF' : '#111827', fontSize: '14px' }}>Edit</span>
            </button>
          </Tooltip>
          <Tooltip title="Delete">
            <button
              className="figma-action-btn figma-delete-btn"
              onClick={async () => {
                modal.confirm({
                  title: 'Delete User Configuration',
                  content: `Are you sure you want to delete this user configuration "${record.name}"? This action cannot be undone.`,
                  closable: true,
                  okText: 'Delete',
                  okType: 'danger',
                  cancelText: 'Cancel',
                  onOk: async () => {
                    await handleDelete(record.configId);
                  }
                });
              }}
              style={{
                display: 'flex',
                flexDirection: 'row',
                justifyContent: 'center',
                alignItems: 'center',
                padding: '0px 16px',
                gap: '8px',
                borderRadius: '400px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                width: '102px',
                height: '40px'
              }}
            >
              <Trash2 size={16} style={{ color: '#D13036' }} />
              <span style={{ color: '#D13036', fontSize: '14px' }}>Delete</span>
            </button>
          </Tooltip>
        </div>
      ),
    },
  ];

  const rowSelection = {
    selectedRowKeys,
    onChange: (selectedKeys: React.Key[]) => {
      setSelectedRowKeys(selectedKeys as string[]);
    },
    getCheckboxProps: (record: ExpandedConfigurationRow) => ({
      name: record.name,
    }),
    hideSelectAll: false,
    preserveSelectedRowKeys: true,
    type: 'checkbox' as const,
  };

  useEffect(() => {
    loadConfigurations();
  }, []);

  return (
    <div className="settings-user-configurations-container">
      <div className="title">
        {t("settingsModal.tabs.userConfigurations", "Configurations")}
      </div>

      <Card>
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <Typography.Text type="secondary" style={{ fontSize: '14px' }}>
              Manage your API keys, tokens, and other configuration values. All secrets are encrypted using AES-256-CBC encryption before storage.
            </Typography.Text>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleCreate}
              size="middle"
            >
              Add Configuration
            </Button>
          </div>

          {/* Controls Section - Show action buttons when configurations are selected, otherwise show search/filters */}
          {selectedRowKeys.length > 0 ? (
            <div style={{ display: 'flex', gap: '16px', marginBottom: 16, alignItems: 'center' }}>
              <button
                onClick={handleBulkDelete}
                className="custom-delete-button"
                style={{
                  width: '102px',
                  height: '40px',
                  borderRadius: '400px',
                  padding: '0px 16px',
                  gap: '8px',
                  display: 'flex',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  alignItems: 'center',
                  border: '1px solid #D13036',
                  background: 'transparent',
                  cursor: 'pointer'
                }}
              >
                <Trash2 size={16} style={{ color: '#D13036' }} />
                <span style={{ color: '#D13036' }}>Delete</span>
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '12px', marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <SearchInput
                placeholder="Search configurations..."
                value={searchQuery}
                onChange={setSearchQuery}
                onSearch={(value) => {
                  if (isSearching) return;
                  setIsSearching(true);
                  setFilters(prev => ({ ...prev, search: value }));
                  setTimeout(() => setIsSearching(false), 100);
                }}
                debounceMs={300}
                width={300}
                height={40}
                borderRadius={99}
                className="tab-search-input"
              />

              <FilterDropdown
                placeholder="Filter by type"
                items={[
                  { id: 'api-key', title: 'API Keys' },
                  { id: 'token', title: 'Tokens' },
                  { id: 'webhook', title: 'Webhooks' },
                  { id: 'database', title: 'Database' },
                  { id: 'other', title: 'Other' }
                ]}
                selectedItems={filters.types}
                onSelectionChange={(types) => setFilters(prev => ({ ...prev, types: types as ConfigurationType[] }))}
                width={200}
                height={40}
                borderRadius={99}
              />

              <FilterDropdown
                placeholder="Filter by environment"
                items={[
                  { id: 'dev', title: 'Dev' },
                  { id: 'test', title: 'Test' },
                  { id: 'production', title: 'Production' }
                ]}
                selectedItems={filters.environments}
                onSelectionChange={(envs) => setFilters(prev => ({ ...prev, environments: envs as ('dev' | 'test' | 'production')[] }))}
                width={200}
                height={40}
                borderRadius={99}
              />
            </div>
          )}

          {filteredConfigurations.length > 0 && (
            <div style={{ marginBottom: 12, color: '#666', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {isSearching && <Spin size="small" />}
              Showing {filteredConfigurations.length} of {expandedRows.length} configuration rows
              {filters.search && <span> • Filtered by "{filters.search}"</span>}
              {filters.types.length > 0 && <span> • Types: {filters.types.map(getTypeLabel).join(', ')}</span>}
              {filters.environments.length > 0 && <span> • Environments: {filters.environments.map(env => env === 'dev' ? 'Dev' : env === 'test' ? 'Test' : 'Production').join(', ')}</span>}
            </div>
          )}
        </div>

        <Spin spinning={loading}>
          <Table
            columns={columns}
            dataSource={filteredConfigurations}
            rowKey="id"
            rowSelection={rowSelection}
            pagination={{
              pageSize: pageSize,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total, range) =>
                `${range[0]}-${range[1]} of ${total} configuration rows`,
              pageSizeOptions: ['10', '15', '25', '50'],
              onShowSizeChange: (current, size) => setPageSize(size),
            }}
            locale={{
              emptyText: (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={
                    <span>
                      {filters.search || filters.types.length > 0
                        ? 'No configurations match your filters'
                        : 'No configurations found. Click "Add Configuration" to create one.'}
                    </span>
                  }
                />
              )
            }}
            size="middle"
          />
        </Spin>
      </Card>

      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {editingConfig ? <EditOutlined /> : <PlusOutlined />}
            {editingConfig ? "Edit Configuration" : "Add Configuration"}
          </div>
        }
        open={modalVisible}
        onCancel={handleModalClose}
        footer={null}
        width={600}
        destroyOnHidden
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
        >
          <Form.Item
            name="name"
            label="Name"
            rules={[
              { required: true, message: "Please enter a name" },
              { max: 50, message: "Name must be less than 50 characters" },
              { 
                pattern: /^[A-Z0-9_]+$/, 
                message: "Name must contain only uppercase letters, numbers, and underscores" 
              }
            ]}
            extra="Use uppercase letters, numbers, and underscores only (e.g., 'OPENAI_API_KEY', 'API_KEY_V2', 'SLACK_WEBHOOK_URL')"
          >
            <Input 
              placeholder="e.g., OPENAI_API_KEY" 
              size="large"
              onInput={(e) => {
                // Auto-convert to uppercase and replace spaces with underscores
                const target = e.target as HTMLInputElement;
                const value = target.value.toUpperCase().replace(/\s+/g, '_');
                target.value = value;
                form.setFieldValue('name', value);
                form.validateFields(['name']);
              }}
            />
          </Form.Item>

          <Form.Item
            name="useMultiEnv"
            valuePropName="checked"
            style={{ marginBottom: 16 }}
          >
            <Checkbox>Use different values for each environment</Checkbox>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.useMultiEnv !== currentValues.useMultiEnv}
          >
            {({ getFieldValue }) => {
              const useMultiEnv = getFieldValue('useMultiEnv');
              
              if (useMultiEnv) {
                return (
                  <>
                    <Form.Item
                      name={['values', 'dev']}
                      label={
                        <span>
                          <Tag color="blue" style={{ marginRight: 8 }}>DEV</Tag>
                          Dev Value <span style={{ color: '#8c8c8c', fontWeight: 'normal' }}>(Optional)</span>
                        </span>
                      }
                      rules={[
                        { max: 1000, message: "Value must be less than 1000 characters" }
                      ]}
                      extra="This value will be encrypted before storage. At least one environment value is required."
                    >
                      <Input.Password
                        placeholder="Enter the dev environment value (optional)"
                        size="large"
                      />
                    </Form.Item>

                    <Form.Item
                      name={['values', 'test']}
                      label={
                        <span>
                          <Tag color="orange" style={{ marginRight: 8 }}>TEST</Tag>
                          Test Value <span style={{ color: '#8c8c8c', fontWeight: 'normal' }}>(Optional)</span>
                        </span>
                      }
                      rules={[
                        { max: 1000, message: "Value must be less than 1000 characters" }
                      ]}
                      extra="This value will be encrypted before storage. Leave empty if not needed."
                    >
                      <Input.Password
                        placeholder="Enter the test environment value (optional)"
                        size="large"
                      />
                    </Form.Item>

                    <Form.Item
                      name={['values', 'production']}
                      label={
                        <span>
                          <Tag color="red" style={{ marginRight: 8 }}>PROD</Tag>
                          Production Value <span style={{ color: '#8c8c8c', fontWeight: 'normal' }}>(Optional)</span>
                        </span>
                      }
                      rules={[
                        { max: 1000, message: "Value must be less than 1000 characters" }
                      ]}
                      extra="This value will be encrypted before storage. Leave empty if not needed."
                    >
                      <Input.Password
                        placeholder="Enter the production environment value (optional)"
                        size="large"
                      />
                    </Form.Item>
                  </>
                );
              }

              return (
                <Form.Item
                  name="value"
                  label="Value"
                  rules={[
                    { required: true, message: "Please enter a value" },
                    { max: 1000, message: "Value must be less than 1000 characters" }
                  ]}
                  extra="This value will be encrypted before storage"
                >
                  <Input.Password
                    placeholder="Enter the configuration value"
                    size="large"
                  />
                </Form.Item>
              );
            }}
          </Form.Item>


          <Form.Item style={{ marginBottom: 0, textAlign: 'right', marginTop: 32 }}>
            <Space size="middle">
              <Button onClick={() => setModalVisible(false)} size="large">
                Cancel
              </Button>
              <Button type="primary" htmlType="submit" size="large">
                {editingConfig ? "Update Configuration" : "Create Configuration"}
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      {/* View Value Modal */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <EyeOutlined />
            <span>View Configuration Value</span>
          </div>
        }
        open={viewValueModalVisible}
        onCancel={() => {
          setViewValueModalVisible(false);
          setViewingValue(null);
        }}
        footer={[
          <Button
            key="copy"
            icon={<CopyOutlined />}
            onClick={() => viewingValue && handleCopyValue(viewingValue.value)}
          >
            Copy Value
          </Button>,
          <Button key="close" onClick={() => {
            setViewValueModalVisible(false);
            setViewingValue(null);
          }}>
            Close
          </Button>
        ]}
        width={800}
        destroyOnClose
      >
        {viewingValue && (
          <div style={{ marginTop: 16 }}>
            <div style={{ marginBottom: 16 }}>
              <Typography.Text strong>Name: </Typography.Text>
              <Typography.Text code>{viewingValue.name}</Typography.Text>
            </div>
            <div style={{ marginBottom: 16 }}>
              <Typography.Text strong>Environment: </Typography.Text>
              <Tag color={viewingValue.environment === 'Dev' ? 'blue' : viewingValue.environment === 'Test' ? 'orange' : viewingValue.environment === 'Production' ? 'red' : 'default'}>
                {viewingValue.environment}
              </Tag>
            </div>
            <div>
              <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>Value:</Typography.Text>
              <Input.TextArea
                value={viewingValue.value}
                readOnly
                autoSize={{ minRows: 4, maxRows: 20 }}
                style={{
                  fontFamily: 'monospace',
                  fontSize: '13px',
                  maxHeight: '400px',
                  overflowY: 'auto',
                  cursor: 'text',
                  userSelect: 'all'
                }}
                onKeyDown={(e) => {
                  // Allow keyboard navigation: Ctrl/Cmd+A to select all, Ctrl/Cmd+C to copy
                  if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'c')) {
                    // Let browser handle these shortcuts
                    return;
                  }
                  // Allow arrow keys, home, end, page up/down for navigation
                  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
                    return;
                  }
                  // Prevent other key inputs since it's read-only
                  if (!e.ctrlKey && !e.metaKey && e.key.length === 1) {
                    e.preventDefault();
                  }
                }}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default SettingsUserConfigurations;