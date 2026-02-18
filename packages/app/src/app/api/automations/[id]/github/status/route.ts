import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ObjectId } from 'mongodb';
import authenticationBackend from '../../../../authentication/authentication-backend';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authentication check
    const currentUser = await authenticationBackend.getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const db = getDb();
    const { id } = await params;

    // Get automation
    const automation = await db.collection('automations').findOne({
      _id: ObjectId.createFromHexString(id),
      $or: [
        { workspaceId: String(currentUser?.workspace?._id) },
        { 'sharedWith.userId': String(currentUser._id) }
      ]
    });

    if (!automation) {
      return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
    }

    // Check if user has GitHub connected (global)
    const githubIntegration = await db.collection('integrations').findOne({
      userId: currentUser.email,
      app: 'github',
      source: 'github',
      isConnected: true
    });

    return NextResponse.json({
      hasGlobalConnection: !!githubIntegration?.isConnected,
      githubUsername: githubIntegration?.githubUsername,
      automation: {
        isConnected: !!automation.githubRepo?.isConnected,
        repo: automation.githubRepo || null
      }
    });

  } catch (error: any) {
    console.error('Error fetching GitHub status:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch status' },
      { status: 500 }
    );
  }
}
