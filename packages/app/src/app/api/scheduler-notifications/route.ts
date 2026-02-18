import { NextRequest, NextResponse } from 'next/server';
import schedulerNotificationService, { SchedulerNotificationData } from '@/lib/scheduler-notifications';
import { getDb } from '@/lib/db';
import { ObjectId } from 'mongodb';

// This endpoint is called by the scheduler queue to send notifications
export async function POST(request: NextRequest) {
  try {
    const {
      automationId,
      executionId,
      status,
      logs,
      errorCode,
      duration,
      triggerTime
    } = await request.json();

    if (!automationId || !executionId || !status) {
      return NextResponse.json({
        success: false,
        message: 'Missing required fields: automationId, executionId, status'
      }, { status: 400 });
    }

    const db = getDb();
    
    // Get automation and user information
    const automation = await db.collection('automations').findOne({
      _id: ObjectId.createFromHexString(automationId)
    });

    if (!automation) {
      return NextResponse.json({
        success: false,
        message: 'Automation not found'
      }, { status: 404 });
    }

    // Get user email from workspace
    const workspace = await db.collection('workspaces').findOne({
      _id: ObjectId.createFromHexString(automation.workspaceId)
    });

    if (!workspace) {
      return NextResponse.json({
        success: false,
        message: 'Workspace not found'
      }, { status: 404 });
    }

    // Get user email from the user collection using ownerUserId
    const user = await db.collection('users').findOne({
      _id: ObjectId.createFromHexString(workspace.ownerUserId)
    });

    if (!user || !user.email) {
      return NextResponse.json({
        success: false,
        message: 'User email not found'
      }, { status: 404 });
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
      triggerTime: triggerTime ? new Date(triggerTime) : new Date(),
      timezone: schedule?.timezone || 'UTC', // Use schedule's timezone
      status,
      logs: logs || [],
      errorCode: errorCode || undefined,
      duration: duration || undefined
    };

    // Send notification
    const emailSent = await schedulerNotificationService.notifySchedulerTrigger(notificationData);

    if (emailSent) {
      console.log(`Scheduler notification sent for ${status} status to ${user.email}`);
      return NextResponse.json({
        success: true,
        message: `${status} notification sent successfully`
      });
    } else {
      console.error(`Failed to send scheduler notification for ${status} status`);
      return NextResponse.json({
        success: false,
        message: `Failed to send ${status} notification`
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error processing scheduler notification:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to process scheduler notification'
    }, { status: 500 });
  }
}

// Get notification history for debugging
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const automationId = searchParams.get('automationId');
    const limit = parseInt(searchParams.get('limit') || '50');

    const db = getDb();
    
    let query = {};
    if (automationId) {
      query = { automationId };
    }

    const notifications = await db.collection('schedulerNotifications')
      .find(query)
      .sort({ sentAt: -1 })
      .limit(limit)
      .toArray();

    return NextResponse.json({
      success: true,
      data: notifications
    });

  } catch (error) {
    console.error('Error fetching scheduler notifications:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch notifications'
    }, { status: 500 });
  }
}