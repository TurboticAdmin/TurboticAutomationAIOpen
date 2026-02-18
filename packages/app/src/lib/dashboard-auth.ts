import { NextRequest, NextResponse } from 'next/server';
import { getDbSync } from '@/lib/db';
import authenticationBackend from '../app/api/authentication/authentication-backend';

export interface DashboardAuthResult {
  success: boolean;
  user?: any;
  error?: string;
  status?: number;
}

/**
 * Generic dashboard authentication function that checks:
 * 1. Standard user authentication
 * 2. Dashboard access allowlist (dashboard_access collection)
 */
export async function authenticateDashboardAccess(request: NextRequest): Promise<DashboardAuthResult> {
  try {
    // Step 1: Check standard user authentication
    const currentUser = await authenticationBackend.getCurrentUser(request);

    if (!currentUser) {
      return {
        success: false,
        error: 'Authentication required',
        status: 401
      };
    }

    const normalizedEmail = currentUser.email.toLowerCase().trim();

    // Step 2: Check dashboard access allowlist
    const db = getDbSync();
    const accessRecord = await db.collection('dashboard_access').findOne({
      email: normalizedEmail
    });

    if (!accessRecord) {
      return {
        success: false,
        error: 'Dashboard access denied',
        status: 403
      };
    }

    return {
      success: true,
      user: currentUser
    };
  } catch (error) {
    console.error('Dashboard authentication error:', error);
    return {
      success: false,
      error: 'Authentication failed',
      status: 500
    };
  }
}

/**
 * Helper function to create error response for dashboard auth failures
 */
export function createDashboardAuthErrorResponse(authResult: DashboardAuthResult): NextResponse {
  return NextResponse.json(
    { error: authResult.error },
    { status: authResult.status || 401 }
  );
}
