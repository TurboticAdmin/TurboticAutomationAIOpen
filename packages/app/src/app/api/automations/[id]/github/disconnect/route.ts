import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ObjectId } from 'mongodb';
import authenticationBackend from '../../../../authentication/authentication-backend';

export async function POST(
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

    // Get automation to verify ownership
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

    if (!automation.githubRepo?.isConnected) {
      return NextResponse.json({
        error: 'No GitHub repository connected'
      }, { status: 400 });
    }

    // Remove GitHub repo connection
    await db.collection('automations').updateOne(
      { _id: automation._id },
      {
        $unset: {
          githubRepo: ""
        }
      }
    );

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Error disconnecting GitHub repository:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to disconnect repository' },
      { status: 500 }
    );
  }
}
