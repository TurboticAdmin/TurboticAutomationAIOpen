import { explainLogs } from "@/lib/game";
import { NextRequest, NextResponse } from "next/server";
import authenticationBackend from "../../authentication/authentication-backend";

export async function POST(request: NextRequest) {
    // Check authentication
    const currentUser = await authenticationBackend.getCurrentUser(request);
    if (!currentUser) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { automationId, logs, executionStatus } = body;

    const result = await explainLogs(automationId, logs, executionStatus);

    return NextResponse.json(result);
}