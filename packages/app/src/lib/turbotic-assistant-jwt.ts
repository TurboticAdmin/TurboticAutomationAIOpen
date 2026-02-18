/**
 * JWT token utilities for Turbotic Assistant
 * Decode and extract information from JWT tokens without verification
 */

interface JWTPayload {
  exp?: number; // Expiration time (seconds since Unix epoch)
  iat?: number; // Issued at time
  sub?: string; // Subject (usually user ID)
  [key: string]: any;
}

/**
 * Decode JWT token without verification
 * Returns null if token is invalid or cannot be decoded
 */
export function decodeJWT(token: string): JWTPayload | null {
  try {
    if (!token || typeof token !== 'string') {
      return null;
    }

    // JWT format: header.payload.signature
    const parts = token.split('.');

    if (parts.length !== 3) {
      return null;
    }

    // Decode the payload (second part)
    const payload = parts[1];

    // Base64 URL decode
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');

    return JSON.parse(jsonPayload) as JWTPayload;
  } catch (error) {
    // Invalid token format
    return null;
  }
}

/**
 * Extract expiration date from JWT token
 * Returns null if token is invalid or has no expiration
 */
export function getTokenExpiration(token: string): Date | null {
  const payload = decodeJWT(token);

  if (!payload || !payload.exp) {
    return null;
  }

  // JWT exp is in seconds, convert to milliseconds
  return new Date(payload.exp * 1000);
}

/**
 * Check if JWT token is expired
 */
export function isTokenExpired(token: string): boolean {
  const expiration = getTokenExpiration(token);

  if (!expiration) {
    // If we can't determine expiration, consider it expired
    return true;
  }

  return new Date() >= expiration;
}

/**
 * Get token issued at date
 */
export function getTokenIssuedAt(token: string): Date | null {
  const payload = decodeJWT(token);

  if (!payload || !payload.iat) {
    return null;
  }

  // JWT iat is in seconds, convert to milliseconds
  return new Date(payload.iat * 1000);
}
