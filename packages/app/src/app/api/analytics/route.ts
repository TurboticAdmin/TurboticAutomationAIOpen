import { getDb } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import authenticationBackend from "../authentication/authentication-backend";

export async function GET(req: NextRequest) {
    // Check basic authentication (no dashboard access required since endpoint is disabled)
    const currentUser = await authenticationBackend.getCurrentUser(req);
    if (!currentUser) {
        return NextResponse.json(
            { error: 'Authentication required' },
            { status: 401 }
        );
    }

    // Analytics endpoint is disabled - returning empty data
    // Original implementation is commented out below for future reference
    
    return new Response(JSON.stringify({
        message: 'Analytics endpoint is disabled',
        periods: {
            day: { total: 0, completed: 0, errored: 0, stopped: 0, running: 0, successRate: 0, avgDuration: 0 },
            week: { total: 0, completed: 0, errored: 0, stopped: 0, running: 0, successRate: 0, avgDuration: 0 },
            month: { total: 0, completed: 0, errored: 0, stopped: 0, running: 0, successRate: 0, avgDuration: 0 },
            threeMonths: { total: 0, completed: 0, errored: 0, stopped: 0, running: 0, successRate: 0, avgDuration: 0 }
        },
        hourlyData: [],
        dailyData: [],
        performanceData: [],
        costData: [],
        totalCostSaved: 0,
        trends: {
            runs: 0,
            duration: 0
        },
        analyticsData: []
    }), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
    });
} 