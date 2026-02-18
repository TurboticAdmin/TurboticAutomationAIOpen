import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import authenticationBackend from "../authentication/authentication-backend";

// GET - Fetch all workflows for the current user
export async function GET(req: NextRequest) {
    try {
        const currentUser = await authenticationBackend.getCurrentUser(req);
        
        if (!currentUser) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Build filter for workflows owned by the user
        const filter: any = {
            createdBy: String(currentUser._id)
        };

        // Add workspace filter if user has a workspace
        if (currentUser.workspace) {
            filter.workspaceId = String(currentUser.workspace._id);
        }

        const workflows = await getDb().collection('workflows')
            .find(filter)
            .sort({ createdAt: -1 })
            .toArray();

        return new Response(JSON.stringify({ 
            workflows,
            total: workflows.length 
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error fetching workflows:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// POST - Create a new workflow
export async function POST(req: NextRequest) {
    try {
        const currentUser = await authenticationBackend.getCurrentUser(req);
        
        if (!currentUser) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const { name, nodes, edges, triggerType, schedule } = await req.json();

        if (!name || !nodes || !edges) {
            return new Response(JSON.stringify({ error: 'Missing required fields' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const workflowData = {
            name,
            nodes,
            edges,
            triggerType: triggerType || 'manual', // 'manual' or 'scheduled'
            schedule: schedule || null, // cron expression for scheduled workflows
            status: 'active', // 'active', 'paused', 'error'
            createdAt: new Date(),
            updatedAt: new Date(),
            createdBy: String(currentUser._id),
            workspaceId: currentUser.workspace ? String(currentUser.workspace._id) : undefined,
            lastRun: null,
            totalRuns: 0,
            successfulRuns: 0,
            errorCount: 0
        };

        const result = await getDb().collection('workflows').insertOne(workflowData);

        return new Response(JSON.stringify({ 
            workflowId: result.insertedId.toString(),
            workflow: { ...workflowData, _id: result.insertedId }
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error creating workflow:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// PUT - Update an existing workflow
export async function PUT(req: NextRequest) {
    try {
        const currentUser = await authenticationBackend.getCurrentUser(req);
        
        if (!currentUser) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const { workflowId, ...updateData } = await req.json();

        if (!workflowId) {
            return new Response(JSON.stringify({ error: 'Workflow ID is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Build filter to ensure user owns the workflow
        const filter: any = {
            _id: ObjectId.createFromHexString(workflowId),
            createdBy: String(currentUser._id)
        };

        if (currentUser.workspace) {
            filter.workspaceId = String(currentUser.workspace._id);
        }

        const updatePayload = {
            ...updateData,
            updatedAt: new Date()
        };

        const result = await getDb().collection('workflows').updateOne(filter, {
            $set: updatePayload
        });

        if (result.matchedCount === 0) {
            return new Response(JSON.stringify({ error: 'Workflow not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error updating workflow:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// DELETE - Delete a workflow
export async function DELETE(req: NextRequest) {
    try {
        const currentUser = await authenticationBackend.getCurrentUser(req);
        
        if (!currentUser) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const { workflowId } = await req.json();

        if (!workflowId) {
            return new Response(JSON.stringify({ error: 'Workflow ID is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Build filter to ensure user owns the workflow
        const filter: any = {
            _id: ObjectId.createFromHexString(workflowId),
            createdBy: String(currentUser._id)
        };

        if (currentUser.workspace) {
            filter.workspaceId = String(currentUser.workspace._id);
        }

        const result = await getDb().collection('workflows').deleteOne(filter);

        if (result.deletedCount === 0) {
            return new Response(JSON.stringify({ error: 'Workflow not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error deleting workflow:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
} 