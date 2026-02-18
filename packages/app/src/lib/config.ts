import { getDb } from './db';
import { ObjectId } from 'mongodb';

export interface UsageConfig {
  _id?: ObjectId;
  mode: 'charge' | 'free'; // 'charge' = enforce limits, 'free' = just track
  onboardingTourEnabled?: boolean; // Default is false (off)
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Get usage configuration (charge vs free mode)
 */
export async function getUsageConfig(): Promise<UsageConfig | null> {
  const db = getDb();

  const config = await db.collection<UsageConfig>('config').findOne() as UsageConfig | null;

  return config;
}

/**
 * Check if onboarding tour is enabled
 */
export async function isOnboardingTourEnabled(): Promise<boolean> {
  const config = await getUsageConfig();
  return config?.onboardingTourEnabled ?? false; // Default to false
}

/**
 * Check if charging is enabled (returns true if in 'charge' mode)
 */
export async function isChargingEnabled(): Promise<boolean> {
  const config = await getUsageConfig();
  return config?.mode === 'charge';
}


