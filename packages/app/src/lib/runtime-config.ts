interface RuntimeConfig {
  socketUrl: string;
  environment: string;
  hostname: string;
  apiBaseUrl: string;
  timestamp: string;
}

class RuntimeConfigManager {
  private static instance: RuntimeConfigManager;
  private config: RuntimeConfig | null = null;
  private configPromise: Promise<RuntimeConfig> | null = null;
  private lastFetchTime: number = 0;
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  private constructor() {}

  static getInstance(): RuntimeConfigManager {
    if (!RuntimeConfigManager.instance) {
      RuntimeConfigManager.instance = new RuntimeConfigManager();
    }
    return RuntimeConfigManager.instance;
  }

  private async fetchConfig(): Promise<RuntimeConfig> {
    try {
      let url = '/api/runtime-config';
      if (typeof window === 'undefined') {
        // Server-side: use localhost since Next.js API and SSR run in the same pod/container
        url = 'http://localhost:3000/api/runtime-config';
      }
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch runtime config: ${response.status} ${response.statusText}`);
      }

      const config = await response.json();
      
      // Validate required fields
      if (!config.socketUrl) {
        throw new Error('Runtime config missing socketUrl');
      }

      return config;
    } catch (error) {
      console.error('[Runtime Config] Failed to fetch configuration:', error);
      if (!process.env.NEXT_PUBLIC_SOCKET_URL) {
        console.warn('[Runtime Config] WARNING: Falling back to ws://localhost:3000 for socketUrl. This means runtime config fetch failed and socket connections will not work in production.');
      }
      // Return fallback configuration
      // Determine protocol for socketUrl and apiBaseUrl
      let protocol = 'http:';
      let wsProtocol = 'ws:';
      if (typeof window !== 'undefined') {
        protocol = window.location.protocol;
        wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
      } else if (process.env.NEXT_PUBLIC_APP_PROTOCOL) {
        protocol = process.env.NEXT_PUBLIC_APP_PROTOCOL;
        wsProtocol = protocol === 'https:' ? 'wss:' : 'ws:';
      }
      const host = process.env.PUBLIC_HOSTNAME || 'localhost';
      const socketPort = '3000';
      const apiPort = '3000';
      return {
        socketUrl: process.env.NEXT_PUBLIC_SOCKET_URL || `${wsProtocol}//${host}:${socketPort}`,
        environment: process.env.APP_ENV || 'development',
        hostname: host,
        apiBaseUrl: host ? `${protocol}//${host}` : `http://localhost:${apiPort}`,
        timestamp: new Date().toISOString()
      };
    }
  }

  async getConfig(): Promise<RuntimeConfig> {
    const now = Date.now();

    // Return cached config if still valid
    if (this.config && (now - this.lastFetchTime) < this.CACHE_DURATION) {
      return this.config;
    }

    // If there's already a fetch in progress, wait for it
    if (this.configPromise) {
      return this.configPromise;
    }

    // Start new fetch
    this.configPromise = this.fetchConfig();
    
    try {
      this.config = await this.configPromise;
      this.lastFetchTime = now;
      return this.config;
    } finally {
      this.configPromise = null;
    }
  }

  async getSocketUrl(): Promise<string> {
    const config = await this.getConfig();
    return config.socketUrl;
  }

  // Force refresh the configuration
  async refresh(): Promise<RuntimeConfig> {
    this.config = null;
    this.configPromise = null;
    this.lastFetchTime = 0;
    return this.getConfig();
  }
}

export const runtimeConfig = RuntimeConfigManager.getInstance();
export type { RuntimeConfig }; 