import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import authenticationBackend from '@/app/api/authentication/authentication-backend';

export async function POST(request: NextRequest) {
  try {
    const currentUser = await authenticationBackend.getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const db = getDb();
    
    // Disconnect the GitHub integration
    await db.collection('integrations').updateOne(
      { 
        userId: currentUser.email,
        app: 'github',
        source: 'github'
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
    console.error('Error disconnecting GitHub integration:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to disconnect GitHub integration' },
      { status: 500 }
    );
  }
}

