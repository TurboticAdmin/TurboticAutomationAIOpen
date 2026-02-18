import { getDb } from "@/lib/db";
import { NextRequest } from "next/server";
import authenticationBackend from "../../authentication/authentication-backend";

export async function POST(req: NextRequest) {
    // Check authentication
    const currentUser = await authenticationBackend.getCurrentUser(req);
    if (!currentUser) {
        return new Response(JSON.stringify({ error: 'Authentication required' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const { executionId, temporaryRunTokenId } = await req.json();

    const progress = await getDb().collection('runTokens').findOne(
        { executionId, temporaryRunTokenId },
        { sort: { $natural: -1 } }
    );

    return new Response(JSON.stringify(progress), {
        headers: { 'Content-Type': 'application/json' }
    });

}
