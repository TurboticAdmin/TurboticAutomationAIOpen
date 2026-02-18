"use client";

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { toast } from '@/hooks/use-toast';
import { Drawer, Button, Spin, message, Modal, Empty, Tooltip } from 'antd';
import { X, Eye, Clock, FileText, ChevronDown } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';
import { diffLines, Change } from 'diff';
import 'highlight.js/styles/github-dark.css';
import eventsEmitter from '@/lib/events-emitter';
import { useTheme } from '@/contexts/ThemeContext';
import { LoadingOutlined } from '@ant-design/icons';

interface CodeFile {
  id: string;
  name: string;
  code: string;
  status?: 'added' | 'modified' | 'deleted' | 'unchanged'; // GitHub-like change tracking
}

interface CodeVersion {
  sha?: string; // Short SHA for display
  version: string;
  message: string;
  timestamp: string;
  userId?: string;
  user?: {
    name?: string;
    email?: string;
  };
  metadata: {
    automationId: string;
    dependencies?: any[];
    environmentVariables?: any[];
    aiModel?: string;
    totalFiles?: number;    // Total number of files in this version
    changedFiles?: number;  // Number of files that were changed (added/modified/deleted)
  };
  code?: string;      // Single file mode
  files?: CodeFile[] | Array<{ id: string; name: string }>; // Multi-file mode (full or metadata only)
}

interface VersionHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  automationId: string;
  currentCode?: string; // Current code for single-file mode
  currentFiles?: CodeFile[]; // Current files for v3 multi-file mode
  onRollback?: (version: string, code: string, dependencies: any[], envVars: any[], files?: CodeFile[]) => void;
}

