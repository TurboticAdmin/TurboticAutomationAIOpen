import { NextRequest, NextResponse } from 'next/server';
import authBackend from '@/app/api/authentication/authentication-backend';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    // Check if user is authenticated
    const user = await authBackend.getCurrentUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Get workspace ID
    const workspaceId = user.workspace ? String(user.workspace._id) : undefined;
    if (!workspaceId) {
      return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
    }

    const db = getDb();

    // Fetch automations that were disabled due to execution limits
    const disabledAutomations = await db.collection('automations').find({
      workspaceId: workspaceId,
      triggerEnabled: false,
      disabledReason: 'execution_limit_exceeded'
    }).project({
      _id: 1,
      name: 1,
      disabledAt: 1,
      disabledReason: 1
    }).toArray();

    return NextResponse.json({
      disabledAutomations: disabledAutomations.map(a => ({
        id: String(a._id),
        name: a.name || 'Untitled Automation',
        disabledAt: a.disabledAt,
        disabledReason: a.disabledReason
      }))
    });
  } catch (error) {
    console.error('Error fetching disabled automations:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
