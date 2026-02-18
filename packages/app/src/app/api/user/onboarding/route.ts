import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import authenticationBackend from '../../authentication/authentication-backend';

interface OnboardingState {
  hasCompletedTour: boolean;
  tourStarted: boolean;
  tourStep: number;
  lastUpdated: Date;
}

/**
 * GET /api/user/onboarding
 * Get user's onboarding tour state
 */
export async function GET(request: NextRequest) {
  try {
    const currentUser = await authenticationBackend.getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const db = getDb();
    const user = await db.collection('users').findOne({ 
      email: currentUser.email 
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Return onboarding state with defaults
    const onboardingState: OnboardingState = user.onboardingState || {
      hasCompletedTour: false,
      tourStarted: false,
      tourStep: 0,
      lastUpdated: new Date()
    };

    return NextResponse.json({
      success: true,
      onboardingState
    });
  } catch (error: any) {
    console.error('Error fetching onboarding state:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch onboarding state' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/user/onboarding
 * Update user's onboarding tour state
 */
export async function PUT(request: NextRequest) {
  try {
    const currentUser = await authenticationBackend.getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { hasCompletedTour, tourStarted, tourStep } = body;

    // Validate input
    if (typeof hasCompletedTour !== 'boolean' && hasCompletedTour !== undefined) {
      return NextResponse.json(
        { error: 'hasCompletedTour must be a boolean' },
        { status: 400 }
      );
    }

    if (typeof tourStarted !== 'boolean' && tourStarted !== undefined) {
      return NextResponse.json(
        { error: 'tourStarted must be a boolean' },
        { status: 400 }
      );
    }

    if (typeof tourStep !== 'number' && tourStep !== undefined) {
      return NextResponse.json(
        { error: 'tourStep must be a number' },
        { status: 400 }
      );
    }

    const db = getDb();
    
    // Get current user data
    const user = await db.collection('users').findOne({ 
      email: currentUser.email 
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    // Get current onboarding state or create default
    const currentOnboardingState: OnboardingState = user.onboardingState || {
      hasCompletedTour: false,
      tourStarted: false,
      tourStep: 0,
      lastUpdated: new Date()
    };

    // Update only provided fields
    const updatedOnboardingState: OnboardingState = {
      ...currentOnboardingState,
      ...(hasCompletedTour !== undefined && { hasCompletedTour }),
      ...(tourStarted !== undefined && { tourStarted }),
      ...(tourStep !== undefined && { tourStep }),
      lastUpdated: new Date()
    };

    // Update user document
    const result = await db.collection('users').updateOne(
      { email: currentUser.email },
      { 
        $set: { 
          onboardingState: updatedOnboardingState,
          updatedAt: new Date()
        } 
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      onboardingState: updatedOnboardingState
    });
  } catch (error: any) {
    console.error('Error updating onboarding state:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update onboarding state' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/user/onboarding
 * Reset user's onboarding tour state
 */
export async function DELETE(request: NextRequest) {
  try {
    const currentUser = await authenticationBackend.getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const db = getDb();
    
    // Reset onboarding state to defaults
    const resetOnboardingState: OnboardingState = {
      hasCompletedTour: false,
      tourStarted: false,
      tourStep: 0,
      lastUpdated: new Date()
    };

    const result = await db.collection('users').updateOne(
      { email: currentUser.email },
      { 
        $set: { 
          onboardingState: resetOnboardingState,
          updatedAt: new Date()
        } 
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Onboarding state reset successfully',
      onboardingState: resetOnboardingState
    });
  } catch (error: any) {
    console.error('Error resetting onboarding state:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to reset onboarding state' },
      { status: 500 }
    );
  }
}
