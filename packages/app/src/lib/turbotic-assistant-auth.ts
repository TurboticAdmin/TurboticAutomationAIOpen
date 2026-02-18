import { getDb } from '@/lib/db';
import { decrypt } from '@/lib/encryption';
import { TOKEN_EXPIRATION_MS } from './turbotic-assistant-constants';
import { getTokenExpiration } from './turbotic-assistant-jwt';

export interface TurboticAssistantAuth {
  cookie?: string;
  token?: string;
  expiresAt?: Date;
  isExpired: boolean;
}

/**
 * Get stored Turbotic Assistant authentication cookie/token from integration
 * Returns null if no auth is stored or integration doesn't exist
 */
export async function getTurboticAssistantAuth(userEmail: string): Promise<TurboticAssistantAuth | null> {
  try {
    const db = getDb();
    const integrationsCollection = db.collection('integrations');

    const integration = await integrationsCollection.findOne({
      userId: userEmail,
      source: 'turbotic-assistant',
      app: 'turbotic-assistant'
    });

    if (!integration || !integration.isConnected) {
      return null;
    }

    // Decrypt stored cookie and token
    const encryptedCookie = integration.turboticAssistantAuthCookie;
    const encryptedToken = integration.turboticAssistantAuthToken;
    
    let cookie: string | undefined;
    let token: string | undefined;
    
    try {
      if (encryptedCookie) {
        cookie = decrypt(encryptedCookie);
      }
    } catch (error) {
      // If decryption fails, token might be in old format (plaintext) or corrupted
      cookie = encryptedCookie; // Fallback to plaintext for backward compatibility
    }
    
    try {
      if (encryptedToken) {
        token = decrypt(encryptedToken);
      }
    } catch (error) {
      // If decryption fails, token might be in old format (plaintext) or corrupted
      token = encryptedToken; // Fallback to plaintext for backward compatibility
    }
    const expiresAtInitial = integration.turboticAssistantAuthExpiresAt 
      ? new Date(integration.turboticAssistantAuthExpiresAt)
      : undefined;
    const lastAuthAt = integration.lastAuthAt ? new Date(integration.lastAuthAt) : undefined;

    // Check if token is expired
    let isExpired = false;
    let expiresAt = expiresAtInitial;

    // Priority 1: If token exists, extract expiration from JWT payload
    if (token) {
      const tokenExpiration = getTokenExpiration(token);
      if (tokenExpiration) {
        // Update expiresAt with token expiration if not already set or different
        expiresAt = tokenExpiration;
        isExpired = new Date() >= tokenExpiration;
      } else {
        // Token exists but can't extract expiration (not a JWT or malformed)
        // Fall back to stored expiration or lastAuthAt
        if (expiresAt) {
          isExpired = new Date() >= expiresAt;
        } else if (lastAuthAt) {
          // Calculate expiration based on TOKEN_EXPIRATION_MS (7 days default)
          const expirationTime = new Date(lastAuthAt.getTime() + TOKEN_EXPIRATION_MS);
          isExpired = new Date() >= expirationTime;
        } else {
          // No way to determine expiration, mark as expired
          isExpired = true;
        }
      }
    } else if (expiresAt) {
      // Priority 2: Use explicit expiration date if provided by API (for cookie-only auth)
      isExpired = new Date() >= expiresAt;
    } else if (lastAuthAt) {
      // Priority 3: Calculate based on lastAuthAt + TOKEN_EXPIRATION_MS (7 days)
      const expirationTime = new Date(lastAuthAt.getTime() + TOKEN_EXPIRATION_MS);
      isExpired = new Date() >= expirationTime;
    } else if (cookie) {
      // Have cookie but no dates, mark as expired to force re-authentication
      isExpired = true;
    }

    if (!cookie && !token) {
      return null;
    }

    return {
      cookie: cookie || undefined,
      token: token || undefined,
      expiresAt,
      isExpired
    };
  } catch (error) {
    return null;
  }
}

/**
 * Check if Turbotic Assistant authentication is valid (exists and not expired)
 */
export async function isTurboticAssistantAuthValid(userEmail: string): Promise<boolean> {
  const auth = await getTurboticAssistantAuth(userEmail);
  return auth !== null && !auth.isExpired;
}

