'use client';

import React, { useState, useEffect } from 'react';
import { AnalyticsConfig, DEFAULT_ANALYTICS_CONFIG } from '@/types/analytics-config';

/**
 * Hook to check if AnalyticsSettings should be visible
 * Can be used by parent components to conditionally render
 */
export function useAnalyticsSettingsVisibility() {
  const [shouldShow, setShouldShow] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkVisibility = async () => {
      try {
        const response = await fetch('/api/analytics-config');
        const data = await response.json();

        if (data.success && data.config) {
          const config = data.config;
          const visible = config.showSettingsPanel === true;
          setShouldShow(visible);
        } else {
          setShouldShow(false);
        }
      } catch (error) {
        setShouldShow(false);
      } finally {
        setLoading(false);
      }
    };

    checkVisibility();
  }, []);

  return { shouldShow, loading };
}

/**
 * Analytics Settings Component
 * Allows users to control analytics tracking at runtime
 * Visibility controlled by database config flag
 */
export function AnalyticsSettings() {
  const [trackingEnabled, setTrackingEnabledState] = useState(true);
  const [consentGiven, setConsentGiven] = useState(false);
  const [config, setConfig] = useState<AnalyticsConfig>(DEFAULT_ANALYTICS_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const response = await fetch('/api/analytics-config');
        const data = await response.json();

        if (data.success && data.config) {
          const fetchedConfig: AnalyticsConfig = {
            enabled: data.config.enabled ?? false,
            showConsentBanner: data.config.showConsentBanner ?? false,
            showSettingsPanel: data.config.showSettingsPanel ?? false,
            allowUserOptOut: data.config.allowUserOptOut ?? false,
            requireConsent: data.config.requireConsent ?? false,
            updatedAt: data.config.updatedAt,
            updatedBy: data.config.updatedBy,
          };
          setConfig(fetchedConfig);
        } else {
          setConfig(DEFAULT_ANALYTICS_CONFIG);
        }
      } catch (error) {
        setConfig(DEFAULT_ANALYTICS_CONFIG);
      } finally {
        setLoading(false);
      }
    };

    const initializeTrackingState = () => {
      // First, read from localStorage (source of truth for user consent)
      // Guard against SSR where window/localStorage is not available
      const consent = typeof window !== 'undefined' ? localStorage.getItem('analytics-consent') : null;
      const consentValue = consent === 'true';
      setConsentGiven(consentValue);
      
      // Set initial state from localStorage (user's preference)
      // This ensures we show the correct state immediately, even before GA initializes
      setTrackingEnabledState(consentValue);
      
      // Wait for GA to initialize, then sync the state with actual tracking status
      // Poll for GA initialization (max 5 seconds, check every 200ms)
      let attempts = 0;
      const maxAttempts = 25;
      
      const checkGAInitialized = setInterval(() => {
        attempts++;
      }, 200);
      
      // Return the interval ID so it can be cleaned up
      return checkGAInitialized;
    };

    fetchConfig();
    const intervalId = initializeTrackingState();
    
    // Cleanup function to clear interval if component unmounts
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, []);

  const handleToggle = () => {
    const newState = !trackingEnabled;
    // Guard against SSR where window/localStorage is not available
    if (typeof window !== 'undefined') {
      localStorage.setItem('analytics-consent', newState.toString());
    }
    setConsentGiven(newState);
  };

  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const isGAConfigured = measurementId && measurementId !== 'G-XXXXXXXXXX';

  if (loading) {
    return null;
  }

  if (config.showSettingsPanel !== true) {
    return null;
  }

  if (!isGAConfigured) {
    return null;
  }

  if (!config.enabled) {
    return null;
  }

  if (!config.allowUserOptOut) {
    return null;
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <h3 className="text-lg font-semibold mb-4" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span>🔒</span>
        Google Analytics
      </h3>

        <div className="border rounded-lg p-4 bg-white dark:bg-gray-800">
          <h4 className="text-base font-semibold mb-2">Analytics Preferences</h4>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            We use analytics to improve your experience. You can disable tracking at any time.
          </p>

          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">
              Enable Analytics Tracking
            </span>
            <button
              onClick={handleToggle}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                trackingEnabled ? 'bg-blue-600' : 'bg-gray-300'
              }`}
              role="switch"
              aria-checked={trackingEnabled}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  trackingEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="mt-4 text-xs text-gray-500 dark:text-gray-400">
            <p>Current status: {trackingEnabled ? '✅ Enabled' : '❌ Disabled'}</p>
            <p>Environment: {process.env.NODE_ENV || 'unknown'}</p>
            <p>Debug mode: {process.env.NEXT_PUBLIC_GA_DEBUG === 'true' ? 'ON' : 'OFF'}</p>
          </div>
        </div>
      </div>
  );
}

/**
 * Consent Banner Component
 * Shows a banner asking for analytics consent on first visit
 * Visibility controlled by database config flag
 */
export function AnalyticsConsentBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [config, setConfig] = useState<AnalyticsConfig>(DEFAULT_ANALYTICS_CONFIG);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch configuration from API
    const fetchConfig = async () => {
      try {
        const response = await fetch('/api/analytics-config');
        const data = await response.json();

        if (data.success) {
          setConfig(data.config);

          // Only show banner if ALL conditions are met:
          // 1. Analytics is globally enabled
          // 2. Consent banner is enabled in config
          // 3. Consent is required OR banner is shown for transparency
          // 4. User hasn't given consent yet
          // Note: Only check localStorage on client side (window is defined)
          const shouldShowBanner =
            data.config.enabled &&
            data.config.showConsentBanner &&
            (typeof window !== 'undefined' && localStorage.getItem('analytics-consent') === null);

          if (shouldShowBanner) {
            setShowBanner(true);
          }
        }
      } catch (error) {
        console.error('[AnalyticsConsentBanner] Error fetching config:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchConfig();
  }, []);

  const handleAccept = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('analytics-consent', 'true');
    }
    setShowBanner(false);
  };

  const handleDecline = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('analytics-consent', 'false');
    }
    setShowBanner(false);
  };

  // Don't render if loading or banner should not be shown
  if (loading || !showBanner || !config.showConsentBanner) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex-1">
          <h4 className="font-semibold mb-1">🍪 Analytics & Cookies</h4>
          <p className="text-sm text-gray-300">
            We use analytics to understand how you use our app and improve your experience.
            Your data is anonymized and never sold to third parties.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleDecline}
            className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm font-medium transition-colors"
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded text-sm font-medium transition-colors"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
