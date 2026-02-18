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


    const logs: any[] = (await getDb().collection('execution_logs').find({
        executionId
    }).sort({ $natural: -1 }).toArray()).reverse();

    const processedLogs = logs.reduce((acc, log) => {
        if (Array.isArray(log?.logs)) {
            acc.push(...log.logs);
        }

        return acc;
    }, []);

    let hasFinished = true;
    let isErrored = false;
    let errorCode = 0;
    let latestLogs: string[] = [];

    if (processedLogs.length > 0) {
        for (const log of processedLogs.reverse()) {
            latestLogs.unshift(log);
            if (log === 'Triggered execution') {
                break;
            }
        }
    }

    if (latestLogs.length > 0) {
        if (!String(latestLogs[latestLogs.length - 1]).startsWith('Run complete with exit code')) {
            hasFinished = false;
        } else {
            isErrored = String(latestLogs[latestLogs.length - 1]) !== 'Run complete with exit code 0'
            if (isErrored === true) {
                errorCode = Number(String(latestLogs[latestLogs.length - 1]).split(' ')[5]);
            }
        }
    }

    // Execution tracking removed - notifications handled by execution-history endpoint

    // Get executionHistoryId from the latest log record
    let executionHistoryId: string | null = null;
    let outputFiles: any[] = [];
    if (logs.length > 0) {
        executionHistoryId = logs[logs.length - 1]?.executionHistoryId || null;
    }

    // add logic to send the output files in the latest logs
    if (executionHistoryId) {
        const executionHistory = await getDb().collection('execution_history').findOne({
            _id: new ObjectId(String(executionHistoryId))
        });
        outputFiles = executionHistory?.outputFiles || [];

        // console.log(`Output files: ${outputFiles}`);
    }

    return new Response(JSON.stringify({
        latestLogs,
        hasFinished,
        isErrored,
        errorCode,
        executionHistoryId,
        outputFiles
    }), {
        headers: {
            'Content-Type': 'application/json'
        }
    });
}
