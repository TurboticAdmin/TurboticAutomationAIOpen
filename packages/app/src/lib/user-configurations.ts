/**
 * Utility functions for working with user configurations
 */

export interface UserConfiguration {
  id: string;
  name: string;
  value?: string | { // Can be a string (applies to all environments) or object (multi-environment)
    dev?: string | null;
    test?: string | null;
    production?: string | null;
  };
  source: string;
}

/**
 * Get user configurations from the API
 */
export async function getUserConfigurations(): Promise<UserConfiguration[]> {
  try {
    const response = await fetch('/api/user-configurations', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user configurations');
    }

    const data = await response.json();
    return data.configurations || [];
  } catch (error) {
    console.error('Error fetching user configurations:', error);
    return [];
  }
}

/**
 * Get a specific configuration by name
 */
export async function getConfigurationByName(name: string): Promise<UserConfiguration | null> {
  const configurations = await getUserConfigurations();
  return configurations.find(config => config.name === name) || null;
}

/**
 * Get configurations by name pattern
 */
export async function getConfigurationsByNamePattern(pattern: string): Promise<UserConfiguration[]> {
  const configurations = await getUserConfigurations();
  return configurations.filter(config => 
    config.name.toLowerCase().includes(pattern.toLowerCase())
  );
}

/**
 * Get all API keys (by name pattern)
 */
export async function getApiKeys(): Promise<UserConfiguration[]> {
  return getConfigurationsByNamePattern('api key');
}

/**
 * Get all webhook URLs (by name pattern)
 */
export async function getWebhookUrls(): Promise<UserConfiguration[]> {
  return getConfigurationsByNamePattern('webhook');
}

/**
 * Get all tokens (by name pattern)
 */
export async function getTokens(): Promise<UserConfiguration[]> {
  return getConfigurationsByNamePattern('token');
}

/**
 * Helper function to get configuration value by name
 * Useful in automation scripts
 * @param name Configuration name
 * @param environment Optional environment (dev, test, production). If not provided, returns the first available value.
 */
export async function getConfigValue(name: string, environment?: 'dev' | 'test' | 'production'): Promise<string | null> {
  const config = await getConfigurationByName(name);
  if (!config) return null;
  
  // If value is an object (multi-environment structure)
  if (config.value && typeof config.value === 'object') {
    if (environment) {
      return config.value[environment] || null;
    }
    // Return first available value if no environment specified
    return config.value.dev || config.value.test || config.value.production || null;
  }
  
  // Any single value (applies to all environments)
  return typeof config.value === 'string' ? config.value : null;
}

/**
 * Common configuration name patterns for better organization
 */
export const COMMON_CONFIG_NAMES = {
  OPENAI_API_KEY: 'OpenAI API Key',
  SENDGRID_API_KEY: 'SendGrid API Key',
  WEBHOOK_URL: 'Webhook URL',
  DATABASE_URL: 'Database URL',
  SMTP_HOST: 'SMTP Host',
  SMTP_PORT: 'SMTP Port',
  SMTP_USER: 'SMTP User',
  SMTP_PASSWORD: 'SMTP Password'
} as const;
