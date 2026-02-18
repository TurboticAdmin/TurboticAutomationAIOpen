/**
 * Utility functions to persist and retrieve UTM parameters across page reloads and failed login attempts
 * UTM parameters are stored in sessionStorage to survive page reloads but not browser restarts
 */

export interface UTMParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

const UTM_STORAGE_KEY = 'utm_params';
const UTM_EXPIRY_KEY = 'utm_params_expiry';
const UTM_EXPIRY_HOURS = 24; // UTM params expire after 24 hours

/**
 * Save UTM parameters to sessionStorage with expiry
 */
export function saveUTMParams(params: UTMParams): void {
  if (typeof window === 'undefined') return;

  // Only save if at least one UTM parameter exists
  if (!params.utm_source && !params.utm_medium && !params.utm_campaign) {
    return;
  }

  try {
    const expiryTime = Date.now() + (UTM_EXPIRY_HOURS * 60 * 60 * 1000);
    sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(params));
    sessionStorage.setItem(UTM_EXPIRY_KEY, expiryTime.toString());
  } catch (error) {
    console.error('[UTM Persistence] Error saving UTM params:', error);
  }
}

/**
 * Get UTM parameters from sessionStorage, checking expiry
 */
export function getStoredUTMParams(): UTMParams {
  if (typeof window === 'undefined') return {};

  try {
    const stored = sessionStorage.getItem(UTM_STORAGE_KEY);
    const expiry = sessionStorage.getItem(UTM_EXPIRY_KEY);

    if (!stored) return {};

    // Check if expired
    if (expiry) {
      const expiryTime = parseInt(expiry, 10);
      if (Date.now() > expiryTime) {
        // Expired, clear storage
        clearUTMParams();
        return {};
      }
    }

    return JSON.parse(stored) as UTMParams;
  } catch (error) {
    console.error('[UTM Persistence] Error retrieving UTM params:', error);
    return {};
  }
}

/**
 * Get UTM parameters from URL with validation
 */
export function getUTMParamsFromURL(): UTMParams {
  if (typeof window === 'undefined') return {};

  const params = new URLSearchParams(window.location.search);
  const utmParams: UTMParams = {};

  const utm_source = params.get('utm_source');
  const utm_medium = params.get('utm_medium');
  const utm_campaign = params.get('utm_campaign');

  if (utm_source) utmParams.utm_source = utm_source;
  if (utm_medium) utmParams.utm_medium = utm_medium;
  if (utm_campaign) utmParams.utm_campaign = utm_campaign;

  // Validate parameters client-side
  return validateUTMParamsClientSide(utmParams);
}

/**
 * Client-side validation for UTM parameters
 * Simpler version for client-side (full sanitization happens server-side)
 */
function validateUTMParamsClientSide(params: UTMParams): UTMParams {
  const validated: UTMParams = {};
  const safePattern = /^[a-zA-Z0-9_\-\s.]+$/;
  const maxLength = 100;

  const validateField = (value: string | undefined): string | undefined => {
    if (!value) return undefined;
    const trimmed = value.trim().substring(0, maxLength);
    return safePattern.test(trimmed) ? trimmed : undefined;
  };

  validated.utm_source = validateField(params.utm_source);
  validated.utm_medium = validateField(params.utm_medium);
  validated.utm_campaign = validateField(params.utm_campaign);

  return validated;
}

/**
 * Get UTM parameters from URL first, fallback to sessionStorage
 * Also saves URL params to storage if found
 */
export function getUTMParams(): UTMParams {
  // Try URL first
  const urlParams = getUTMParamsFromURL();

  // If we have URL params, save them and return them
  if (urlParams.utm_source || urlParams.utm_medium || urlParams.utm_campaign) {
    saveUTMParams(urlParams);
    return urlParams;
  }

  // Otherwise, try to get from storage
  return getStoredUTMParams();
}

/**
 * Clear UTM parameters from sessionStorage
 */
export function clearUTMParams(): void {
  if (typeof window === 'undefined') return;

  try {
    sessionStorage.removeItem(UTM_STORAGE_KEY);
    sessionStorage.removeItem(UTM_EXPIRY_KEY);
  } catch (error) {
    console.error('[UTM Persistence] Error clearing UTM params:', error);
  }
}

/**
 * Clear UTM parameters after successful login (optional - call this if you want to prevent reuse)
 */
export function clearUTMParamsAfterLogin(): void {
  // Optionally clear UTM params after successful signup
  // You may want to keep them for the session in case of multiple signups
  clearUTMParams();
}
