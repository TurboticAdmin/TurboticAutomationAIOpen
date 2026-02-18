import { NextRequest, NextResponse } from 'next/server';
import authBackend from '@/app/api/authentication/authentication-backend';
import { getActiveNotifications } from '@/lib/notifications';
// Subscription functions removed for open source
import { ObjectId } from 'mongodb';

export async function GET(request: NextRequest) {
  try {
    // Check if user is authenticated
    const user = await authBackend.getCurrentUser(request);
    
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Get workspace ID for workspace-specific notifications
    // Use consistent workspaceId with fallback for all operations
    const workspaceId: string | undefined = user.workspace ? String(user.workspace._id) : undefined;
    
    // Get regular active notifications (filtered by workspaceId if available)
    // @ts-ignore - TypeScript cache issue, function signature is correct
    const regularNotifications = await getActiveNotifications(workspaceId);
    
    // Check for limits that have been reached and exceeded (combines both checks)
    // Use the same workspaceId consistently to avoid mismatches between queries and notifications
    const workspaceIdForLimits = workspaceId;
    // Note: Don't return early if workspaceId is missing - we still need to check for subscription notifications

    // Subscription limit checks removed for open source
    let limitReachedCheck: any = { reachedLimits: [] };
    let limitExceededCheck: any = { allowed: true, breachedLimits: [] };

    let limitNotifications: any[] = [];
    // Show notifications when limits are reached (>= limit)
    if (limitReachedCheck.reachedLimits.length > 0) {
      // Check if user has dismissed any limit notifications recently
      const { getDb } = await import('@/lib/db');
      const db = getDb();

      // Get current limit types that are reached
      const currentLimitTypes = limitReachedCheck.reachedLimits.map((l: { type: 'execution' | 'automation' | 'chat' | 'subscription'; reason: string; upgradeAction?: any }) => l.type).sort();
      
      // Find all dismissed notifications in the last 24 hours
      const dismissedNotifications = await db.collection('execution_limit_notifications').find({
        workspaceId: workspaceIdForLimits,
        dismissed: true,
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Within last 24 hours
      }).toArray();

      // Collect all limit types from dismissed notifications
      const dismissedLimitTypesSet = new Set<string>();
      dismissedNotifications.forEach(notif => {
        const notifLimitTypes = notif.limitTypes || [];
        notifLimitTypes.forEach((type: string) => dismissedLimitTypesSet.add(type));
      });

      // Check if any current limit types are NEW (not in dismissed notifications)
      const hasNewLimitTypes = currentLimitTypes.some((type: 'execution' | 'automation' | 'chat' | 'subscription') => !dismissedLimitTypesSet.has(type));
      
      // Only suppress if ALL current limit types were already dismissed
      // If new limit types appeared, show a new notification
      const shouldSuppress = !hasNewLimitTypes && currentLimitTypes.length > 0 && currentLimitTypes.every((type: 'execution' | 'automation' | 'chat' | 'subscription') => dismissedLimitTypesSet.has(type));

      // Check if a combined notification already exists (and not dismissed)
      let notification = await db.collection('execution_limit_notifications').findOne({
        workspaceId: workspaceIdForLimits,
        limitType: 'combined',
        dismissed: false
      });

      // If notification exists but dismissed, or if we should suppress, skip
      // But if new limit types appeared, create/update notification
      if (!shouldSuppress) {

        // Always update the notification with current limit information
        const limitTypes = limitReachedCheck.reachedLimits.map((l: { type: 'execution' | 'automation' | 'chat' | 'subscription'; reason: string; upgradeAction?: any }) => l.type);
        const hasExecutionLimit = limitTypes.includes('execution');
        
        // Store limit types in the notification so we can check later if new types appear
        const limitTypesArray = [...limitTypes].sort();
        
        let title = "Subscription Limits Reached";
        let message = "";
        
        // Build combined message
        const limitMessages = limitReachedCheck.reachedLimits.map((limit: { type: 'execution' | 'automation' | 'chat' | 'subscription'; reason: string; upgradeAction?: any }) => {
          switch (limit.type) {
            case 'execution':
              return `• Execution Limit: ${limit.reason}`;
            case 'automation':
              return `• Automation Limit: ${limit.reason}`;
            case 'chat':
              return `• Chat Limit: ${limit.reason}`;
            case 'subscription':
              return `• Subscription Issue: ${limit.reason}`;
            default:
              return `• ${limit.reason}`;
          }
        });
        
        message = limitMessages.join('\n');
        
        // Add disable info if execution limit is exceeded (not just reached)
        if (hasExecutionLimit && limitExceededCheck.schedulesDisabled) {
          if ((limitExceededCheck.disabledSchedulesCount || 0) > 0) {
            message += `\n\n${limitExceededCheck.disabledSchedulesCount} scheduled automation${limitExceededCheck.disabledSchedulesCount !== 1 ? 's' : ''} automatically disabled to prevent scheduled runs.`;
          } else {
            // No automations found with triggerEnabled: true
            message += `\n\nScheduled Automations automatically disabled to prevent further executions.`;
          }
        }
        
        // Use the first upgrade action (they should all be similar)
        const firstUpgradeAction = limitReachedCheck.reachedLimits[0]?.upgradeAction;
        
        if (!notification) {
          // Create new notification
          const notificationData = {
            workspaceId: workspaceId,
            userId: String(user._id),
            userEmail: user.email,
            title: title,
            message: message,
            limitType: 'combined',
            limitTypes: limitTypesArray, // Store which limit types are in this notification
            schedulesDisabled: limitExceededCheck.schedulesDisabled || false,
            disabledSchedulesCount: limitExceededCheck.disabledSchedulesCount || 0,
            upgradeAction: firstUpgradeAction,
            dismissed: false,
            createdAt: new Date(),
            updatedAt: new Date()
          };

          const result = await db.collection('execution_limit_notifications').insertOne(notificationData);
          notification = { ...notificationData, _id: result.insertedId };
        } else {
          // Update existing notification
          await db.collection('execution_limit_notifications').updateOne(
            { _id: notification._id },
            {
            $set: {
              title: title,
              message: message,
              limitTypes: limitTypesArray, // Update limit types array
              schedulesDisabled: limitExceededCheck.schedulesDisabled || false,
              disabledSchedulesCount: limitExceededCheck.disabledSchedulesCount || 0,
              upgradeAction: firstUpgradeAction,
              updatedAt: new Date()
            }
          }
        );
        notification = { ...notification, title, message, schedulesDisabled: limitExceededCheck.schedulesDisabled, disabledSchedulesCount: limitExceededCheck.disabledSchedulesCount };
        }


        limitNotifications.push({
          id: `limit-combined-${String(notification._id)}`,
          title: notification.title,
          message: notification.message,
          type: 'warning' as const,
          isActive: true,
          createdAt: notification.createdAt.toISOString(),
          links: notification.upgradeAction ? [{
            label: notification.upgradeAction.buttonText,
            url: notification.upgradeAction.buttonUrl,
            color: 'orange'
          }] : []
        });
      }
    }

    // Always check for undismissed schedule_disabled notifications in the database
    // The notification should persist until user dismisses it or re-enables automations
    // This ensures it doesn't disappear when limits are no longer actively exceeded
    if (limitNotifications.length === 0) {
      const { getDb } = await import('@/lib/db');
      const db = getDb();

      // Fetch any undismissed schedule_disabled notification for this workspace
      const scheduleNotification = await db.collection('execution_limit_notifications').findOne({
        workspaceId: workspaceId,
        limitType: 'schedule_disabled',
        dismissed: false
      });

      if (scheduleNotification) {
        // Format disabledAutomations for frontend consumption
        const disabledAutomations = (scheduleNotification.disabledAutomations || []).map((auto: any) => ({
          id: auto.id,
          name: auto.name,
          disabledAt: auto.disabledAt instanceof Date ? auto.disabledAt.toISOString() :
                      (auto.disabledAt?.$date ? new Date(auto.disabledAt.$date).toISOString() : new Date().toISOString())
        }));

        limitNotifications.push({
          id: `limit-schedule_disabled-${String(scheduleNotification._id)}`,
          title: scheduleNotification.title,
          message: scheduleNotification.message,
          type: 'warning' as const,
          isActive: true,
          createdAt: scheduleNotification.createdAt.toISOString(),
          disabledAutomations: disabledAutomations, // List of disabled automations with formatted dates
          requiresRefresh: true, // Signal frontend to refresh schedule/automation pages
          links: scheduleNotification.upgradeAction ? [{
            label: scheduleNotification.upgradeAction.buttonText,
            url: scheduleNotification.upgradeAction.buttonUrl,
            color: 'orange'
          }] : []
        });
      }
    }

    // Check for subscription cancellation/downgrade notifications and payment failures
    let subscriptionNotifications: any[] = [];
    try {
      // Subscription lookup removed for open source - get from database directly
      const { getDb } = await import('@/lib/db');
      const db = getDb();
      const subscription = await db.collection('subscriptions').findOne({ userId: new ObjectId(user._id) });
      
      if (!subscription) {
        // No subscription found, skip subscription notifications
        return NextResponse.json({
          notifications: [...regularNotifications, ...limitNotifications],
          lastUpdated: new Date().toISOString()
        });
      }

      // Check for payment failure notifications
      if (subscription.status === 'past_due' || subscription.status === 'incomplete' || subscription.status === 'incomplete_expired' || subscription.status === 'unpaid') {
        // workspaceId should always exist - notifications are created with workspaceId
        if (!workspaceId) {
          console.error(`[Notifications API] Cannot find payment failure notification - workspaceId not found for user ${user._id}`);
        } else {
          const paymentFailureNotification = await db.collection('execution_limit_notifications').findOne({
            workspaceId: workspaceId,
            limitType: 'payment_failed',
            dismissed: false
          });

          if (paymentFailureNotification) {
            subscriptionNotifications.push({
              id: `payment-failed-${String(paymentFailureNotification._id)}`,
              title: paymentFailureNotification.title,
              message: paymentFailureNotification.message,
              type: 'error' as const,
              isActive: true,
              createdAt: paymentFailureNotification.createdAt.toISOString(),
              links: [{
                label: 'Update Payment Method',
                url: '/?settingsModal=subscription&tab=billing',
                color: 'orange'
              }]
            });
          } else {
            console.log(`[Notifications API] No payment failure notification found for user ${user._id}, workspaceId: ${workspaceId}, status: ${subscription.status}`);
          }
        }
      }

      // Check if subscription is cancelled or has scheduled downgrade
      if (subscription.cancelAtPeriodEnd || subscription.scheduledTier) {
        // workspaceId should always exist
        if (!workspaceId) {
          console.error(`[Notifications API] Cannot create subscription cancellation notification - workspaceId not found for user ${user._id}`);
        } else {
          // Check if user has dismissed this notification recently (within 7 days)
          // Use workspace-specific notification ID to check dismissal
          const workspaceNotificationId = `subscription-cancellation-notification-${workspaceId}`;
          const dismissedNotification = await db.collection('notification_dismissals').findOne({
            notificationId: workspaceNotificationId,
            userId: String(user._id),
            dismissedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Within last 7 days
          });

          // Check if there's already a subscription cancellation notification in regular notifications
          const existingSubscriptionNotification = regularNotifications.find(n =>
            n.id === workspaceNotificationId ||
            n.id?.includes(`subscription-cancellation-notification-${workspaceId}`)
          );

          // Also check if payment failure notification already exists (don't show both)
          const hasPaymentFailureNotification = subscriptionNotifications.some(n => n.id?.includes('payment-failed'));


          if (!dismissedNotification && !existingSubscriptionNotification && !hasPaymentFailureNotification) {
            let title = "";
            let message = "";
            let effectiveDate = "";

            if (subscription.cancelAtPeriodEnd) {
              // Subscription is cancelled at period end
              title = "Subscription Cancellation Scheduled";
              effectiveDate = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : "end of billing period";
              
              // Default FREE plan limits (pricing config removed for open source)
              const executions = 20; // Default FREE plan executions
              const chats = 10; // Default FREE plan chats
              
              const currentTierName = subscription.tier === 'CUSTOM' ? 'Custom' : subscription.tier;
              message = `Your subscription will be cancelled on ${effectiveDate}. After that date you'll be downgraded to the Free plan and you will lose access to your ${currentTierName} benefits. You'll have ${executions.toLocaleString()} executions and ${chats.toLocaleString()} chats per month with the Free plan.`;
            } else if (subscription.scheduledTier) {
              // Subscription has scheduled downgrade
              title = "Plan Downgrade Scheduled";
              effectiveDate = subscription.currentPeriodEnd ? new Date(subscription.currentPeriodEnd).toLocaleDateString() : "end of billing period";
              
              // Plan details removed for open source (using defaults)
              const executions = 0;
              const chats = 0;
              
              message = `Your plan will be downgraded to ${subscription.scheduledTier} on ${effectiveDate}. You'll have ${executions.toLocaleString()} executions and ${chats.toLocaleString()} chats per month.`;
            }

            // Create subscription cancellation notification (workspace-specific, not stored in global notifications)
            subscriptionNotifications.push({
              id: `subscription-cancellation-notification-${workspaceId}`,
              title: title,
              message: message,
              type: 'warning' as const,
              isActive: true,
              createdAt: new Date().toISOString(),
              workspaceId: workspaceId, // Link to workspace
              links: [] // No links - the Cancel Downgrade button is handled by the component
            });
          }
        }
      }
    } catch (error) {
      console.error('Error checking subscription cancellation status:', error);
      // Don't fail the entire request if subscription check fails
    }

    // Combine notifications (limit notifications first, then subscription notifications, then regular notifications)
    const allNotifications = [
      ...limitNotifications,
      ...subscriptionNotifications,
      ...regularNotifications
    ];

    return NextResponse.json({ notifications: allNotifications });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
