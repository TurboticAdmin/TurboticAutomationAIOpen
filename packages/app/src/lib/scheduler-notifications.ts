import sgMail from '@sendgrid/mail';
import { getDb } from './db';
import { ObjectId } from 'mongodb';
import { explainLogs } from './game';

export interface SchedulerNotificationData {
  automationId: string;
  automationTitle: string;
  executionId: string;
  userId: string;
  userEmail: string;
  triggerTime: Date;
  timezone?: string; // IANA timezone from schedule (e.g., "America/New_York")
  status: 'completed' | 'failed' | 'errored';
  logs?: string[];
  errorCode?: number;
  duration?: number;
}

export class SchedulerNotificationService {
  private static instance: SchedulerNotificationService;

  public static getInstance(): SchedulerNotificationService {
    if (!SchedulerNotificationService.instance) {
      SchedulerNotificationService.instance = new SchedulerNotificationService();
    }
    return SchedulerNotificationService.instance;
  }

  // Format time with timezone information
  private formatTimeWithTimezone(date: Date, timezone?: string): string {
    if (!timezone || timezone === 'UTC') {
      return date.toLocaleString('en-US', { timeZone: 'UTC' }) + ' (UTC)';
    }

    try {
      const formatted = date.toLocaleString('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
      });
      return `${formatted} (${timezone})`;
    } catch (error) {
      // Fallback to UTC if timezone is invalid
      return date.toLocaleString('en-US', { timeZone: 'UTC' }) + ' (UTC)';
    }
  }

  async notifySchedulerTrigger(data: SchedulerNotificationData): Promise<boolean> {
    try {
      const db = getDb();

      // Get schedule to check email preferences (single source of truth)
      const schedule = await db.collection('schedules-v2').findOne({
        automationId: data.automationId
      });

      if (!schedule) {
        console.error(`Schedule for automation ${data.automationId} not found for notification`);
        return false;
      }

      // Check if email notifications are enabled for this schedule
      const emailNotificationsEnabled = schedule.emailNotificationsEnabled !== false;

      if (!emailNotificationsEnabled) {
        // Still store the notification but don't send email
        await db.collection('schedulerNotifications').insertOne({
          ...data,
          sentAt: new Date(),
          emailSent: false,
          emailDisabled: true
        });
        return false;
      }

      // Check specific status preferences from schedule
      let shouldSendEmail = false;
      switch (data.status) {
        case 'completed':
          shouldSendEmail = schedule.emailOnCompleted === true;
          break;
        case 'failed':
        case 'errored':
          // Use emailOnFailed for both failed and errored statuses
          shouldSendEmail = schedule.emailOnFailed === true;
          break;
      }

      if (!shouldSendEmail) {
        // Still store the notification but don't send email
        await db.collection('schedulerNotifications').insertOne({
          ...data,
          sentAt: new Date(),
          emailSent: false,
          emailDisabled: true
        });
        return false;
      }
      
      // Store notification in database for tracking
      await db.collection('schedulerNotifications').insertOne({
        ...data,
        sentAt: new Date(),
        emailSent: false
      });

      let emailSent = false;

      switch (data.status) {
        case 'completed':
          emailSent = await this.sendCompletedNotification(data);
          break;
        case 'failed':
        case 'errored':
          emailSent = await this.sendFailedNotification(data);
          break;
      }

      // Update email sent status
      if (emailSent) {
        await db.collection('schedulerNotifications').updateOne(
          { automationId: data.automationId, executionId: data.executionId, status: data.status },
          { $set: { emailSent: true, emailSentAt: new Date() } }
        );
      }

      return emailSent;
    } catch (error) {
      console.error('Error sending scheduler notification:', error);
      return false;
    }
  }

  private async sendStartedNotification(data: SchedulerNotificationData): Promise<boolean> {
    const subject = `🚀 Automation "${data.automationTitle}" Started`;
    const html = this.generateStartedEmailHTML(data);
    const text = this.generateStartedEmailText(data);

    return this.sendEmail(data.userEmail, subject, html, text);
  }

  private async sendCompletedNotification(data: SchedulerNotificationData): Promise<boolean> {
    const subject = `Automation "${data.automationTitle}" Completed Successfully`;
    
    // Get log explanation if logs are available
    let logExplanation = null;
    if (data.logs && data.logs.length > 0) {
      try {
        logExplanation = await explainLogs(data.automationId, data.logs, 'Script has finished running');
      } catch (error) {
        console.error('Error explaining logs:', error);
      }
    }

    const html = this.generateCompletedEmailHTML(data, logExplanation);
    const text = this.generateCompletedEmailText(data, logExplanation);

    return this.sendEmail(data.userEmail, subject, html, text);
  }

  private async sendFailedNotification(data: SchedulerNotificationData): Promise<boolean> {
    const subject = `Automation "${data.automationTitle}" Failed`;
    
    // Get log explanation if logs are available
    let logExplanation = null;
    if (data.logs && data.logs.length > 0) {
      try {
        logExplanation = await explainLogs(data.automationId, data.logs, 'Script has finished running');
      } catch (error) {
        console.error('Error explaining logs:', error);
      }
    }

    const html = this.generateFailedEmailHTML(data, logExplanation);
    const text = this.generateFailedEmailText(data, logExplanation);

    return this.sendEmail(data.userEmail, subject, html, text);
  }

  private generateStartedEmailHTML(data: SchedulerNotificationData): string {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Automation Started</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); background-color: #667eea; color: white !important; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
          .header h1, .header h2 { color: white !important; }
          .content { background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .status-badge { display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: bold; margin: 10px 0; }
          .started { background: #e3f2fd; color: #1976d2; }
          .info-row { margin: 15px 0; padding: 10px; background: #f8f9fa; border-radius: 5px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
          .btn { display: inline-block; padding: 12px 24px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="color: white !important; margin: 0; font-size: 28px;">🚀 Automation Started</h1>
            <h2 style="color: white !important; margin: 10px 0 0 0; font-size: 20px; font-weight: normal;">${data.automationTitle}</h2>
          </div>
          <div class="content">
            <div class="status-badge started">Started</div>

            <div class="info-row">
              <strong>Trigger Time:</strong> ${this.formatTimeWithTimezone(data.triggerTime, data.timezone)}
            </div>
            
            <div class="info-row">
              <strong>Execution ID:</strong> ${data.executionId}
            </div>

            <p>Your scheduled automation has been triggered successfully and is now running. You'll receive another notification when it completes.</p>

            <div style="text-align: center;">
              <a href="${process.env.AUTOMATIONAI_ENDPOINT}/canvas/${data.automationId}" class="btn">View Automation</a>
            </div>
          </div>
          <div class="footer">
            <p>This is an automated notification from Turbotic AI</p>
            <p>© ${new Date().getFullYear()} Turbotic. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateCompletedEmailHTML(data: SchedulerNotificationData, logExplanation: any): string {
    const logsSection = data.logs && data.logs.length > 0 ? `
      <div class="info-row">
        <strong>Recent Output:</strong>
        <div style="background: #f1f3f4; padding: 10px; border-radius: 5px; margin-top: 10px; font-family: monospace; font-size: 12px; max-height: 200px; overflow-y: auto;">
          ${data.logs.slice(-10).join('<br>')}
        </div>
      </div>
    ` : '';

    const explanationSection = logExplanation ? `
      <div class="info-row">
        <strong>Summary:</strong> ${logExplanation.explanation}
      </div>
      <div class="info-row">
        <strong>Next Steps:</strong> ${logExplanation.whatToDoNext}
      </div>
    ` : '';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Automation Completed</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #4caf50 0%, #45a049 100%); background-color: #4caf50; color: white !important; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
          .header h1, .header h2 { color: white !important; }
          .content { background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .status-badge { display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: bold; margin: 10px 0; }
          .completed { background: #e8f5e8; color: #2e7d32; }
          .info-row { margin: 15px 0; padding: 10px; background: #f8f9fa; border-radius: 5px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
          .btn { display: inline-block; padding: 12px 24px; background: #4caf50; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="color: white !important; margin: 0; font-size: 28px;">✅ Automation Completed</h1>
            <h2 style="color: white !important; margin: 10px 0 0 0; font-size: 20px; font-weight: normal;">${data.automationTitle}</h2>
          </div>
          <div class="content">
            <div class="status-badge completed">Completed Successfully</div>

            <div class="info-row">
              <strong>Started:</strong> ${this.formatTimeWithTimezone(data.triggerTime, data.timezone)}
            </div>
            
            <div class="info-row">
              <strong>Duration:</strong> ${data.duration ? `${Math.round(data.duration / 1000)}s` : 'N/A'}
            </div>
            
            <div class="info-row">
              <strong>Execution ID:</strong> ${data.executionId}
            </div>

            ${explanationSection}
            ${logsSection}

            <div style="text-align: center;">
              <a href="${process.env.AUTOMATIONAI_ENDPOINT}/canvas/${data.automationId}" class="btn">View Results</a>
            </div>
          </div>
          <div class="footer">
            <p>This is an automated notification from Turbotic AI</p>
            <p>© ${new Date().getFullYear()} Turbotic. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateFailedEmailHTML(data: SchedulerNotificationData, logExplanation: any): string {
    const logsSection = data.logs && data.logs.length > 0 ? `
      <div class="info-row">
        <strong>Error Logs:</strong>
        <div style="background: #ffebee; padding: 10px; border-radius: 5px; margin-top: 10px; font-family: monospace; font-size: 12px; max-height: 200px; overflow-y: auto; border-left: 4px solid #f44336;">
          ${data.logs.slice(-10).join('<br>')}
        </div>
      </div>
    ` : '';

    const explanationSection = logExplanation ? `
      <div class="info-row">
        <strong>Issue Summary:</strong> ${logExplanation.explanation}
      </div>
      <div class="info-row">
        <strong>Recommended Actions:</strong> ${logExplanation.whatToDoNext}
      </div>
    ` : '';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Automation Failed</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #f44336 0%, #d32f2f 100%); background-color: #f44336; color: white !important; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
          .header h1, .header h2 { color: white !important; }
          .content { background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .status-badge { display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: bold; margin: 10px 0; }
          .failed { background: #ffebee; color: #d32f2f; }
          .info-row { margin: 15px 0; padding: 10px; background: #f8f9fa; border-radius: 5px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
          .btn { display: inline-block; padding: 12px 24px; background: #f44336; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="color: white !important; margin: 0; font-size: 28px;">❌ Automation Failed</h1>
            <h2 style="color: white !important; margin: 10px 0 0 0; font-size: 20px; font-weight: normal;">${data.automationTitle}</h2>
          </div>
          <div class="content">
            <div class="status-badge failed">Failed</div>

            <div class="info-row">
              <strong>Started:</strong> ${this.formatTimeWithTimezone(data.triggerTime, data.timezone)}
            </div>
            
            <div class="info-row">
              <strong>Error Code:</strong> ${data.errorCode || 'Unknown'}
            </div>
            
            <div class="info-row">
              <strong>Execution ID:</strong> ${data.executionId}
            </div>

            ${explanationSection}
            ${logsSection}

            <p style="color: #f44336; font-weight: bold;">Your scheduled automation encountered an error and was unable to complete successfully.</p>

            <div style="text-align: center;">
              <a href="${process.env.AUTOMATIONAI_ENDPOINT}/canvas/${data.automationId}" class="btn">Debug & Fix</a>
            </div>
          </div>
          <div class="footer">
            <p>This is an automated notification from Turbotic AI</p>
            <p>© ${new Date().getFullYear()} Turbotic. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  private generateStartedEmailText(data: SchedulerNotificationData): string {
    return `
Automation Started: ${data.automationTitle}

Status: Started
Trigger Time: ${this.formatTimeWithTimezone(data.triggerTime, data.timezone)}
Execution ID: ${data.executionId}

Your scheduled automation has been triggered successfully and is now running. You'll receive another notification when it completes.

View Automation: ${process.env.AUTOMATIONAI_ENDPOINT}/canvas/${data.automationId}

This is an automated notification from Turbotic AI.
© ${new Date().getFullYear()} Turbotic. All rights reserved.
    `.trim();
  }

  private generateCompletedEmailText(data: SchedulerNotificationData, logExplanation: any): string {
    const explanationText = logExplanation ? `
Summary: ${logExplanation.explanation}
Next Steps: ${logExplanation.whatToDoNext}
` : '';

    const logsText = data.logs && data.logs.length > 0 ? `
Recent Output:
${data.logs.slice(-10).join('\n')}
` : '';

    return `
Automation Completed: ${data.automationTitle}

Status: Completed Successfully
Started: ${this.formatTimeWithTimezone(data.triggerTime, data.timezone)}
Duration: ${data.duration ? `${Math.round(data.duration / 1000)}s` : 'N/A'}
Execution ID: ${data.executionId}

${explanationText}
${logsText}

View Results: ${process.env.AUTOMATIONAI_ENDPOINT}/canvas/${data.automationId}

This is an automated notification from Turbotic AI.
© ${new Date().getFullYear()} Turbotic. All rights reserved.
    `.trim();
  }

  private generateFailedEmailText(data: SchedulerNotificationData, logExplanation: any): string {
    const explanationText = logExplanation ? `
Issue Summary: ${logExplanation.explanation}
Recommended Actions: ${logExplanation.whatToDoNext}
` : '';

    const logsText = data.logs && data.logs.length > 0 ? `
Error Logs:
${data.logs.slice(-10).join('\n')}
` : '';

    return `
Automation Failed: ${data.automationTitle}

Status: Failed
Started: ${this.formatTimeWithTimezone(data.triggerTime, data.timezone)}
Error Code: ${data.errorCode || 'Unknown'}
Execution ID: ${data.executionId}

${explanationText}
${logsText}

Your scheduled automation encountered an error and was unable to complete successfully.

Debug & Fix: ${process.env.AUTOMATIONAI_ENDPOINT}/canvas/${data.automationId}

This is an automated notification from Turbotic AI.
© ${new Date().getFullYear()} Turbotic. All rights reserved.
    `.trim();
  }

  private async sendEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
    try {
      const fromEmailEnv = process.env.SENDGRID_FROM_EMAIL;
      if (!fromEmailEnv) {
        console.error('SENDGRID_FROM_EMAIL is not configured');
        return false;
      }

      // Assign to a new variable with explicit string type after the check
      const fromEmail: string = fromEmailEnv;

      // Initialize SendGrid
      sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

      // TypeScript doesn't narrow the type after the if check, so we use type assertions
      // We've already checked that fromEmail is not undefined above
      const msg: any = {
        to: to,
        from: fromEmail,
        subject: subject,
        text: text,
        html: html,
      };

      await sgMail.send(msg as any);
      console.log('Scheduler notification email sent successfully to:', to);
      return true;
      
    } catch (error) {
      console.error('Error sending scheduler notification email:', error);
      return false;
    }
  }
}

export default SchedulerNotificationService.getInstance();