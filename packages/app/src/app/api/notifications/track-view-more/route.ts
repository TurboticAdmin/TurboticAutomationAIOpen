import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import authenticationBackend from '@/app/api/authentication/authentication-backend';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { notificationId, source } = body;

    if (!notificationId) {
      return NextResponse.json({ error: 'Notification ID is required' }, { status: 400 });
    }

    // Get current user (can be null for non-authenticated users on homepage)
    let currentUser = null;
    try {
      currentUser = await authenticationBackend.getCurrentUser(request);
    } catch (error) {
      // User not authenticated - that's okay for homepage notifications
    }

    const db = getDb();
    const clicksCollection = db.collection('notification_view_more_clicks');

    const ipAddress = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Create unique identifier based on user/location
    // For authenticated users: use userId + notificationId + source
    // For anonymous users: use ipAddress + notificationId + source
    const uniqueKey = currentUser?._id
      ? `${currentUser._id}_${notificationId}_${source}`
      : `${ipAddress}_${notificationId}_${source}`;

    // Upsert: update if exists, insert if not
    const result = await clicksCollection.updateOne(
      { uniqueKey },
      {
        $set: {
          notificationId,
          userId: currentUser?._id || null,
          userEmail: currentUser?.email || null,
          userName: currentUser?.name || null,
          source: source || 'unknown',
          lastClickAt: new Date(),
          ipAddress,
          userAgent
        },
        $inc: { clickCount: 1 },
        $setOnInsert: {
          uniqueKey,
          firstClickAt: new Date()
        }
      },
      { upsert: true }
    );

    // Optionally update notification with click count
    const notificationsCollection = db.collection('notifications');
    await notificationsCollection.updateOne(
      { id: notificationId },
      {
        $inc: { viewMoreClicks: 1 },
        $set: { lastViewMoreClickAt: new Date() }
      }
    );

    return NextResponse.json({
      success: true,
      message: 'Click tracked successfully'
    });
  } catch (error) {
    console.error('Error tracking notification click:', error);
    return NextResponse.json({
      error: 'Internal server error',
      success: false
    }, { status: 500 });
  }
}
