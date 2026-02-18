import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
    try {
        const url = new URL(req.url);
        const automationId = url.searchParams.get('automationId');
        const deviceId = url.searchParams.get('deviceId');

        // Validate required parameters
        if (!automationId) {
            return new Response(JSON.stringify({ error: 'Automation ID is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (!deviceId) {
            return new Response(JSON.stringify({ error: 'Device ID is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Validate ObjectId format
        const isValidObjectId = (id: string) => typeof id === 'string' && id.length === 24 && /^[a-fA-F0-9]+$/.test(id);
        
        if (!isValidObjectId(automationId)) {
            return new Response(JSON.stringify({ error: 'Invalid automation ID format' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (!isValidObjectId(deviceId)) {
            return new Response(JSON.stringify({ error: 'Invalid device ID format' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const db = getDb();

        // Find the execution by automationId and deviceId
        const execution = await db.collection('executions').findOne({
            automationId: automationId,
            deviceId: deviceId
        });

        if (!execution) {
            return new Response(JSON.stringify({ 
                resumable: false,
                message: 'No execution found for the given automation and device'
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Find the latest runToken for this execution
        const latestRunToken = await db.collection('runTokens').findOne(
            { executionId: execution._id.toString() },
            { sort: { $natural: -1 } }
        );

        if (!latestRunToken) {
            return new Response(JSON.stringify({ 
                resumable: false,
                message: 'No run tokens found for this execution'
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Check if the latest runToken status is 'errored'
        const isResumable = latestRunToken.status === 'errored';

        const response = {
            resumable: isResumable,
            executionId: execution._id.toString(),
            lastRunTokenId: latestRunToken._id.toString(),
            lastRunTokenStatus: latestRunToken.status,
            lastRunTokenCreatedAt: latestRunToken.createdAt
        };

        return new Response(JSON.stringify(response), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error checking if automation can resume:', error);
        return new Response(JSON.stringify({ 
            error: 'Internal server error',
            resumable: false
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
