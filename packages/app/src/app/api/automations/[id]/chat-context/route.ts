import { NextRequest, NextResponse } from 'next/server';
import { getDbWithSelection, getDbSync } from '@/lib/db';
import authenticationBackend from '../../../authentication/authentication-backend';

function isValidObjectId(id: string) {
  return typeof id === 'string' && id.length === 24 && /^[a-fA-F0-9]+$/.test(id);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // Validate ObjectId format
    if (!isValidObjectId(id)) {
      return NextResponse.json({ error: 'Invalid automation ID format' }, { status: 400 });
    }

    // Check authentication
    const currentUser = await authenticationBackend.getCurrentUser(req);
    if (!currentUser?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get database selection from query params
    const { searchParams } = new URL(req.url);
    const database = searchParams.get('database') || 'test';

    // Connect to the appropriate database
    const db = getDbWithSelection(database === 'prod' ? 'prod' : 'test');

    // Check dashboard access in the main database
    const mainDb = getDbSync();
    const accessRecord = await mainDb.collection('dashboard_access').findOne({
      email: currentUser.email.toLowerCase().trim()
    });

    if (!accessRecord) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Fetch chat context for the automation
    const chatContext = await db.collection('chatContext').findOne({
      automationId: id
    });

    if (!chatContext) {
      return NextResponse.json({ 
        error: 'No chat context found for this automation',
        chatMessages: []
      }, { status: 404 });
    }

    // Return the chat context data
    return NextResponse.json({
      automationId: id,
      chatMessages: chatContext.messages || [],
      createdAt: chatContext.createdAt,
      updatedAt: chatContext.updatedAt,
      totalMessages: chatContext.messages?.length || 0
    });

  } catch (error) {
    console.error('Error fetching chat context:', error);
    return NextResponse.json(
      { error: 'Failed to fetch chat context' },
      { status: 500 }
    );
  }
}
