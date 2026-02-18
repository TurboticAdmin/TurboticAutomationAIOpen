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
    
    // Get GitHub integration for the current user
    const githubIntegration = await db.collection('integrations').findOne({
      userId: currentUser.email,
      app: 'github',
      source: 'github'
    });

    if (!githubIntegration) {
      return NextResponse.json({ integration: null });
    }

    return NextResponse.json({
      integration: {
        _id: githubIntegration._id?.toString(),
        userId: githubIntegration.userId,
        app: githubIntegration.app,
        source: githubIntegration.source,
        isConnected: githubIntegration.isConnected || false,
        githubUsername: githubIntegration.githubUsername,
        repoOwner: githubIntegration.repoOwner,
        repoName: githubIntegration.repoName,
        defaultBranch: githubIntegration.defaultBranch,
        lastSync: githubIntegration.lastSync,
        createdAt: githubIntegration.createdAt,
        updatedAt: githubIntegration.updatedAt
      }
    });
  } catch (error: any) {
    console.error('Error fetching GitHub integration:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch GitHub integration' },
      { status: 500 }
    );
  }
}

