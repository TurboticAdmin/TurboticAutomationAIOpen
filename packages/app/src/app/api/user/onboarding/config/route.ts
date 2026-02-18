import { NextRequest, NextResponse } from 'next/server';
import { isOnboardingTourEnabled } from '@/lib/config';
import authenticationBackend from '../../../authentication/authentication-backend';

/**
 * GET /api/user/onboarding/config
 * Get onboarding tour configuration (enabled/disabled)
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate the requesting user
    const currentUser = await authenticationBackend.getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const tourEnabled = await isOnboardingTourEnabled();

    return NextResponse.json({
      success: true,
      tourEnabled
    });
  } catch (error: any) {
    console.error('Error fetching onboarding config:', error);
    return NextResponse.json(
      {
        success: true,
        tourEnabled: false // Default to false on error
      }
    );
  }
}
