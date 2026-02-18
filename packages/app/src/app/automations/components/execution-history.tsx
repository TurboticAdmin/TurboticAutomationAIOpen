"use client";

import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertCircle, Clock, Play, Settings, Circle, FileText, Square, RefreshCw, Filter, Calendar } from 'lucide-react';
import { LogsModal } from '@/components/LogsModal';
import { Spin, Empty } from 'antd';
import { StandardizedSelect, StandardizedSelectOption } from '@/components/ui/standardized-select';
import SearchInput from '@/components/ui/search-input';
import FilterDropdown from '@/components/ui/filter-dropdown';
import InfiniteScroll from "react-infinite-scroll-component";
import { fetchAllAutomationsForFilter, AutomationForFilter } from '@/lib/automation-utils';
import { DatePicker } from 'antd';
import dayjs from 'dayjs';

interface ExecutionHistory {
  id: string;
  automationId: string;
  automationTitle: string;
  userId: string | null;
  userName: string;
  userEmail?: string;
  status: 'running' | 'success' | 'failed' | 'stopped' | 'unknown';
  startedAt: Date | null;
  endedAt?: Date | null;
  duration?: number | null;
  exitCode?: number | null;
  errorMessage?: string | null;
  triggerType?: 'manual' | 'scheduled' | 'api';
  triggerSource?: 'web-ui' | 'scheduler' | 'api-key';
  triggeredBy?: 'user' | 'scheduler' | 'api';
  triggeredBySystem?: 'web-ui' | 'automationai-scheduler' | 'api-key-authentication';
  triggeredAt?: string;
  scheduleId?: string;
  scheduleTitle?: string;
  cronExpression?: string;
  timezone?: string;
  scheduledAt?: string;
  environment?: 'local' | 'production';
  deploymentMethod?: 'local-script-runner' | 'kubernetes';
  deploymentName?: string;
  deviceId?: string;
  executionId?: string;
}

