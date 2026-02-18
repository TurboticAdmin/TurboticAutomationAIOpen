import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { sendScheduledExecutionNotification } from "@/lib/execution-tracker";

export async function POST(req: NextRequest) {
    const { executionId, historyId } = await req.json();

    if (historyId) {
        const executionHistory = await getDb().collection('execution_history').findOne({
            _id: ObjectId.createFromHexString(historyId)
        });

        return new Response(JSON.stringify(executionHistory), {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    const executionHistory = await getDb().collection('execution_history').find({
        executionId,
        status: {
            $in: ['queued', 'running']
        }
    }).sort({ $natural: -1 }).limit(1).toArray();

    if (executionHistory?.length < 1) {
        return new Response(JSON.stringify({ error: 'Execution history not found' }), {
            status: 404
        });
    }
    
    return new Response(JSON.stringify(executionHistory[0]), {
        headers: {
            'Content-Type': 'application/json'
        }
    });
}

export async function PUT(req: NextRequest) {
    const { executionHistoryId, status, ...rest } = await req.json();

    // Get the current execution history to check if it's scheduled
    const currentHistory = await getDb().collection('execution_history').findOne({
        _id: ObjectId.createFromHexString(executionHistoryId)
    });

    if (!currentHistory) {
        return new Response(JSON.stringify({ error: 'Execution history not found' }), {
            status: 404
        });
    }

    const updateData: any = {};
    
    // Only update status if it's provided and not undefined
    if (status !== undefined) {
        updateData.status = status;
    }
    
    // Handle date fields
    if (rest.startedAt) {
        updateData.startedAt = rest.startedAt instanceof Date ? rest.startedAt : new Date(rest.startedAt);
    }
    if (rest.endedAt) {
        updateData.endedAt = rest.endedAt instanceof Date ? rest.endedAt : new Date(rest.endedAt);
    }
    
    // Handle other fields
    Object.keys(rest).forEach(key => {
        if (key !== 'startedAt' && key !== 'endedAt') {
            updateData[key] = rest[key];
        }
    });

    const executionHistory = await getDb().collection('execution_history').updateOne({
        _id: ObjectId.createFromHexString(executionHistoryId)
    }, {
        $set: updateData
    });

    if (!executionHistory) {
        return new Response(JSON.stringify({ error: 'Execution history not found' }), {
            status: 404
        });
    }

    // Send notification for scheduled executions when they complete
    if ((status === 'completed' || status === 'failed' || status === 'errored') && currentHistory.executionId) {
        
        // Check if this is a scheduled execution by looking at the isScheduled flag
        const isScheduled = currentHistory.isScheduled === true;
        
        if (isScheduled) {
            // Wait for exit code to appear before sending notification
            let flattenedLogs: string[] = [];
            const maxRetries = 10;
            const retryDelay = 2000;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {

                // Get the logs for the execution (using existing pattern)
                const logs = await getDb().collection('execution_logs').find({
                    executionId: currentHistory.executionId
                }).sort({ createdAt: 1 }).toArray();

                flattenedLogs = logs.reduce((acc: string[], log) => {
                    if (Array.isArray(log?.logs)) {
                        acc.push(...log.logs);
                    }
                    return acc;
                }, []);

                // Check if final execution exit code appears in logs (not installation)
                const hasExitCode = flattenedLogs.some(log =>
                    log.includes('Run complete with exit code')
                );

                if (hasExitCode) {
                    break;
                }

                if (attempt < maxRetries) {
                    await new Promise(resolve => setTimeout(resolve, retryDelay));
                }
            }

            await sendScheduledExecutionNotification(
                currentHistory.automationId,
                currentHistory.executionId,
                status,
                flattenedLogs,
                rest.exitCode
            );
        } else {
            console.log(`[Execution History PUT] Skipping notification for non-scheduled execution ${currentHistory.executionId}`);
        }
    }
    
    return new Response(JSON.stringify(executionHistory), {
        headers: {
            'Content-Type': 'application/json'
        }
    });
}


