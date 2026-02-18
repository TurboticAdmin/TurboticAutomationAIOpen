import { NextRequest, NextResponse } from 'next/server';
import { versionControl } from '@/lib/mongodb-version-control';
import authenticationBackend from '../../authentication/authentication-backend';
import { getDb } from '@/lib/db';
import { ObjectId } from 'mongodb';

/**
 * GET /api/code-versions/history?automationId=xxx&limit=50
 * Get version history for an automation from MongoDB
 */
export async function GET(request: NextRequest) {
  try {
    // Authentication check
    const currentUser = await authenticationBackend.getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const automationId = searchParams.get('automationId');
    const limit = parseInt(searchParams.get('limit') || '50', 10);

    // Input validation
    if (!automationId || typeof automationId !== 'string') {
      return NextResponse.json(
        { error: 'Valid automationId is required' },
        { status: 400 }
      );
    }

    if (!ObjectId.isValid(automationId)) {
      return NextResponse.json(
        { error: 'Invalid automationId format' },
        { status: 400 }
      );
    }

    // Authorization check
    const db = getDb();
    const automation = await db.collection('automations').findOne({
      _id: ObjectId.createFromHexString(automationId),
      $or: [
        { workspaceId: String(currentUser?.workspace?._id) },
        { 'sharedWith.userId': String(currentUser._id) }
      ]
    });

    if (!automation) {
      return NextResponse.json(
        { error: 'Automation not found or access denied' },
        { status: 403 }
      );
    }

    const versions = await versionControl.getVersionHistory(automationId, limit);

    // Get user information for each version
    const versionsWithUsers = await Promise.all(
      versions.map(async (v) => {
        let userInfo: { name?: string; email?: string } | null = null;
        
        if (v.userId) {
          try {
            const user = await db.collection('users').findOne(
              { _id: ObjectId.createFromHexString(v.userId) },
              { projection: { name: 1, email: 1 } }
            );
            if (user) {
              userInfo = {
                name: user.name || undefined,
                email: user.email || undefined,
              };
            }
          } catch (error) {
            console.error('Error fetching user info:', error);
          }
        }

        return {
          version: v.userVersion,
          message: v.message,
          timestamp: v.timestamp,
          metadata: v.metadata,
          // Include file metadata for display without full code content
          files: v.files?.map(f => ({ id: f.id, name: f.name })) || undefined,
          sha: v.codeHash.substring(0, 7), // Short SHA for UI
          userId: v.userId,
          user: userInfo,
        };
      })
    );

    return NextResponse.json({
      success: true,
      versions: versionsWithUsers,
    });
  } catch (error: any) {
    console.error('Error fetching version history:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch version history' },
      { status: 500 }
    );
  }
}