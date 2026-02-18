'use client';

import React from 'react';
import { useState, useEffect, useMemo, useCallback } from 'react';

import {
  File, Download, Trash2, FileText,
  FileImage, FileVideo, FileAudio, Archive,
  Code, SearchIcon, Table
} from 'lucide-react';
import { useAuth } from '../authentication';
import { useRouter } from 'next/navigation';
import { App, Button as AntButton, Spin, Input, Select, Tag, Tooltip, Space, Empty, Pagination, Table as AntTable } from 'antd';
import { FilePdfOutlined } from '@ant-design/icons';
import { debounce } from 'lodash';
import './style.scss';
import { LoadingOutlined } from '@ant-design/icons';
import { toast } from '@/hooks/use-toast';
import GlobalLoading from '@/components/GlobalLoading';

interface FileItem {
  _id: string;
  filename?: string;
  originalName?: string;
  size?: number;
  mimeType?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  uploadedBy?: string;
  workspaceId?: string;
  // Add potential alternative field names
  created_at?: string;
  updated_at?: string;
  uploaded_by?: string;
  workspace_id?: string;
  uploadedAt?: string;
  automationName?: string;
  automationId?: string;
}

type FileType = 'all' | 'pdf' | 'word' | 'excel' | 'powerpoint' | 'text' | 'image' | 'video' | 'audio' | 'code' | 'archive' | 'other';

