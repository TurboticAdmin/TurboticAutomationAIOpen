import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        
        if (!id || !ObjectId.isValid(id)) {
            return new Response(JSON.stringify({ error: 'Invalid executionId' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 400
            });
        }

        const db = getDb();
        
        // Get execution record
        const execution = await db.collection('executions').findOne({
            _id: ObjectId.createFromHexString(id)
        });

        if (!execution) {
            return new Response(JSON.stringify({ error: 'Execution not found' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 404
            });
        }

        // Get execution history
        let history = null;
        if (execution.historyId && ObjectId.isValid(execution.historyId)) {
            history = await db.collection('execution_history').findOne({
                _id: ObjectId.createFromHexString(execution.historyId)
            });
        }

        // Get logs
        const logs = await db.collection('execution_logs').find({
            executionId: id
        }).sort({ createdAt: 1 }).toArray();

        const processedLogs = logs.reduce((acc: string[], log) => {
            if (Array.isArray(log?.logs)) {
                acc.push(...log.logs);
            }
            return acc;
        }, []);

        // Determine status
        let status = 'unknown';
        let hasFinished = false;
        let isErrored = false;
        let exitCode = null;
        let errorMessage = null;
        let duration = null;

        if (history) {
            status = history.status;
            hasFinished = history.status !== 'running';
            isErrored = history.status === 'failed' || (history.exitCode !== null && history.exitCode !== 0);
            exitCode = history.exitCode;
            errorMessage = history.errorMessage;
            
            if (history.startedAt && history.endedAt) {
                duration = history.endedAt.getTime() - history.startedAt.getTime();
            }
        }

        // Get automation details
        let automation = null;
        if (execution.automationId) {
            automation = await db.collection('automations').findOne({
                _id: ObjectId.createFromHexString(execution.automationId)
            });
        }

        return new Response(JSON.stringify({
            executionId: id,
            automationId: execution.automationId,
            deviceId: execution.deviceId,
            automationTitle: automation?.title || 'Unknown Automation',
            status: status,
            hasFinished: hasFinished,
            isErrored: isErrored,
            exitCode: exitCode,
            errorMessage: errorMessage,
            duration: duration,
            startedAt: history?.startedAt,
            endedAt: history?.endedAt,
            logs: processedLogs,
            historyId: execution.historyId
        }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Error fetching execution status:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 500
        });
    }
} 