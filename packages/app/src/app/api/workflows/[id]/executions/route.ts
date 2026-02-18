import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import authenticationBackend from "../../../authentication/authentication-backend";

// GET - Fetch execution history for a specific workflow
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const currentUser = await authenticationBackend.getCurrentUser(req);
        
        if (!currentUser) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const { id: workflowId } = await params;
        const url = new URL(req.url);
        const page = parseInt(url.searchParams.get('page') || '1');
        const limit = parseInt(url.searchParams.get('limit') || '20');
        const skip = (page - 1) * limit;

        // Verify workflow ownership
        const workflowFilter: any = {
            _id: ObjectId.createFromHexString(workflowId),
            createdBy: String(currentUser._id)
        };

        if (currentUser.workspace) {
            workflowFilter.workspaceId = String(currentUser.workspace._id);
        }

        const workflow = await getDb().collection('workflows').findOne(workflowFilter);

        if (!workflow) {
            return new Response(JSON.stringify({ error: 'Workflow not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Fetch executions
        const executionsFilter: any = {
            workflowId: ObjectId.createFromHexString(workflowId)
        };

        if (currentUser.workspace) {
            executionsFilter.workspaceId = String(currentUser.workspace._id);
        }

        const executions = await getDb().collection('workflow_executions')
            .find(executionsFilter)
            .sort({ startedAt: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();

        const totalExecutions = await getDb().collection('workflow_executions')
            .countDocuments(executionsFilter);

        return new Response(JSON.stringify({ 
            executions,
            total: totalExecutions,
            page,
            limit,
            totalPages: Math.ceil(totalExecutions / limit)
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error fetching workflow executions:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
} 