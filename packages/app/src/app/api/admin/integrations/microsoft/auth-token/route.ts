import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { MICROSOFT_APP_CONFIGS } from '@/lib/microsoft-scope';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { executionId, type } = body;

    if (!executionId) {
      return NextResponse.json({ error: 'executionId is required' }, { status: 400 });
    }

    if (!type) {
      return NextResponse.json({ error: 'type is required' }, { status: 400 });
    }

    const app = type;
    
    if (!app || !MICROSOFT_APP_CONFIGS[app as keyof typeof MICROSOFT_APP_CONFIGS]) {
      return NextResponse.json({ 
        error: `Invalid app type. Supported apps: ${Object.keys(MICROSOFT_APP_CONFIGS).join(', ')}` 
      }, { status: 400 });
    }

    const appConfig = MICROSOFT_APP_CONFIGS[app as keyof typeof MICROSOFT_APP_CONFIGS];
    // Try to find execution history by executionId first, then by _id (historyId)
    const db = getDb();
    let executionHistory = await db.collection('execution_history').findOne({ 
      executionId: executionId 
    }, { sort: { startedAt: -1 } }); // Get the most recent record if multiple exist

    if (!executionHistory) {
      // Try to find by _id (historyId) as fallback
      try {
        const { ObjectId } = require('mongodb');
        const historyId = new ObjectId(executionId);
        executionHistory = await db.collection('execution_history').findOne({ 
          _id: historyId 
        });
      } catch (error) {
        console.log(`[Microsoft Auth API] Invalid ObjectId format for historyId lookup: ${executionId}`);
      }
    }

    if (!executionHistory || !executionHistory.userEmail) {
      
      // Log additional debug info
      const allMatchingRecords = await db.collection('execution_history').find({ 
        executionId: executionId 
      }).toArray();
            
      return NextResponse.json({ 
        error: 'No user email found in execution history', 
        userId: 'unknown' 
      }, { status: 400 });
    }
  
    // Get app-specific auth token with custom scopes
    const authResult = await getMicrosoftAuthTokenForApp(
      executionHistory.userEmail, 
      app, 
      appConfig.scopes,
      appConfig.envPrefix
    );

    if (!authResult.success) {
      return NextResponse.json({ 
        error: authResult.error, 
        userId: authResult.userId 
      }, { status: 401 });
    }

    return NextResponse.json({ 
      accessToken: authResult.accessToken, 
      refreshToken: authResult.refreshToken,
      userId: authResult.userId, 
      isRefreshed: authResult.isRefreshed,
      app: app,
      scopes: appConfig.scopes,
      expiresAt: authResult.expiresAt
    });

  } catch (error) {
    console.error(`[Microsoft Auth API] Error:`, error);
    return NextResponse.json({ 
      error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}` 
    }, { status: 500 });
  }
}

/**
 * Get Microsoft auth token for a specific app with custom scopes
 */
async function getMicrosoftAuthTokenForApp(
  userId: string, 
  app: string, 
  scopes: string[],
  envPrefix: string
): Promise<{
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
  userId: string;
  isRefreshed?: boolean;
  expiresAt?: Date;
}> {
  try {   
    const db = getDb();
    const integrationsCollection = db.collection('integrations');
    
    // Find the user's Microsoft integration
    const integration = await integrationsCollection.findOne({
      userId,
      app: app,
      source: 'microsoft'
    });

    if (!integration) {
      return {
        success: false,
        error: `Microsoft ${app} integration not set up. Please connect your Microsoft account in Settings > Integrations.`,
        userId
      };
    }

    if (!integration.isConnected) {
      return {
        success: false,
        error: `Microsoft ${app} integration is disconnected. Please reconnect your account in Settings > Integrations.`,
        userId
      };
    }

    if (!integration.accessToken) {
      return {
        success: false,
        error: `Microsoft ${app} access token is missing. Please reconnect your account in Settings > Integrations.`,
        userId
      };
    }

    // Check if token is expired or will expire soon (within 5 minutes)
    const now = new Date();
    const expiresAt = new Date(integration.expiresAt);
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (expiresAt <= fiveMinutesFromNow) {
      
      if (!integration.refreshToken) {
        return {
          success: false,
          error: `Microsoft ${app} token has expired and cannot be refreshed. Please reconnect your account in Settings > Integrations.`,
          userId
        };
      }

      // Attempt to refresh the token with app-specific scopes
      const refreshResult = await refreshMicrosoftTokenForApp(
        userId, 
        integration.refreshToken, 
        scopes,
        envPrefix
      );
      
      if (!refreshResult.success) {
        return {
          success: false,
          error: `Microsoft ${app} token refresh failed. Please reconnect your account in Settings > Integrations.`,
          userId
        };
      }

      return {
        success: true,
        accessToken: refreshResult.accessToken,
        refreshToken: refreshResult.refreshToken,
        userId,
        isRefreshed: true,
        expiresAt: refreshResult.expiresAt
      };
    }

    return {
      success: true,
      accessToken: integration.accessToken,
      refreshToken: integration.refreshToken,
      userId,
      isRefreshed: false,
      expiresAt: integration.expiresAt
    };

  } catch (error) {
    console.error(`[Microsoft Auth] Error getting ${app} auth token for user ${userId}:`, error);
    return {
      success: false,
      error: `Internal error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      userId
    };
  }
}

/**
 * Refresh Microsoft access token for a specific app with custom scopes
 */
async function refreshMicrosoftTokenForApp(
  userId: string, 
  refreshToken: string, 
  scopes: string[],
  envPrefix: string
): Promise<{
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
  userId?: string;
  expiresAt?: Date;
}> {
  try {
    // Use app-specific environment variables if available, fallback to general ones
    const clientId = process.env[`${envPrefix}_CLIENT_ID`] || '';
    const clientSecret = process.env[`${envPrefix}_CLIENT_SECRET`] || '';
    
    if (!clientId || !clientSecret) {
      console.error('No client ID or secret found for:', envPrefix);
      return {
        success: false,
        error: `Failed to refresh Microsoft account due to missing client ID or secret. Please try again.` 
      };
    }
    
    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        scope: scopes.join(' '),
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error(`[Microsoft Auth] ${envPrefix} token refresh failed: ${tokenResponse.status} - ${errorText}`);
      
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
      
      return {
        success: false,
        error: `Token refresh failed: ${tokenResponse.status}`,
        userId
      };
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

    return {
      success: true,
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || refreshToken,
      userId,
      expiresAt: new Date(Date.now() + tokenData.expires_in * 1000)
    };

  } catch (error) {
    console.error(`[Microsoft Auth] Error refreshing ${envPrefix} token for user ${userId}:`, error);
    return {
      success: false,
      error: `Refresh error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      userId
    };
  }
} 
