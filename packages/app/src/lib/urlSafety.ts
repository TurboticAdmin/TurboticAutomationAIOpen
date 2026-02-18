let allowedHostsCache: string[] | null = null;
let lastFetchedAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function loadAllowedHosts(): Promise<string[]> {
  const now = Date.now();
  if (allowedHostsCache && now - lastFetchedAt < CACHE_TTL_MS) {
    return allowedHostsCache;
  }
  try {
    const res = await fetch('/api/notifications/allowed-hosts', { cache: 'no-store' });
    const data = await res.json();
    if (res.ok && data?.allowedHosts && Array.isArray(data.allowedHosts)) {
      allowedHostsCache = data.allowedHosts as string[];
      lastFetchedAt = now;
      return allowedHostsCache;
    }
  } catch {
    // ignore
  }
  // Fallback to empty list if API fails
  allowedHostsCache = [];
  lastFetchedAt = now;
  return allowedHostsCache;
}

export function getSafeExternalUrl(raw: string | null | undefined, allowedHosts: string[]): string | null {
  if (!raw) return null;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:') return null;
    if (!allowedHosts.includes(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

export async function openExternalSafeAsync(raw: string | null | undefined) {
  const hosts = await loadAllowedHosts();
  const url = getSafeExternalUrl(raw, hosts);
  if (!url) return;
  const win = window.open(url, '_blank', 'noopener,noreferrer');
  if (win) win.opener = null;
}

export async function getAllowedHostsCached(): Promise<string[]> {
  return loadAllowedHosts();
}

/**
 * Validates that a redirect URL is safe (same-origin or relative path)
 * Prevents open redirect attacks
 */
export function isValidRedirectUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  
  try {
    // If it's a relative path (starts with /), it's safe
    if (url.startsWith('/')) {
      // Additional check: ensure it doesn't contain protocol-relative URLs
      if (url.startsWith('//')) return false;
      // Ensure it doesn't contain javascript: or data: protocols
      if (url.toLowerCase().includes('javascript:') || url.toLowerCase().includes('data:')) return false;
      return true;
    }
    
    // If it's a full URL, check if it's same-origin
    const redirectUrl = new URL(url, window.location.origin);
    return redirectUrl.origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Sanitizes and validates a redirect URL
 * Returns null if invalid, otherwise returns the safe URL
 */
export function sanitizeRedirectUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  
  try {
    const decoded = decodeURIComponent(url);
    if (!isValidRedirectUrl(decoded)) return null;
    return decoded;
  } catch {
    return null;
  }
}


