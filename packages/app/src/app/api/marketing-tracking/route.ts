import { NextRequest, NextResponse } from 'next/server';
import { getMarketingTrackingRecords } from '@/lib/marketing-tracking';
import { authenticateDashboardAccess, createDashboardAuthErrorResponse } from '@/lib/dashboard-auth';

export async function GET(req: NextRequest) {
  try {
    // Check dashboard access - only dashboard admins can view marketing tracking data
    const authResult = await authenticateDashboardAccess(req);

    if (!authResult.success) {
      return createDashboardAuthErrorResponse(authResult);
    }

    const currentUser = authResult.user;

    const { searchParams } = new URL(req.url);

    // Get database selection
    const database = searchParams.get('database') || 'prod';

    // Build filters from query parameters
    const filters: any = {};

    const utm_source = searchParams.get('utm_source');
    const utm_medium = searchParams.get('utm_medium');
    const utm_campaign = searchParams.get('utm_campaign');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (utm_source) {
      filters.utm_source = utm_source;
    }
    if (utm_medium) {
      filters.utm_medium = utm_medium;
    }
    if (utm_campaign) {
      filters.utm_campaign = utm_campaign;
    }
    if (startDate) {
      const date = new Date(startDate);
      if (isNaN(date.getTime())) {
        return NextResponse.json(
          { error: 'Invalid startDate format. Use ISO 8601 format (e.g., 2025-01-01)' },
          { status: 400 }
        );
      }
      filters.startDate = date;
    }
    if (endDate) {
      const date = new Date(endDate);
      if (isNaN(date.getTime())) {
        return NextResponse.json(
          { error: 'Invalid endDate format. Use ISO 8601 format (e.g., 2025-12-31)' },
          { status: 400 }
        );
      }
      filters.endDate = date;
    }

    // Get marketing tracking records
    const records = await getMarketingTrackingRecords(filters, database as 'prod' | 'test');

    return NextResponse.json({
      success: true,
      count: records.length,
      data: records
    });

  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch marketing tracking data' },
      { status: 500 }
    );
  }
}
