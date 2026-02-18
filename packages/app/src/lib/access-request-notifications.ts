import sgMail from '@sendgrid/mail';
import { getDb } from './db';

export interface AccessRequestData {
  userEmail: string;
  attemptedAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

export class AccessRequestNotificationService {
  private static instance: AccessRequestNotificationService;

  public static getInstance(): AccessRequestNotificationService {
    if (!AccessRequestNotificationService.instance) {
      AccessRequestNotificationService.instance = new AccessRequestNotificationService();
    }
    return AccessRequestNotificationService.instance;
  }

  async notifyAccessRequest(data: AccessRequestData): Promise<{ emailSent: boolean; blocked: boolean; attemptCount: number }> {
    try {
      const db = getDb();
      const normalizedEmail = data.userEmail.toLowerCase();

      // Use findOneAndUpdate with upsert to avoid race conditions
      const result = await db.collection('accessRequests').findOneAndUpdate(
        { userEmail: normalizedEmail },
        {
          $set: {
            lastAttemptAt: data.attemptedAt,
            userAgent: data.userAgent,
            ipAddress: data.ipAddress,
            updatedAt: new Date()
          },
          $inc: { attemptCount: 1 },
          $setOnInsert: {
            userEmail: normalizedEmail,
            firstAttemptAt: data.attemptedAt,
            emailSent: false,
            isBlocked: false,
            createdAt: new Date()
          }
        },
        {
          upsert: true,
          returnDocument: 'after'
        }
      );

      const updatedDocument = result?.value || result;
      const currentAttemptCount = updatedDocument?.attemptCount || 1;

      // Block user after 10 attempts
      let isBlocked = false;
      if (currentAttemptCount >= 10) {
        await db.collection('accessRequests').updateOne(
          { userEmail: normalizedEmail },
          {
            $set: {
              isBlocked: true,
              blockedAt: new Date(),
              blockReason: 'Exceeded maximum access attempts (10)'
            }
          }
        );
        isBlocked = true;
      }

      // Only send email notification for first 3 attempts to avoid spam
      let emailSent = false;
      if (currentAttemptCount <= 3) {
        emailSent = await this.sendAccessRequestNotification({
          ...data,
          attemptCount: currentAttemptCount
        });

        // Update email sent status if email was sent
        if (emailSent) {
          await db.collection('accessRequests').updateOne(
            { userEmail: normalizedEmail },
            { $set: { emailSent: true, emailSentAt: new Date() } }
          );
        }
      }

      return { emailSent, blocked: isBlocked, attemptCount: currentAttemptCount };
    } catch (error) {
      console.error('Error sending access request notification:', error);
      return { emailSent: false, blocked: false, attemptCount: 0 };
    }
  }

  async checkIfBlocked(email: string): Promise<{ blocked: boolean; attemptCount: number; reason?: string }> {
    try {
      const db = getDb();
      const normalizedEmail = email.toLowerCase();

      const accessRequest = await db.collection('accessRequests').findOne({
        userEmail: normalizedEmail
      });

      if (!accessRequest) {
        return { blocked: false, attemptCount: 0 };
      }

      const isBlocked = accessRequest.isBlocked || accessRequest.attemptCount >= 10;

      return {
        blocked: isBlocked,
        attemptCount: accessRequest.attemptCount || 0,
        reason: isBlocked ? accessRequest.blockReason || 'Exceeded maximum access attempts' : undefined
      };
    } catch (error) {
      console.error('Error checking if email is blocked:', error);
      return { blocked: false, attemptCount: 0 };
    }
  }

  private async sendAccessRequestNotification(data: AccessRequestData & { attemptCount?: number }): Promise<boolean> {
    const attemptText = data.attemptCount && data.attemptCount > 1 ? ` (Attempt #${data.attemptCount})` : '';
    const subject = `🔐 Non-whitelisted User Access Request${attemptText} - ${data.userEmail}`;
    const html = this.generateAccessRequestEmailHTML(data);
    const text = this.generateAccessRequestEmailText(data);

    const supportEmail = process.env.SUPPORT_EMAIL || 'support@your-domain.com';
    return this.sendEmail(supportEmail, subject, html, text);
  }

