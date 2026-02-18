/**
 * Analytics Configuration Types
 * Nested within the main config document under 'analytics' field
 */

export interface AnalyticsConfig {
  // Enable/disable analytics globally
  enabled: boolean;
  // Google Analytics Measurement ID (e.g., G-XXXXXXXXXX)
  measurementId?: string;
  // Enable/disable debug mode (shows console logs)
  debugMode: boolean;
  // Show/hide the consent banner on first visit
  showConsentBanner: boolean;
  // Show/hide analytics settings in user preferences
  showSettingsPanel: boolean;
  // Allow users to opt-out of tracking
  allowUserOptOut: boolean;
  // Require consent before tracking (GDPR compliance)
  requireConsent: boolean;
  // Last updated timestamp
  updatedAt?: Date;
  // Who updated it
  updatedBy?: string;
}

export const DEFAULT_ANALYTICS_CONFIG: AnalyticsConfig = {
  enabled: false,
  debugMode: false,
  showConsentBanner: false,
  showSettingsPanel: false,
  allowUserOptOut: false,
  requireConsent: false,
};
