import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import moment from 'moment';
import authenticationBackend from "../authentication/authentication-backend";

export async function POST(req: NextRequest) {
    try {
        // Check authentication
        const currentUser = await authenticationBackend.getCurrentUser(req);
        
        if (!currentUser) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const op = await getDb().collection('devices').insertOne({
            registeredAt: (moment()).utc().toDate(),
            userId: String(currentUser._id), // Associate device with user
            userEmail: currentUser.email
        });

        return new Response(JSON.stringify({
            deviceId: String(op.insertedId)
        }), {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        console.error('Error in devices API:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
