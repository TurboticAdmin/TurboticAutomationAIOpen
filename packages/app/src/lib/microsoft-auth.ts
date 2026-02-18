import { getDb } from './db';

export interface MicrosoftAuthResult {
  success: boolean;
  accessToken?: string;
  error?: string;
  userId: string;
  isRefreshed?: boolean;
}

/**
 * Get a valid Microsoft authorization token for a user
 * This function handles token retrieval, validation, and automatic refresh
 * 
 * @param userId - The user's email address
 * @returns Promise<MicrosoftAuthResult> - Object containing the token or error details
 */
export async function getMicrosoftAuthToken(userId: string): Promise<MicrosoftAuthResult> {
  try {
    console.log(`[Microsoft Auth] Getting auth token for user: ${userId}`);
    
    const db = getDb();
    const integrationsCollection = db.collection('integrations');
    
    // Find the user's Microsoft integration
    const integration = await integrationsCollection.findOne({
      userId,
      app: 'microsoft'
    });

    if (!integration) {
      return {
        success: false,
        error: 'No Microsoft integration found for user',
        userId
      };
    }

    if (!integration.isConnected) {
      return {
        success: false,
        error: 'Microsoft integration is not connected',
        userId
      };
    }

    if (!integration.accessToken) {
      return {
        success: false,
        error: 'No access token found',
        userId
      };
    }

    // Check if token is expired or will expire soon (within 5 minutes)
    const now = new Date();
    const expiresAt = new Date(integration.expiresAt);
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (expiresAt <= fiveMinutesFromNow) {
      console.log(`[Microsoft Auth] Token expiring soon for user: ${userId}, refreshing...`);
      
      if (!integration.refreshToken) {
        return {
          success: false,
          error: 'Token expired and no refresh token available',
          userId
        };
      }

      // Attempt to refresh the token
      const refreshResult = await refreshMicrosoftToken(userId, integration.refreshToken);
      
      if (!refreshResult.success) {
        return {
          success: false,
          error: `Token refresh failed: ${refreshResult.error}`,
          userId
        };
      }

      console.log(`[Microsoft Auth] Token refreshed successfully for user: ${userId}`);
      return {
        success: true,
        accessToken: refreshResult.accessToken,
        userId,
        isRefreshed: true
      };
    }

    console.log(`[Microsoft Auth] Using valid token for user: ${userId}`);
    return {
      success: true,
      accessToken: integration.accessToken,
      userId,
      isRefreshed: false
    };

  } catch (error) {
    console.error(`[Microsoft Auth] Error getting auth token for user ${userId}:`, error);
    return {
      success: false,
      error: `Internal error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      userId
    };
  }
}

/**
 * Refresh a Microsoft access token using the refresh token
 * 
 * @param userId - The user's email address
 * @param refreshToken - The refresh token to use
 * @returns Promise<MicrosoftAuthResult> - Object containing the new token or error details
 */
async function refreshMicrosoftToken(userId: string, refreshToken: string): Promise<MicrosoftAuthResult> {
  try {
    const MICROSOFT_CALENDAR_CLIENT_ID = process.env.MICROSOFT_CALENDAR_CLIENT_ID!;
    
    console.log(`[Microsoft Auth] Refreshing token for user: ${userId}`);
    
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
      console.error(`[Microsoft Auth] Token refresh failed: ${tokenResponse.status} - ${errorText}`);
      
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

    console.log(`[Microsoft Auth] Token refreshed successfully for user: ${userId}`);
    return {
      success: true,
      accessToken: tokenData.access_token,
      userId,
      isRefreshed: true
    };

  } catch (error) {
    console.error(`[Microsoft Auth] Error refreshing token for user ${userId}:`, error);
    return {
      success: false,
      error: `Refresh error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      userId
    };
  }
}

/**
 * Check if a user has a valid Microsoft integration
 * 
 * @param userId - The user's email address
 * @returns Promise<boolean> - True if user has valid Microsoft integration
 */
export async function hasValidMicrosoftIntegration(userId: string): Promise<boolean> {
  try {
    const db = getDb();
    const integrationsCollection = db.collection('integrations');
    
    const integration = await integrationsCollection.findOne({
      userId,
      app: 'microsoft',
      isConnected: true
    });

    if (!integration || !integration.accessToken) {
      return false;
    }

    // Check if token is not expired
    const now = new Date();
    const expiresAt = new Date(integration.expiresAt);
    
    return expiresAt > now;
  } catch (error) {
    console.error(`[Microsoft Auth] Error checking integration for user ${userId}:`, error);
    return false;
  }
}

/**
 * Get Microsoft integration status for a user
 * 
 * @param userId - The user's email address
 * @returns Promise<{isConnected: boolean, expiresAt?: Date, lastSync?: Date}>
 */
