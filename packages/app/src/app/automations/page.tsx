'use client';

// Suppress hydration warnings caused by browser extensions (like Dashlane)
// These warnings occur when extensions modify the DOM after server-side rendering
// and don't affect the application's functionality

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { toast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import './style.scss';
import {
  Eye,
  Copy,
  Play,
  EyeOff,
  SearchIcon,
  Trash2,
  Filter,
  X,
  CheckSquare,
  Square,
  ArrowUp,
  Paperclip
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '../authentication';
import { useSuppressHydrationWarnings } from '@/hooks/use-mobile';
import { useRouter } from 'next/navigation';
import { useUpgrade } from '@/contexts/UpgradeContext';
import { App, Empty, Input, Spin, Tabs, Button as AntdButton, Tag, Tooltip, Modal } from 'antd';
import { StandardizedSelect, StandardizedSelectOption } from '@/components/ui/standardized-select';
import FilterDropdown from '@/components/ui/filter-dropdown';
import SearchInput from '@/components/ui/search-input';
import AutomationCard from './components/automation-card';
import { CloseOutlined } from '@ant-design/icons';
import ScheduleCard from './components/schedule-card';
import { ExecutionHistory } from './components/execution-history';
import InfiniteScroll from "react-infinite-scroll-component";
import { fetchAllAutomationsForFilter, AutomationForFilter } from '@/lib/automation-utils';
import GlobalLoading from '@/components/GlobalLoading';
import dynamic from 'next/dynamic';

// Dynamically import speech recognition components with SSR disabled
const SpeechRecognitionButton = dynamic(
  () => import('@/components/SpeechRecognitionButton'),
  { ssr: false }
);

interface TransformedAutomation {
  id: string;
  title: string;
  status: 'live' | 'draft' | 'not_in_use';
  lastRun: string;
  successRate: number;
  totalRuns: number;
  triggers: number;
  description: string;
  cost: number;
  currency: string;
  successfulRuns: number;
  totalCostSaved: number;
  scheduleCount: number;
  isShared?: boolean;
  sharedFrom?: {
    userEmail: string;
    sharedAt: string;
  };
  sharedWithCount?: number;
  isPublished: boolean;
  marketplaceSource?: {
    listingId: string;
    listingSlug: string;
    publisherId: string;
    installedVersion: string;
    installedAt: Date;
  };
}

interface MetricData {
  total: number;
  completed: number;
  errored: number;
  running: number;
  successRate: number;
  avgDuration: number;
  stopped: number;
}
interface AnalyticsData {
  periods: {
    day: MetricData;
    week: MetricData;
    month: MetricData;
    threeMonths: MetricData;
  };
  hourlyData: any[];
  dailyData?: any[];
  performanceData: any[];
  costData: any[];
  totalCostSaved: number;
  trends: {
    runs: number;
    duration: number;
  };
}
interface Schedule {
  _id: string;
  automationId: string;
  automationTitle: string;
  cronExpression: string;
  cronExpressionFriendly: string;
  mode: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

// Helper to get user initials
function getInitials(user: any) {
  if (user?.name) {
    return user.name.split(' ').map((n: string) => n[0]).join('').toUpperCase();
  }
  if (user?.email) {
    return user.email[0].toUpperCase();
  }
  return '?';
}

const StatisticCard = ({
  title,
  value,
  extraCards,
}: {
  title: string;
  value: string | number;
  extraCards: { value: string | number; color: "green" | 'red' | 'blue' }[];
}) => {
  const getColorClasses = (color: "green" | 'red' | 'blue') => {
    switch (color) {
      case 'green':
        return 'border-green-500 text-green-700 bg-green-100 dark:border-green-400 dark:text-green-400 dark:bg-green-900/20';
      case 'blue':
        return 'border-blue-500 text-blue-700 bg-blue-100 dark:border-blue-400 dark:text-blue-400 dark:bg-blue-900/20';
      case 'red':
        return 'border-red-500 text-red-700 bg-red-100 dark:border-red-400 dark:text-red-400 dark:bg-red-900/20';
      default:
        return 'border-gray-500 text-gray-700 bg-gray-100 dark:border-gray-400 dark:text-gray-400 dark:bg-gray-900/20';
    }
  };

  return (
    <div className="pb-4 border-b mb-4" style={{ borderBottom: '1px solid var(--border-default)' }}>
      <div>{title}</div>
      <div className="flex justify-between" style={{ alignItems: "center" }}>
        <div className="text-[24px] font-semibold">{value}</div>
        <div className="inline-flex gap-1 items-center">
          {extraCards.map((card, index) => (
            <span
              key={index}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${getColorClasses(card.color)}`}
            >
              {card.value}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

// Component for displaying attached image previews
function AttachedImagePreview({ 
  file, 
  previewUrl, 
  onRemove, 
  isDarkMode 
}: { 
  file: File; 
  previewUrl: string; 
  onRemove: () => void; 
  isDarkMode: boolean;
}) {
  const [showRemove, setShowRemove] = useState(false);

  return (
    <div 
      style={{ 
        position: 'relative',
        display: 'inline-block'
      }}
      onMouseEnter={() => setShowRemove(true)}
      onMouseLeave={() => setShowRemove(false)}
    >
      <img
        src={previewUrl}
        alt={file.name}
        style={{
          width: 60,
          height: 60,
          objectFit: 'cover',
          borderRadius: 4,
          border: `1px solid ${isDarkMode ? '#30363d' : '#d0d7de'}`
        }}
      />
      {showRemove && (
        <button
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            width: 20,
            height: 20,
            backgroundColor: '#ef4444',
            borderRadius: '50%',
            border: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            padding: 2
          }}
        >
          <X size={12} color="white" />
        </button>
      )}
      <div style={{ 
        fontSize: '11px',
        marginTop: 4,
        maxWidth: 60,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        color: isDarkMode ? '#8b949e' : '#656d76'
      }}>
        {file.name.length > 10 ? `${file.name.substring(0, 10)}...` : file.name}
      </div>
    </div>
  );
}

const Index = () => {
  const { currentUser, hasInitialised, logout, getCurrentUser } = useAuth();
  const router = useRouter();
  const { handleApiError } = useUpgrade();

  const { modal, message } = App.useApp();
  
  // Suppress hydration warnings caused by browser extensions
  useSuppressHydrationWarnings();
  
  // All state hooks must be called before any conditional returns
  const [activeTab, setActiveTab] = useState('automations');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [selectAllChecked, setSelectAllChecked] = useState(false);
  const [automations, setAutomations] = useState<any[]>([]);
  const [selectedAutomationsForStats, setSelectedAutomationsForStats] = useState<string[]>([]);
  const [allAutomationsForFilter, setAllAutomationsForFilter] = useState<AutomationForFilter[]>([]);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showNewAutomationModal, setShowNewAutomationModal] = useState(false);
  const [newAutomationPrompt, setNewAutomationPrompt] = useState('');
  const [isCreatingAutomation, setIsCreatingAutomation] = useState(false);
  const [attachedImages, setAttachedImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  const [workflowsNotified, setWorkflowsNotified] = useState(false);
  const [queuesNotified, setQueuesNotified] = useState(false);
  const [showEditAutomationModal, setShowEditAutomationModal] = useState(false);
  const [editingAutomation, setEditingAutomation] = useState<any>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editCost, setEditCost] = useState('');
  const [editCurrency, setEditCurrency] = useState('USD');
  const [editStatus, setEditStatus] = useState<'draft' | 'live' | 'not_in_use'>('draft');
  const [isUpdatingAutomation, setIsUpdatingAutomation] = useState(false);
  const [lastAutomationsRefresh, setLastAutomationsRefresh] = useState(new Date());
  const [isRefreshingAutomations, setIsRefreshingAutomations] = useState(false);
  const [lastId, setLastId] = useState<string | null>(null);
  const [limit] = useState(20);
  const [hasMore, setHasMore] = useState(true);
  const [isFetchingMore, setIsFetchingMore] = useState(false);
  // Schedule pagination (client-side since API doesn't support pagination)
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]);
  const [displayedScheduleCount, setDisplayedScheduleCount] = useState(20);
  const [hasMoreSchedules, setHasMoreSchedules] = useState(true);
  const [isFetchingMoreSchedules, setIsFetchingMoreSchedules] = useState(false);
  const hasMoreSchedulesRef = useRef(true);
  const isFetchingMoreSchedulesRef = useRef(false);
  const loaderRef = useRef<HTMLDivElement | null>(null);
  const tabsRef = useRef<HTMLDivElement>(null);
  const [scrollHeight, setScrollHeight] = useState(600);
  const [isRegeneratingApiKey, setIsRegeneratingApiKey] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const [deviceId, setDeviceId] = useState<string>('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData | null>(null);
  const [analyticsDataV2, setAnalyticsDataV2] = useState<any | null>(null);

  const currentTab = useRef('all-automations');

  const handleToggleScheduleStatus = async (automationId: string, enabled: boolean) => {
    // Update both allSchedules (which drives filteredSchedules) and schedules state to reflect the change
    setAllSchedules(prev => prev.map(schedule => 
      schedule.automationId === automationId 
        ? { ...schedule, triggerEnabled: enabled }
        : schedule
    ));
    setSchedules(prev => prev.map(schedule => 
      schedule.automationId === automationId 
        ? { ...schedule, triggerEnabled: enabled }
        : schedule
    ));
  };

  // Authentication check - redirect to home if not authenticated
  useEffect(() => {
    // Add a small delay to allow authentication to fully initialize
    const timer = setTimeout(() => {
      
      if (hasInitialised && !currentUser) {
        // Preserve URL parameters when redirecting to home
        const currentUrl = new URL(window.location.href);
        const params = new URLSearchParams(currentUrl.search);
        
        // If there are important parameters, preserve them
        if (params.has('settingsModal') || params.has('stripe_return') || params.has('session_id')) {
          const homeUrl = new URL(window.location.origin);
          homeUrl.search = params.toString();
          router.push(homeUrl.toString());
        } else {
          router.push('/');
        }
      }
    }, 100); // 100ms delay

    return () => clearTimeout(timer);
  }, [hasInitialised, currentUser, router]);


  // Check notification status on component mount
  useEffect(() => {
    const workflowsStatus = localStorage.getItem('workflows-notified') === 'true';
    const queuesStatus = localStorage.getItem('queues-notified') === 'true';
    setWorkflowsNotified(workflowsStatus);
    setQueuesNotified(queuesStatus);
  }, []);

  // Check for GitHub connection success from OAuth callback
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const githubConnected = urlParams.get('githubConnected');
      
      if (githubConnected === 'true') {
        toast.success("Your GitHub account has been connected.");
        // Clear URL parameters
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);



  // Load avatar from localStorage on mount
  useEffect(() => {
    if (currentUser?.email) {
      const stored = localStorage.getItem(`avatar_${currentUser.email}`);
      if (stored) setAvatarUrl(stored);
    }
  }, [currentUser?.email]);

  // Load automations for filter dropdown
  const loadAutomationsForFilter = useCallback(async () => {
    const automations = await fetchAllAutomationsForFilter();
    setAllAutomationsForFilter(automations);
  }, []);


  // Load automations for filter on component mount
  useEffect(() => {
    loadAutomationsForFilter();
  }, [loadAutomationsForFilter]);

  // Detect dark mode changes using Tailwind's dark class
  useEffect(() => {
    const checkDarkMode = () => {
      // Check if the html element has the 'dark' class (Tailwind's approach)
      const isDark = document.documentElement.classList.contains('dark');
      setIsDarkMode(isDark);
    };

    checkDarkMode(); // Set initial value

    // Listen for class changes on the html element
    const observer = new MutationObserver(checkDarkMode);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class']
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  // Listen for refresh events from notifications (e.g., when schedules are disabled)
  useEffect(() => {
    const handleRefreshAutomations = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log('📢 Received refresh-automations event:', customEvent.detail);

      // Refresh automations and schedules
      if (currentTab.current === 'scheduled-automations') {
        fetchSchedules(true);
      } else {
        fetchAutomations(true);
      }
    };

    window.addEventListener('refresh-automations', handleRefreshAutomations);

    return () => {
      window.removeEventListener('refresh-automations', handleRefreshAutomations);
    };
  }, []);

  // Fetch automations from API (initial and paginated) - simplified to prevent infinite loops
  const fetchAutomations = useCallback(async (reset = false, search?: string) => {
    if (reset) {
      setLastId(null);
      setHasMore(true);
      setLoading(true);
      setSelectedItems([]);
      setIsFetchingMore(false); // Reset fetching flag on reset
    } else {
      // Prevent multiple simultaneous fetches, but don't check loading state for pagination
      if (isFetchingMore || !hasMore) return;
      setIsFetchingMore(true);
    }
    
    const currentLastId = reset ? null : lastId;
    try {
      const response = await fetch('/api/get-all-automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lastId: currentLastId,
          limit,
          search: typeof search === 'string' ? search: searchQuery,
          status: currentTab.current === 'live-automations' ? 'live' : undefined
        }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error: ${response.status} - ${errorText}`);
      }
      const data = await response.json();
      
      
      if (reset) {
        setAutomations(data.items || []);
        setHasMore(data.hasMore || false);
        setLastId(data.nextCursor || null);
      } else {
        // Filter out duplicates based on ID when appending
        setAutomations(prev => {
          const existingIds = new Set(prev.map(item => item._id || item.id));
          const newItems = (data.items || []).filter((item: any) => 
            !existingIds.has(item._id || item.id)
          );
          return [...prev, ...newItems];
        });
        // Update hasMore and lastId based on API response (even if filtered, use API response)
        setHasMore(data.hasMore || false);
        setLastId(data.nextCursor || null);
      }
    } catch (error) {
      if (reset) setAutomations([]);
      toast.error("Error",'Failed to load automations. Please refresh the page.');
    } finally {
      if (reset) setLoading(false);
      else setIsFetchingMore(false);
    }
  }, [limit, lastId, hasMore, isFetchingMore, searchQuery]);

  // Fetch schedules with client-side pagination (API doesn't support pagination)
  const fetchSchedules = useCallback(async (reset = false, search?: string) => {
    if (reset) {
      setDisplayedScheduleCount(20);
      setHasMoreSchedules(true);
      hasMoreSchedulesRef.current = true;
      setLoading(true);
      setIsFetchingMoreSchedules(false);
      isFetchingMoreSchedulesRef.current = false;
    } else {
      // For load more, just increase display count from already fetched data
      if (isFetchingMoreSchedulesRef.current || !hasMoreSchedulesRef.current) return;
      setIsFetchingMoreSchedules(true);
      isFetchingMoreSchedulesRef.current = true;
      
      // Simulate loading delay for better UX
      await new Promise(resolve => setTimeout(resolve, 300));
      
      setDisplayedScheduleCount(prev => prev + limit);
      setIsFetchingMoreSchedules(false);
      isFetchingMoreSchedulesRef.current = false;
      return;
    }
    
    // Reset path: fetch from API
    try {
      const url = new URL('/api/schedules-v2', window.location.origin);
      if (typeof search === 'string' && search.trim()) {
        url.searchParams.set('search', search.trim());
      } else if (searchQuery && typeof searchQuery === 'string' && searchQuery.trim()) {
        url.searchParams.set('search', searchQuery.trim());
      }
      
      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      
      if (response.ok) {
        const data = await response.json();
        const schedulesArray = Array.isArray(data) ? data : [];
        
        // Store all schedules, filtered schedules will be computed from allSchedules
        setAllSchedules(schedulesArray);
        setDisplayedScheduleCount(20);
      } else {
        setAllSchedules([]);
      }
    } catch (error) {
      console.error('Failed to fetch schedules:', error);
      setAllSchedules([]);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, limit]);

  // Simple search handler without debouncing to prevent infinite loops
  const handleSearch = useCallback((query: string) => {
    if (isSearching) return;

    setIsSearching(true);


    if (currentTab.current === 'scheduled-automations') {
      fetchSchedules(true, query).finally(() => setIsSearching(false));
    } else {
      // Capture query value to avoid closure issues with rapid searches
      const capturedQuery = query && typeof query === 'string' ? query.trim() : '';
      fetchAutomations(true, query).finally(() => {
        setIsSearching(false);

      });
    }
  }, [isSearching, fetchSchedules, fetchAutomations, searchQuery]);

  const getPeriodData = () => {
    if (!analyticsData) return null;
    return analyticsData.periods.threeMonths;
    // switch (selectedPeriod) {
    //   case '24h': return analyticsData.periods.day;
    //   case '7d': return analyticsData.periods.week;
    //   case '30d': return analyticsData.periods.month;
    //   case '90d': return analyticsData.periods.threeMonths;
    //   default: return analyticsData.periods.week;
    // }
  };

  // Calculate actual totals from automations data
  const calculateTotalsFromAutomations = () => {
    // totalRuns now excludes 'running' executions from API
    const totalRuns = automations.reduce((sum, automation) => sum + (automation.totalRuns || 0), 0);
    // successfulRuns are executions with status 'completed'  
    const successfulRuns = automations.reduce((sum, automation) => sum + (automation.successfulRuns || 0), 0);
    // failedRuns are all non-running executions that aren't completed (failed, error, timeout, etc.)
    const failedRuns = totalRuns - successfulRuns;
    const successRate = totalRuns > 0 ? (successfulRuns / totalRuns) * 100 : 0;

    return {
      total: totalRuns,
      completed: successfulRuns,
      errored: failedRuns,
      successRate
    };
  };

  const periodData = getPeriodData();
  const actualTotals = calculateTotalsFromAutomations();

  const fetchAnalytics = useCallback(async () => {
    try {
      // setIsUpdating(true);
      const response = await fetch('/api/analytics');
      if (!response.ok) {
        throw new Error('Failed to fetch analytics');
      }
      const data = await response.json();
      setAnalyticsData(data);
      // setLastUpdate(new Date());
      // console.log('Analytics data updated:', data);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      // setLoading(false);
      // setIsUpdating(false);
    }
  }, []);

  const fetchAnalyticsV2 = useCallback(async () => {
    try {
      const response = await fetch('/api/analytics-v2');
      if (!response.ok) {
        throw new Error('Failed to fetch analytics');
      }
      const data = await response.json();
      setAnalyticsDataV2(data);
    }
     catch (error) {
      console.error('Error fetching analytics:', error);
    } finally {
      // setLoading(false);
      // setIsUpdating(false);
    }
  }, []);


  // Initial fetch
  useEffect(() => {
    const initialFetch = async () => {
      setLastId(null);
      setHasMore(true);
      setAutomations([]);
      setLoading(true);
      
      try {
        const response = await fetch('/api/get-all-automations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lastId: null, limit }),
        });
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API error: ${response.status} - ${errorText}`);
        }
        const data = await response.json();
        setAutomations(data.items || []);
        setHasMore(data.hasMore || false);
        setLastId(data.nextCursor || null);
        
        // Fetch schedules and workflows
        // await fetchSchedules(true);
        // await fetchWorkflows();
      } catch (error) {
        setAutomations([]);
        toast.error("Error",'Failed to load automations. Please refresh the page.');
      } finally {
        setLoading(false);
      }
    };
    
    initialFetch();
  }, [limit]);

  useEffect(() => {
    fetchAnalytics();
    fetchAnalyticsV2();
    fetchSchedules(true);
  }, [])

  // Calculate scroll height dynamically
  useEffect(() => {
    const calculateHeight = () => {
      const vh = window.innerHeight;
      // Account for header (143px) and padding/margins (about 200px for tabs, search, etc.)
      const calculatedHeight = Math.max(400, vh - 343);
      setScrollHeight(calculatedHeight);
    };

    calculateHeight();
    window.addEventListener('resize', calculateHeight);
    return () => window.removeEventListener('resize', calculateHeight);
  }, []);
  
  // Infinite scroll observer - simplified
  useEffect(() => {
    if (!hasMore || loading || isFetchingMore) return;
    const observer = new window.IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting && !isFetchingMore) {
          fetchAutomations();
        }
      },
      { root: null, rootMargin: '200px', threshold: 0 }
    );
    if (loaderRef.current) observer.observe(loaderRef.current);
    return () => {
      if (loaderRef.current) observer.unobserve(loaderRef.current);
    };
  }, [hasMore, loading, isFetchingMore]);

  const handleAutomationsClick = useCallback(() => {
    setActiveTab('automations');
    // Smooth scroll to tabs section
    setTimeout(() => {
      tabsRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, [activeTab]);

  const handleSchedulesClick = useCallback(() => {
    setActiveTab('schedules');
    // Smooth scroll to tabs section
    setTimeout(() => {
      tabsRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, [activeTab]);

  // Fetch device ID
  useEffect(() => {
    async function fetchDeviceId() {
      let dId = window.localStorage.getItem('d_id') || '';
      if (dId) {
        setDeviceId(dId);
        return;
      }
      const res = await fetch('/api/devices', { method: 'POST' });
      const data = await res.json();
      dId = data.deviceId || '';
      window.localStorage.setItem('d_id', dId);
      setDeviceId(dId);
    }
    fetchDeviceId();
  }, []);

  
  // Create a map of automation ID to schedule count
  const scheduleCountMap = useMemo(() => {
    const map = new Map<string, number>();
    schedules.forEach(schedule => {
      const automationId = String(schedule.automationId);
      map.set(automationId, (map.get(automationId) || 0) + 1);
    });
    return map;
  }, [schedules]);

  // Transform API data to match component expectations
  const transformedAutomations: TransformedAutomation[] = automations.map((automation, index) => {
    const automationId = String(automation._id);
    const scheduleCount = scheduleCountMap.get(automationId) || 0;
    const totalRuns = Number(automation.totalRuns) || 0;
    const cost = Number(automation.cost) || 0;
    const currency = automation.currency || 'USD';
    
    // Calculate totalCostSaved as: number of executions * price per execution
    // Always calculate even if values are 0 to ensure correct currency display
    const totalCostSaved = cost * totalRuns;
    
    let derivedStatus: 'live' | 'draft' | 'not_in_use';
    if (automation.status === 'live') {
      derivedStatus = 'live';
    } else if (automation.status === 'not_in_use') {
      derivedStatus = 'not_in_use';
    } else if (automation.status === 'draft') {
      derivedStatus = 'draft';
    } else {
      derivedStatus = automation.isPublished ? 'live' : 'draft';
    }

    return {
      ...automation,
      id: automation._id,
      title: automation.title || 'Untitled Automation',
      status: derivedStatus,
      lastRun: automation.lastRun || 'Never',
      successRate: automation.successRate || 0,
      totalRuns,
      triggers: automation.triggers || 0,
      description: automation.description || 'No description available',
      cost, 
      currency,
      successfulRuns: automation.successfulRuns || 0,
      totalCostSaved, // Calculated as: executions * price per execution
      scheduleCount, // Added: count of schedules using this automation
    };
  });

  // Enhanced filtering logic
  // No need for client-side filtering since the API already handles search
  const filteredAutomations: TransformedAutomation[] = useMemo(() => {
    return transformedAutomations;
  }, [transformedAutomations]);

  // Handle select all functionality
  const handleSelectAll = useCallback(() => {
    if (selectAllChecked) {
      setSelectedItems([]);
      setSelectAllChecked(false);
    } else {
      const visibleIds = filteredAutomations.map(a => a.id);
      setSelectedItems(visibleIds);
      setSelectAllChecked(true);
    }
  }, [selectAllChecked, filteredAutomations]);

  // Update select all state when selection changes
  useEffect(() => {
    const visibleIds = filteredAutomations.map(a => a.id);
    const allVisible = visibleIds.length > 0 && visibleIds.every(id => selectedItems.includes(id));
    setSelectAllChecked(allVisible);
  }, [selectedItems, filteredAutomations]);

  // Clear filters
  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedItems([]);
    setSelectAllChecked(false);
    // Refresh the list after clearing filters
    if (currentTab.current === 'scheduled-automations') {
      fetchSchedules(true, '');
    } else {
      fetchAutomations(true, '');
    }
  }, [fetchAutomations, fetchSchedules]);

  // Get filter count
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery) count++;
    return count;
  }, [searchQuery]);

  // Filtered statistics based on filter selector
  const filteredStatistics = useMemo(() => {
    let baseAutomations = allAutomationsForFilter;
    
    if (selectedAutomationsForStats.length > 0) {
      baseAutomations = allAutomationsForFilter.filter(a => selectedAutomationsForStats.includes(a.id));
    }
    
    const liveAutomations = baseAutomations.filter(a => a.status === 'live');
    const scheduledAutomations = baseAutomations.filter(a => (a.scheduleCount || 0) > 0);
    
    // Calculate totals for filtered automations
    const totalRuns = baseAutomations.reduce((sum, a) => sum + (a.totalRuns || 0), 0);
    const successfulRuns = baseAutomations.reduce((sum, a) => sum + (a.successfulRuns || 0), 0);
    const failedRuns = baseAutomations.reduce((sum, a) => sum + ((a.totalRuns || 0) - (a.successfulRuns || 0)), 0);
    const successRate = totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0;

    return {
      liveAutomations: liveAutomations.length,
      scheduledAutomations: scheduledAutomations.length,
      totalAutomations: baseAutomations.length,
      totalRuns,
      successfulRuns,
      failedRuns,
      successRate
    };
  }, [allAutomationsForFilter, selectedAutomationsForStats]);

  // const filteredLiveAutomations = useMemo(() => {
  //   return filteredAutomations.filter(a => a.status === 'live');
  // }, [filteredAutomations]);

  // No need for client-side filtering since the API already handles search
  const filteredSchedules: any[] = useMemo(() => {
    // Apply client-side pagination: only show up to displayedScheduleCount
    return allSchedules.slice(0, displayedScheduleCount);
  }, [allSchedules, displayedScheduleCount]);
  
  // Update hasMoreSchedules based on all schedules length vs displayed count
  useEffect(() => {
    const hasMore = displayedScheduleCount < allSchedules.length;
    setHasMoreSchedules(hasMore);
    hasMoreSchedulesRef.current = hasMore;
  }, [allSchedules, displayedScheduleCount]);
  
  // Update schedules state for backward compatibility with existing code
  useEffect(() => {
    setSchedules(filteredSchedules);
  }, [filteredSchedules]);

  const handleSelectItem = (id: string) => {
    setSelectedItems(prev => 
      prev.includes(id) 
        ? prev.filter(item => item !== id)
        : [...prev, id]
    );
  };


  const handleClearSelection = () => {
    setSelectedItems([]);
  };

  const handleSelectionChange = (automationId: string, selected: boolean) => {
    if (selected) {
      setSelectedItems(prev => [...prev, automationId]);
    } else {
      setSelectedItems(prev => prev.filter(id => id !== automationId));
    }
  };

  const handleCloneAutomation = async (automation: any) => {
    try {
      const response = await fetch('/api/automations', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          automationId: automation.id
        })
      });

      if (!response.ok) {
        throw new Error('Failed to clone automation');
      }

      const data = await response.json();
      
      // Refresh the automations list to show the new clone
      await handleRefreshAutomations();
      
      toast.success(`Automation "${automation.title}" cloned successfully`);
      
      // Optionally redirect to the new automation
      router.push(`/canvas/${data.automationId}`);
    } catch (error) {
      toast.error("Error",'Failed to clone automation');
    }
  };

  const handleEditAutomation = async (automationId: string) => {
    try {
      // Fetch the latest automation data from the API to ensure currency and cost are up-to-date
      const response = await fetch(`/api/automations/${automationId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch automation');
      }
      const automation = await response.json();
      
      if (automation) {
        setEditingAutomation(automation);
        setEditTitle(automation.title || '');
        setEditDescription(automation.description || '');
        setEditCost(automation.cost ? automation.cost.toString() : '');
        setEditCurrency(automation.currency || 'USD');
        setEditStatus(automation.status || (automation.isPublished ? 'live' : 'draft'));
        setShowEditAutomationModal(true);
      }
    } catch (error) {
      console.error('Error fetching automation:', error);
      toast.error("Error", 'Failed to load automation data');
      // Fallback to local data if API fails
      const automation = automations.find(a => a._id === automationId);
      if (automation) {
        setEditingAutomation(automation);
        setEditTitle(automation.title || '');
        setEditDescription(automation.description || '');
        setEditCost(automation.cost ? automation.cost.toString() : '');
        setEditCurrency(automation.currency || 'USD');
        setEditStatus(automation.status || (automation.isPublished ? 'live' : 'draft'));
        setShowEditAutomationModal(true);
      }
    }
  };

  const handleRunAutomation = (automationId: string) => {
    router.push(`/canvas/${automationId}?run=true`)
  };

  const handleDeleteAutomation = async (automationId: string, automationTitle: string) => {
    // Show confirmation dialog with custom styling
    const confirmed = await modal.confirm({
      title: (
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-white text-sm font-bold">!</span>
          </div>
          <div>
            <div className="text-color">Delete Automation</div>
          </div>
        </div>
      ),
      content: `Are you sure you want to delete "${automationTitle}"? This action cannot be undone.`,
      icon: null,
      closable: true,
      okText: 'Delete',
      cancelText: 'Cancel',
    })
    if (!confirmed) {
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/automations?automationId=${automationId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.ok) {
        toast.success('Automation deleted successfully');
        // Refresh the automations list
        await fetchAutomations(true);
      } else {
        const errorData = await response.json();
        toast.error("Error",errorData.error || 'Failed to delete automation');
      }
    } catch (error) {
      console.error('Error deleting automation:', error);
      toast.error("Error",'Failed to delete automation');
    }
    setLoading(false);
  };

  const handleBulkDeleteAutomations = async () => {
    if (selectedItems.length === 0) {
      toast.error("Error",'No automations selected');
      return;
    }

    // Show confirmation dialog using modal.confirm for consistency
    const confirmed = await modal.confirm({
      title: (
        <div className="flex items-start gap-3">
          <div className="w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
            <span className="text-white text-sm font-bold">!</span>
          </div>
          <div>
            <div className="text-color">Delete Automations</div>
          </div>
        </div>
      ),
      content: `Are you sure you want to delete ${selectedItems.length} automation${selectedItems.length > 1 ? 's' : ''}? This action cannot be undone.`,
      icon: null,
      closable: true,
      okText: 'Delete',
      cancelText: 'Cancel',
    });
    
    if (!confirmed) {
      return;
    }

    setLoading(true);
    try {
      // Delete each automation one by one
      const deletePromises = selectedItems.map(async (automationId) => {
        const response = await fetch(`/api/automations?automationId=${automationId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' }
        });
        return { automationId, success: response.ok };
      });

      const results = await Promise.all(deletePromises);
      const successfulDeletes = results.filter(r => r.success).length;
      const failedDeletes = results.filter(r => !r.success).length;

      if (successfulDeletes > 0) {
        toast.success(`Successfully deleted ${successfulDeletes} automation${successfulDeletes > 1 ? 's' : ''}`);
        if (failedDeletes > 0) {
          toast.error("Error", `Failed to delete ${failedDeletes} automation${failedDeletes > 1 ? 's' : ''}`);
        }
        // Clear selection and refresh the automations list
        setSelectedItems([]);
        await fetchAutomations(true);
        fetchAnalyticsV2();
      } else {
        toast.error("Error", 'Failed to delete any automations');
      }
    } catch (error) {
      console.error('Error bulk deleting automations:', error);
      toast.error("Error", 'Failed to delete automations');
    } finally {
      setLoading(false);
    }
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
        // Only prevent default and select all automations if NOT in a text input
        if (!isTextInput) {
          event.preventDefault();
          handleSelectAll();
        }
        // If in a text input, let the browser handle Ctrl+A for text selection
      }
      
      // Delete key for bulk delete
      if (event.key === 'Delete' && selectedItems.length > 0) {
        // Only prevent default if NOT in a text input
        if (!isTextInput) {
          event.preventDefault();
          handleBulkDeleteAutomations();
        }
        // If in a text input, let the browser handle Delete/Backspace for text editing
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleSelectAll, selectedItems]);

  const handleRefreshAutomations = async () => {
    setIsRefreshingAutomations(true);
    try {
      // Reset pagination state
      setLastId(null);
      setHasMore(true);
      
      const response = await fetch('/api/get-all-automations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastId: null, limit }),
      });
      if (!response.ok) {
        throw new Error('Failed to refresh automations');
      }
      const data = await response.json();
      setAutomations(data.items || []);
      setHasMore((data.items?.length || 0) > 0);
      setLastId(data.lastId || null);
      setLastAutomationsRefresh(new Date());
      toast.success('Automations refreshed successfully');
    } catch (error) {
      toast.error("Error",'Failed to refresh automations');
    } finally {
      setIsRefreshingAutomations(false);
    }
  };

  const handleUpdateAutomation = async () => {
    if (!editingAutomation) return;

    setIsUpdatingAutomation(true);
    try {
      const response = await fetch(`/api/automations/${editingAutomation._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          automationId: editingAutomation._id,
          title: editTitle,
          description: editDescription,
          cost: parseFloat(editCost) || 0,
          currency: editCurrency,
          status: editStatus
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update automation');
      }

      // Refresh the automations list
      await handleRefreshAutomations();
      
      setShowEditAutomationModal(false);
      setEditingAutomation(null);
      setEditTitle('');
      setEditDescription('');
      setEditCost('');
      setEditCurrency('USD');
      setEditStatus('draft');
      
      toast.success('Automation updated successfully');
    } catch (error) {
      toast.error("Error",'Failed to update automation');
    } finally {
      setIsUpdatingAutomation(false);
    }
  };

  const handleCreateNewAutomation = () => {
    setShowNewAutomationModal(true);
  };

  // Handle paste events to capture images from clipboard
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const imageFiles: File[] = [];
    
    // Check each item in the clipboard
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      
      // Check if the item is an image
      if (item.type.indexOf('image') !== -1) {
        const blob = item.getAsFile();
        if (blob) {
          // Convert blob to File with a proper name
          const timestamp = Date.now();
          const fileExtension = blob.type.split('/')[1] || 'png';
          const fileName = `pasted-image-${timestamp}.${fileExtension}`;
          const file = new File([blob], fileName, { type: blob.type });
          imageFiles.push(file);
        }
      }
    }

    // If images were found, add them to attached images
    if (imageFiles.length > 0) {
      e.preventDefault(); // Prevent pasting the image data as text
      setAttachedImages((prevImages) => {
        // Create a Set of existing file names + sizes to check for duplicates
        const existingFiles = new Set(
          prevImages.map(f => `${f.name}-${f.size}-${f.lastModified}`)
        );
        
        // Filter out duplicates based on name, size, and lastModified
        const uniqueNewFiles = imageFiles.filter(f => {
          const fileKey = `${f.name}-${f.size}-${f.lastModified}`;
          return !existingFiles.has(fileKey);
        });
        
        // Combine existing files with new unique files
        const combinedFiles = [...prevImages, ...uniqueNewFiles];
        
        // Create previews only for new files
        const newPreviews = uniqueNewFiles.map((f) => URL.createObjectURL(f));
        
        // Update previews state by appending new previews
        setImagePreviews((prevPreviews) => [...prevPreviews, ...newPreviews]);
        
        return combinedFiles;
      });
      
      // Show a success message
      message.success(`${imageFiles.length} image(s) pasted`);
    }
  };

  const handleSubmitNewAutomation = async () => {
    if (!newAutomationPrompt.trim() && attachedImages.length === 0) {
      toast.error("Error",'Please enter a description for your automation or attach an image');
      return;
    }

    setIsCreatingAutomation(true);
    try {
      let response: Response;
      
      if (attachedImages.length > 0) {
        // Use FormData when images are attached
        const formData = new FormData();
        formData.append('prompt', newAutomationPrompt);
        attachedImages.forEach((file) => {
          formData.append('promptImages', file);
        });
        
        response = await fetch('/api/automations', {
          method: 'POST',
          body: formData
        });
      } else {
        // Use JSON when no images
        response = await fetch('/api/automations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: newAutomationPrompt })
        });
      }

      if (response.ok) {
        const data = await response.json();
        toast.success('Automation created successfully!');
        
        // Clean up and close modal (but keep files for sending)
        setShowNewAutomationModal(false);
        setNewAutomationPrompt('');
        
        
        // Redirect to the new automation
        router.push(`/canvas/${data.automationId}`)
      } else {
        // Try to parse error response
        let errorData;
        try {
          const text = await response.text();
          errorData = text ? JSON.parse(text) : { error: `HTTP ${response.status}: ${response.statusText}` };
        } catch (parseError) {
          errorData = { 
            error: `HTTP ${response.status}: ${response.statusText}`,
            message: 'Failed to parse error response'
          };
        }
        throw errorData; // Throw the full error object to preserve upgradeAction
      }
    } catch (error) {
      // Parse error if it's a stringified JSON
      let errorObj: any = error;
      if (typeof error === 'string') {
        try {
          errorObj = JSON.parse(error);
        } catch (parseError) {
          // If parsing fails, treat it as a regular error message
          errorObj = { error: error };
        }
      }
      
      // Log error details
      console.error('Error creating automation:', errorObj?.error || errorObj?.message || 'Unknown error', errorObj);
      
      // Try to handle upgrade action first (pass the parsed object)
      if (handleApiError(errorObj)) {
        // Close the new automation modal when upgrade modal is shown
        setShowNewAutomationModal(false);
        // Still show a brief error message to inform the user
        const limitMessage = errorObj?.error || errorObj?.reason || 'Automation limit reached';
        toast.warning(limitMessage);
        return; // Upgrade modal was shown
      }
      
      // Extract error message
      let errorMessage = 'Failed to create automation';
      if (errorObj instanceof Error) {
        errorMessage = errorObj.message || errorMessage;
      } else if (typeof errorObj === 'object' && errorObj !== null && 'error' in errorObj) {
        errorMessage = errorObj.error || errorObj.message || errorMessage;
      }
      
      toast.error("Error",errorMessage);
    } finally {
      setIsCreatingAutomation(false);
    }
  };

  const handleGetNotifiedWorkflows = async () => {
    try {
      // Check if already notified
      const isNotified = localStorage.getItem('workflows-notified');
      if (isNotified === 'true') {
        toast.info('You\'re already on the notification list for Workflows!\nWe\'ll notify you as soon as this feature is available.');
        return;
      }

      // Get user information from the authenticated user
      const userEmail = currentUser?.email || 'Unknown User';
      const userId = currentUser?._id || 'Unknown';
      
      // Show loading toast
      const loadingToast = toast.loading('Adding you to the notification list...', {
        description: 'Please wait while we process your request.'
      });
      
      // Send email notification
      const notificationEmail = process.env.NEXT_PUBLIC_NOTIFICATION_EMAIL || 'support@your-domain.com';
      const response = await fetch('/api/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': userEmail,
          'x-user-id': userId,
        },
        body: JSON.stringify({
          email: notificationEmail,
          subject: 'Workflows Feature Notification Request',
          message: 'A user has requested to be notified when the Workflows feature becomes available.',
          feature: 'workflows'
        })
      });

      // Dismiss loading toast
      toast.dismiss(loadingToast);

      if (response.ok) {
        // Mark as notified in localStorage
        localStorage.setItem('workflows-notified', 'true');
        setWorkflowsNotified(true);
        
        // Show success message
        toast.success('Successfully added to notification list!\nYou\'ll be the first to know when Workflows becomes available. We\'ll send you an email notification.');
      } else {
        toast.error("Error",'Failed to add to notification list.\nPlease try again later or contact support if the issue persists.');
      }
    } catch (error) {
      toast.error("Error",'Network error.\nPlease check your connection and try again.');
    }
  };

  const handleGetNotifiedQueues = async () => {
    try {
      // Check if already notified
      const isNotified = localStorage.getItem('queues-notified');
      if (isNotified === 'true') {
        toast.info('You\'re already on the notification list for Queue Management!\nWe\'ll notify you as soon as this feature is available.');
        return;
      }

      // Get user information from the authenticated user
      const userEmail = currentUser?.email || 'Unknown User';
      const userId = currentUser?._id || 'Unknown';
      
      // Show loading toast
      const loadingToast = toast.loading('Adding you to the notification list...', {
        description: 'Please wait while we process your request.'
      });
      
      // Send email notification
      const notificationEmail = process.env.NEXT_PUBLIC_NOTIFICATION_EMAIL || 'support@your-domain.com';
      const response = await fetch('/api/notify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-user-email': userEmail,
          'x-user-id': userId,
        },
        body: JSON.stringify({
          email: notificationEmail,
          subject: 'Queue Management Feature Notification Request',
          message: 'A user has requested to be notified when the Queue Management feature becomes available.',
          feature: 'queues'
        })
      });

      // Dismiss loading toast
      toast.dismiss(loadingToast);

      if (response.ok) {
        // Mark as notified in localStorage
        localStorage.setItem('queues-notified', 'true');
        setQueuesNotified(true);
        
        // Show success message
        toast.success('Successfully added to notification list!\nYou\'ll be the first to know when Queue Management becomes available. We\'ll send you an email notification.');
      } else {
        toast.error("Error",'Failed to add to notification list.\nPlease try again later or contact support if the issue persists.');
      }
    } catch (error) {
      toast.error("Error",'Network error.\nPlease check your connection and try again.');
    }
  };

  // Handle avatar file selection
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const url = reader.result as string;
        setAvatarUrl(url);
        if (currentUser?.email) {
          localStorage.setItem(`avatar_${currentUser.email}`, url);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle avatar click
  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };
  
  // Show loading while checking authentication
  if (!hasInitialised || !currentUser) {
    return (
      <GlobalLoading />
    );
  }

  return (
    <div
      className="container-background-color automation-container"
      style={{ borderStartStartRadius: 16 }}
    >
      <div className="page-header text-color flex justify-between items-center">
        <span>Automations</span>
        <AntdButton shape="round" type="primary" onClick={handleCreateNewAutomation}>
          New Automation
        </AntdButton>
      </div>
      <div className="px-[40px] flex gap-[40px] h-[calc(100%-143px)] overflow-hidden my-automation-content-container">
        <div style={{ width: 'calc(75% - 40px)' }}>
          <Tabs
            tabBarExtraContent={
              <div className="flex items-center gap-3">
                {/* Filter Summary */}
                {activeFilterCount > 0 && (
                  <Tag
                    closable
                    onClose={clearFilters}
                    color="blue"
                    style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 4 }}
                  >
                    <Filter size={12} />
                    {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
                  </Tag>
                )}
              </div>
            }
            destroyOnHidden
            items={[
              {
                label: "All automations",
                key: "all-automations",
                children: (
                  <>
                    {/* Search Controls - Under tabs */}
                    <div className="flex items-center justify-start mb-4">
                      {selectedItems.length === 0 ? (
                        /* Show search input form when no items are selected */
                        <SearchInput
                          placeholder="Search automations"
                          value={searchQuery}
                          onChange={setSearchQuery}
                          onSearch={handleSearch}
                          debounceMs={300}
                          width={276}
                          height={40}
                          borderRadius={99}
                          className="tab-search-input"
                        />
                      ) : (
                        /* Show delete button when items are selected */
                        <button
                          onClick={handleBulkDeleteAutomations}
                          className="custom-delete-button"
                          data-dark-mode={isDarkMode.toString()}
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
                      )}
                      </div>

                    {/* Select All - Below search/delete */}
                    <div className="flex items-center justify-start mb-4">
                          <AntdButton
                        type={selectedItems.length > 0 ? "primary" : "text"}
                            size="small"
                        icon={selectedItems.length > 0 ? (
                          <div style={{
                            position: 'relative',
                            width: 20,
                            height: 20,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#1677FF',
                            borderRadius: 4
                          }}>
                            <div style={{
                              position: 'absolute',
                              width: 10,
                              height: 2,
                              left: 'calc(50% - 10px/2)',
                              top: 'calc(50% - 2px/2)',
                              background: '#FFFFFF',
                              borderRadius: 99
                            }} />
                          </div>
                        ) : (
                          <Square size={20} className="text-foreground" />
                        )}
                            onClick={handleSelectAll}
                        className="text-foreground hover:bg-muted no-underline"
                        style={{ 
                          minWidth: 'auto', 
                          padding: '0px',
                          gap: 12,
                          display: 'flex',
                          flexDirection: 'row',
                          alignItems: 'center',
                          height: 20,
                          background: 'transparent',
                          border: 'none',
                          fontFamily: 'DM Sans',
                          fontWeight: 400,
                          fontSize: 15,
                          lineHeight: '15px',
                          color: 'var(--foreground)',
                          textDecoration: 'none'
                        }}
                      >
                        {selectedItems.length > 0 ? 'Unselect all' : 'Select all'}
                      </AntdButton>
                      {selectedItems.length > 0 && (
                        <span className="ml-2 text-sm text-muted-foreground">
                          {selectedItems.length} selected
                        </span>
                      )}
                      </div>

                    {/* Results Summary */}
                    {searchQuery && (
                      <div className="flex items-center justify-start mb-4">
                        <span className="text-sm text-gray-500 flex items-center gap-2">
                          {isSearching && <Spin size="small" />}
                          {filteredAutomations.length} of {transformedAutomations.length} automations
                        </span>
                    </div>
                    )}

                    <Spin spinning={loading} size="large" style={{ minHeight: 200 }}>
                      {filteredAutomations.length > 0 && <InfiniteScroll
                      hasMore={hasMore}
                      dataLength={filteredAutomations.length}
                      loader={
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                          <Spin size="large" />
                        </div>
                      }
                      next={() => {
                        fetchAutomations();
                      }}
                      style={{ 
                        overflowX: 'hidden',
                        minHeight: filteredAutomations.length > 0 ? 'var(--infinite-scroll-height)' : undefined,
                        maxHeight: 'var(--infinite-scroll-height)',
                      }}
                      height={scrollHeight}
                      className="my-automation-infinite-scroll"
                    >
                      {filteredAutomations.map((automation) => (
                        <AutomationCard
                          automation={{
                            ...automation,
                            title: automation.title?.length > 50 ? automation.title.substring(0, 50) + '...' : automation.title,
                            description: automation.description?.length > 100 ? automation.description.substring(0, 100) + '...' : automation.description
                          }}
                          onEdit={handleEditAutomation}
                          onRun={handleRunAutomation}
                          onClone={handleCloneAutomation}
                          onConfigure={handleEditAutomation}
                          onDelete={handleDeleteAutomation}
                          isSelected={selectedItems.includes(automation.id)}
                          onSelectionChange={handleSelectionChange}
                          key={automation.id}
                        />
                      ))}
                    </InfiniteScroll>}
                    {!loading && !automations.length && <Empty /> }
                    {!loading && automations.length > 0 && !filteredAutomations.length && <Empty description="No automation matching the search" /> }
                  </Spin>
                  </>
                ),
              },
              {
                label: "Live automations",
                key: "live-automations",
                children: (
                  <>
                    {/* Search Controls - Under tabs */}
                    <div className="flex items-center justify-start mb-4">
                      {selectedItems.length === 0 ? (
                        /* Show search input form when no items are selected */
                        <SearchInput
                          placeholder="Search automations"
                          value={searchQuery}
                          onChange={setSearchQuery}
                          onSearch={handleSearch}
                          debounceMs={300}
                          width={276}
                          height={40}
                          borderRadius={99}
                          className="tab-search-input"
                        />
                      ) : (
                        /* Show delete button when items are selected */
                        <button
                          onClick={handleBulkDeleteAutomations}
                          className="custom-delete-button"
                          data-dark-mode={isDarkMode.toString()}
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
                      )}
                    </div>

                    {/* Select All - Below search/delete */}
                    <div className="flex items-center justify-start mb-4">
                      <AntdButton
                        type={selectedItems.length > 0 ? "primary" : "text"}
                        size="small"
                        icon={selectedItems.length > 0 ? (
                          <div style={{
                            position: 'relative',
                            width: 20,
                            height: 20,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#1677FF',
                            borderRadius: 4
                          }}>
                            <div style={{
                              position: 'absolute',
                              width: 10,
                              height: 2,
                              left: 'calc(50% - 10px/2)',
                              top: 'calc(50% - 2px/2)',
                              background: '#FFFFFF',
                              borderRadius: 99
                            }} />
                          </div>
                        ) : (
                          <Square size={20} className="text-foreground" />
                        )}
                        onClick={handleSelectAll}
                        className="text-foreground hover:bg-muted no-underline"
                        style={{ 
                          minWidth: 'auto', 
                          padding: '0px',
                          gap: 12,
                          display: 'flex',
                          flexDirection: 'row',
                          alignItems: 'center',
                          height: 20,
                          background: 'transparent',
                          border: 'none',
                          fontFamily: 'DM Sans',
                          fontWeight: 400,
                          fontSize: 15,
                          lineHeight: '15px',
                          color: 'var(--foreground)',
                          textDecoration: 'none'
                        }}
                      >
                        {selectedItems.length > 0 ? 'Unselect all' : 'Select all'}
                      </AntdButton>
                      {selectedItems.length > 0 && (
                        <span className="ml-2 text-sm text-muted-foreground">
                          {selectedItems.length} selected
                        </span>
                      )}
                    </div>

                    {/* Results Summary */}
                    {searchQuery && (
                      <div className="flex items-center justify-start mb-4">
                        <span className="text-sm text-gray-500 flex items-center gap-2">
                          {isSearching && <Spin size="small" />}
                          {filteredAutomations.length} of {transformedAutomations.length} automations
                        </span>
                      </div>
                    )}

                  <Spin spinning={loading} size="large" style={{ minHeight: 200 }}>
                    {filteredAutomations.filter(a => a.status === 'live').length > 0 && <InfiniteScroll
                      hasMore={hasMore}
                      dataLength={filteredAutomations.length}
                      loader={
                        <div style={{ textAlign: 'center', padding: '20px 0' }}>
                          <Spin size="large" />
                        </div>
                      }
                      next={() => {
                        fetchAutomations();
                      }}
                      style={{ 
                        overflowX: 'hidden',
                        minHeight: filteredAutomations.length > 0 ? 'var(--live-infinite-scroll-height)' : undefined,
                        maxHeight: 'var(--live-infinite-scroll-height)',
                      }}
                      height={scrollHeight}
                      className="my-automation-infinite-scroll"
                    >
                      {filteredAutomations.map((automation) => (
                        <AutomationCard
                          automation={automation}
                          onEdit={handleEditAutomation}
                          onRun={handleRunAutomation}
                          onClone={handleCloneAutomation}
                          onConfigure={handleEditAutomation}
                          onDelete={handleDeleteAutomation}
                          isSelected={selectedItems.includes(automation.id)}
                          onSelectionChange={handleSelectionChange}
                          key={automation.id}
                        />
                      ))}
                    </InfiniteScroll>}
                    {!loading && !automations.filter(a => a.status === 'live').length && <Empty /> }
                    {!loading && automations.filter(a => a.status === 'live').length > 0 && !filteredAutomations.length && <Empty  description="No automation matching the search" /> }
                  </Spin>
                  </>
                )
              },
              {
                label: "Scheduled automations",
                key: "scheduled-automations",
                children: (
                  <>
                    {/* Search Controls - Under tabs */}
                    <div className="flex items-center justify-start mb-4">
                      {selectedItems.length === 0 ? (
                        /* Show search input form when no items are selected */
                        <SearchInput
                          placeholder="Search schedules"
                          value={searchQuery}
                          onChange={setSearchQuery}
                          onSearch={handleSearch}
                          debounceMs={300}
                          width={276}
                          height={40}
                          borderRadius={99}
                          className="tab-search-input"
                        />
                      ) : (
                        /* Show delete button when items are selected */
                        <button
                          onClick={handleBulkDeleteAutomations}
                          className="custom-delete-button"
                          data-dark-mode={isDarkMode.toString()}
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
                      )}
                    </div>

                    {/* Select All - Below search/delete */}
                    <div className="flex items-center justify-start mb-4">
                      <AntdButton
                        type={selectedItems.length > 0 ? "primary" : "text"}
                        size="small"
                        icon={selectedItems.length > 0 ? (
                          <div style={{
                            position: 'relative',
                            width: 20,
                            height: 20,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#1677FF',
                            borderRadius: 4
                          }}>
                            <div style={{
                              position: 'absolute',
                              width: 10,
                              height: 2,
                              left: 'calc(50% - 10px/2)',
                              top: 'calc(50% - 2px/2)',
                              background: '#FFFFFF',
                              borderRadius: 99
                            }} />
                          </div>
                        ) : (
                          <Square size={20} className="text-foreground" />
                        )}
                        onClick={handleSelectAll}
                        className="text-foreground hover:bg-muted"
                        style={{
                          minWidth: 'auto',
                          padding: '0px',
                          gap: 12,
                          display: 'flex',
                          flexDirection: 'row',
                          alignItems: 'center',
                          height: 20,
                          background: 'transparent',
                          border: 'none',
                          fontFamily: 'DM Sans',
                          fontWeight: 400,
                          fontSize: 15,
                          lineHeight: '15px',
                          color: 'var(--foreground)'
                        }}
                      >
                        {selectedItems.length > 0 ? 'Unselect all' : 'Select all'}
                      </AntdButton>
                      {selectedItems.length > 0 && (
                        <span className="ml-2 text-sm text-muted-foreground">
                          {selectedItems.length} selected
                        </span>
                      )}
                    </div>

                    {/* Results Summary */}
                    {searchQuery && (
                      <div className="flex items-center justify-start mb-4">
                        <span className="text-sm text-gray-500 flex items-center gap-2">
                          {isSearching && <Spin size="small" />}
                          {filteredSchedules.length} of {schedules.length} schedules
                        </span>
                      </div>
                    )}

                  <Spin spinning={loading} size="large" style={{ minHeight: 200 }}>
                    {filteredSchedules.length > 0 && <InfiniteScroll
                        hasMore={hasMoreSchedules}
                        dataLength={filteredSchedules.length}
                        loader={
                          <div style={{ textAlign: 'center', padding: '20px 0' }}>
                            <Spin size="large" />
                          </div>
                        }
                        next={() => {
                          fetchSchedules();
                        }}
                        style={{
                          overflowX: 'hidden',
                          minHeight: filteredSchedules.length > 0 ? 'var(--scheduled-infinite-scroll-height)' : undefined,
                          maxHeight: 'var(--scheduled-infinite-scroll-height)',
                        }}
                        height={scrollHeight}
                        className="my-automation-infinite-scroll"
                      >
                      {filteredSchedules.map((schedule) => (
                        <ScheduleCard 
                          schedule={schedule}
                          // onEdit={handleEditAutomation}
                          onRun={handleRunAutomation}
                          onToggleStatus={handleToggleScheduleStatus}
                          onClone={handleCloneAutomation}
                          onUpdate={() => fetchSchedules(true)}
                          // onConfigure={handleEditAutomation}
                          // onDelete={handleDeleteAutomation}
                          key={schedule._id}
                        />
                      ))}
                    </InfiniteScroll>}
                    {!loading && !schedules.length && <Empty /> }
                    {!loading && schedules.length > 0 && !filteredSchedules.length && <Empty description="No schedules matching the search" /> }
                  </Spin>
                  </>
                )
              },
              {
                label: "Run history",
                key: "history",
                children: (
                  <ExecutionHistory externalSearchQuery={searchQuery} />
                )
              },
            ]}
            className="automation-tabs"
            onChange={(activeKey) => {
              currentTab.current = activeKey;
              if (activeKey === 'scheduled-automations') {
                fetchSchedules(true)
              } else {
                fetchAutomations(true);
              }
            }}
          />
        </div>
        <div className="w-[25%]">
          <div
            className="py-[11px] text-[15px] mb-[20px]"
            style={{
              borderBottom: '1px solid var(--border-default)'
            }}
          >
            Statistics
          </div>
          
          {/* Statistics Filter Selector - positioned to align with run history filters */}
          <div className="mb-4" style={{ marginTop: '32px' }}>
            <FilterDropdown
              placeholder="Filter automations"
              items={allAutomationsForFilter.map(automation => ({
                id: automation.id,
                title: automation.title
              }))}
              selectedItems={selectedAutomationsForStats}
              onSelectionChange={setSelectedAutomationsForStats}
              width={234}
              height={40}
              borderRadius={99}
            />
          </div>

          <div className=' overflow-y-auto' style={{ height: 'calc(100% - 163px)', paddingLeft: '16px', paddingTop: '16px' }}>
            <StatisticCard
              title="Live automations"
              value={selectedAutomationsForStats.length === 0 ? `${analyticsDataV2?.liveAutomations || 0}/${analyticsDataV2?.totalAutomations || 0}` : `${filteredStatistics.liveAutomations}/${filteredStatistics.totalAutomations}`}
              extraCards={[
                {
                  value: selectedAutomationsForStats.length === 0 
                    ? (analyticsDataV2?.totalAutomations > 0 ? `${Math.round((analyticsDataV2?.liveAutomations || 0) / analyticsDataV2?.totalAutomations * 100)}%` : '0%')
                    : (filteredStatistics.totalAutomations > 0 ? `${Math.round((filteredStatistics.liveAutomations / filteredStatistics.totalAutomations) * 100)}%` : '0%'),
                  color: 'green'
                }
              ]}
            />
            <StatisticCard
              title="Scheduled automations"
              value={selectedAutomationsForStats.length === 0 ? `${schedules?.length || 0}/${analyticsDataV2?.totalAutomations || 0}` : `${filteredStatistics.scheduledAutomations}/${filteredStatistics.totalAutomations}`}
              extraCards={[
                {
                  value: selectedAutomationsForStats.length === 0
                    ? (analyticsDataV2?.totalAutomations > 0 ? `${Math.round((schedules?.length || 0) / analyticsDataV2?.totalAutomations * 100)}%` : '0%')
                    : (filteredStatistics.totalAutomations > 0 ? `${Math.round((filteredStatistics.scheduledAutomations / filteredStatistics.totalAutomations) * 100)}%` : '0%'),
                  color: 'blue'
                }
              ]}
            />
            <StatisticCard
              title="Total executions"
              value={selectedAutomationsForStats.length === 0 ? (analyticsDataV2?.totalRuns || 0) : filteredStatistics.totalRuns}
              extraCards={[
                {
                  value: selectedAutomationsForStats.length === 0 ? `${analyticsDataV2?.successfulRuns || 0} success` : `${filteredStatistics.successfulRuns} success`,
                  color: 'green'
                },
                {
                  value: selectedAutomationsForStats.length === 0 ? `${analyticsDataV2?.failedRuns || 0} failed` : `${filteredStatistics.failedRuns} failed`,
                  color: 'red'
                }
              ]}
            />
            <StatisticCard
              title="Success rate"
              value={selectedAutomationsForStats.length === 0 ? `${Math.round(analyticsDataV2?.successRate || 0)}%` : `${filteredStatistics.successRate}%`}
              extraCards={[]}
            />
          </div>
        </div>
      </div>

      {/* Modals and Overlays */}
      {/* <BulkOperations
        selectedItems={selectedItems}
        onSelectAll={handleSelectAll}
        onClearSelection={handleClearSelection}
        totalItems={filteredAutomations.length}
      /> */}

      {/* New Automation Modal */}
      <Modal
        open={showNewAutomationModal}
        onCancel={() => setShowNewAutomationModal(false)}
        title="What do you want to automate?"
        footer={null}
      >
        {/* <DialogContent className="container-background-color"> */}
          <div className="space-y-4">
            {/* Display attached images */}
            {attachedImages.length > 0 && (
              <div className="flex flex-wrap gap-2 p-2 border rounded" style={{ 
                borderColor: isDarkMode ? '#30363d' : '#d0d7de',
                backgroundColor: isDarkMode ? '#161b22' : '#f6f8fa'
              }}>
                {attachedImages.map((file, index) => (
                  <AttachedImagePreview
                    key={index}
                    file={file}
                    previewUrl={imagePreviews[index]}
                    isDarkMode={isDarkMode}
                    onRemove={() => {
                      const newFiles = attachedImages.filter((_, i) => i !== index);
                      const newPreviews = imagePreviews.filter((_, i) => i !== index);
                      setAttachedImages(newFiles);
                      setImagePreviews(newPreviews);
                      URL.revokeObjectURL(imagePreviews[index]);
                      const input = document.getElementById('new-automation-image-input') as HTMLInputElement | null;
                      if (input) input.value = '';
                    }}
                  />
                ))}
              </div>
            )}
            <div>
              <Input.TextArea
                value={newAutomationPrompt}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNewAutomationPrompt(e.target.value)}
                onPaste={handlePaste}
                placeholder="Describe what you want to automate (e.g., 'Fetch emails from Gmail, summarize them with AI, and send to Slack')"
                className="w-full p-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:border-slate-600 dark:text-white"
                rows={4}
                onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    handleSubmitNewAutomation();
                  }
                }}
              />
            </div>
            <div className="flex justify-between">
              <div className="inline-flex gap-2">
                <input
                  id="new-automation-image-input"
                  type="file"
                  accept="image/*"
                  multiple
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const newFiles = Array.from(e.target.files || []);
                    if (newFiles.length > 0) {
                      setAttachedImages((prevImages) => {
                        const existingFiles = new Set(
                          prevImages.map(f => `${f.name}-${f.size}-${f.lastModified}`)
                        );
                        const uniqueNewFiles = newFiles.filter(f => {
                          const fileKey = `${f.name}-${f.size}-${f.lastModified}`;
                          return !existingFiles.has(fileKey);
                        });
                        const combinedFiles = [...prevImages, ...uniqueNewFiles];
                        const newPreviews = uniqueNewFiles.map((f) => URL.createObjectURL(f));
                        setImagePreviews((prevPreviews) => [...prevPreviews, ...newPreviews]);
                        return combinedFiles;
                      });
                    }
                    e.target.value = '';
                  }}
                />
                <Tooltip title={attachedImages.length > 0 ? `${attachedImages.length} image(s) attached` : 'Attach images'}>
                  <AntdButton
                    onClick={() => {
                      const input = document.getElementById('new-automation-image-input') as HTMLInputElement | null;
                      if (input) {
                        input.value = '';
                        input.click();
                      }
                    }}
                    className="!w-[32px]"
                    type="text"
                    shape="round"
                    icon={<Paperclip size={16} />}
                    style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                    disabled={isCreatingAutomation}
                  />
                </Tooltip>
                <AntdButton
                  onClick={() => {
                    // Clean up image previews when canceling
                    imagePreviews.forEach(url => URL.revokeObjectURL(url));
                    setAttachedImages([]);
                    setImagePreviews([]);
                    setShowNewAutomationModal(false);
                  }}
                  disabled={isCreatingAutomation}
                >
                  Cancel
                </AntdButton>
              </div>
              <div className="inline-flex gap-2">
                <SpeechRecognitionButton
                  isAuthenticated={!!currentUser}
                  loading={isCreatingAutomation}
                  onTranscriptUpdate={setNewAutomationPrompt}
                  onEnterCommand={handleSubmitNewAutomation}
                  message={message}
                  getCurrentUser={getCurrentUser}
                  canChat={true}
                />
                <AntdButton
                  className="arrow-up-button-blue"
                  style={{
                    height: 32,
                    width: 32,
                    backgroundColor: '#1677FF',
                    borderColor: '#1677FF',
                  }}
                  shape="round"
                  type="primary"
                  icon={<ArrowUp size={18} />}
                  disabled={isCreatingAutomation || (!newAutomationPrompt.trim() && attachedImages.length === 0)}
                  loading={isCreatingAutomation}
                  onClick={handleSubmitNewAutomation}
                />
              </div>
            </div>
          </div>
        {/* </DialogContent> */}
      </Modal>

      {/* Edit Automation Modal */}
      <Dialog
        open={showEditAutomationModal}
        onOpenChange={setShowEditAutomationModal}
      >
        <DialogContent className="sm:max-w-lg w-full max-w-[95vw] overflow-y-auto bg-white dark:bg-black border-none" style={{ minWidth: 600, maxHeight: 'var(--window-height)' }}>
          <DialogHeader>
            <DialogTitle>Edit Automation</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block text-slate-900 dark:text-white">
                Automation Name *
              </label>
              <Input 
                value={editTitle}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setEditTitle(e.target.value);
                }}
                placeholder="Enter automation name"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block text-slate-900 dark:text-white">
                Description
              </label>
              <Input.TextArea 
                value={editDescription}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                  setEditDescription(e.target.value);
                }}
                placeholder="Describe what this automation does..."
                rows={4}
                maxLength={500}
                autoSize={{ minRows: 3, maxRows: 6 }}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block text-slate-900 dark:text-white">
                Cost Saved per Run ({editCurrency})
              </label>
              <Input 
                type="number"
                value={editCost}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setEditCost(e.target.value);
                }}
                placeholder="0.00"
                step="0.01"
                min="0"
              />
            </div>
            <div>
              <StandardizedSelect
                value={editCurrency}
                onChange={(value) => setEditCurrency(value as string)}
                label="Currency"
              >
                <StandardizedSelectOption value="USD">USD</StandardizedSelectOption>
                <StandardizedSelectOption value="EUR">EUR</StandardizedSelectOption>
                <StandardizedSelectOption value="GBP">GBP</StandardizedSelectOption>
                <StandardizedSelectOption value="SEK">SEK</StandardizedSelectOption>
                <StandardizedSelectOption value="JPY">JPY</StandardizedSelectOption>
                <StandardizedSelectOption value="AUD">AUD</StandardizedSelectOption>
                <StandardizedSelectOption value="CAD">CAD</StandardizedSelectOption>
                <StandardizedSelectOption value="CHF">CHF</StandardizedSelectOption>
                <StandardizedSelectOption value="CNY">CNY</StandardizedSelectOption>
                <StandardizedSelectOption value="INR">INR</StandardizedSelectOption>
              </StandardizedSelect>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block text-slate-900 dark:text-white">
                Status
              </label>
              <div className="space-y-2">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    value="draft"
                    checked={editStatus === 'draft'}
                    onChange={(e) => setEditStatus(e.target.value as "draft" | "live" | "not_in_use")}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <span className="text-sm text-gray-900 dark:text-white">Draft</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    value="live"
                    checked={editStatus === 'live'}
                    onChange={(e) => setEditStatus(e.target.value as "draft" | "live" | "not_in_use")}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <span className="text-sm text-gray-900 dark:text-white">Live</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="status"
                    value="not_in_use"
                    checked={editStatus === 'not_in_use'}
                    onChange={(e) => setEditStatus(e.target.value as "draft" | "live" | "not_in_use")}
                    className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                  />
                  <span className="text-sm text-gray-900 dark:text-white">Not in Use</span>
                </label>
              </div>
            </div>
            {/* API Key and Usage Sample (Admin Only) */}
            {editingAutomation?.adminUserIds?.includes(currentUser?._id) && (
              <div className="flex flex-col w-full mt-6 p-4 container-background-color rounded-lg">
                <label className="block font-semibold mb-2">API key</label>
                <div className="flex items-center gap-2 mb-2 w-full">
                
                  <Input.Password
                    value={editingAutomation?.apiKey || ""}
                    readOnly
                    style={{ wordBreak: "break-all" }}
                  />
                 
                  <Button
                    onClick={() => {
                      navigator.clipboard.writeText(
                        editingAutomation?.apiKey || ""
                      );
                      toast.success("API key copied!");
                    }}
                    className="ml-2"
                  >
                    <Copy className="w-4 h-4 mr-1" />
                    Copy
                  </Button>
                  <Button
                    variant="outline"
                    className="ml-2 pointer"
                    disabled={isRegeneratingApiKey}
                    onClick={async () => {
                      if (!editingAutomation?._id) return;
                      setIsRegeneratingApiKey(true);
                      try {
                        const res = await fetch(
                          `/api/automations/${editingAutomation._id}/regenerate-api-key`,
                          { method: "POST" }
                        );
                        const data = await res.json();
                        if (res.ok && data.apiKey) {
                          setEditingAutomation((prev: any) => ({
                            ...prev,
                            apiKey: data.apiKey,
                          }));
                          toast.success("API key regenerated!");
                        } else {
                          toast.error("Error",data.error || "Failed to regenerate API key");
                        }
                      } catch (e) {
                        toast.error("Error","Network error while regenerating API key");
                      } finally {
                        setIsRegeneratingApiKey(false);
                      }
                    }}
                  >
                    {isRegeneratingApiKey ? "Regenerating..." : "Regenerate"}
                  </Button>
                </div>
                <label className="block font-semibold mb-2 flex items-center gap-2">
                  API usage sample
                  <button
                    type="button"
                    onClick={() => {
                      // Get the current hostname
                      const hostname = window.location.hostname;
                      const sample = `# 1. Trigger the automation
curl --location 'https://${hostname}/api/automations/${editingAutomation?._id}/trigger' \\
--header 'Content-Type: application/json' \\
--data '{\n  "apiKey": "<API_KEY>"\n}'

# 2. Poll for status using the returned executionId
curl --location 'https://${hostname}/api/run/executions/<EXECUTION_ID>'`;
                      navigator.clipboard.writeText(sample);
                      toast.success("API usage sample copied!");
                    }}
                    className="p-1"
                    title="Copy API usage sample"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                </label>
                <pre
                  className="card-background-color p-3 rounded text-xs w-full"
                  style={{ wordBreak: "break-all", whiteSpace: "pre-wrap" }}
                >
                  {`# 1. Trigger the automation
curl --location 'https://${
                    typeof window !== "undefined"
                      ? window.location.hostname
                      : "yourdomain.com"
                  }/api/automations/${editingAutomation?._id}/trigger' \\
--header 'Content-Type: application/json' \\
--data '{\n  "apiKey": "<API_KEY>"\n}'

# 2. Poll for status using the returned executionId
curl --location 'https://${
                    typeof window !== "undefined"
                      ? window.location.hostname
                      : "yourdomain.com"
                  }/api/run/executions/<EXECUTION_ID>'`}
                </pre>
              </div>
            )}
                         <div className="flex justify-end gap-2">
               
                <AntdButton
                  onClick={() => setShowEditAutomationModal(false)}
                  disabled={isUpdatingAutomation}
                >

                 Cancel
                </AntdButton>
                <AntdButton
                  type="primary"
                  onClick={handleUpdateAutomation}
                  disabled={isUpdatingAutomation || !editTitle.trim()}
                >
                  {isUpdatingAutomation ? "Updating..." : "Save Changes"}
                </AntdButton>
             </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Workflow Builder Drag & Drop Modal */}
      {/* <WorkflowBuilderDragDrop
        isOpen={showWorkflowBuilder}
        onClose={() => {
          setShowWorkflowBuilder(false);
          setEditingWorkflow(null);
        }}
        editingWorkflow={editingWorkflow}
        onWorkflowSaved={() => {
          // console.log(
          //   "Dashboard: onWorkflowSaved called, refreshing workflows"
          // );
          fetchWorkflows();
        }}
      /> */}
    </div>
  );
};

export default Index;
