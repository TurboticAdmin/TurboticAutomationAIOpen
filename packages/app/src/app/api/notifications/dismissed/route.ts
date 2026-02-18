import { NextRequest, NextResponse } from 'next/server';
import authBackend from '@/app/api/authentication/authentication-backend';
import { getDismissedNotifications } from '@/lib/notifications';

export async function GET(request: NextRequest) {
  try {
    // Check if user is authenticated
    const user = await authBackend.getCurrentUser(request);
    
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Get dismissed notifications for this user
    const dismissedNotificationIds = await getDismissedNotifications(String(user._id));

    return NextResponse.json({ 
      dismissedNotificationIds 
    });
  } catch (error) {
    console.error('Error fetching dismissed notifications:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
