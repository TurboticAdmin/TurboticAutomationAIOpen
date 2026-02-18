import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import authenticationBackend from '@/app/api/authentication/authentication-backend';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await authenticationBackend.getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const db = getDb();
    
    // Get all Microsoft integrations for the current user
    const microsoftIntegrations = await db.collection('integrations').find({
      userId: currentUser.email,
      source: 'microsoft'
    }).toArray();

    const appIntegrations: any = {};
    
    microsoftIntegrations.forEach((integration) => {
      const app = integration.app;
      appIntegrations[app] = {
        _id: integration._id?.toString(),
        userId: integration.userId,
        app: integration.app,
        source: integration.source,
        isConnected: integration.isConnected || false,
        lastSync: integration.lastSync,
        createdAt: integration.createdAt,
        updatedAt: integration.updatedAt
      };
    });

    return NextResponse.json({ integration: appIntegrations });
  } catch (error: any) {
    console.error('Error fetching Microsoft integration:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch Microsoft integration' },
      { status: 500 }
    );
  }
}

