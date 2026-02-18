/**
 * Constants for Turbotic Assistant integration
 */

// API request timeouts
export const API_REQUEST_TIMEOUT_MS = 3 * 60 * 1000; // 3 minutes

// Token expiration time (fallback if JWT extraction fails)
// Tokens are typically valid for 7 days from the Turbotic Assistant backend
// This is used as a fallback when expiration cannot be extracted from the JWT token
export const TOKEN_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Status names (correct spelling)
export const MEETING_STATUS = {
  ONGOING: 'ongoing',
  UPCOMING: 'upcoming',
  COMPLETED: 'completed',
  SHARED: 'shared',
  ERROR: 'error'
} as const;

export type MeetingStatus = typeof MEETING_STATUS[keyof typeof MEETING_STATUS];