export async function getMicrosoftIntegrationStatus(userId: string): Promise<{
  isConnected: boolean;
  expiresAt?: Date;
  lastSync?: Date;
  hasValidToken: boolean;
}> {
  try {
    const db = getDb();
    const integrationsCollection = db.collection('integrations');
    
    const integration = await integrationsCollection.findOne({
      userId,
      app: 'microsoft'
    });

    if (!integration) {
      return {
        isConnected: false,
        hasValidToken: false
      };
    }

    const now = new Date();
    const expiresAt = new Date(integration.expiresAt);
    const hasValidToken = integration.isConnected && 
                         integration.accessToken && 
                         expiresAt > now;

    return {
      isConnected: integration.isConnected,
      expiresAt: integration.expiresAt,
      lastSync: integration.lastSync,
      hasValidToken
    };
  } catch (error) {
    console.error(`[Microsoft Auth] Error getting integration status for user ${userId}:`, error);
    return {
      isConnected: false,
      hasValidToken: false
    };
  }
} 

/**
 * Get Microsoft integration status for the current execution
 * This function looks up the user from execution history and then gets their integration status
 * 
 * @returns Promise<{isConnected: boolean, expiresAt?: Date, lastSync?: Date, hasValidToken: boolean, userId?: string}>
 */
export async function getMicrosoftIntegrationStatusForExecution(): Promise<{
  isConnected: boolean;
  expiresAt?: Date;
  lastSync?: Date;
  hasValidToken: boolean;
  userId?: string;
}> {
  try {
    const executionId = process.env.EXECUTION_ID;
    
    if (!executionId) {
      return {
        isConnected: false,
        hasValidToken: false
      };
    }

    const db = getDb();
    
    // Try to find execution history by executionId first, then by _id (historyId)
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
        // Invalid ObjectId format, return false
        return {
          isConnected: false,
          hasValidToken: false
        };
      }
    }

    if (!executionHistory || !executionHistory.userEmail) {
      return {
        isConnected: false,
        hasValidToken: false
      };
    }

    const userId = executionHistory.userEmail;
    
    const integration = await db.collection('integrations').findOne({
      userId,
      app: 'microsoft'
    });

    if (!integration) {
      return {
        isConnected: false,
        hasValidToken: false,
        userId
      };
    }

    const now = new Date();
    const expiresAt = new Date(integration.expiresAt);
    const hasValidToken = integration.isConnected && 
                         integration.accessToken && 
                         expiresAt > now;

    return {
      isConnected: integration.isConnected,
      expiresAt: integration.expiresAt,
      lastSync: integration.updatedAt,
      hasValidToken,
      userId
    };
  } catch (error) {
    console.error(`[Microsoft Auth] Error getting integration status for execution:`, error);
    return {
      isConnected: false,
      hasValidToken: false
    };
  }
}

/**
 * Check if the current execution has a valid Microsoft integration
 * 
 * @returns Promise<boolean> - True if execution has valid Microsoft integration
 */
export async function hasValidMicrosoftIntegrationForExecution(executionId?: string): Promise<boolean> {
  try {
    const execId = executionId || process.env.EXECUTION_ID;
    
    if (!execId) {
      return false;
    }

    const db = getDb();
    
    // Try to find execution history by executionId first, then by _id (historyId)
    let executionHistory = await db.collection('execution_history').findOne({
      executionId: execId
    }, { sort: { startedAt: -1 } }); // Get the most recent record if multiple exist

    if (!executionHistory) {
      // Try to find by _id (historyId) as fallback
      try {
        const { ObjectId } = require('mongodb');
        const historyId = new ObjectId(execId);
        executionHistory = await db.collection('execution_history').findOne({ 
          _id: historyId 
        });
      } catch (error) {
        // Invalid ObjectId format, return false
        return false;
      }
    }

    if (!executionHistory || !executionHistory.userEmail) {
      return false;
    }

    const userId = executionHistory.userEmail;
    
    // Check if user has valid Microsoft integration
    const integration = await db.collection('integrations').findOne({
      userId,
      app: 'microsoft',
      isConnected: true
    });

    if (!integration || !integration.accessToken) {
      return false;
    }

    // Check if token is not expired
    const now = new Date();
    const expiresAt = new Date(integration.expiresAt);
    
    return expiresAt > now;
  } catch (error) {
    console.error(`[Microsoft Auth] Error checking integration for execution:`, error);
    return false;
  }
}

/**
 * Get Microsoft auth token using execution ID from environment
 * This function looks up the user from execution history and then gets their token
 * 
 * @returns Promise<MicrosoftAuthResult> - Object containing the token or error details
 */
export async function getMicrosoftAuthTokenFromEnvironment(): Promise<MicrosoftAuthResult> {
  const executionId = process.env.EXECUTION_ID;
  
  if (!executionId) {
    return {
      success: false,
      error: 'EXECUTION_ID not found in environment',
      userId: 'unknown'
    };
  }

  try {
    const db = getDb();
    
    // Get the execution history to find the user who triggered this execution
    const executionHistory = await db.collection('execution_history').findOne({
      executionId: executionId
    });

    if (!executionHistory || !executionHistory.userEmail) {
      return {
        success: false,
        error: 'No user email found in execution history',
        userId: 'unknown'
      };
    }

    return await getMicrosoftAuthToken(executionHistory.userEmail);
  } catch (error) {
    console.error(`[Microsoft Auth] Error getting auth token from environment:`, error);
    return {
      success: false,
      error: `Internal error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      userId: 'unknown'
    };
  }
} 