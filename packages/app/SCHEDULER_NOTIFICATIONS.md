# Scheduler Notifications System

This document describes the automated email notification system for scheduled automations.

## Overview

The scheduler notifications system automatically sends email notifications to users when their scheduled automations are triggered, completed, or fail. This keeps users informed about the status of their automations without requiring them to manually check the application.

## Components

### 1. Scheduler Notification Service (`/src/lib/scheduler-notifications.ts`)

The main service class that handles:
- Sending different types of notifications (started, completed, failed)
- Beautiful HTML email templates with status-specific styling
- Integration with log explanation AI for user-friendly summaries
- Database tracking of sent notifications

### 2. Execution Tracker (`/src/lib/execution-tracker.ts`)

Helper functions to track automation executions:
- Tracks when scheduled executions start
- Monitors execution completion and failure
- Triggers appropriate notifications based on execution status
- Cleans up stale execution data

### 3. API Endpoints

#### `/api/scheduler-notifications` (POST)
Internal endpoint called by the system to send notifications:
```json
{
  "automationId": "string",
  "executionId": "string", 
  "status": "started|completed|failed",
  "logs": ["array of log lines"],
  "errorCode": "number",
  "duration": "number in ms",
  "triggerTime": "ISO date string"
}
```

#### `/api/test-scheduler-notification` (POST)
Test endpoint to verify notifications work:
```json
{
  "email": "test@example.com",
  "automationTitle": "Test Automation",
  "status": "completed"
}
```

## Integration Points

### 1. Scheduler Queue (`packages/worker-node/src/queues/scheduler-queue.ts`)
- Modified to pass `isScheduled: true` flag when triggering executions
- Identifies scheduled vs manual runs

### 2. Execution API (`/api/run/executions/route.ts`)
- Accepts `isScheduled` parameter
- Starts execution tracking for scheduled runs
- Sends "started" notifications immediately

### 3. Latest Logs API (`/api/run/latest-logs/route.ts`)
- Detects when executions finish
- Completes execution tracking
- Triggers "completed" or "failed" notifications

## Email Templates

The system includes three beautiful HTML email templates:

### Started Notification (🚀)
- Blue gradient header
- Confirms automation has been triggered
- Includes trigger time and execution ID
- Link to view automation

### Completed Notification (✅) 
- Green gradient header
- Shows execution summary and duration
- AI-generated explanation of what happened
- Recent log output (last 10 lines)
- Link to view results

### Failed Notification (❌)
- Red gradient header  
- Shows error details and exit code
- AI-generated issue summary and recommended actions
- Error logs for debugging
- Link to debug and fix

## Configuration

Required environment variables:
- `SENDGRID_API_KEY`: SendGrid API key for sending emails
- `SENDGRID_FROM_EMAIL`: From email address
- `APP_URL`: Base URL for links in emails

## Data Flow

1. **Scheduler triggers automation** → Sets `isScheduled: true`
2. **Execution starts** → `startExecutionTracking()` called → "Started" notification sent
3. **Execution completes** → `completeExecutionTracking()` called → "Completed/Failed" notification sent
4. **User receives emails** with status, logs, and AI-generated explanations

## Database Collections

### `schedulerNotifications`
Tracks all sent notifications:
```json
{
  "automationId": "string",
  "executionId": "string", 
  "status": "started|completed|failed",
  "userEmail": "string",
  "sentAt": "Date",
  "emailSent": "boolean",
  "emailSentAt": "Date"
}
```

## Testing

1. **Use test endpoint:**
```bash
curl -X POST http://localhost:3000/api/test-scheduler-notification \
  -H "Content-Type: application/json" \
  -d '{"email":"your@email.com","automationTitle":"Test Automation","status":"completed"}'
```

2. **Schedule a real automation:**
   - Create an automation with a cron schedule
   - Wait for it to trigger
   - Check your email for notifications

3. **Check notification history:**
```bash
curl "http://localhost:3000/api/scheduler-notifications?automationId=YOUR_ID"
```

## Features

- ✅ Beautiful HTML email templates with status-specific colors
- ✅ AI-generated log explanations for non-technical users
- ✅ Automatic detection of scheduled vs manual runs
- ✅ Comprehensive logging and error handling
- ✅ Database tracking of all notifications
- ✅ Configurable email settings via environment variables
- ✅ Test endpoint for verification
- ✅ Clean separation of concerns with minimal changes to existing code

## Future Enhancements

- [ ] Email preferences per user (opt-in/out)
- [ ] Slack/Teams integration
- [ ] SMS notifications for critical failures
- [ ] Email digest for multiple automation results
- [ ] Custom email templates per automation