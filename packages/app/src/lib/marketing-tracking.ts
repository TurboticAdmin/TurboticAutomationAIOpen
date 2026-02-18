import { getDb, getDbWithSelection } from './db';
import { ObjectId } from 'mongodb';

export interface UTMParameters {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

export interface PlanInfo {
  tier: string;
  billingPeriod?: 'monthly' | 'yearly';
  customLimits?: {
    executionsPerMonth?: number;
    chats?: number;
    automations?: number;
  };
  updatedAt: Date;
}

export interface ScheduledPlanChange {
  tier: string;
  billingPeriod?: 'monthly' | 'yearly';
  customLimits?: {
    executionsPerMonth?: number;
    chats?: number;
    automations?: number;
  };
  scheduledFor: Date;
  type: 'cancellation' | 'downgrade' | 'upgrade' | 'change';
  createdAt: Date;
}

export interface MarketingTrackingRecord {
  _id?: ObjectId;
  userId: string;
  email: string;
  workspaceId: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  joinedAt: Date;
  planHistory: PlanInfo[];
  scheduledPlanChange?: ScheduledPlanChange;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Sanitize and validate UTM parameters
 * Prevents XSS, injection attacks, and data pollution
 */
export function sanitizeUTMParams(params: UTMParameters): UTMParameters {
  const sanitized: UTMParameters = {};

  // Allow alphanumeric, hyphens, underscores, spaces, and dots
  // This covers most legitimate marketing campaigns while preventing malicious input
  const safePattern = /^[a-zA-Z0-9_\-\s.]+$/;
  const maxLength = 100;

  const sanitizeField = (value: string | undefined): string | undefined => {
    if (!value) return undefined;

    // Trim and limit length
    let sanitized = value.trim().substring(0, maxLength);

    // Check against safe pattern
    if (!safePattern.test(sanitized)) {
      return undefined;
    }

    return sanitized;
  };

  sanitized.utm_source = sanitizeField(params.utm_source);
  sanitized.utm_medium = sanitizeField(params.utm_medium);
  sanitized.utm_campaign = sanitizeField(params.utm_campaign);

  return sanitized;
}

/**
 * Extract UTM parameters from URL search params or query object
 */
export function extractUTMParameters(params: URLSearchParams | Record<string, string>): UTMParameters {
  const utmParams: UTMParameters = {};

  if (params instanceof URLSearchParams) {
    const source = params.get('utm_source');
    const medium = params.get('utm_medium');
    const campaign = params.get('utm_campaign');

    if (source) utmParams.utm_source = source;
    if (medium) utmParams.utm_medium = medium;
    if (campaign) utmParams.utm_campaign = campaign;
  } else {
    if (params.utm_source) utmParams.utm_source = params.utm_source;
    if (params.utm_medium) utmParams.utm_medium = params.utm_medium;
    if (params.utm_campaign) utmParams.utm_campaign = params.utm_campaign;
  }

  // Sanitize before returning
  return sanitizeUTMParams(utmParams);
}

/**
 * Create initial marketing tracking record when user signs up
 */
export async function createMarketingTrackingRecord(
  userId: string,
  email: string,
  workspaceId: string,
  utmParams: UTMParameters,
  initialPlan: {
    tier: string;
    billingPeriod?: 'monthly' | 'yearly';
    customLimits?: {
      executionsPerMonth?: number;
      chats?: number;
      automations?: number;
    };
  }
): Promise<void> {
  const db = getDb();

  const now = new Date();
  const planInfo: PlanInfo = {
    tier: initialPlan.tier,
    billingPeriod: initialPlan.billingPeriod,
    customLimits: initialPlan.customLimits,
    updatedAt: now
  };

  const trackingRecord: MarketingTrackingRecord = {
    userId,
    email,
    workspaceId,
    utm_source: utmParams.utm_source,
    utm_medium: utmParams.utm_medium,
    utm_campaign: utmParams.utm_campaign,
    joinedAt: now,
    planHistory: [planInfo],
    createdAt: now,
    updatedAt: now
  };

  try {
    await db.collection('marketing_tracking').insertOne(trackingRecord);
  } catch (error) {
    console.error('[Marketing Tracking] Error creating tracking record:', error);
    // Don't throw error - marketing tracking failure shouldn't break user signup
  }
}

/**
 * Update plan information in marketing tracking when subscription changes
 */
export async function updateMarketingTrackingPlan(
  workspaceId: string,
  newPlan: {
    tier: string;
    billingPeriod?: 'monthly' | 'yearly';
    customLimits?: {
      executionsPerMonth?: number;
      chats?: number;
      automations?: number;
    };
  }
): Promise<void> {
  const db = getDb();

  try {
    const now = new Date();
    const planInfo: PlanInfo = {
      tier: newPlan.tier,
      billingPeriod: newPlan.billingPeriod,
      customLimits: newPlan.customLimits,
      updatedAt: now
    };

    // Find existing record by workspaceId
    const existingRecord = await db.collection('marketing_tracking').findOne({ workspaceId });

    if (existingRecord) {
      // Check if the plan actually changed (avoid duplicate entries)
      const lastPlan = existingRecord.planHistory[existingRecord.planHistory.length - 1];

      const planChanged = lastPlan.tier !== newPlan.tier ||
                         lastPlan.billingPeriod !== newPlan.billingPeriod ||
                         JSON.stringify(lastPlan.customLimits) !== JSON.stringify(newPlan.customLimits);

      if (planChanged) {
        // Add new plan to history - use the record's _id for reliable update
        await db.collection('marketing_tracking').updateOne(
          { _id: existingRecord._id },
          {
            $push: { planHistory: planInfo } as any,
            $set: { updatedAt: now }
          }
        );
      }
    }
  } catch (error) {
    console.error('[Marketing Tracking] Error updating plan:', error);
    // Don't throw error - marketing tracking failure shouldn't break subscription updates
  }
}

/**
 * Schedule a plan change (cancellation, downgrade, upgrade)
 */
export async function scheduleMarketingTrackingPlanChange(
  workspaceId: string,
  scheduledPlan: {
    tier: string;
    billingPeriod?: 'monthly' | 'yearly';
    customLimits?: {
      executionsPerMonth?: number;
      chats?: number;
      automations?: number;
    };
  },
  scheduledFor: Date,
  changeType: 'cancellation' | 'downgrade' | 'upgrade' | 'change'
): Promise<void> {
  const db = getDb();

  try {
    const scheduledChange: ScheduledPlanChange = {
      tier: scheduledPlan.tier,
      billingPeriod: scheduledPlan.billingPeriod,
      customLimits: scheduledPlan.customLimits,
      scheduledFor,
      type: changeType,
      createdAt: new Date()
    };

    await db.collection('marketing_tracking').updateOne(
      { workspaceId },
      {
        $set: {
          scheduledPlanChange: scheduledChange,
          updatedAt: new Date()
        }
      }
    );
  } catch (error) {
    console.error('[Marketing Tracking] Error scheduling plan change:', error);
    // Don't throw error - marketing tracking failure shouldn't break subscription updates
  }
}

/**
 * Execute and clear a scheduled plan change
 */
export async function executeScheduledPlanChange(workspaceId: string): Promise<void> {
  const db = getDb();

  try {
    const record = await db.collection('marketing_tracking').findOne({ workspaceId });

    if (!record || !record.scheduledPlanChange) {
      return;
    }

    // Add the scheduled plan to history
    const now = new Date();
    const planInfo: PlanInfo = {
      tier: record.scheduledPlanChange.tier,
      billingPeriod: record.scheduledPlanChange.billingPeriod,
      customLimits: record.scheduledPlanChange.customLimits,
      updatedAt: now
    };

    // Update the record: add to plan history and remove scheduled change
    await db.collection('marketing_tracking').updateOne(
      { _id: record._id },
      {
        $push: { planHistory: planInfo } as any,
        $unset: { scheduledPlanChange: "" },
        $set: { updatedAt: now }
      }
    );
  } catch (error) {
    console.error('[Marketing Tracking] Error executing scheduled plan change:', error);
    // Don't throw error - marketing tracking failure shouldn't break subscription updates
  }
}

/**
 * Cancel a scheduled plan change
 */
export async function cancelScheduledPlanChange(workspaceId: string): Promise<void> {
  const db = getDb();

  try {
    await db.collection('marketing_tracking').updateOne(
      { workspaceId },
      {
        $unset: { scheduledPlanChange: "" },
        $set: { updatedAt: new Date() }
      }
    );
  } catch (error) {
    console.error('[Marketing Tracking] Error cancelling scheduled plan change:', error);
    // Don't throw error - marketing tracking failure shouldn't break subscription updates
  }
}

/**
 * Get marketing tracking record for a user
 */
export async function getMarketingTrackingRecord(userId: string): Promise<MarketingTrackingRecord | null> {
  const db = getDb();

  try {
    const record = await db.collection('marketing_tracking').findOne({ userId });
    return record as MarketingTrackingRecord | null;
  } catch (error) {
    return null;
  }
}

/**
 * Get all marketing tracking records with optional filtering
 */
export async function getMarketingTrackingRecords(
  filters?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    startDate?: Date;
    endDate?: Date;
  },
  database: 'prod' | 'test' = 'prod'
): Promise<MarketingTrackingRecord[]> {
  const db = getDbWithSelection(database);

  try {
    const query: any = {};

    if (filters?.utm_source) {
      query.utm_source = filters.utm_source;
    }
    if (filters?.utm_medium) {
      query.utm_medium = filters.utm_medium;
    }
    if (filters?.utm_campaign) {
      query.utm_campaign = filters.utm_campaign;
    }
    if (filters?.startDate || filters?.endDate) {
      query.joinedAt = {};
      if (filters.startDate) {
        query.joinedAt.$gte = filters.startDate;
      }
      if (filters.endDate) {
        query.joinedAt.$lte = filters.endDate;
      }
    }

    const records = await db.collection('marketing_tracking')
      .find(query)
      .sort({ joinedAt: -1 })
      .toArray();

    return records as MarketingTrackingRecord[];
  } catch (error) {
    return [];
  }
}
