import { getDb } from '@/lib/db';
import { NextRequest, NextResponse } from "next/server";
import authenticationBackend from "../authentication-backend";

// Helper function to create CORS-enabled responses
function createCorsResponse(data: any, status: number = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}

// Handle CORS preflight requests
export async function OPTIONS(req: NextRequest) {
    return new Response(null, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}

export async function GET(req: NextRequest) {
    const user = await authenticationBackend.getCurrentUser(req);
    if (!user) {
        return createCorsResponse({ currentUser: null });
    }
    // Fetch avatarDataUrl if present
    const dbUser = await getDb().collection('users').findOne({ _id: user._id });

    if (dbUser?.avatarDataUrl) {
        user.avatarDataUrl = dbUser.avatarDataUrl;
    }

    return createCorsResponse({ currentUser: user });
}