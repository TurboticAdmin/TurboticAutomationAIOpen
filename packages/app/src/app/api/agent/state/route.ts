import { NextRequest } from 'next/server';
import authenticationBackend from '../../authentication/authentication-backend';
import { getDb } from '@/lib/db';
import { ObjectId } from 'mongodb';

export async function POST(req: NextRequest) {
    try {
        // Check authentication
        const currentUser = await authenticationBackend.getCurrentUser(req);
        if (!currentUser) {
            return new Response(JSON.stringify({ error: 'Authentication required' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const { latestAction, latestResponse } = await req.json();

        const db = getDb();
        const result = await db.collection('agent_state').insertOne({
            latestAction,
            latestResponse,
            userId: currentUser._id?.toString(),
            createdAt: new Date(),
            updatedAt: new Date()
        });

        return new Response(JSON.stringify({ stateId: result.insertedId.toString() }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        console.error('Error saving agent state:', error);
        return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

export async function GET(req: NextRequest) {
    try {
        // Check authentication
        const currentUser = await authenticationBackend.getCurrentUser(req);
        if (!currentUser) {
            return new Response(JSON.stringify({ error: 'Authentication required' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const { searchParams } = new URL(req.url);
        const stateId = searchParams.get('stateId');

        if (!stateId) {
            return new Response(JSON.stringify({ error: 'stateId is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const db = getDb();
        const state = await db.collection('agent_state').findOne({
            _id: ObjectId.createFromHexString(stateId),
            userId: currentUser._id?.toString()
        });

        if (!state) {
            return new Response(JSON.stringify({ error: 'State not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({
            stateId: state._id.toString(),
            latestAction: state.latestAction,
            latestResponse: state.latestResponse
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        console.error('Error getting agent state:', error);
        return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

export async function PUT(req: NextRequest) {
    try {
        // Check authentication
        const currentUser = await authenticationBackend.getCurrentUser(req);
        if (!currentUser) {
            return new Response(JSON.stringify({ error: 'Authentication required' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const { stateId, latestAction, latestResponse } = await req.json();

        if (!stateId) {
            return new Response(JSON.stringify({ error: 'stateId is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const db = getDb();
        const result = await db.collection('agent_state').updateOne(
            {
                _id: ObjectId.createFromHexString(stateId),
                userId: currentUser._id?.toString()
            },
            {
                $set: {
                    latestAction,
                    latestResponse,
                    updatedAt: new Date()
                }
            },
            {
                upsert: false
            }
        );

        if (result.matchedCount === 0) {
            return new Response(JSON.stringify({ error: 'State not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({ stateId, success: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error: any) {
        console.error('Error updating agent state:', error);
        return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

