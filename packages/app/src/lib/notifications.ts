import { getDb } from './db';
import { ObjectId } from 'mongodb';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  isActive: boolean;
  createdAt: string;
  links: Array<{
    label: string;
    url: string;
    color: string;
  }>;
  showMore?: string;
  showOnHomepage?: boolean;
}

// Default welcome notification removed for open source
async function initializeDefaultNotification() {
  // No default notifications for open source
}

export async function getNotifications(): Promise<Notification[]> {
  try {
    const db = getDb();
    await initializeDefaultNotification();
    
    // Clean up orphaned dismissals before returning notifications
    await cleanupOrphanedDismissals();
    
    const notifications = await db.collection('notifications').find({}).toArray();
    return notifications.map(n => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      isActive: n.isActive,
      createdAt: n.createdAt,
      links: n.links || [],
      showMore: n.showMore || undefined,
      showOnHomepage: n.showOnHomepage || false
    }));
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return [];
  }
}

export async function getActiveNotifications(workspaceId?: string): Promise<Notification[]> {
  try {
    const db = getDb();
    await initializeDefaultNotification();

    // Clean up orphaned dismissals before returning notifications
    await cleanupOrphanedDismissals();

    // Build query: active notifications that are either global (no workspaceId) or match the current workspace
    const query: { isActive: boolean; $or?: Array<Record<string, any>> } = { isActive: true };
    if (workspaceId) {
      query.$or = [
        { workspaceId: { $exists: false } }, // Global notifications (no workspaceId)
        { workspaceId: null }, // Global notifications (workspaceId is null)
        { workspaceId: workspaceId } // Notifications for this specific workspace
      ];
    }

    const notifications = await db.collection('notifications').find(query).toArray();
    return notifications.map(n => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      isActive: n.isActive,
      createdAt: n.createdAt,
      links: n.links || [],
      showMore: n.showMore || undefined,
      showOnHomepage: n.showOnHomepage || false
    }));
  } catch (error) {
    console.error('Error fetching active notifications:', error);
    return [];
  }
}

export async function getHomepageNotifications(): Promise<Notification[]> {
  try {
    const db = getDb();
    await initializeDefaultNotification();

    // Get active notifications that should be shown on homepage
    const notifications = await db.collection('notifications').find({
      isActive: true,
      showOnHomepage: true
    }).toArray();

    return notifications.map(n => ({
      id: n.id,
      title: n.title,
      message: n.message,
      type: n.type,
      isActive: n.isActive,
      createdAt: n.createdAt,
      links: n.links || [],
      showMore: n.showMore || undefined,
      showOnHomepage: n.showOnHomepage || false
    }));
  } catch (error) {
    console.error('Error fetching homepage notifications:', error);
    return [];
  }
}

export async function addNotification(newNotification: Omit<Notification, 'id'>): Promise<void> {
  try {
    const db = getDb();
    const notification = {
      ...newNotification,
      id: new ObjectId().toString()
    };
    await db.collection('notifications').insertOne(notification);
  } catch (error) {
    throw error;
  }
}

export async function updateNotification(id: string, updates: Partial<Notification>): Promise<void> {
  try {
    const db = getDb();
    await db.collection('notifications').updateOne(
      { id },
      { $set: updates }
    );
  } catch (error) {
    throw error;
  }
}

export async function deleteNotification(id: string): Promise<void> {
  try {
    const db = getDb();
    
    // Delete the notification
    await db.collection('notifications').deleteOne({ id });
    
    // Also delete all dismissals for this notification
    await db.collection('notification_dismissals').deleteMany({ notificationId: id });
    
  } catch (error) {
    throw error;
  }
}

// Dismissal tracking functions
export async function trackDismissal(notificationId: string, userId: string, workspaceId?: string): Promise<void> {
  try {
    const db = getDb();

    // Ensure compound index exists for efficient lookups (including workspaceId)
    await db.collection('notification_dismissals').createIndex(
      { notificationId: 1, userId: 1, workspaceId: 1 },
      { unique: true }
    );

    // Use upsert to prevent duplicate dismissals
    await db.collection('notification_dismissals').updateOne(
      { notificationId, userId, workspaceId: workspaceId || null },
      {
        $set: {
          notificationId,
          userId,
          workspaceId: workspaceId || null,
          dismissedAt: new Date().toISOString()
        }
      },
      { upsert: true }
    );
  } catch (error) {
    throw error;
  }
}

export async function resetDismissals(notificationId?: string): Promise<void> {
  try {
    const db = getDb();
    if (notificationId) {
      // Reset dismissals for specific notification
      await db.collection('notification_dismissals').deleteMany({ notificationId });
    } else {
      // Reset all dismissals
      await db.collection('notification_dismissals').deleteMany({});
    }
  } catch (error) {
    throw error;
  }
}

export async function getDismissedNotifications(userId: string): Promise<string[]> {
  try {
    const db = getDb();
    const dismissals = await db.collection('notification_dismissals').find({ userId }).toArray();
    return dismissals.map(d => d.notificationId);
  } catch (error) {
    console.error('Error getting dismissed notifications:', error);
    return [];
  }
}

// Check if a specific dismissal already exists
export async function isDismissed(notificationId: string, userId: string): Promise<boolean> {
  try {
    const db = getDb();
    const dismissal = await db.collection('notification_dismissals').findOne({ notificationId, userId });
    return !!dismissal;
  } catch (error) {
    console.error('Error checking dismissal status:', error);
    return false;
  }
}

// Cleanup function to remove orphaned dismissals
export async function cleanupOrphanedDismissals(): Promise<void> {
  try {
    const db = getDb();
    
    // Ensure index exists for better performance
    await db.collection('notification_dismissals').createIndex({ notificationId: 1 });
    
    // Get all notification IDs that exist
    const existingNotifications = await db.collection('notifications').find({}, { projection: { id: 1 } }).toArray();
    const existingNotificationIds = existingNotifications.map(n => n.id);
    
    // Delete dismissals for notifications that no longer exist
    const result = await db.collection('notification_dismissals').deleteMany({
      notificationId: { $nin: existingNotificationIds }
    });
    
  } catch (error) {
    throw error;
  }
}
