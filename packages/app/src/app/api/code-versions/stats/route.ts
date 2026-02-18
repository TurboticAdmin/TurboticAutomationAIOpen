import { NextRequest, NextResponse } from 'next/server';
import { versionControl } from '@/lib/mongodb-version-control';
import authenticationBackend from '../../authentication/authentication-backend';
import { getDb } from '@/lib/db';
import { ObjectId } from 'mongodb';

/**
 * GET /api/code-versions/stats?automationId=xxx
 * Get version statistics for an automation from MongoDB
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

    const stats = await versionControl.getVersionStats(automationId);

    return NextResponse.json({
      success: true,
      stats,
    });
  } catch (error: any) {
    console.error('Error fetching version stats:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch version stats' },
      { status: 500 }
    );
  }
}