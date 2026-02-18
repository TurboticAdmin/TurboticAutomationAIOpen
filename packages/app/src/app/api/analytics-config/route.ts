import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { AnalyticsConfig, DEFAULT_ANALYTICS_CONFIG } from '@/types/analytics-config';
import authenticationBackend from '@/app/api/authentication/authentication-backend';

/**
 * GET /api/analytics-config
 * Fetch analytics configuration from database
 * Public endpoint - no auth required (needed for consent banner)
 *
 * Analytics config is stored as a nested field in the single config document
 */
export async function GET(request: NextRequest) {
  try {
    const db = getDb();

    // Fetch the single config document (there should only be one)
    const configDoc = await db.collection('config').findOne({});

    // Extract analytics config from nested field
    const analyticsConfig = configDoc?.analytics || DEFAULT_ANALYTICS_CONFIG;

    // Return config or defaults if not found
    return NextResponse.json({
      success: true,
      config: analyticsConfig,
    });

  } catch (error) {
    console.error('[Analytics Config API] Error fetching config:', error);

    // Return defaults on error
    return NextResponse.json({
      success: false,
      config: DEFAULT_ANALYTICS_CONFIG,
      error: 'Failed to fetch analytics configuration',
    }, { status: 500 });
  }
}

/**
 * POST /api/analytics-config
 * Update analytics configuration
 * Requires admin privileges
 *
 * Updates the nested 'analytics' field in the single config document
 */
export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const currentUser = await authenticationBackend.getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { enabled, measurementId, debugMode, showConsentBanner, showSettingsPanel, allowUserOptOut, requireConsent } = body;

    // Validate input
    if (
      typeof enabled !== 'boolean' ||
      typeof debugMode !== 'boolean' ||
      typeof showConsentBanner !== 'boolean' ||
      typeof showSettingsPanel !== 'boolean' ||
      typeof allowUserOptOut !== 'boolean' ||
      typeof requireConsent !== 'boolean'
    ) {
      return NextResponse.json({
        success: false,
        error: 'Invalid configuration values',
      }, { status: 400 });
    }

    // Validate measurement ID format if provided
    if (measurementId !== undefined && measurementId !== null && measurementId !== '') {
      if (typeof measurementId !== 'string' || !/^G-[A-Z0-9]+$/.test(measurementId)) {
        return NextResponse.json({
          success: false,
          error: 'Invalid measurement ID format. Expected format: G-XXXXXXXXXX',
        }, { status: 400 });
      }
    }

    const db = getDb();

    const updatedConfig: AnalyticsConfig = {
      enabled,
      measurementId: measurementId || undefined,
      debugMode,
      showConsentBanner,
      showSettingsPanel,
      allowUserOptOut,
      requireConsent,
      updatedAt: new Date(),
      updatedBy: currentUser?.email,
    };

    // Fetch the existing config document
    const existingConfig = await db.collection('config').findOne({});

    if (!existingConfig) {
      return NextResponse.json({
        success: false,
        error: 'Config document not found',
      }, { status: 404 });
    }

    // Update the nested 'analytics' field in the existing config document
    await db.collection('config').updateOne(
      { _id: existingConfig._id },
      { $set: { analytics: updatedConfig } }
    );

    return NextResponse.json({
      success: true,
      config: updatedConfig,
      message: 'Analytics configuration updated successfully',
    });

  } catch (error) {
    console.error('[Analytics Config API] Error updating config:', error);

    return NextResponse.json({
      success: false,
      error: 'Failed to update analytics configuration',
    }, { status: 500 });
  }
}
