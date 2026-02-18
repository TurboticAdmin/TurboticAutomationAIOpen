import { getDb } from './db';

export interface MicrosoftGraphUser {
  id: string;
  displayName: string;
  mail: string;
  userPrincipalName: string;
}

export interface MicrosoftGraphEmail {
  id: string;
  subject: string;
  from: {
    emailAddress: {
      address: string;
      name: string;
    };
  };
  receivedDateTime: string;
  isRead: boolean;
}

export class MicrosoftGraphAPI {
  private static async getValidAccessToken(userId: string): Promise<string | null> {
    const db = getDb();
    const integrationsCollection = db.collection('integrations');
    
    const integration = await integrationsCollection.findOne({
      userId,
      app: 'microsoft'
    });

    if (!integration || !integration.accessToken) {
      console.log(`[Microsoft Graph] No integration found for user: ${userId}`);
      return null;
    }

    // Check if token is expired or will expire soon (within 5 minutes)
    if (integration.expiresAt && new Date(integration.expiresAt) <= new Date(Date.now() + 5 * 60 * 1000)) {
      console.log(`[Microsoft Graph] Token expiring soon for user: ${userId}, attempting refresh`);
      
      // Token is expired or will expire soon, try to refresh
      if (integration.refreshToken) {
        const refreshed = await this.refreshAccessToken(userId, integration.refreshToken);
        if (refreshed) {
          const updatedIntegration = await integrationsCollection.findOne({
            userId,
            app: 'microsoft'
          });
          return updatedIntegration?.accessToken || null;
        } else {
          console.log(`[Microsoft Graph] Token refresh failed for user: ${userId}`);
        }
      } else {
        console.log(`[Microsoft Graph] No refresh token available for user: ${userId}`);
      }
      return null;
    }

    console.log(`[Microsoft Graph] Using valid token for user: ${userId}`);
    return integration.accessToken;
  }

  private static async refreshAccessToken(userId: string, refreshToken: string): Promise<boolean> {
    try {
      const MICROSOFT_CALENDAR_CLIENT_ID = process.env.MICROSOFT_CALENDAR_CLIENT_ID!;
      
      console.log(`[Microsoft Graph] Refreshing token for user: ${userId}`);
      
      const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: MICROSOFT_CALENDAR_CLIENT_ID,
          client_secret: process.env.MICROSOFT_CALENDAR_CLIENT_SECRET!,
          scope: 'https://graph.microsoft.com/User.Read https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/Calendars.Read',
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error(`[Microsoft Graph] Token refresh failed: ${tokenResponse.status} - ${errorText}`);
        
        // If refresh token is invalid, mark integration as disconnected
        if (tokenResponse.status === 400) {
          const db = getDb();
          const integrationsCollection = db.collection('integrations');
          await integrationsCollection.updateOne(
            { userId, app: 'microsoft' },
            { 
              $set: { 
                isConnected: false,
                updatedAt: new Date()
              } 
            }
          );
        }
        
        return false;
      }

      const tokenData = await tokenResponse.json();
      const db = getDb();
      const integrationsCollection = db.collection('integrations');

      // Update with new tokens
      await integrationsCollection.updateOne(
        { userId, app: 'microsoft' },
        {
          $set: {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || refreshToken, // Keep old refresh token if new one not provided
            expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
            isConnected: true,
            updatedAt: new Date()
          }
        }
      );

      console.log(`[Microsoft Graph] Token refreshed successfully for user: ${userId}`);
      return true;
    } catch (error) {
      console.error('Error refreshing Microsoft token:', error);
      return false;
    }
  }

  static async getUserProfile(userId: string): Promise<MicrosoftGraphUser | null> {
    try {
      const accessToken = await this.getValidAccessToken(userId);
      if (!accessToken) {
        return null;
      }

      const response = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return null;
    }
  }

  static async getEmails(userId: string, top: number = 10): Promise<MicrosoftGraphEmail[]> {
    try {
      const accessToken = await this.getValidAccessToken(userId);
      if (!accessToken) {
        return [];
      }

      const response = await fetch(`https://graph.microsoft.com/v1.0/me/messages?$top=${top}&$orderby=receivedDateTime desc`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();
      return data.value || [];
    } catch (error) {
      console.error('Error fetching emails:', error);
      return [];
    }
  }

  static async sendEmail(userId: string, to: string[], subject: string, body: string): Promise<boolean> {
    try {
      const accessToken = await this.getValidAccessToken(userId);
      if (!accessToken) {
        return false;
      }

      const emailData = {
        message: {
          subject,
          body: {
            contentType: 'Text',
            content: body,
          },
          toRecipients: to.map(email => ({
            emailAddress: {
              address: email,
            },
          })),
        },
      };

      const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(emailData),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to send email via Microsoft Graph: ${response.status} - ${errorText}`);
      }
      return response.ok;
    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }
} 