export default function VersionHistoryDrawer({
  open,
  onClose,
  automationId,
  currentCode,
  currentFiles,
  onRollback,
}: VersionHistoryDrawerProps) {
  const [versions, setVersions] = useState<CodeVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDiff] = useState(true); // Always show diff mode
  const [selectedVersion, setSelectedVersion] = useState<CodeVersion | null>(null);
  const [viewingCode, setViewingCode] = useState(false);
  const [rollingBack, setRollingBack] = useState(false);
  const [viewLoading, setViewLoading] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [activeFileId, setActiveFileId] = useState<string | null>(null); // For multi-file mode
  const [expandedVersions, setExpandedVersions] = useState<Set<string>>(new Set()); // Track which version cards are expanded
  const [previousVersionCode, setPreviousVersionCode] = useState<string>(''); // Code from previous version for diff comparison
  const [loadingPreviousVersion, setLoadingPreviousVersion] = useState(false);
  const [previousVersionData, setPreviousVersionData] = useState<CodeVersion | null>(null); // Full previous version data for file comparison
  const [fileChanges, setFileChanges] = useState<Array<{ fileId: string; fileName: string; status: 'added' | 'modified' | 'deleted' }>>([]); // File change status
  const openRef = useRef(open); // Ref to track latest open state
  const {theme} = useTheme();
  const isDark = theme === 'dark';

  // Keep ref in sync with state
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  useEffect(() => {
    if (open) {
      loadVersionHistory();
      loadStats();
    }
  }, [open, automationId]);

  useEffect(() => {
    const unsubscribe = eventsEmitter.on('version-control:version-created', () => {
      // Only refresh if drawer is open (check ref for latest value)
      if (openRef.current) {
        loadVersionHistory();
        loadStats();
      }
    });

    return () => unsubscribe();
  }, [automationId]);

  // Set active file to first non-deleted file when a version with multiple files is selected
  useEffect(() => {
    if (selectedVersion?.files && selectedVersion.files.length > 0) {
      // Find first non-deleted file
      const firstNonDeletedFile = selectedVersion.files.find((f: any) => f.status !== 'deleted');
      setActiveFileId(firstNonDeletedFile?.id || selectedVersion.files[0].id);
    } else {
      setActiveFileId(null);
    }
  }, [selectedVersion]);

  // Load previous version code and compare files when viewing diff
  useEffect(() => {
    const loadPreviousCode = async () => {
      if (selectedVersion && versions.length > 0) {
        setLoadingPreviousVersion(true);
        try {
          const { code, versionData } = await getPreviousVersionData(selectedVersion, activeFileId || undefined, versions);
          setPreviousVersionCode(code);
          setPreviousVersionData(versionData);

          // Calculate file changes
          if (versionData) {
            const changes = compareVersionsFiles(selectedVersion, versionData);
            // Deduplicate changes by fileId to prevent same file appearing multiple times
            const uniqueChanges = Array.from(
              new Map(changes.map(change => [change.fileId, change])).values()
            );
            setFileChanges(uniqueChanges);
          } else {
            setFileChanges([]);
          }
        } catch (error) {
          console.error('Error loading previous version code:', error);
          setPreviousVersionCode('');
          setPreviousVersionData(null);
          setFileChanges([]);
        } finally {
          setLoadingPreviousVersion(false);
        }
      } else {
        setPreviousVersionCode('');
        setPreviousVersionData(null);
        setFileChanges([]);
      }
    };

    loadPreviousCode();
  }, [selectedVersion, activeFileId, versions, automationId]);

  const loadVersionHistory = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/code-versions/history?automationId=${automationId}&limit=50`);
      const data = await response.json();

      if (!response.ok) {
        console.error('Version history error:', data);
        toast.error("Error",data.error || `Failed to load version history (${response.status})`);
        return;
      }

      if (data.success) {
        setVersions(data.versions);
      } else {
        toast.error("Error",data.error || 'Failed to load version history');
      }
    } catch (error: any) {
      console.error('Error loading version history:', error);
      toast.error("Error",'Failed to load version history');
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await fetch(`/api/code-versions/stats?automationId=${automationId}`);
      const data = await response.json();

      if (data.success) {
        setStats(data.stats);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const viewVersion = async (version: CodeVersion) => {
    setViewLoading(version.version);
    try {
      const response = await fetch(`/api/code-versions/get?automationId=${automationId}&version=${version.version}`);
      const data = await response.json();

      if (data.success) {
        setSelectedVersion(data.version);
        setViewingCode(true);
      } else {
        toast.error("Error",'Failed to load version code');
      }
    } catch (error) {
      console.error('Error viewing version:', error);
      toast.error("Error",'Failed to load version code');
    } finally {
      setViewLoading(null);
    }
  };

  const handleRollback = async (version: CodeVersion) => {
    Modal.confirm({
      title: (
        <div className="flex items-center gap-3">
          <span className="text-2xl">⚠️</span>
          <span className="text-gray-900 dark:text-white">Restore Previous Version?</span>
        </div>
      ),
      content: (
        <div className="py-2">
          <p className="text-sm mb-3 text-gray-900 dark:text-white">
            You're about to restore <strong>{version.version}</strong>. Your current version will be preserved in history.
          </p>
        </div>
      ),
      closable: true,
      okText: 'Restore Version',
      cancelText: 'Cancel',
      okButtonProps: {
        className: "bg-blue-500 hover:bg-blue-600 dark:bg-blue-600 dark:hover:bg-blue-700 text-white border-none rounded-lg"
      },
      cancelButtonProps: {
        className: "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-900 dark:text-white rounded-lg"
      },
      icon: null,
      onOk: async () => {
        setRollingBack(true);
        try {
          const response = await fetch(`/api/code-versions/get?automationId=${automationId}&version=${version.version}`);
          const data = await response.json();

          if (data.success && data.version) {
            if (onRollback) {
              // Filter out deleted files when rolling back
              const activeFiles = data.version.files?.filter((f: CodeFile) => f.status !== 'deleted') || [];

              await onRollback(
                version.version,
                data.version.code,
                data.version.metadata?.dependencies || [],
                data.version.metadata?.environmentVariables || [],
                activeFiles.length > 0 ? activeFiles : undefined // Pass only active files for multi-file versions
              );
            }
            toast.success(`Restored to ${version.version}`);

            // Refresh version history after successful rollback
            await loadVersionHistory();
            await loadStats();
          } else {
            toast.error("Error",data.error || 'Failed to load version');
          }
        } catch (error) {
          console.error('Failed to rollback version:', error);
          toast.error("Error",'Failed to rollback version');
        } finally {
          setRollingBack(false);
        }
      },
    });
  };

  const highlightCode = (code: string) => {
    try {
      const highlighted = hljs.highlight(code, { language: 'javascript' }).value;
      const sanitized = DOMPurify.sanitize(highlighted);
      return <div dangerouslySetInnerHTML={{ __html: sanitized }} />;
    } catch {
      return <pre>{code}</pre>;
    }
  };

  // Get current code for comparison
  const getCurrentCodeForFile = (fileId?: string): string => {
    if (currentFiles && currentFiles.length > 0 && fileId) {
      const file = currentFiles.find((f: any) => f.id === fileId);
      return file?.code || '';
    }
    return currentCode || '';
  };

  // Get previous version code and data for comparison
  const getPreviousVersionData = async (selectedVersion: CodeVersion, fileId?: string, versionsList?: CodeVersion[]): Promise<{ code: string; versionData: CodeVersion | null }> => {
    const versionsToUse = versionsList || versions;
    
    if (!selectedVersion.version) {
      return { code: '', versionData: null };
    }

    if (versionsToUse.length === 0) {
      return { code: '', versionData: null };
    }

    // Find the index of selected version in the versions array
    const selectedIndex = versionsToUse.findIndex(v => v.version === selectedVersion.version);
    
    if (selectedIndex < 0) {
      return { code: '', versionData: null };
    }

    // Versions are sorted newest first (index 0 = newest, last index = oldest)
    // To get the previous version, we need the next index (+1) which is older
    if (selectedIndex >= versionsToUse.length - 1) {
      // This is the oldest version, no previous version exists
      return { code: '', versionData: null };
    }

    // Get the previous version (older version, higher index)
    const previousVersion = versionsToUse[selectedIndex + 1];
    if (!previousVersion || !previousVersion.version) {
      return { code: '', versionData: null };
    }

    try {
      const response = await fetch(`/api/code-versions/get?automationId=${automationId}&version=${previousVersion.version}`);
      const data = await response.json();

      if (data.success && data.version) {
        // Store full version data for file comparison
        const previousData: CodeVersion = {
          version: data.version.version,
          message: data.version.message,
          timestamp: data.version.timestamp,
          metadata: data.version.metadata || {},
          code: data.version.code,
          files: data.version.files,
        };

        // Get code for the specific file
        // For newly added files, previous version code should be empty
        let code = '';
        if (data.version.files && data.version.files.length > 0) {
          // Multi-file mode: only get code if the file exists in previous version
          if (fileId) {
            const fileToShow = data.version.files.find((f: any) => f.id === fileId);
            if (fileToShow) {
              code = isFullCodeFile(fileToShow) ? fileToShow.code : '';
            }
            // If file not found, code remains empty (file was added in current version)
          } else {
            // No specific fileId, fallback to first file (for single-file view)
            const fileToShow = data.version.files[0];
            code = isFullCodeFile(fileToShow) ? fileToShow.code : '';
          }
        } else {
          // Single file mode
          code = data.version.code || '';
        }

        return { code, versionData: previousData };
      } else {
        console.log('getPreviousVersionData: API response failed', data);
      }
    } catch (error) {
      console.error('Error loading previous version:', error);
    }
    return { code: '', versionData: null };
  };

  // Type guard to check if file has code property
  const isFullCodeFile = (file: any): file is CodeFile => {
    return file && typeof file === 'object' && 'code' in file && typeof file.code === 'string';
  };

  // Compare files between two versions to determine change status
  const compareVersionsFiles = (currentVersion: CodeVersion | null, previousVersion: CodeVersion | null): Array<{ fileId: string; fileName: string; status: 'added' | 'modified' | 'deleted' }> => {
    if (!currentVersion || !previousVersion) {
      return [];
    }

    // Handle single-file mode
    if (!currentVersion.files && !previousVersion.files) {
      // Both are single file - always modified if we're comparing
      if (currentVersion.code !== previousVersion.code) {
        return [{ fileId: 'main', fileName: 'main.js', status: 'modified' }];
      }
      return [];
    }

    // Handle multi-file mode
    // Filter out deleted files from both versions for comparison
    const currentFiles = (currentVersion.files || []).filter((f: any) => f.status !== 'deleted');
    const previousFiles = (previousVersion.files || []).filter((f: any) => f.status !== 'deleted');

    // Create maps for easy lookup using file ID (prefer ID over name for matching)
    const currentFileMap = new Map<string, any>();
    const previousFileMap = new Map<string, any>();

    currentFiles.forEach((f: any) => {
      const fileId = f.id || getFileNameForDisplay(f);
      currentFileMap.set(fileId, f);
    });

    previousFiles.forEach((f: any) => {
      const fileId = f.id || getFileNameForDisplay(f);
      previousFileMap.set(fileId, f);
    });

    // Track which files we've already processed to avoid duplicates
    // Use a map keyed by fileId to track the final status of each file
    const fileStatusMap = new Map<string, { fileId: string; fileName: string; status: 'added' | 'modified' | 'deleted' }>();

    // First pass: Process current files (added and modified)
    currentFiles.forEach((file: any) => {
      const fileId = file.id || getFileNameForDisplay(file);
      const fileName = getFileNameForDisplay(file);
      
      if (!previousFileMap.has(fileId)) {
        // File exists in current but not in previous = newly added
        fileStatusMap.set(fileId, { fileId, fileName, status: 'added' });
      } else {
        // File exists in both - check if modified (compare code if available)
        const prevFile = previousFileMap.get(fileId);
        const currentCode = isFullCodeFile(file) ? file.code : '';
        const prevCode = isFullCodeFile(prevFile) ? prevFile.code : '';
        
        if (currentCode !== prevCode) {
          fileStatusMap.set(fileId, { fileId, fileName, status: 'modified' });
        }
      }
    });

    // Second pass: Process previous files for deletions (only if not already in map)
    previousFiles.forEach((file: any) => {
      const fileId = file.id || getFileNameForDisplay(file);
      const fileName = getFileNameForDisplay(file);
      
      // Only mark as deleted if file doesn't exist in current AND wasn't already processed
      if (!currentFileMap.has(fileId) && !fileStatusMap.has(fileId)) {
        // File existed in previous but not in current = deleted
        fileStatusMap.set(fileId, { fileId, fileName, status: 'deleted' });
      }
    });

    // Convert map to array
    return Array.from(fileStatusMap.values());
  };

  // Helper to get file names for display
  const getFileNameForDisplay = (file: any): string => {
    if (typeof file === 'object' && 'name' in file) {
      return file.name;
    }
    return typeof file === 'string' ? file : 'unnamed';
  };

  // Get file order - use explicit order field or fallback to creation order
  const getStepOrderFromFile = (file: any): number => {
    if (!file) {
      return Infinity;
    }

    // Use explicit order field if available (preferred - for new versions)
    if (typeof file.order === 'number') {
      return file.order;
    }

    // Fallback for old versions: Use file ID as a sortable value
    // File IDs are in format timestamp_index, so we can use them directly for sorting
    // This ensures chronological order when explicit order is not available
    if (file.id) {
      // Convert ID to a number for sorting (timestamp part ensures chronological order)
      // Format: "1761860168359_0" -> use full ID as string for lexicographic sort
      // Or extract timestamp as primary sort key
      const parts = file.id.split('_');
      if (parts.length >= 2) {
        const timestamp = parseInt(parts[0], 10);
        const index = parseInt(parts[1], 10);
        if (!isNaN(timestamp) && !isNaN(index)) {
          // Combine timestamp and index: timestamp * 1000 + index
          // This ensures files with same timestamp are ordered by index,
          // and files with different timestamps are ordered chronologically
          return timestamp * 1000 + index;
        }
      }
    }

    // If no order found, return Infinity (will be sorted last)
    return Infinity;
  };

  // Improved diff renderer with line numbers
  const renderDiff = (oldCode: string, newCode: string, showLineNumbers: boolean = true, showSingleLineNumber: boolean = false) => {
    // Compare oldCode (previous version) with newCode (selected version)
    // diffLines(oldCode, newCode) shows changes from oldCode to newCode
    // change.added => lines added in newCode (should be green/+)
    // change.removed => lines removed from oldCode (should be red/-)
    const changes = diffLines(oldCode, newCode);

    // Check if there are any actual changes (added or removed lines)
    const hasChanges = changes.some((change: Change) => change.added || change.removed);
    
    // If no changes and should show single line number, render simple code view with one line number column
    if (!hasChanges && showSingleLineNumber) {
      return (
        <div style={{
          fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace",
          fontSize: '14px',
          lineHeight: '1.6',
        }}>
          {newCode.split('\n').map((line, index) => (
            <div
              key={index}
              style={{
                display: 'flex',
                paddingLeft: '8px',
                paddingRight: '8px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                minHeight: '22px',
                alignItems: 'flex-start',
              }}
            >
              <span className="text-gray-500 dark:text-gray-400" style={{
                marginRight: '16px',
                userSelect: 'none',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: '12px',
                width: '40px',
                textAlign: 'right',
                flexShrink: 0
              }}>
                {index + 1}
              </span>
              <span style={{ flex: 1 }}>
                {line || ' '}
              </span>
            </div>
          ))}
        </div>
      );
    }

    // Calculate line numbers
    let oldLineNum = 0;
    let newLineNum = 0;
    const linesWithNumbers: Array<{
      line: string;
      oldLineNum: number | null;
      newLineNum: number | null;
      isAdded: boolean;
      isRemoved: boolean;
    }> = [];

    changes.forEach((change: Change) => {
      const lines = change.value.split('\n');
      if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop();
      }

      lines.forEach((line: string) => {
        if (change.added) {
          // Only in new code
          newLineNum++;
          linesWithNumbers.push({ line, oldLineNum: null, newLineNum, isAdded: true, isRemoved: false });
        } else if (change.removed) {
          // Only in old code
          oldLineNum++;
          linesWithNumbers.push({ line, oldLineNum, newLineNum: null, isAdded: false, isRemoved: true });
        } else {
          // Unchanged - present in both
          oldLineNum++;
          newLineNum++;
          linesWithNumbers.push({ line, oldLineNum, newLineNum, isAdded: false, isRemoved: false });
        }
      });
    });

    return (
      <div style={{
        fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace",
        fontSize: '14px',
        lineHeight: '1.6',
      }}>
        {linesWithNumbers.map((item, index) => {
          let borderColor = '3px solid transparent';
          let backgroundColor = 'transparent'; // Let parent handle background
          let markerColor = '#999';
          let marker = ' ';

          if (item.isAdded) {
            // Lines added in newCode (selected version) - Monaco diff colors
            borderColor = isDark ? '3px solid #3fb950' : '3px solid #487E02';
            backgroundColor = isDark ? 'rgba(46, 160, 67, 0.15)' : 'rgba(155, 185, 85, 0.2)';
            markerColor = isDark ? '#3fb950' : '#487E02';
            marker = '+';
          } else if (item.isRemoved) {
            // Lines removed from oldCode (previous version) - Monaco diff colors
            borderColor = isDark ? '3px solid #f85149' : '3px solid #D73A49';
            backgroundColor = isDark ? 'rgba(248, 81, 73, 0.15)' : 'rgba(255, 0, 0, 0.2)';
            markerColor = isDark ? '#f85149' : '#D73A49';
            marker = '-';
          }

          return (
            <div
              key={index}
              style={{
                display: 'flex',
                borderLeft: borderColor,
                backgroundColor: backgroundColor,
                paddingLeft: '8px',
                paddingRight: '8px',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                minHeight: '22px',
                alignItems: 'flex-start',
              }}
            >
              {showLineNumbers && (
                <>
                  <span style={{ 
                    color: markerColor, 
                    marginRight: '12px', 
                    userSelect: 'none',
                    width: '16px',
                    textAlign: 'center',
                    flexShrink: 0,
                  }}>
                    {marker}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400" style={{
                    marginRight: '16px',
                    userSelect: 'none',
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '12px',
                    width: '40px',
                    textAlign: 'right',
                    flexShrink: 0
                  }}>
                    {item.oldLineNum !== null ? item.oldLineNum : ''}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400" style={{
                    marginRight: '16px',
                    userSelect: 'none',
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: '12px',
                    width: '40px',
                    textAlign: 'right',
                    flexShrink: 0
                  }}>
                    {item.newLineNum !== null ? item.newLineNum : ''}
                  </span>
                </>
              )}
              <span style={{ flex: 1 }}>
                {item.line || ' '}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  const getTimeDisplay = (timestamp: string) => {
    const timeAgo = formatDistanceToNow(new Date(timestamp), { addSuffix: true });

    // Check if it's recent
    const diff = Date.now() - new Date(timestamp).getTime();
    const minutesAgo = Math.floor(diff / 60000);
    const hoursAgo = Math.floor(diff / 3600000);
    const daysAgo = Math.floor(diff / 86400000);

    if (minutesAgo < 1) return 'less than a minute ago';
    if (hoursAgo < 24) return timeAgo.replace('about ', '');
    if (daysAgo < 7) return timeAgo.replace('about ', '');

    // For older dates, show absolute date
    return new Date(timestamp).toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getFileCount = (version: CodeVersion): number => {
    if (version.files && Array.isArray(version.files)) {
      return version.files.length;
    }
    if (version.code) {
      return 1; // Single file mode
    }
    return 0;
  };

  const getFileNames = (version: CodeVersion): string[] => {
    if (version.files && Array.isArray(version.files) && version.files.length > 0) {
      return version.files.map(f => getFileNameForDisplay(f));
    }
    if (version.code) {
      return ['automation.js'];
    }
    return [];
  };

  // Get changed files from version metadata (GitHub-like)
  const getChangedFiles = (version: CodeVersion): CodeFile[] => {
    if (version.files && Array.isArray(version.files)) {
      // Filter files that have status: added, modified, or deleted
      return version.files.filter((f: any) =>
        f.status && f.status !== 'unchanged'
      ) as CodeFile[];
    }
    return [];
  };

  // Get total files count from metadata
  const getTotalFilesCount = (version: CodeVersion): number => {
    return version.metadata?.totalFiles || getFileCount(version);
  };

  // Get changed files count from metadata
  const getChangedFilesCount = (version: CodeVersion): number => {
    return version.metadata?.changedFiles || getChangedFiles(version).length;
  };

  const toggleExpanded = (versionSha: string) => {
    setExpandedVersions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(versionSha)) {
        newSet.delete(versionSha);
      } else {
        newSet.add(versionSha);
      }
      return newSet;
    });
  };

  return (
    <>
      <Drawer
        placement="left"
        onClose={onClose}
        open={open}
        width={526}
        closable={false}
        styles={{
          body: {
            padding: 0,
            position: 'relative',
            height: '100%',
            background: 'var(--list-item-background-color)'
          },
          header: {
            background: 'var(--list-item-background-color)',
            borderBottom: 0
          }
        }}
        title={
          <div>
            <div className="text-[24px] text-color !font-medium flex items-center justify-between">
              Version history
              <X onClick={onClose} className="text-color cursor-pointer" style={{ fontSize: 15 }} />
            </div>
            <p className="text-gray-600 dark:text-gray-400" style={{
              width: '379px',
              height: '23px',
              fontFamily: "'DM Sans'",
              fontStyle: 'normal',
              fontWeight: 400,
              fontSize: '15px',
              lineHeight: '22px',
              margin: 0,
              flex: 'none',
              order: 1,
              alignSelf: 'stretch',
              flexGrow: 1
            }}>
              {stats ? `${stats.totalVersions} saved versions` : 'Loading...'}
            </p>
          </div>
        }
      >
        <div style={{
          position: 'relative',
          width: '491px',
          background: 'var(--list-item-background-color)'
        }}>
          {loading ? (
            <div style={{
              display: 'flex',
              justifyContent: 'center',
              alignItems: 'center',
              height: '400px',
            }}>
              <Spin size="large" indicator={<LoadingOutlined spin style={{ fontSize: 48 }} />} />
            </div>
          ) : versions.length === 0 ? (
            <div style={{ marginTop: '200px', textAlign: 'center' }}>
              <Empty description="No versions yet" />
            </div>
          ) : (
            <>
              {/* Version Cards with Timeline */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '0px',
                gap: '20px',
                position: 'absolute',
                width: '400px',
                left: '61px',
                // top: '128px',
                paddingBottom: '100px'
              }}>
                {versions.map((version, index) => {
                  const isCurrent = index === 0;
                  const versionDisplay = version.version; // Display full version string like "v1.0.6"

                  return (
                    <div key={`${version.sha}-${index}`} style={{
                      position: 'relative',
                      width: '100%'
                    }}>
                      {/* Timeline Circle for this card */}
                      <div className="" style={{
                        position: 'absolute',
                        left: '-34px', // 61px - 27px = 34px offset to timeline position
                        top: '25px', // 20px padding + 5px to center with text
                        width: '12px',
                        height: '12px',
                        boxSizing: 'border-box',
                        border: '2px solid #1A8AF2',
                        borderRadius: '99px',
                        zIndex: 2,
                        background: 'var(--list-item-background-color)'
                      }} />

                      {/* Timeline connector line */}
                      {index < versions.length - 1 && (
                        <div style={{
                          position: 'absolute',
                          left: '-28.5px', // Center of circle (left: -34px + 6px - 0.5px for 1px line)
                          top: '37px', // Start after circle (25px + 12px)
                          width: '1px',
                          height: 'calc(100% + 20px)', // Extend to next card including gap
                          background: isDark ? '#626262' : '#D9D9D9',
                          zIndex: 1
                        }} />
                      )}

                      <div style={{
                      boxSizing: 'border-box',
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      padding: '20px',
                      gap: '16px',
                      width: '400px',
                      minHeight: '171px',
                      borderRadius: '12px',
                      flex: 'none',
                      order: index,
                      alignSelf: 'stretch',
                      flexGrow: 0,
                      border: '1px solid #FFFFFF33'
                    }}>
                      {/* Version Header */}
                      <div style={{
                        display: 'flex',
                        flexDirection: 'row',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '0px',
                        gap: '10px',
                        width: '360px',
                        height: '24px',
                        flex: 'none',
                        order: 0,
                        alignSelf: 'stretch',
                        flexGrow: 0
                      }}>
                        <div style={{
                          display: 'flex',
                          flexDirection: 'row',
                          alignItems: 'flex-end',
                          padding: '0px',
                          gap: '8px',
                          height: '22px',
                          flex: 'none',
                          order: 0,
                          flexGrow: 0
                        }}>
                          <span className="text-gray-900 dark:text-white" style={{
                            height: '22px',
                            fontFamily: "'DM Sans'",
                            fontStyle: 'normal',
                            fontWeight: 500,
                            fontSize: '15px',
                            lineHeight: '22px',
                            flex: 'none',
                            order: 0,
                            flexGrow: 0,
                            display: 'flex',
                            alignItems: 'flex-end'
                          }}>
                            {versionDisplay}
                          </span>

                          <span className="tertiary-text" style={{
                            height: '16px',
                            fontFamily: "'DM Sans'",
                            fontStyle: 'normal',
                            fontWeight: 400,
                            fontSize: '12px',
                            lineHeight: '16px',
                            flex: 'none',
                            order: 1,
                            flexGrow: 0,
                            display: 'flex',
                            alignItems: 'flex-end'
                          }}>
                            {getTimeDisplay(version.timestamp)}
                          </span>
                        </div>

                        {/* Current Badge */}
                        <div style={{
                          display: 'flex',
                          flexDirection: 'row',
                          justifyContent: 'center',
                          alignItems: 'center',
                          padding: '0px 10px',
                          gap: '4px',
                          width: '69px',
                          height: '24px',
                          background: isCurrent ? isDark ? '#334455' : '#1A8AF2' : 'transparent',
                          opacity: isCurrent ? 1 : 0,
                          borderRadius: '400px',
                          flex: 'none',
                          order: 1,
                          flexGrow: 0,
                        }}>
                          <span style={{
                            width: '49px',
                            height: '22px',
                            fontFamily: "'DM Sans'",
                            fontStyle: 'normal',
                            fontWeight: 600,
                            fontSize: '13px',
                            lineHeight: '22px',
                            color: isDark ?'#1A8AF2' : '#FFFFFF',
                            flex: 'none',
                            order: 0,
                            flexGrow: 0
                          }}>
                            Current
                          </span>
                        </div>
                      </div>

                      {/* Description */}
                      <div style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        padding: '0px',
                        gap: '10px',
                        width: '360px',
                        minHeight: '47px',
                        flex: 'none',
                        order: 1,
                        alignSelf: 'stretch',
                        flexGrow: 0
                      }}>
                        <p className="text-gray-600 dark:text-gray-300" style={{
                          width: '360px',
                          fontFamily: "'DM Sans'",
                          fontStyle: 'normal',
                          fontWeight: 400,
                          fontSize: '15px',
                          lineHeight: '22px',
                          margin: 0,
                          flex: 'none',
                          order: 0,
                          flexGrow: 1
                        }}>
                          {version.message}
                        </p>
                      </div>

                      {/* User Info */}
                      {version.user && (
                        <div style={{
                          display: 'flex',
                          flexDirection: 'row',
                          alignItems: 'center',
                          padding: '0px',
                          gap: '6px',
                          width: '360px',
                          flex: 'none',
                          order: 2,
                          alignSelf: 'stretch',
                          flexGrow: 0
                        }}>
                          <span className="secondary-text" style={{
                            fontFamily: "'DM Sans'",
                            fontStyle: 'normal',
                            fontWeight: 400,
                            fontSize: '12px',
                            lineHeight: '16px'
                          }}>
                            by
                          </span>
                          <span className="text-color" style={{
                            fontFamily: "'DM Sans'",
                            fontStyle: 'normal',
                            fontWeight: 500,
                            fontSize: '13px',
                            lineHeight: '18px'
                          }}>
                            {version.user.name || version.user.email || 'Unknown'}
                          </span>
                          {version.user.email && version.user.name && (
                            <span className="secondary-text" style={{
                              fontFamily: "'DM Sans'",
                              fontStyle: 'normal',
                              fontWeight: 400,
                              fontSize: '12px',
                              lineHeight: '16px'
                            }}>
                              ({version.user.email})
                            </span>
                          )}
                        </div>
                      )}

                      {/* File Change Indicator - GitHub-like display */}
                      {(version.files || version.code) && (() => {
                        const changedFiles = getChangedFiles(version);
                        const changedCount = getChangedFilesCount(version);
                        const totalCount = getTotalFilesCount(version);
                        const isExpanded = expandedVersions.has(version.sha || `version-${index}`);

                        return (
                          <Tooltip
                            title={
                              <div style={{ padding: '4px 0' }}>
                                {changedFiles.map((file, idx) => (
                                  <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{
                                      color: file.status === 'added' ? '#52c41a' :
                                             file.status === 'deleted' ? '#ff4d4f' : '#1890ff'
                                    }}>
                                      {file.status === 'added' ? '+' :
                                       file.status === 'deleted' ? '-' : 'M'}
                                    </span>
                                    <span>{file.name}</span>
                                  </div>
                                ))}
                              </div>
                            }
                            placement="top"
                          >
                            <div
                              onClick={() => toggleExpanded(version.sha || `version-${index}`)}
                              style={{
                                display: 'flex',
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: '8px',
                                cursor: 'pointer',
                                padding: '4px 0'
                              }}
                            >
                              <FileText style={{
                                width: '14px',
                                height: '14px',
                                color: '#6B7280',
                                flexShrink: 0
                              }} />
                              <span className="text-gray-500 dark:text-gray-400" style={{
                                fontFamily: "'DM Sans'",
                                fontStyle: 'normal',
                                fontWeight: 500,
                                fontSize: '13px',
                                lineHeight: '18px'
                              }}>
                                {changedCount} changed, {totalCount} total {totalCount === 1 ? 'file' : 'files'}
                              </span>
                            </div>
                            {/* Expanded list - shows on click */}
                            {isExpanded && (
                              <div style={{
                                display: 'flex',
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: '6px',
                                paddingLeft: '22px',
                                flexWrap: 'wrap',
                                marginTop: '8px'
                              }}>
                                {changedFiles.map((file, idx) => {
                                  const statusColor =
                                    file.status === 'added' ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' :
                                    file.status === 'deleted' ? 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200' :
                                    'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200';

                                  const statusIcon =
                                    file.status === 'added' ? '+' :
                                    file.status === 'deleted' ? '-' :
                                    'M';

                                  return (
                                    <span
                                      key={idx}
                                      className={statusColor}
                                      style={{
                                        padding: '2px 8px',
                                        borderRadius: '4px',
                                        fontFamily: "'DM Sans'",
                                        fontStyle: 'normal',
                                        fontWeight: 500,
                                        fontSize: '11px',
                                        lineHeight: '16px',
                                        whiteSpace: 'nowrap',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px'
                                      }}
                                    >
                                      <span style={{ fontWeight: 700 }}>{statusIcon}</span>
                                      {file.name}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                          </Tooltip>
                        );
                      })()}

                      {/* Action Buttons */}
                      <div style={{
                        display: 'flex',
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        padding: '0px',
                        gap: '10px',
                        width: isCurrent ? '86px' : '200px',
                        height: '32px',
                        flex: 'none',
                        order: 2,
                        flexGrow: 0
                      }}>
                        {/* View Button */}
                        <button
                          onClick={() => viewVersion(version)}
                          disabled={viewLoading === version.version}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                            alignItems: 'center',
                            padding: '0px 15px',
                            gap: '8px',
                            width: '86px',
                            height: '32px',
                            background: '#1A8AF2',
                            borderRadius: '99px',
                            border: 'none',
                            cursor: viewLoading === version.version ? 'not-allowed' : 'pointer',
                            flex: 'none',
                            order: 0,
                            flexGrow: 0,
                            opacity: viewLoading === version.version ? 0.6 : 1
                          }}
                        >
                          <div style={{
                            display: 'flex',
                            flexDirection: 'row',
                            justifyContent: 'center',
                            alignItems: 'center',
                            padding: '0px',
                            gap: '8px',
                            width: '56px',
                            height: '32px',
                            flex: 'none',
                            order: 0,
                            flexGrow: 0
                          }}>
                            <Eye style={{
                              width: '16px',
                              height: '16px',
                              color: '#FFFFFF',
                              flex: 'none',
                              order: 0,
                              flexGrow: 0
                            }} />

                            <span style={{
                              width: '32px',
                              height: '22px',
                              fontFamily: "'DM Sans'",
                              fontStyle: 'normal',
                              fontWeight: 400,
                              fontSize: '14px',
                              lineHeight: '22px',
                              color: '#FFFFFF',
                              flex: 'none',
                              order: 1,
                              flexGrow: 0
                            }}>
                              View
                            </span>
                          </div>
                        </button>

                        {/* Restore Button - Only show for non-current versions */}
                        {!isCurrent && (
                          <button
                            onClick={() => handleRollback(version)}
                            disabled={rollingBack}
                            className=" border-gray-300 dark:border-gray-600"
                            style={{
                              boxSizing: 'border-box',
                              display: 'flex',
                              flexDirection: 'column',
                              justifyContent: 'center',
                              alignItems: 'center',
                              padding: '0px 15px',
                              gap: '8px',
                              width: '104px',
                              height: '32px',
                              border: '1px solid #D9D9D9',
                              borderRadius: '99px',
                              cursor: rollingBack ? 'not-allowed' : 'pointer',
                              flex: 'none',
                              order: 1,
                              flexGrow: 0,
                              opacity: rollingBack ? 0.6 : 1
                            }}
                          >
                            <div style={{
                              display: 'flex',
                              flexDirection: 'row',
                              justifyContent: 'center',
                              alignItems: 'center',
                              padding: '0px 0px 1px',
                              gap: '8px',
                              width: '74px',
                              height: '32px',
                              flex: 'none',
                              order: 0,
                              flexGrow: 0
                            }}>
                              <Clock className="text-gray-900 dark:text-gray-100" style={{
                                width: '16px',
                                height: '16px',
                                flex: 'none',
                                order: 0,
                                flexGrow: 0
                              }} />

                              <span className="text-gray-900 dark:text-gray-100" style={{
                                width: '50px',
                                height: '22px',
                                fontFamily: "'DM Sans'",
                                fontStyle: 'normal',
                                fontWeight: 400,
                                fontSize: '14px',
                                lineHeight: '22px',
                                flex: 'none',
                                order: 1,
                                flexGrow: 0
                              }}>
                                Restore
                              </span>
                            </div>
                          </button>
                        )}
                      </div>
                    </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </Drawer>

      {/* Code Viewing Modal */}
      <Modal
        open={viewingCode}
        onCancel={() => {
          setViewingCode(false);
          setSelectedVersion(null);
        }}
        closable={false}
        footer={null}
        width={1100}
        styles={{
          body: {
            padding: '24px'
          }
        }}
        style={{
          top: '50%',
          transform: 'translateY(-50%)',
          maxHeight: '90vh'
        }}
        className={isDark ? 'version-control-modal-dark' : ''}
      >
        {selectedVersion && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            padding: '0px',
            gap: '32px',
            width: '100%'
          }}>
            {/* Header */}
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              padding: '0px',
              gap: '16px',
              width: '100%'
            }}>
              {/* Title Row */}
              <div style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'flex-start',
                padding: '0px',
                gap: '24px',
                width: '100%',
                height: '24px'
              }}>
                {/* Version Title and Time */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'flex-end',
                  padding: '0px',
                  gap: '10px',
                  flex: '1',
                  height: '24px'
                }}>
                  <span className="text-color" style={{
                    fontWeight: 400,
                    fontSize: '24px',
                  }}>
                    {selectedVersion.version}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400" style={{
                    height: '16px',
                    fontFamily: "'DM Sans'",
                    fontStyle: 'normal',
                    fontWeight: 400,
                    fontSize: '12px',
                    lineHeight: '16px'
                  }}>
                    {getTimeDisplay(selectedVersion.timestamp)}
                  </span>
                </div>


                {/* Close Button */}
                <div
                  onClick={() => {
                    setViewingCode(false);
                    setSelectedVersion(null);
                  }}
                  style={{
                    width: '24px',
                    height: '24px',
                    cursor: 'pointer'
                  }}
                >
                  <X className="text-gray-900 dark:text-white" style={{
                    width: '100%',
                    height: '100%'
                  }} />
                </div>
              </div>

              {/* Description */}
              <div className="text-gray-900 dark:text-white" style={{
                width: '100%',
                height: '22px',
                fontFamily: "'DM Sans'",
                fontStyle: 'normal',
                fontWeight: 400,
                fontSize: '15px',
                lineHeight: '22px'
              }}>
                {selectedVersion.message}
              </div>
            </div>

            {/* Code Container */}
            <div className="list-item-background-color" style={{
              boxSizing: 'border-box',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'flex-start',
              padding: '0px',
              width: '100%',
              height: '450px',
              borderRadius: '12px'
            }}>
              {/* Files Sidebar */}
              <div style={{
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '0px',
                gap: '12px',
                width: '250px',
                height: '450px',
                borderRight: '1px solid'
              }}>
                {/* Files Header */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                  padding: '16px 12px 0px',
                  gap: '10px',
                  width: '250px',
                  height: '40px'
                }}>
                  <span className="text-gray-900 dark:text-white" style={{
                    width: '32px',
                    height: '22px',
                    fontFamily: "'DM Sans'",
                    fontStyle: 'normal',
                    fontWeight: 500,
                    fontSize: '15px',
                    lineHeight: '22px'
                  }}>
                    Files
                  </span>
                </div>

                {/* File List */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  padding: '0px 12px',
                  gap: '10px',
                  width: '250px',
                  flex: 1,
                  overflowY: 'auto'
                }}>
                  {selectedVersion.files && selectedVersion.files.length > 0 ? (
                    // Multi-file mode: Show all files including deleted ones, sorted by step order
                    (() => {
                      const sortedFiles = [...selectedVersion.files].sort((a: any, b: any) => {
                        const orderA = getStepOrderFromFile(a);
                        const orderB = getStepOrderFromFile(b);                       
                        return orderA - orderB;
                      });
                      return sortedFiles;
                    })()
                      .map((file: any) => {
                        const isActive = activeFileId === file.id;
                        const isDeleted = file.status === 'deleted';
                        const statusColor =
                          file.status === 'added' ? 'text-green-600 dark:text-green-400' :
                          file.status === 'modified' ? 'text-blue-600 dark:text-blue-400' :
                          file.status === 'deleted' ? 'text-red-600 dark:text-red-400' :
                          'text-gray-400 dark:text-gray-500';

                        const statusIcon =
                          file.status === 'added' ? '+' :
                          file.status === 'modified' ? 'M' :
                          file.status === 'deleted' ? '-' :
                          ' ';

                        return (
                          <div
                            key={file.id}
                            onClick={() => !isDeleted && setActiveFileId(file.id)}
                            className={isActive && !isDeleted ? 'bg-gray-100 dark:bg-gray-700' : ''}
                            style={{
                              display: 'flex',
                              flexDirection: 'row',
                              alignItems: 'center',
                              padding: '0px 10px',
                              gap: '6px',
                              width: '226px',
                              height: '32px',
                              borderRadius: '6px',
                              cursor: isDeleted ? 'not-allowed' : 'pointer',
                              opacity: isDeleted ? 0.6 : 1
                            }}
                          >
                            <Tooltip
                              title={
                                file.status === 'added' ? 'Created' :
                                file.status === 'modified' ? 'Modified' :
                                file.status === 'deleted' ? 'Deleted' :
                                'Unchanged'
                              }
                            >
                              <span className={statusColor} style={{
                                fontWeight: 700,
                                fontSize: '12px',
                                flexShrink: 0,
                                width: '12px',
                                textAlign: 'center',
                                cursor: 'help'
                              }}>
                                {statusIcon}
                              </span>
                            </Tooltip>
                            <span className={isDeleted ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white'} style={{
                              fontFamily: "'DM Sans'",
                              fontStyle: 'normal',
                              fontWeight: isActive && !isDeleted ? 500 : 400,
                              fontSize: '14px',
                              lineHeight: '15px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                              flex: 1,
                              textDecoration: isDeleted ? 'line-through' : 'none'
                            }}>
                              {getFileNameForDisplay(file)}
                            </span>
                          </div>
                        );
                      })
                  ) : (
                    // Single file mode: Show automation.js
                    <div className="bg-gray-100 dark:bg-gray-700" style={{
                      display: 'flex',
                      flexDirection: 'row',
                      alignItems: 'center',
                      padding: '0px 10px',
                      gap: '10px',
                      width: '226px',
                      height: '32px',
                      borderRadius: '6px'
                    }}>
                      <span className="text-gray-900 dark:text-white" style={{
                        fontFamily: "'DM Sans'",
                        fontStyle: 'normal',
                        fontWeight: 400,
                        fontSize: '14px',
                        lineHeight: '15px'
                      }}>
                        automation.js
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Code Editor Area */}
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                padding: '0px',
                flex: '1',
                height: '450px'
              }}>
                {/* Tab Bar */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  padding: '0px',
                  gap: '10px',
                  width: '100%',
                  height: '36px',
                  borderTopRightRadius: '12px',
                }}>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: '0px',
                    width: '296px',
                    height: '36px'
                  }}>
                    <div className="list-item-background-color" style={{
                      display: 'flex',
                      flexDirection: 'row',
                      justifyContent: 'center',
                      alignItems: 'center',
                      padding: '0px 12px',
                      gap: '8px',
                      width: '173px',
                      height: '36px'
                    }}>
                      <span className="text-gray-900 dark:text-white" style={{
                        fontFamily: "'DM Sans'",
                        fontStyle: 'normal',
                        fontWeight: 500,
                        fontSize: '14px',
                        lineHeight: '22px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {(() => {
                          if (selectedVersion.files && selectedVersion.files.length > 0) {
                            // Multi-file mode: show active file name
                            const currentFile = selectedVersion.files.find((f: any) => f.id === activeFileId) || selectedVersion.files[0];
                            return getFileNameForDisplay(currentFile);
                          } else {
                            // Single file mode: show automation.js
                            return 'automation.js';
                          }
                        })()}
                      </span>
                    </div>
                  </div>
                </div>


                {/* Code Content */}
                <div style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  padding: '16px',
                  gap: '12px',
                  width: '100%',
                  height: 'calc(450px - 36px)',
                  overflow: 'auto'
                }}>
                  <div style={{
                    display: 'flex',
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    padding: '0px',
                    gap: '0px',
                    width: '100%'
                  }}>

                    {/* Code or Diff */}
                    <pre style={{
                      flex: '1',
                      margin: 0,
                      fontFamily: "'Fira Code', 'Consolas', 'Monaco', monospace",
                      fontStyle: 'normal',
                      fontWeight: 400,
                      fontSize: '14px',
                      lineHeight: '150%',
                      whiteSpace: 'normal',
                      wordBreak: 'break-word',
                      padding: '0'
                    }}>
                      {(() => {
                        let historicalCode = '';
                        let currentFile: any = null;
                        
                        if (selectedVersion.files && selectedVersion.files.length > 0) {
                          // Multi-file mode: show active file or first file
                          currentFile = selectedVersion.files.find(f => f.id === activeFileId) || selectedVersion.files[0];
                          historicalCode = isFullCodeFile(currentFile) ? currentFile.code : '';
                        } else {
                          // Single file mode
                          historicalCode = selectedVersion.code || '';
                        }

                        // Always render the diff
                        if (loadingPreviousVersion) {
                          return <div style={{ padding: '20px', textAlign: 'center' }}>Loading previous version...</div>;
                        }
                        
                        // Check if this file was deleted
                        const isFileDeleted = currentFile && currentFile.status === 'deleted';
                        if (isFileDeleted) {
                          // For deleted files, show diff with previous version's code (old code vs empty)
                          if (previousVersionData || previousVersionCode) {
                            return renderDiff(previousVersionCode || '', '');
                          } else {
                            return (
                              <div style={{ padding: '20px', textAlign: 'center', color: '#999' }}>
                                <div style={{ textDecoration: 'line-through', marginBottom: '8px' }}>
                                  {getFileNameForDisplay(currentFile)}
                                </div>
                                <div>This file was deleted in this version</div>
                              </div>
                            );
                          }
                        }
                        
                        // Check if this file was added (didn't exist in previous version)
                        const isFileAdded = currentFile && fileChanges.some(
                          (change: any) => change.fileId === (currentFile.id || getFileNameForDisplay(currentFile)) && change.status === 'added'
                        );
                        
                        // Check if file is unchanged (not modified, not added, not deleted)
                        const isFileUnchanged = currentFile && fileChanges.length > 0 && !fileChanges.some(
                          (change: any) => change.fileId === (currentFile.id || getFileNameForDisplay(currentFile))
                        );
                        
                        // For newly added files or first version, compare against empty string
                        const isFirstVersion = !previousVersionData;
                        const oldCodeForDiff = (isFileAdded || isFirstVersion) ? '' : (previousVersionCode || '');

                        // Check if file has actual changes
                        const hasFileChanges = isFileAdded || isFirstVersion || oldCodeForDiff !== historicalCode;
                        
                        // If file is unchanged, show single line number column; otherwise show two columns (diff view)
                        const shouldShowSingleLineNumber = isFileUnchanged && !hasFileChanges;
                        
                        // Render diff - show single line number if unchanged, two columns if changed
                        return renderDiff(oldCodeForDiff, historicalCode, true, shouldShowSingleLineNumber);
                      })()}
                    </pre>
                  </div>
                </div>
              </div>
            </div>

            {/* Warning Banner */}
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800" style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              padding: '12px',
              gap: '10px',
              width: '100%',
              borderRadius: '8px'
            }}>
              <div style={{
                width: '24px',
                height: '24px',
                color: '#FAAD14'
              }}>
                ⚠️
              </div>
              <span className="text-yellow-800 dark:text-yellow-200" style={{
                fontFamily: "'DM Sans'",
                fontStyle: 'normal',
                fontWeight: 500,
                fontSize: '14px',
                lineHeight: '20px'
              }}>
                Your current version will be preserved in history
              </span>
            </div>

            {/* Actions */}
            <div style={{
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              padding: '0px',
              gap: '8px',
              width: '100%',
              height: '40px'
            }}>
              <div style={{ opacity: 0 }}></div>
              <div style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                padding: '0px',
                gap: '8px',
                height: '40px'
              }}>
                {/* Close Button */}
                <button
                  onClick={() => {
                    setViewingCode(false);
                    setSelectedVersion(null);
                  }}
                  className="bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
                  style={{
                    boxSizing: 'border-box',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: '0px 15px',
                    gap: '8px',
                    width: '70px',
                    height: '40px',
                    border: '1px solid',
                    borderRadius: '99px',
                    cursor: 'pointer'
                  }}
                >
                  <span className="text-gray-900 dark:text-white" style={{
                    fontFamily: "'DM Sans'",
                    fontStyle: 'normal',
                    fontWeight: 400,
                    fontSize: '15px',
                    lineHeight: '22px'
                  }}>
                    Close
                  </span>
                </button>

                {/* Restore Button - only show if not the latest version */}
                {selectedVersion && versions.length > 0 && selectedVersion.version !== versions[0]?.version && (
                  <button
                    onClick={() => {
                      setViewingCode(false);
                      if (selectedVersion) {
                        handleRollback(selectedVersion);
                      }
                    }}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      justifyContent: 'center',
                      alignItems: 'center',
                      padding: '0px 15px',
                      gap: '8px',
                      width: '191px',
                      height: '40px',
                      background: '#1A8AF2',
                      borderRadius: '99px',
                      border: 'none',
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
                      width: '161px',
                      height: '40px'
                    }}>
                      <Clock style={{
                        width: '16px',
                        height: '16px',
                        color: '#FFFFFF'
                      }} />
                      <span style={{
                        fontFamily: "'DM Sans'",
                        fontStyle: 'normal',
                        fontWeight: 400,
                        fontSize: '15px',
                        lineHeight: '22px',
                        color: '#FFFFFF'
                      }}>
                        Restore this version
                      </span>
                    </div>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
