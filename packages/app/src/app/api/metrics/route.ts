import { getDb } from "@/lib/db";
import { NextRequest } from "next/server";
import authenticationBackend from "../authentication/authentication-backend";

export async function GET(req: NextRequest) {
    try {
        const currentUser = await authenticationBackend.getCurrentUser(req);
        
        if (!currentUser) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const db = getDb();
        
        // Get all automations for the user's workspace
        const automations = await db.collection('automations').find({
            $or: [
                { workspaceId: currentUser.workspace?._id },
                { 
                    $and: [
                        { workspaceId: { $exists: false } },
                        { createdBy: currentUser._id }
                    ]
                }
            ]
        }).toArray();

        // Calculate metrics
        const totalAutomations = automations.length;
        const activeAutomations = automations.filter(a => a.isPublished).length;
        const pausedAutomations = automations.filter(a => !a.isPublished).length;

        // Get execution history for success rate calculation
        const executionHistory = await db.collection('execution_history').find({
            automationId: { $in: automations.map(a => a._id) }
        }).toArray();

        const totalExecutions = executionHistory.length;
        const successfulExecutions = executionHistory.filter(exec => exec.status === 'completed').length;
        const successRate = totalExecutions > 0 ? Math.round((successfulExecutions / totalExecutions) * 100) : 0;

        // Calculate cost savings
        const totalCostSaved = automations.reduce((total, automation) => {
            const automationExecutions = executionHistory.filter(exec => 
                exec.automationId.toString() === automation._id.toString() && 
                exec.status === 'completed'
            );
            return total + ((automation.cost || 0) * automationExecutions.length);
        }, 0);

        // Get recent activity (last 7 days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        
        const recentExecutions = executionHistory.filter(exec => {
            const execDate = exec.createdAt instanceof Date ? exec.createdAt : new Date(exec.createdAt);
            return execDate >= sevenDaysAgo;
        });

        const metrics = {
            totalAutomations,
            activeAutomations,
            pausedAutomations,
            totalExecutions,
            successfulExecutions,
            successRate,
            totalCostSaved,
            recentExecutions: recentExecutions.length,
            lastUpdated: new Date().toISOString()
        };

        return new Response(JSON.stringify(metrics), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error fetching metrics:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
} 