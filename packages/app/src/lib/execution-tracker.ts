// Helper functions to send scheduler notifications for completed executions

import schedulerNotificationService, { SchedulerNotificationData } from './scheduler-notifications';
import { getDb } from './db';
import { ObjectId } from 'mongodb';

// Simple function to send completion notification for scheduled executions
export async function sendScheduledExecutionNotification(
  automationId: string, 
  executionId: string, 
  status: 'completed' | 'failed' | 'errored',
  logs: string[] = [],
  errorCode?: number
) {
  console.log(`[Scheduler Notification] Sending ${status} notification for scheduled execution ${executionId}`);
  
  try {
    await sendSchedulerNotification(
      automationId,
      executionId,
      status,
      logs,
      errorCode,
      undefined, // duration - not needed
      new Date() // triggerTime - use current time
    );
    console.log(`[Scheduler Notification] Successfully sent ${status} notification for execution ${executionId}`);
  } catch (error) {
    console.error(`[Scheduler Notification] Error sending ${status} notification:`, error);
  }
}

async function sendSchedulerNotification(
  automationId: string,
  executionId: string,
  status: 'completed' | 'failed' | 'errored',
  logs: string[] = [],
  errorCode?: number,
  duration?: number,
  triggerTime?: Date
) {
  try {
    console.log(`Sending ${status} notification for execution ${executionId}`);

    const db = getDb();
    
    // Get automation and user information
    const automation = await db.collection('automations').findOne({
      _id: new ObjectId(automationId)
    });

    if (!automation) {
      console.error(`Automation ${automationId} not found for notification`);
      return;
    }

    // Get user email from workspace
    const workspace = await db.collection('workspaces').findOne({
      _id: new ObjectId(automation.workspaceId)
    });

    if (!workspace) {
      console.error(`Workspace not found for automation ${automationId}`);
      return;
    }

    // Get user email from the user collection using ownerUserId
    const user = await db.collection('users').findOne({
      _id: new ObjectId(workspace.ownerUserId)
    });

    if (!user || !user.email) {
      console.error(`User email not found for automation ${automationId}, workspace ownerUserId: ${workspace.ownerUserId}`);
      return;
    }

    // Get schedule to fetch timezone
    const schedule = await db.collection('schedules-v2').findOne({
      automationId: automationId
    });

    // Prepare notification data
    const notificationData: SchedulerNotificationData = {
      automationId,
      automationTitle: automation.title || automation.description || 'Untitled Automation',
      executionId,
      userId: automation.workspaceId,
      userEmail: user.email,
      triggerTime: triggerTime || new Date(),
      timezone: schedule?.timezone || 'UTC', // Use schedule's timezone
      status,
      logs: logs.slice(-20) || [],
      errorCode: errorCode || undefined,
      duration: duration || undefined
    };

    // Send notification directly using the service
    const emailSent = await schedulerNotificationService.notifySchedulerTrigger(notificationData);

    if (emailSent) {
      console.log(`Scheduler ${status} notification sent successfully to ${user.email}`);
    } else {
      console.error(`Failed to send scheduler ${status} notification`);
    }

  } catch (error) {
    console.error('Error sending scheduler notification:', error);
  }
}

// Removed all tracking functions - we only send notifications on completion