import { NextRequest, NextResponse } from 'next/server';
import { getHomepageNotifications } from '@/lib/notifications';

export async function GET(req: NextRequest) {
  try {
    const notifications = await getHomepageNotifications();

    return NextResponse.json({
      success: true,
      notifications
    });
  } catch (error) {
    console.error('Error fetching homepage notifications:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch homepage notifications',
        notifications: []
      },
      { status: 500 }
    );
  }
}
