import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
    const url = new URL(req.url);
    const executionId = url.searchParams.get('executionId');

    if (!executionId) {
        return new Response(JSON.stringify({ error: 'Execution ID is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }
    
    const result = await getDb().collection('runTokens').find({ executionId }).sort({ $natural: -1 }).limit(1).toArray();

    return new Response(JSON.stringify({
        latestRunToken: result?.length > 0 ? result[0] : null
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
}

// Create and get
export async function POST(req: NextRequest) {
    const { action, payload } = await req.json();

    switch (action) {
        case 'create': {
            delete payload._id;
            const result = await getDb().collection('runTokens').insertOne(payload);
            return new Response(JSON.stringify({
                success: true,
                result: {
                    ...payload,
                    _id: result.insertedId
                }
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        case 'get': {
            const result = await getDb().collection('runTokens').findOne({ _id: ObjectId.createFromHexString(payload.runId) });
            return new Response(JSON.stringify({
                success: true,
                result
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        default: {
            return new Response(JSON.stringify({ error: 'Invalid action: ' + action }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
} 

// Update
export async function PUT(req: NextRequest) {
    const { action, payload } = await req.json();

    switch (action) {
        case 'update': {
            const result = await getDb().collection('runTokens').updateOne({ _id: ObjectId.createFromHexString(payload.runId) }, {
                $set: {
                    progress: payload.progress,
                    context: payload.context,
                    status: payload.status,
                    temporaryRunTokenId: payload.temporaryRunTokenId
                }
            });

            try {
                fetch(`${process.env.SOCKET_BASE_URL || process.env.NEXT_PUBLIC_SOCKET_BASE_URL || 'http://localhost:3001'}/ping`, {
                    method: 'POST',
                    body: JSON.stringify({
                        message: payload, event: 'runToken:progress', room: `execution-${payload?.executionId}`
                    }),
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
                console.log('Pushed event to socket', `execution-${payload?.executionId}`);
            } catch (e) {
                console.error(e);
            }

            return new Response(JSON.stringify({
                success: true,
                result
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        default: {
            return new Response(JSON.stringify({ error: 'Invalid action: ' + action }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
    }
}