function formatDuration(durationMs?: number | null) {
  if (!durationMs) return 'N/A';
  const seconds = Math.floor(durationMs / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}

function formatTimeAgo(date: Date | string | null) {
  if (!date) return 'Unknown time';
  let dateObj: Date;
  try {
    dateObj = date instanceof Date ? date : new Date(date);
    if (isNaN(dateObj.getTime())) throw new Error('Invalid date');
  } catch {
    return 'Invalid date';
  }
  const now = new Date();
  const diffMs = now.getTime() - dateObj.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

const statusIcon = (status: string) => {
  switch (status) {
    case 'running':
      return <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />;
    case 'success':
      return (
        <div 
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 0,
            width: 20,
            height: 20,
            background: '#3C9F53',
            borderRadius: '333.333px',
            flex: 'none',
            order: 0,
            flexGrow: 0
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              flex: 'none',
              order: 0,
              flexGrow: 0,
              position: 'relative'
            }}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              style={{
                position: 'absolute',
                left: '0%',
                right: '0%',
                top: '0%',
                bottom: '0%'
              }}
            >
              <path
                d="M1.5 5L3.5 7L8.5 2"
                stroke="#FFFFFF"
                strokeWidth="1.66667"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  position: 'absolute',
                  left: '15.62%',
                  right: '12.5%',
                  top: '28.12%',
                  bottom: '21.88%'
                }}
              />
            </svg>
          </div>
        </div>
      );
    case 'failed':
      return (
        <div 
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 0,
            width: 20,
            height: 20,
            background: '#D13036',
            borderRadius: '333.333px',
            flex: 'none',
            order: 0,
            flexGrow: 0
          }}
        >
          <div
            style={{
              width: 4,
              height: 15,
              fontFamily: 'DM Sans',
              fontStyle: 'normal',
              fontWeight: 600,
              fontSize: '12.5px',
              lineHeight: '14px',
              textAlign: 'center',
              color: '#FFFFFF',
              flex: 'none',
              order: 0,
              flexGrow: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            !
          </div>
        </div>
      );
    case 'stopped':
      return (
        <div 
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 0,
            width: 20,
            height: 20,
            background: '#F3F4F6',
            borderRadius: '333.333px',
            flex: 'none',
            order: 0,
            flexGrow: 0
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              flex: 'none',
              order: 0,
              flexGrow: 0,
              position: 'relative'
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              style={{
                position: 'absolute',
                left: '0%',
                right: '0%',
                top: '0%',
                bottom: '0%'
              }}
            >
              {/* Top right line */}
              <path
                d="M9.375 1.875L9.375 1.875"
                stroke="rgba(0, 0, 0, 0.65)"
                strokeWidth="1"
                style={{
                  position: 'absolute',
                  left: '78.12%',
                  right: '12.5%',
                  top: '15.62%',
                  bottom: '65.62%'
                }}
              />
              {/* Top left line */}
              <path
                d="M1.5 3L1.5 3"
                stroke="rgba(0, 0, 0, 0.65)"
                strokeWidth="1"
                style={{
                  position: 'absolute',
                  left: '12.5%',
                  right: '12.5%',
                  top: '25%',
                  bottom: '50%'
                }}
              />
              {/* Bottom left line */}
              <path
                d="M1.5 7.875L1.5 7.875"
                stroke="rgba(0, 0, 0, 0.65)"
                strokeWidth="1"
                style={{
                  position: 'absolute',
                  left: '12.5%',
                  right: '78.12%',
                  top: '65.62%',
                  bottom: '15.62%'
                }}
              />
              {/* Bottom right line */}
              <path
                d="M1.5 6L1.5 6"
                stroke="rgba(0, 0, 0, 0.65)"
                strokeWidth="1"
                style={{
                  position: 'absolute',
                  left: '12.5%',
                  right: '12.5%',
                  top: '50%',
                  bottom: '25%'
                }}
              />
            </svg>
          </div>
        </div>
      );
    default:
      return (
        <div 
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            padding: 0,
            width: 20,
            height: 20,
            background: '#F3F4F6',
            borderRadius: '333.333px',
            flex: 'none',
            order: 0,
            flexGrow: 0
          }}
        >
          <div
            style={{
              width: 12,
              height: 12,
              flex: 'none',
              order: 0,
              flexGrow: 0,
              position: 'relative'
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 12 12"
              style={{
                position: 'absolute',
                left: '0%',
                right: '0%',
                top: '0%',
                bottom: '0%'
              }}
            >
              {/* Top right line */}
              <path
                d="M9.375 1.875L9.375 1.875"
                stroke="rgba(0, 0, 0, 0.65)"
                strokeWidth="1"
                style={{
                  position: 'absolute',
                  left: '78.12%',
                  right: '12.5%',
                  top: '15.62%',
                  bottom: '65.62%'
                }}
              />
              {/* Top left line */}
              <path
                d="M1.5 3L1.5 3"
                stroke="rgba(0, 0, 0, 0.65)"
                strokeWidth="1"
                style={{
                  position: 'absolute',
                  left: '12.5%',
                  right: '12.5%',
                  top: '25%',
                  bottom: '50%'
                }}
              />
              {/* Bottom left line */}
              <path
                d="M1.5 7.875L1.5 7.875"
                stroke="rgba(0, 0, 0, 0.65)"
                strokeWidth="1"
                style={{
                  position: 'absolute',
                  left: '12.5%',
                  right: '78.12%',
                  top: '65.62%',
                  bottom: '15.62%'
                }}
              />
              {/* Bottom right line */}
              <path
                d="M1.5 6L1.5 6"
                stroke="rgba(0, 0, 0, 0.65)"
                strokeWidth="1"
                style={{
                  position: 'absolute',
                  left: '12.5%',
                  right: '12.5%',
                  top: '50%',
                  bottom: '25%'
                }}
              />
            </svg>
          </div>
        </div>
      );
  }
};

const statusBadge = (status: string) => {
  switch (status) {
    case 'running':
      return 'bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400';
    case 'success':
      return 'bg-green-100 text-green-700 dark:bg-green-900/20 dark:text-green-400';
    case 'failed':
      return 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400';
    case 'stopped':
      return 'bg-orange-100 text-orange-700 dark:bg-orange-900/20 dark:text-orange-400';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
  }
};

