import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import authenticationBackend from '@/app/api/authentication/authentication-backend';

export async function POST(request: NextRequest) {
  try {
    const currentUser = await authenticationBackend.getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { app } = body;

    if (!app) {
      return NextResponse.json({ error: 'App is required' }, { status: 400 });
    }

    const db = getDb();
    
    // Disconnect the integration
    await db.collection('integrations').updateOne(
      { 
        userId: currentUser.email,
        app: app,
        source: 'microsoft'
      },
      {
        $set: {
          isConnected: false,
          updatedAt: new Date()
        }
      }
    );

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error disconnecting Microsoft integration:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to disconnect Microsoft integration' },
      { status: 500 }
    );
  }
}