export default function FilesPage() {
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { currentUser, hasInitialised } = useAuth();
  const router = useRouter();
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const { modal } = App.useApp();
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Enhanced state for search and filtering
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [fileTypeFilter, setFileTypeFilter] = useState<FileType>('all');
  const [selectAllChecked, setSelectAllChecked] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Sorting state
  const [sortField, setSortField] = useState<'uploadedAt' | 'filename' | 'size' | 'automationName'>('uploadedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

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

  // Debounced search function
  const debouncedSearch = useCallback(
    debounce((query: string) => {
      if (isSearching) return; // Prevent multiple simultaneous searches
      
      setIsSearching(true);
      setDebouncedSearchQuery(query);
      // Simulate a small delay to show loading state
      setTimeout(() => setIsSearching(false), 100);
    }, 300), // Reduced debounce time for better responsiveness
    [isSearching]
  );

  // Authentication check - redirect to home if not authenticated
  useEffect(() => {
    if (hasInitialised && !currentUser) {
      router.push('/');
    }
  }, [hasInitialised, currentUser, router]);

  // Get file type from file data
  const getFileType = useCallback((mimeType: string, filename: string): FileType => {
    if (!mimeType && !filename) return 'other';

    const mime = mimeType?.toLowerCase() || '';
    const ext = filename?.toLowerCase().split('.').pop() || '';

    // PDF files
    if (mime.includes('pdf') || ext === 'pdf') {
      return 'pdf';
    }

    // Excel/Spreadsheet files - Check FIRST to avoid conflicts
    if (['xlsx', 'xls', 'csv', 'ods'].includes(ext) || 
        mime.includes('spreadsheet') || mime.includes('excel')) {
      return 'excel';
    }

    // PowerPoint presentations - Check SECOND to avoid conflicts
    if (['ppt', 'pptx', 'odp'].includes(ext) ||
        mime.includes('presentation') || mime.includes('powerpoint')) {
      return 'powerpoint';
    }

    // Word documents - Check LAST to avoid conflicts
    if (['doc', 'docx', 'rtf', 'odt'].includes(ext) ||
        mime.includes('word') || mime.includes('wordprocessingml')) {
      return 'word';
    }

    // Text files
    if (mime.includes('text') || ext === 'txt') {
      return 'text';
    }

    // Image files
    if (mime.includes('image') ||
        ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'].includes(ext)) {
      return 'image';
    }

    // Video files
    if (mime.includes('video') ||
        ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv'].includes(ext)) {
      return 'video';
    }

    // Audio files
    if (mime.includes('audio') ||
        ['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(ext)) {
      return 'audio';
    }

    // Code files
    if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rust', 'json'].includes(ext)) {
      return 'code';
    }

    // Archive files
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
      return 'archive';
    }

    return 'other';
  }, []);

  // Enhanced filtering and sorting logic
  const filteredFiles = useMemo(() => {
    let filtered = files.filter(file => {
      // Search filter - use debounced query to prevent rapid re-renders
      const matchesSearch = !debouncedSearchQuery ||
        (file.originalName || file.filename || '').toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
        (file.automationName || '').toLowerCase().includes(debouncedSearchQuery.toLowerCase());

      // Type filter
      const fileType = getFileType(file.mimeType || '', file.originalName || file.filename || '');
      const matchesType = fileTypeFilter === 'all' || fileType === fileTypeFilter;

      return matchesSearch && matchesType;
    });

    // Sort the filtered files
    filtered.sort((a, b) => {
      let aValue: any;
      let bValue: any;

      switch (sortField) {
        case 'uploadedAt':
          aValue = new Date(a.uploadedAt || a.createdAt || a.created_at || 0).getTime();
          bValue = new Date(b.uploadedAt || b.createdAt || b.created_at || 0).getTime();
          break;
        case 'filename':
          aValue = (a.originalName || a.filename || '').toLowerCase();
          bValue = (b.originalName || b.filename || '').toLowerCase();
          break;
        case 'size':
          aValue = a.size || 0;
          bValue = b.size || 0;
          break;
        case 'automationName':
          aValue = (a.automationName || '').toLowerCase();
          bValue = (b.automationName || '').toLowerCase();
          break;
        default:
          return 0;
      }

      if (sortOrder === 'asc') {
        return aValue < bValue ? -1 : aValue > bValue ? 1 : 0;
      } else {
        return aValue > bValue ? -1 : aValue < bValue ? 1 : 0;
      }
    });

    return filtered;
  }, [files, debouncedSearchQuery, fileTypeFilter, getFileType, sortField, sortOrder]);

  // Pagination logic
  const paginatedFiles = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredFiles.slice(startIndex, startIndex + pageSize);
  }, [filteredFiles, currentPage, pageSize]);

  // Handle select all functionality
  const handleSelectAll = useCallback(() => {
    if (selectAllChecked) {
      setSelectedFiles([]);
      setSelectAllChecked(false);
    } else {
      const visibleIds = paginatedFiles.map(f => f._id);
      setSelectedFiles(visibleIds);
      setSelectAllChecked(true);
    }
  }, [selectAllChecked, paginatedFiles]);

  // Update select all state when selection changes
  useEffect(() => {
    const visibleIds = paginatedFiles.map(f => f._id);
    const allVisible = visibleIds.length > 0 && visibleIds.every(id => selectedFiles.includes(id));
    setSelectAllChecked(allVisible);
  }, [selectedFiles, paginatedFiles]);

  // Clear filters
  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setDebouncedSearchQuery('');
    setFileTypeFilter('all');
    setSortField('uploadedAt');
    setSortOrder('desc');
    setSelectedFiles([]);
    setSelectAllChecked(false);
    setCurrentPage(1);
  }, []);

  // Get filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery) count++;
    if (fileTypeFilter !== 'all') count++;
    if (sortField !== 'uploadedAt' || sortOrder !== 'desc') count++;
    return count;
  }, [searchQuery, fileTypeFilter, sortField, sortOrder]);

  // Reset pagination when filters or sorting change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, fileTypeFilter, sortField, sortOrder]);


  const fetchFiles = async () => {
    if (!currentUser) return;
    setSelectedFiles([])
    try {
      setLoading(true);
      const response = await fetch('/api/files', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', userId: currentUser._id }
      });

      if (response.ok) {
        const data = await response.json();
        //console.log('Files API Response:', data);

        // Handle different possible response structures
        let filesArray = [];
        if (Array.isArray(data)) {
          filesArray = data;
        } else if (Array.isArray(data.files)) {
          filesArray = data.files;
        } else if (data.data && Array.isArray(data.data)) {
          filesArray = data.data;
        } else if (data.items && Array.isArray(data.items)) {
          filesArray = data.items;
        }

        setFiles(filesArray);
      } else {
        console.error('Failed to fetch files:', response.status);
        setFiles([]);
      }
    } catch (error) {
      console.error('Error fetching files:', error);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };
  // Fetch files from the database
  useEffect(() => {
    fetchFiles();
  }, [currentUser]);

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'inactive':
        return 'bg-gray-100 text-gray-800';
      case 'processing':
        return 'bg-yellow-100 text-yellow-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-blue-100 text-blue-800';
    }
  };

  const formatFileSize = (bytes: number) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType: string, filename: string) => {
    if (!mimeType && !filename) return File;
    
    const mime = mimeType?.toLowerCase() || '';
    const ext = filename?.toLowerCase().split('.').pop() || '';
    
    // PDF files
    if (mime.includes('pdf') || ext === 'pdf') return FilePdfOutlined;
    
    // Excel/Spreadsheet files - Check FIRST to avoid conflicts
    if (['xlsx', 'xls', 'csv', 'ods'].includes(ext) ||
        mime.includes('spreadsheet') || mime.includes('excel')) return Table;
    
    // PowerPoint presentations - Check SECOND to avoid conflicts
    if (['ppt', 'pptx', 'odp'].includes(ext) ||
        mime.includes('presentation') || mime.includes('powerpoint')) return FileText;
    
    // Word documents - Check LAST to avoid conflicts
    if (['doc', 'docx', 'rtf', 'odt'].includes(ext) ||
        mime.includes('word') || mime.includes('wordprocessingml')) return FileText; 
    
    // Text files
    if (mime.includes('text') || ext === 'txt') return FileText;
    
    // Image files
    if (mime.includes('image') || 
        ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'].includes(ext)) return FileImage;
    
    // Video files
    if (mime.includes('video') || 
        ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv'].includes(ext)) return FileVideo;
    
    // Audio files
    if (mime.includes('audio') || 
        ['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(ext)) return FileAudio;
    
    // Code files
    if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rust'].includes(ext)) return Code;
    
    // Archive files
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return Archive;
    
    return File;
  };

  const getFileIconColor = (mimeType: string, filename: string) => {
    if (!mimeType && !filename) return 'bg-blue-100 text-blue-600';
    
    const mime = mimeType?.toLowerCase() || '';
    const ext = filename?.toLowerCase().split('.').pop() || '';
    
    // PDF files - red
    if (mime.includes('pdf') || ext === 'pdf') return 'bg-red-100 text-red-600';
    
    // Excel/Spreadsheet files - green - Check FIRST to avoid conflicts
    if (['xlsx', 'xls', 'csv', 'ods'].includes(ext) ||
        mime.includes('spreadsheet') || mime.includes('excel')) return 'bg-green-100 text-green-600';
    
    // PowerPoint presentations - orange - Check SECOND to avoid conflicts
    if (['ppt', 'pptx', 'odp'].includes(ext) ||
        mime.includes('presentation') || mime.includes('powerpoint')) return 'bg-orange-100 text-orange-600';
    
    // Word documents - blue - Check LAST to avoid conflicts
    if (['doc', 'docx', 'rtf', 'odt'].includes(ext) ||
        mime.includes('word') || mime.includes('wordprocessingml')) return 'bg-blue-100 text-blue-600';
    
    // Text files - gray
    if (mime.includes('text') || ext === 'txt') return 'bg-gray-100 dark:bg-gray-900 tertiary-text';
    
    // Image files - purple
    if (mime.includes('image') || 
        ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp'].includes(ext)) return 'bg-purple-100 text-purple-600';
    
    // Video files - orange
    if (mime.includes('video') || 
        ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv'].includes(ext)) return 'bg-orange-100 text-orange-600';
    
    // Audio files - pink
    if (mime.includes('audio') || 
        ['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(ext)) return 'bg-pink-100 text-pink-600';
    
    // Code files - indigo
    if (['js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'cs', 'php', 'rb', 'go', 'rust'].includes(ext)) return 'bg-indigo-100 text-indigo-600';
    
    // Archive files - yellow
    if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'bg-yellow-100 text-yellow-600';
    
    return 'bg-blue-100 text-blue-600';
  };


  const downloadSelected = async () => {
    if (selectedFiles.length === 0) {
      toast.error("Error",'No files selected');
      return;
    }

    try {
      // Download each selected file
      for (const fileId of selectedFiles) {
        const file = files.find(f => f._id === fileId);
        if (file) {
          const link = document.createElement('a');
          link.href = `/api/files/${fileId}`;
          link.download = file.originalName || file.filename || 'download';
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      }
      toast.success(`Downloaded ${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''}`);
    } catch (error) {
      console.error('Error downloading files:', error);
      toast.error("Error",'Error downloading files. Please try again.');
    }
  };

  const deleteMany = async () => {
    if (selectedFiles.length === 0) {
      toast.error("Error",'No files selected');
      return;
    }

    modal.confirm({
      title: 'Delete files',
      content: `Are you sure you want to delete ${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''}? This action cannot be undone.`,
      icon: null,
      closable: true,
      okText: 'Delete',
      okType: 'danger',
      cancelText: 'Cancel',
      onOk: async () => {
        try {
          const response = await fetch('/api/files', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              ids: selectedFiles
            })
          });

          if (response.ok) {
            toast.success(`Successfully deleted ${selectedFiles.length} file${selectedFiles.length > 1 ? 's' : ''}`);
            setSelectedFiles([]);
            setSelectAllChecked(false);
            fetchFiles();
          } else {
            const errorData = await response.json();
            toast.error("Error",`Failed to delete files: ${errorData.message || 'Unknown error'}`);
          }
        } catch (error) {
          console.error('Error deleting files:', error);
          toast.error("Error",'Error deleting files. Please try again.');
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
        // Only prevent default and select all files if NOT in a text input
        if (!isTextInput) {
          event.preventDefault();
          handleSelectAll();
        }
        // If in a text input, let the browser handle Ctrl+A for text selection
      }
      
      // Delete key for bulk delete
      if (event.key === 'Delete' && selectedFiles.length > 0) {
        // Only prevent default if NOT in a text input
        if (!isTextInput) {
          event.preventDefault();
          deleteMany();
        }
        // If in a text input, let the browser handle Delete/Backspace for text editing
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleSelectAll, selectedFiles, deleteMany]);


  if (loading || !hasInitialised || !currentUser) {
    return <GlobalLoading loadingText={loading ? "Loading files...": undefined} />
  }

  return (
    <div className="files-container">
      {/* Main container with Figma design background */}
      <div className="figma-main-container">
        {/* Header Section */}
        <div className="figma-header">
          <h1 className="figma-title">Files</h1>
        </div>

        {/* Controls Section - Show action buttons when files are selected, otherwise show search/filters */}
        {selectedFiles.length > 0 ? (
          <div className="figma-controls" style={{ gap: '16px' }}>
            <button
              onClick={downloadSelected}
              className="custom-delete-button"
              style={{
                width: '127px',
                height: '40px',
                borderRadius: '400px',
                padding: '0px 16px',
                gap: '8px',
                display: 'flex',
                flexDirection: 'row' as const,
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: isDarkMode ? '#000000' : '#FFFFFF',
                border: `1px solid ${isDarkMode ? '#404040' : '#d9d9d9'}`,
                cursor: 'pointer',
                fontFamily: 'DM Sans',
                fontWeight: 500,
                fontSize: '15px',
                lineHeight: '22px',
                transition: 'all 0.3s ease'
              }}
            >
              <Download size={16} style={{ color: isDarkMode ? '#FFFFFF' : 'rgba(0, 0, 0, 0.9)' }} />
              <span style={{ color: isDarkMode ? '#FFFFFF' : 'rgba(0, 0, 0, 0.9)' }}>Download</span>
            </button>
            <button
              onClick={deleteMany}
              className="custom-delete-button"
              style={{
                width: '102px',
                height: '40px',
                borderRadius: '400px',
                padding: '0px 16px',
                gap: '8px',
                display: 'flex',
                flexDirection: 'row' as const,
                justifyContent: 'center',
                alignItems: 'center',
                backgroundColor: isDarkMode ? '#000000' : '#FFFFFF',
                border: `1px solid ${isDarkMode ? '#404040' : '#d9d9d9'}`,
                color: '#D13036',
                cursor: 'pointer',
                fontFamily: 'DM Sans',
                fontWeight: 500,
                fontSize: '15px',
                lineHeight: '22px',
                transition: 'all 0.3s ease'
              }}
            >
              <Trash2 size={16} style={{ color: '#D13036' }} />
              <span style={{ color: '#D13036' }}>Delete</span>
            </button>
          </div>
        ) : (
          <div className="figma-controls">
            {/* Search Input */}
            <div className="figma-search-container">
              <Input
                placeholder=""
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  debouncedSearch(e.target.value);
                }}
                className="figma-search-input"
                prefix={<SearchIcon size={16} />}
              />
            </div>

            {/* Filter Dropdowns */}
            <div className="figma-filters">
              <Select
                value={sortField}
                onChange={setSortField}
                className="figma-dropdown"
                style={{ width: 132 }}
              >
                <Select.Option value="uploadedAt">Sort by date</Select.Option>
                <Select.Option value="filename">Sort by name</Select.Option>
                <Select.Option value="size">Sort by size</Select.Option>
                <Select.Option value="automationName">Sort by automation</Select.Option>
              </Select>

              <Select
                value={sortOrder}
                onChange={setSortOrder}
                className="figma-dropdown"
                style={{ width: 129 }}
              >
                <Select.Option value="desc">Descending</Select.Option>
                <Select.Option value="asc">Ascending</Select.Option>
              </Select>

              <Select
                value={fileTypeFilter}
                onChange={setFileTypeFilter}
                className="figma-dropdown"
                style={{ width: 109 }}
              >
                <Select.Option value="all">All types</Select.Option>
                <Select.Option value="pdf">PDF</Select.Option>
                <Select.Option value="word">Word</Select.Option>
                <Select.Option value="excel">Excel</Select.Option>
                <Select.Option value="powerpoint">PowerPoint</Select.Option>
                <Select.Option value="text">Text</Select.Option>
                <Select.Option value="image">Images</Select.Option>
                <Select.Option value="video">Videos</Select.Option>
                <Select.Option value="audio">Audio</Select.Option>
                <Select.Option value="code">Code</Select.Option>
                <Select.Option value="archive">Archives</Select.Option>
                <Select.Option value="other">Other</Select.Option>
              </Select>
            </div>
          </div>
        )}

        {/* File List Section */}
        <div className="figma-file-list">

          {files.length === 0 ? (
            <div className="figma-empty-state">
              <File className="w-16 h-16 tertiary-text mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-color mb-2">
                No files found
              </h3>
              <p className="secondary-text">
                Upload files or run automations to see them here
              </p>
            </div>
          ) : filteredFiles.length === 0 ? (
            <div className="figma-empty-state">
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  <span>
                    No files match your search criteria.
                    <br />
                    <AntButton type="link" onClick={clearFilters}>Clear filters</AntButton>
                  </span>
                }
              />
            </div>
          ) : (
        <>
          <AntTable
            dataSource={paginatedFiles}
            rowKey="_id"
            rowSelection={{
              selectedRowKeys: selectedFiles,
              onChange: (selectedRowKeys: React.Key[]) => {
                setSelectedFiles(selectedRowKeys as string[]);
              },
              onSelectAll: (selected: boolean) => {
                if (selected) {
                  const visibleIds = paginatedFiles.map(f => f._id);
                  setSelectedFiles(visibleIds);
                            } else {
                  setSelectedFiles([]);
                }
              },
            }}
            columns={[
              {
                title: 'File name',
                dataIndex: 'originalName',
                key: 'name',
                width: '35%',
                ellipsis: true,
                render: (text: string, record: FileItem) => {
                  const FileIcon = getFileIcon(record.mimeType || '', record.originalName || record.filename || '');
                  const iconColorClass = getFileIconColor(record.mimeType || '', record.originalName || record.filename || '');
                  const fileName = record.originalName || record.filename || 'Untitled File';
                  
                  return (
                    <Tooltip title={fileName} placement="topLeft" mouseEnterDelay={0.3} overlayClassName="file-name-tooltip">
                      <div className="flex items-center gap-3 min-w-0" style={{ width: '100%', maxWidth: '100%', overflow: 'hidden' }}>
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${iconColorClass}`} style={{ flexShrink: 0, pointerEvents: 'none' }}>
                          <FileIcon className="w-4 h-4" />
                        </div>
                        <div 
                          className="text-sm font-medium text-color"
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            minWidth: 0,
                            flex: 1,
                            maxWidth: 'calc(100% - 52px)',
                            display: 'block'
                          }}
                        >
                          {fileName}
                        </div>
                      </div>
                    </Tooltip>
                  );
                },
              },
              {
                title: 'Date added',
                dataIndex: 'uploadedAt',
                width: '18%',
                render: (uploadedAt: string | number | Date, record: FileItem) => {
                  try {
                    const createdDate = uploadedAt || record.createdAt || record.created_at;
                                  if (!createdDate) return 'Unknown date';

                                  let date;
                                  if (typeof createdDate === 'string') {
                                    date = new Date(createdDate);
                                    if (isNaN(date.getTime())) {
                                      const timestamp = parseInt(createdDate);
                                      if (!isNaN(timestamp)) {
                                        date = new Date(timestamp);
                                      } else {
                                        if (createdDate.length === 24) {
                                          const objectIdDate = new Date(parseInt(createdDate.substring(0, 8), 16) * 1000);
                                          if (!isNaN(objectIdDate.getTime())) {
                                            date = objectIdDate;
                                          }
                                        }
                                      }
                                    }
                                  } else if (typeof createdDate === 'number') {
                                    date = new Date(createdDate);
                    } else if (createdDate && typeof createdDate === 'object' && '$date' in createdDate) {
                      date = new Date((createdDate as { $date: string }).$date);
                                  } else {
                                    date = new Date(createdDate);
                                  }

                                  if (isNaN(date.getTime())) {
                                    return 'Invalid date';
                                  }

                                  const dateStr = date.toLocaleDateString();
                                  const timeStr = date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

                                  return `${dateStr} ${timeStr}`;
                  } catch {
                                  return 'Invalid date';
                                }
                },
              },
              {
                title: 'Size',
                dataIndex: 'size',
                key: 'size',
                width: '12%',
                render: (size: number) => size ? formatFileSize(size) : '-',
              },
              {
                title: 'Type',
                dataIndex: 'mimeType',
                key: 'type',
                width: '12%',
                render: (mimeType: string, record: FileItem) => {
                  const fileType = getFileType(mimeType || '', record.originalName || record.filename || '');
                  
                  return (
                    <span className={`type-tag type-${fileType}`}>
                      {fileType}
                    </span>
                  );
                },
              },
              {
                title: 'Automation name',
                dataIndex: 'automationName',
                key: 'automation',
                width: '13%',
                ellipsis: {
                  showTitle: false,
                },
                render: (automationName: string, record: FileItem) => {
                  if (!automationName || !record.automationId) {
                    return '-';
                  }
                  
                  return (
                    <span 
                      className="truncate block cursor-pointer text-blue-500 hover:text-blue-700 hover:underline"
                      title={`Click to open automation: ${automationName}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(`/canvas/${record.automationId}`);
                      }}
                      style={{
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {automationName}
                    </span>
                  );
                },
              },
              {
                title: '',
                key: 'actions',
                width: '10%',
                render: (_: unknown, record: FileItem) => (
                  <Space>
                        <Tooltip title="Download">
                          <AntButton
                            type="text"
                        size="small"
                            onClick={() => {
                              const link = document.createElement('a');
                          link.href = `/api/files/${record._id}`;
                          link.download = record.originalName || record.filename || 'download';
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                            }}
                        className="p-1"
                          >
                            <Download className="w-4 h-4" />
                          </AntButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <AntButton
                            type="text"
                        size="small"
                            onClick={async () => {
                              if (confirm('Are you sure you want to delete this file?')) {
                                try {
                              const response = await fetch(`/api/files/${record._id}`, {
                                    method: 'DELETE',
                                    headers: { 'Content-Type': 'application/json' }
                                  });

                                  if (response.ok) {
                                setFiles(prevFiles => prevFiles.filter(f => f._id !== record._id));
                                    toast.success('File deleted successfully');
                                  } else {
                                    const errorData = await response.json();
                                    toast.error("Error",`Failed to delete file: ${errorData.message}`);
                                  }
                                } catch (error) {
                                  console.error('Error deleting file:', error);
                                  toast.error("Error",'Error deleting file. Please try again.');
                                }
                              }
                            }}
                        className="p-1"
                          >
                            <Trash2 className="w-4 h-4" />
                          </AntButton>
                        </Tooltip>
                  </Space>
                ),
              },
            ]}
            pagination={false}
            className="files-table file-table transparent-table"
            size="middle"
          />

          {/* Pagination */}
          {filteredFiles.length > pageSize && (
            <div className="flex justify-center">
              <Pagination
                current={currentPage}
                total={filteredFiles.length}
                pageSize={pageSize}
                showSizeChanger
                showQuickJumper
                showTotal={(total, range) =>
                  `${range[0]}-${range[1]} of ${total} files`
                }
                pageSizeOptions={['10', '20', '50', '100']}
                onChange={(page, size) => {
                  setCurrentPage(page);
                  if (size !== pageSize) {
                    setPageSize(size);
                    setCurrentPage(1);
                  }
                }}
                style={{ marginTop: '24px' }}
              />
            </div>
          )}
        </>
      )}
        </div>
      </div>
    </div>
  );
}