interface ExecutionHistoryProps {
  externalSearchQuery?: string; // Search query from parent page
}

export const ExecutionHistory = ({ externalSearchQuery }: ExecutionHistoryProps = {}) => {
  const [executions, setExecutions] = useState<ExecutionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedExecutionId, setSelectedExecutionId] = useState<string | null>(null);
  const [logsModalOpen, setLogsModalOpen] = useState(false);
  
  // Applied filters (used for API calls)
  const [appliedAutomations, setAppliedAutomations] = useState<string[]>([]);
  const [appliedStatus, setAppliedStatus] = useState<string[]>([]);
  const [appliedDateRange, setAppliedDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);
  
  // Pending filters (what user is selecting, not yet applied)
  const [selectedAutomations, setSelectedAutomations] = useState<string[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);
  
  const [searchQuery, setSearchQuery] = useState(''); // The actual input value
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(''); // The debounced value used for API calls
  
  // Use internal search query if user has typed something, otherwise use external search query
  // This allows the main page search to filter run history, but also allows independent search within run history
  const effectiveSearchQuery = debouncedSearchQuery.trim() ? debouncedSearchQuery : (externalSearchQuery || '');
  const [allAutomationsForFilter, setAllAutomationsForFilter] = useState<AutomationForFilter[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const pageSize = 50;
  const isFetchingRef = useRef(false);
  const searchQueryRef = useRef('');

  // Load automations for filter dropdown
  const loadAutomationsForFilter = useCallback(async () => {
    const automations = await fetchAllAutomationsForFilter();
    setAllAutomationsForFilter(automations);
  }, []);

  // Handle search input change (immediate, for UI update)
  const handleSearchChange = useCallback((query: string) => {
    // Update the input value immediately for responsive UI
    setSearchQuery(query);
    // Also update the ref so handleSearch always has the latest value
    searchQueryRef.current = query;
  }, []);

  // Handle search - this will be triggered by the debounced search input
  const handleSearch = useCallback((query: string) => {
    // Use the ref value instead of the parameter, since the ref always has the latest
    const latestQuery = searchQueryRef.current;
    // Update the debounced search query which triggers the API call
    setDebouncedSearchQuery(latestQuery);
  }, []);

  const fetchExecutions = useCallback(async (pageNum: number = 1, append: boolean = false) => {
    // Prevent duplicate calls
    if (isFetchingRef.current) {
      return;
    }

    isFetchingRef.current = true;

    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setPage(1);
        setHasMore(true);
      }

      const offset = (pageNum - 1) * pageSize;
      let url = `/api/run/executions?limit=${pageSize}&offset=${offset}`;
      if (appliedStatus.length > 0) {
        url += `&status=${appliedStatus.join(',')}`;
      }
      if (appliedDateRange && appliedDateRange[0] && appliedDateRange[1]) {
        url += `&startDate=${appliedDateRange[0].format('YYYY-MM-DD')}&endDate=${appliedDateRange[1].format('YYYY-MM-DD')}`;
      }
      if (appliedAutomations.length > 0) {
        url += `&automationIds=${appliedAutomations.join(',')}`;
      }
      if (effectiveSearchQuery.trim()) {
        url += `&search=${encodeURIComponent(effectiveSearchQuery.trim())}`;
      }
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      const executions = Array.isArray(data) ? data : [];

      // Check if we have more data BEFORE updating state
      // If we got 0 items or less than pageSize, there's no more data
      const shouldHaveMore = executions.length >= pageSize;

      // If API returns 0 items, we've definitely reached the end
      if (executions.length === 0) {
        setHasMore(false);
        setLoading(false);
        setLoadingMore(false);
        isFetchingRef.current = false;
        return;
      }

      if (append) {
        let hasNewItems = true;
        // Deduplicate by execution ID
        setExecutions(prev => {
          const existingIds = new Set(prev.map(e => e.id));
          const newExecutions = executions.filter(e => !existingIds.has(e.id));
          // If after deduplication we have no new items, there's no more data
          if (newExecutions.length === 0) {
            hasNewItems = false;
            return prev;
          }
          return [...prev, ...newExecutions];
        });

        if (!hasNewItems) {
          setHasMore(false);
        } else {
          setHasMore(shouldHaveMore);
          setPage(prev => prev + 1);
        }
      } else {
        setExecutions(executions);
        setPage(2); // Next page will be 2
        setHasMore(shouldHaveMore);
      }

      // Fetch total count on first load
      if (!append) {
        fetchTotalCount();
      }
    } catch (error) {
      console.error('Error fetching executions:', error);
      if (!append) {
        setExecutions([]);
      }
      setHasMore(false); // Stop trying to fetch more on error
    } finally {
      setLoading(false);
      setLoadingMore(false);
      isFetchingRef.current = false;
    }
  }, [pageSize, appliedStatus, appliedDateRange, appliedAutomations, effectiveSearchQuery]);

  const fetchTotalCount = useCallback(async () => {
    try {
      let url = '/api/run/executions?countOnly=true';
      if (appliedStatus.length > 0) {
        url += `&status=${appliedStatus.join(',')}`;
      }
      if (appliedDateRange && appliedDateRange[0] && appliedDateRange[1]) {
        url += `&startDate=${appliedDateRange[0].format('YYYY-MM-DD')}&endDate=${appliedDateRange[1].format('YYYY-MM-DD')}`;
      }
      if (appliedAutomations.length > 0) {
        url += `&automationIds=${appliedAutomations.join(',')}`;
      }
      if (effectiveSearchQuery.trim()) {
        url += `&search=${encodeURIComponent(effectiveSearchQuery.trim())}`;
      }
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch count: ${response.status}`);
      
      const data = await response.json();
      setTotalCount(data.count || 0);
    } catch (error) {
      console.error('Error fetching total count:', error);
      setTotalCount(0);
    }
  }, [appliedStatus, appliedDateRange, appliedAutomations, effectiveSearchQuery]);

  // Sync internal search query display with external search query when it changes
  // Only sync if user hasn't typed anything in the internal search
  useEffect(() => {
    if (externalSearchQuery !== undefined && !debouncedSearchQuery.trim()) {
      setSearchQuery(externalSearchQuery);
      searchQueryRef.current = externalSearchQuery;
    }
  }, [externalSearchQuery, debouncedSearchQuery]);

  // Initial load
  useEffect(() => {
    loadAutomationsForFilter();
    // Initialize applied filters to match pending filters on mount
    setAppliedAutomations(selectedAutomations);
    setAppliedStatus(selectedStatus);
    setAppliedDateRange(dateRange);
    fetchExecutions(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset and refetch when applied filters change (not pending filters)
  useEffect(() => {
    setExecutions([]);
    setPage(1);
    setHasMore(true);
    fetchExecutions(1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appliedStatus, appliedDateRange, appliedAutomations, effectiveSearchQuery]);

  // Apply filters handler
  const handleApplyFilters = () => {
    setAppliedAutomations(selectedAutomations);
    setAppliedStatus(selectedStatus);
    setAppliedDateRange(dateRange);
  };

  // Check if there are pending filter changes
  const hasPendingChanges = 
    JSON.stringify(selectedAutomations.sort()) !== JSON.stringify(appliedAutomations.sort()) ||
    JSON.stringify(selectedStatus.sort()) !== JSON.stringify(appliedStatus.sort()) ||
    JSON.stringify(dateRange) !== JSON.stringify(appliedDateRange);

  // No client-side filtering needed - API now handles automation filter server-side
  const filteredExecutions = executions;

  // Normal hasMore behavior since server-side filtering is implemented
  const effectiveHasMore = hasMore;

  const loadMoreExecutions = () => {
    if (!loadingMore && effectiveHasMore && !loading) {
      fetchExecutions(page, true);
    }
  };

  const handleRefresh = () => {
    setExecutions([]);
    setPage(1);
    setHasMore(true);
    fetchExecutions(1, false);
  };

  const handleViewLogs = (historyId: string) => {
    setSelectedExecutionId(historyId);
    setLogsModalOpen(true);
  };

  return (
    <div className="space-y-4">
      {/* Search and Filter Controls */}
      <div className="space-y-4">
        {/* Search and Filter Row */}
        <div className="flex items-center gap-4 flex-wrap">
          {/* Search Input */}
          <SearchInput
            placeholder="Search"
            value={searchQuery}
            onChange={handleSearchChange}
            onSearch={handleSearch}
            debounceMs={300}
            width={240}
            height={40}
            borderRadius={99}
          />

          {/* Automation Filter Dropdown */}
          <FilterDropdown
            placeholder="Filter automations"
            items={allAutomationsForFilter.map(automation => ({
              id: automation.id,
              title: automation.title
            }))}
            selectedItems={selectedAutomations}
            onSelectionChange={setSelectedAutomations}
            width={234}
            height={40}
            borderRadius={99}
          />

          {/* Date Range Picker */}
          <DatePicker.RangePicker
            value={dateRange}
            onChange={(dates) => setDateRange(dates as [dayjs.Dayjs | null, dayjs.Dayjs | null])}
            placeholder={['Start date', 'End date']}
            style={{
              width: 280,
              height: 40,
              borderRadius: 99,
              fontSize: 14,
              fontFamily: 'DM Sans',
              fontWeight: 400,
              lineHeight: '22px',
              color: 'var(--muted-foreground)'
            }}
            className="list-item-background-color custom-date-picker"
            allowClear
            format="YYYY-MM-DD"
            variant="filled"
            disabledDate={(current) => {
              // Disable dates after today (future dates)
              return current && current.isAfter(dayjs(), 'day');
            }}
          />

          {/* Status Filter Dropdown */}
          <div style={{ width: 150, minWidth: 150 }}>
            <StandardizedSelect
              mode="multiple"
              placeholder="Status"
              value={selectedStatus}
              onChange={(value) => setSelectedStatus(Array.isArray(value) ? value : [])}
              allowClear
              maxTagCount="responsive"
              wrapperClassName="status-dropdown"
            >
              <StandardizedSelectOption value="success">Success</StandardizedSelectOption>
              <StandardizedSelectOption value="failed">Failed</StandardizedSelectOption>
              <StandardizedSelectOption value="running">Running</StandardizedSelectOption>
              <StandardizedSelectOption value="stopped">Stopped</StandardizedSelectOption>
            </StandardizedSelect>
          </div>

          {/* Refresh Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={loading}
            style={{
              width: 40,
              height: 40,
              borderRadius: 99,
              padding: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: 'auto'
            }}
          >
            <RefreshCw 
              size={16} 
              className="text-foreground"
              style={{ color: 'var(--foreground)' }}
            />
          </Button>
        </div>

        {/* Results Summary */}
        <div className="flex items-center justify-between flex-nowrap">
          {(appliedAutomations.length > 0 || appliedStatus.length > 0 || (appliedDateRange && appliedDateRange[0] && appliedDateRange[1])) ? (
            <div className="inline-flex items-center px-2 py-1 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-blue-700 dark:text-blue-400 whitespace-nowrap min-w-0 flex-shrink">
              <Filter size={12} className="mr-1 flex-shrink-0" />
              <span className="whitespace-nowrap">
                <span className="font-medium">{filteredExecutions.length}</span>
                <span> of {totalCount} execution{totalCount !== 1 ? 's' : ''}</span>
                {appliedAutomations.length > 0 && (
                  <> from <span className="font-medium">{appliedAutomations.length}</span> automation{appliedAutomations.length !== 1 ? 's' : ''}</>
                )}
                {appliedStatus.length > 0 && (
                  <> with status{appliedStatus.length > 1 ? 'es' : ''} <span className="font-medium">{appliedStatus.join(', ')}</span></>
                )}
                {appliedDateRange && appliedDateRange[0] && appliedDateRange[1] && (
                  <> between <span className="font-medium">{appliedDateRange[0].format('MMM DD')}</span> and <span className="font-medium">{appliedDateRange[1].format('MMM DD')}</span></>
                )}
              </span>
            </div>
          ) : (
            <div className="inline-flex items-center secondary-text rounded text-xs">
              <span><span className="font-medium">{totalCount}</span> execution{totalCount !== 1 ? 's' : ''} from all automations</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            {hasPendingChanges && (
              <Button
                variant="default"
                size="sm"
                onClick={handleApplyFilters}
                disabled={loading}
                style={{
                  height: 28,
                  borderRadius: 6,
                  padding: '0 12px',
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                Apply Filters
              </Button>
            )}
            {(hasPendingChanges || appliedAutomations.length > 0 || appliedStatus.length > 0 || (appliedDateRange && appliedDateRange[0] && appliedDateRange[1]) || searchQuery || debouncedSearchQuery) && (
              <button
                onClick={() => {
                  setSelectedAutomations([]);
                  setSelectedStatus([]);
                  setDateRange([null, null]);
                  setAppliedAutomations([]);
                  setAppliedStatus([]);
                  setAppliedDateRange([null, null]);
                  setSearchQuery('');
                  setDebouncedSearchQuery('');
                }}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="execution-history-scroll-container" id="execution-history-scroll">
        {loading ? (
          <div className="flex justify-center py-8">
            <Spin size="large" />
          </div>
        ) : executions.length === 0 ? (
          <Empty description="No execution history found" />
        ) : filteredExecutions.length === 0 ? (
          <Empty description="No executions found for selected automation" />
        ) : (
          <InfiniteScroll
            dataLength={filteredExecutions.length}
            next={loadMoreExecutions}
            hasMore={effectiveHasMore && !loading}
            loader={
              <div className="flex justify-center py-4">
                <Spin size="default" />
              </div>
            }
            scrollableTarget="execution-history-scroll"
            endMessage={
              filteredExecutions.length > 0 && !effectiveHasMore ? (
                <div className="text-center text-gray-500 py-4">
                  <p>No more execution history to load</p>
                </div>
              ) : null
            }
          >
            <div className="space-y-3">
              {filteredExecutions.map((exec, idx) => (
              <div
                key={`${exec.id}-${idx}`}
                className="p-4 rounded-lg list-item-background-color hover:shadow-[0_4px_25px_0_#0000001A] transition-all duration-300"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      {statusIcon(exec.status)}
                      <h4 
                        className="font-medium truncate ai-gradient-text" 
                        style={{ fontSize: '20px' }}
                      >
                        {exec.automationTitle}
                      </h4>
                      <Badge className={`text-xs ${statusBadge(exec.status)}`}>
                        {exec.status}
                      </Badge>
                    </div>

                    <div className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
                      <div className="flex items-center gap-4 secondary-text">
                        <span>
                          <span className="font-medium">Started:</span> {formatTimeAgo(exec.startedAt)}
                        </span>
                        {exec.duration && (
                          <span>
                            <span className="font-medium">Duration:</span> {formatDuration(exec.duration)}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 tertiary-text">
                        <span>
                          <span className="font-medium">Run by:</span> {exec.userName}
                        </span>
                        {exec.triggerType && (
                          <span>
                            <span className="font-medium">Trigger:</span> {exec.triggerType}
                          </span>
                        )}
                      </div>

                      {exec.exitCode !== undefined && exec.exitCode !== null && (
                        <div>
                          <span className="font-medium">Exit code:</span> {exec.exitCode}
                        </div>
                      )}

                      {exec.errorMessage && (
                        <div className="text-red-600 dark:text-red-400">
                          <span className="font-medium">Error:</span> {exec.errorMessage}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 ml-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleViewLogs(exec.id)}
                    >
                      <FileText className="w-4 h-4 mr-1" />
                      Logs
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            </div>
          </InfiniteScroll>
        )}
      </div>

      {selectedExecutionId && (
        <LogsModal
          isOpen={logsModalOpen}
          onClose={() => {
            setLogsModalOpen(false);
            setSelectedExecutionId(null);
          }}
          executionId={selectedExecutionId}
        />
      )}
    </div>
  );
};