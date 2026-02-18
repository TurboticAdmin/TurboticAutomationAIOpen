import { NextRequest, NextResponse } from 'next/server';
import { versionControl } from '@/lib/mongodb-version-control';
import authenticationBackend from '../../authentication/authentication-backend';
import { getDb } from '@/lib/db';
import { ObjectId } from 'mongodb';

/**
 * GET /api/code-versions/get?automationId=xxx&version=v1
 * Get a specific code version from MongoDB
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
    const version = searchParams.get('version');

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

    if (!version || typeof version !== 'string') {
      return NextResponse.json(
        { error: 'Valid version is required' },
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

    const codeVersion = await versionControl.getVersion(automationId, version);

    if (!codeVersion) {
      return NextResponse.json(
        { error: 'Version not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      version: {
        version: codeVersion.userVersion,
        code: codeVersion.code,
        files: codeVersion.files, // Include files array for v3 multi-file versions
        message: codeVersion.message,
        timestamp: codeVersion.timestamp,
        metadata: codeVersion.metadata,
      },
    });
  } catch (error: any) {
    console.error('Error fetching code version:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch code version' },
      { status: 500 }
    );
  }
}