  private generateAccessRequestEmailHTML(data: AccessRequestData & { attemptCount?: number }): string {
    const applicationDomain = this.getApplicationDomain();
    const attemptBadge = data.attemptCount && data.attemptCount > 1 ? `
      <div style="display: inline-block; padding: 4px 8px; border-radius: 12px; font-size: 12px; font-weight: bold; margin-left: 10px; background: #ffebee; color: #d32f2f;">
        Attempt #${data.attemptCount}
      </div>
    ` : '';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Access Request</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%); background-color: #ff9800; color: white !important; padding: 30px; border-radius: 10px 10px 0 0; text-align: center; }
          .header h1 { color: white !important; margin: 0; font-size: 28px; }
          .content { background: white; padding: 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
          .status-badge { display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: bold; margin: 10px 0; background: #fff3e0; color: #f57c00; }
          .info-row { margin: 15px 0; padding: 10px; background: #f8f9fa; border-radius: 5px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
          .btn { display: inline-block; padding: 12px 24px; background: #ff9800; color: white; text-decoration: none; border-radius: 5px; margin: 10px 5px; }
          .email-highlight { background: #e3f2fd; padding: 15px; border-radius: 8px; border-left: 4px solid #2196f3; margin: 15px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="color: white !important;">🔐 Access Request${attemptBadge}</h1>
          </div>
          <div class="content">
            <div class="status-badge">Pending Review</div>

            <p><strong>A non-whitelisted user has attempted to access the application and has been shown the pending review message.</strong></p>

            <div class="email-highlight">
              <strong>User Email:</strong> <code>${data.userEmail}</code>
            </div>

            <div class="info-row">
              <strong>Attempted At:</strong> ${data.attemptedAt.toLocaleString()}
            </div>

            ${data.attemptCount ? `
            <div class="info-row">
              <strong>Total Attempts:</strong> ${data.attemptCount}
            </div>
            ` : ''}

            <div class="info-row">
              <strong>Application Domain:</strong> ${applicationDomain}
            </div>

            ${data.userAgent ? `
            <div class="info-row">
              <strong>User Agent:</strong> ${data.userAgent}
            </div>
            ` : ''}

            ${data.ipAddress ? `
            <div class="info-row">
              <strong>IP Address:</strong> ${data.ipAddress}
            </div>
            ` : ''}

            <p>The user has been informed that their request is being reviewed and they will receive an email notification once approved.</p>

            <div style="text-align: center;">
              <p style="margin-top: 10px; color: #666;">Please review this request in the internal admin console. Do not use links from email.</p>
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

  private generateAccessRequestEmailText(data: AccessRequestData & { attemptCount?: number }): string {
    const applicationDomain = this.getApplicationDomain();
    const attemptText = data.attemptCount && data.attemptCount > 1 ? ` (Attempt #${data.attemptCount})` : '';

    return `
Access Request Notification${attemptText}

A non-whitelisted user has attempted to access the Turbotic AI application.

User Email: ${data.userEmail}
Attempted At: ${data.attemptedAt.toLocaleString()}
Application Domain: ${applicationDomain}
${data.attemptCount ? `Total Attempts: ${data.attemptCount}` : ''}
${data.userAgent ? `User Agent: ${data.userAgent}` : ''}
${data.ipAddress ? `IP Address: ${data.ipAddress}` : ''}

The user has been informed that their request is being reviewed and they will receive an email notification once approved.

Please review this request in the internal admin console. Links are intentionally omitted from this email.

This is an automated notification from Turbotic AI.
© ${new Date().getFullYear()} Turbotic. All rights reserved.
    `.trim();
  }

  private async sendEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
    try {
      const fromEmail = process.env.SENDGRID_FROM_EMAIL;
      if (!fromEmail) {
        console.error('SENDGRID_FROM_EMAIL is not configured');
        return false;
      }

      // Initialize SendGrid
      sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

      // TypeScript doesn't narrow the type after the if check, so we use a type assertion
      await sgMail.send({
        to: to,
        from: fromEmail as string,
        subject: subject,
        text: text,
        html: html,
      } as any);
      console.log('Access request notification email sent successfully to:', to);
      return true;

    } catch (error) {
      console.error('Error sending access request notification email:', error);
      return false;
    }
  }

  private getApplicationDomain(): string {
    return (
      process.env.PUBLIC_HOSTNAME ||
      process.env.HOSTNAME ||
      process.env.NEXT_PUBLIC_APP_DOMAIN ||
      process.env.NEXT_PUBLIC_MARKETING_DOMAIN ||
      'Unknown domain'
    );
  }
}

export default AccessRequestNotificationService.getInstance();