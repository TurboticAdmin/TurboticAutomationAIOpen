/**
 * Helper functions for automation scripts to access user configurations
 */

import { getConfigValue, getConfigurationByName, getUserConfigurations } from './user-configurations';

/**
 * Get OpenAI API key from user configurations
 */
export async function getOpenAIApiKey(): Promise<string | null> {
  return getConfigValue('OpenAI API Key');
}

/**
 * Get SendGrid API key from user configurations
 */
export async function getSendGridApiKey(): Promise<string | null> {
  return getConfigValue('SendGrid API Key');
}

/**
 * Get webhook URL from user configurations
 */
export async function getWebhookUrl(name: string = 'Webhook URL'): Promise<string | null> {
  return getConfigValue(name);
}

/**
 * Get database connection string from user configurations
 */
export async function getDatabaseUrl(): Promise<string | null> {
  return getConfigValue('Database URL');
}

/**
 * Get email configuration
 */
export async function getEmailConfig(): Promise<{
  smtpHost?: string;
  smtpPort?: string;
  smtpUser?: string;
  smtpPassword?: string;
} | null> {
  const configs = await getUserConfigurations();
  
  const smtpHost = configs.find(c => c.name === 'SMTP Host')?.value;
  const smtpPort = configs.find(c => c.name === 'SMTP Port')?.value;
  const smtpUser = configs.find(c => c.name === 'SMTP User')?.value;
  const smtpPassword = configs.find(c => c.name === 'SMTP Password')?.value;

  if (!smtpHost || !smtpPort || !smtpUser || !smtpPassword) {
    return null;
  }

  return {
    smtpHost,
    smtpPort,
    smtpUser,
    smtpPassword
  };
}

/**
 * Generic function to get any configuration value
 */
export async function getConfig(name: string): Promise<string | null> {
  return getConfigValue(name);
}

/**
 * Get all configurations as a key-value object
 */
export async function getAllConfigs(): Promise<Record<string, string>> {
  const configs = await getUserConfigurations();
  const result: Record<string, string> = {};
  
  configs.forEach(config => {
    result[config.name] = config.value;
  });
  
  return result;
}
