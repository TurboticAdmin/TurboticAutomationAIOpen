import { NextRequest, NextResponse } from 'next/server';
import authBackend from '@/app/api/authentication/authentication-backend';
import { trackDismissal } from '@/lib/notifications';

export async function POST(request: NextRequest) {
  try {
    // Check if user is authenticated
    const user = await authBackend.getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { notificationId } = body;

    if (!notificationId) {
      return NextResponse.json({ error: 'Notification ID is required' }, { status: 400 });
    }

    // Get workspace ID for workspace-specific dismissals
    const workspaceId = user.workspace ? String(user.workspace._id) : undefined;

    // Check if this is a subscription cancellation notification
    if (notificationId.startsWith('subscription-cancellation-notification-')) {
      // Use the existing notification dismissal system with workspaceId
      await trackDismissal(notificationId, String(user._id), workspaceId);
    }
    // Check if this is a limit notification (any type)
    else if (notificationId.startsWith('limit-')) {
      const { getDb } = await import('@/lib/db');
      const db = getDb();

      // Extract the actual notification ID from the prefixed ID
      // Format: limit-{type}-{actualId} or limit-combined-{actualId}
      const parts = notificationId.split('-');
      let actualNotificationId;

      if (parts[1] === 'combined') {
        // Format: limit-combined-{actualId}
        actualNotificationId = parts.slice(2).join('-'); // Handle ObjectIds with dashes
      } else {
        // Format: limit-{type}-{actualId}
        actualNotificationId = parts.slice(2).join('-'); // Handle ObjectIds with dashes
      }

      // Mark limit notification as dismissed (workspace-specific)
      await db.collection('execution_limit_notifications').updateOne(
        {
          _id: new (await import('mongodb')).ObjectId(actualNotificationId),
          workspaceId: workspaceId
        },
        {
          $set: {
            dismissed: true,
            dismissedAt: new Date(),
            updatedAt: new Date()
          }
        }
      );
    } else {
      // Track dismissal in regular notification system with workspaceId
      await trackDismissal(notificationId, String(user._id), workspaceId);
    }

    return NextResponse.json({ 
      message: 'Notification dismissed successfully',
      notificationId 
    });
  } catch (error) {
    console.error('Error dismissing notification:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
