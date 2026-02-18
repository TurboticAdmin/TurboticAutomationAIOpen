import { TurboticAssistantAuth } from './turbotic-assistant-auth';

/**
 * Build authentication headers for Turbotic Assistant API requests
 */
export function buildTurboticAuthHeaders(
  workspaceId: string,
  auth: TurboticAssistantAuth,
  contentType: string = 'application/json'
): Record<string, string> {
  const headers: Record<string, string> = {
    'workspaceid': workspaceId,
    'Content-Type': contentType
  };

  // Use stored cookie if available (preferred method)
  if (auth.cookie) {
    headers['cookie'] = auth.cookie;
  }

  // Use stored token if available
  if (auth.token) {
    headers['authorization'] = `Bearer ${auth.token}`;
  }

  return headers;
}

/**
 * Create an AbortController with timeout for fetch requests
 */
export function createTimeoutController(timeoutMs: number): {
  controller: AbortController;
  timeoutId: NodeJS.Timeout;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    controller,
    timeoutId,
    cleanup: () => clearTimeout(timeoutId)
  };
}

/**
 * Check if the current environment is production
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

/**
 * Enforce HTTPS in production
 * Throws an error if the protocol is not HTTPS in production
 */
export function enforceHttpsInProduction(url: string): void {
  if (isProduction()) {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== 'https:') {
        throw new Error('HTTPS is required in production environment');
      }
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error('Invalid URL provided');
      }
      throw error;
    }
  }
}
