import { getDb } from "@/lib/db";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    // Check authentication - try header first, then body
    const headerApiKey = req.headers.get('turbotic-api-key');
    const bodyData = await req.json();
    const { executionHistoryId } = bodyData;
    
    const { id } = await params;
    
    if (!headerApiKey || !executionHistoryId) {
        return new Response(JSON.stringify({ error: 'API key and execution history ID are required' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 400
        });
    }
    const automation = await getDb().collection('automations').findOne({
        _id: ObjectId.createFromHexString(id),
        apiKey: headerApiKey
    });
    if (!automation) {
        return new Response(JSON.stringify({ error: 'Automation not found' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 404
        });
    }
    try {
    const logs: any[] = (await getDb().collection('execution_logs').find({
        executionHistoryId: executionHistoryId
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

    let outputFiles: any[] = [];
    // add logic to send the output files in the latest logs
    if (executionHistoryId) {
        const executionHistory = await getDb().collection('execution_history').findOne({
            _id: new ObjectId(String(executionHistoryId))
        });
        outputFiles = executionHistory?.outputFiles || [];

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
    } catch (error) {
        console.error('Error fetching logs:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 500
        });
    }
}
