import { getDb } from "@/lib/db";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import authenticationBackend from "../../authentication/authentication-backend";

export async function GET(req: NextRequest) {
    // Check authentication
    const currentUser = await authenticationBackend.getCurrentUser(req);
    if (!currentUser) {
        return new Response(JSON.stringify({ error: 'Authentication required' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const executionId = req.nextUrl.searchParams.get('executionId');

    if (!executionId) {
        return new Response("Execution ID is required", {
            status: 400
        });
    }


    const logs: any[] = await getDb().collection('execution_logs').find({
        executionId
    }).toArray();

    const processedLogs = logs.reduce((acc, log) => {
        if (Array.isArray(log?.logs)) {
            acc.push(...log.logs);
        }
        
        return acc;
    }, []);

    return new Response(JSON.stringify(processedLogs), {
        headers: {
            'Content-Type': 'application/json'
        }
    });
}

export async function POST(req: NextRequest) {
    const { executionId, logs, executionHistoryId } = await req.json();

    const payload: any = {
        executionId,
        logs,
        createdAt: new Date(),
        executionHistoryId
    }

    const op = await getDb().collection('execution_logs').insertOne(payload);
    await getDb().collection('execution_history_logs').insertOne(payload);

    payload._id = op.insertedId;

    try {
        fetch(`${process.env.SOCKET_BASE_URL || process.env.NEXT_PUBLIC_SOCKET_BASE_URL || 'http://localhost:3001'}/ping`, {
            method: 'POST',
            body: JSON.stringify({
                message: payload, event: 'execution:log', room: `execution-${executionId}`
            }),
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (e) {
        console.error(e);
    }

    return new Response("OK");
}