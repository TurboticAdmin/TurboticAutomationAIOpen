import { getDb } from "@/lib/db";

export default async function createExecutionHistory(payload: any) {
    // Cancel all previously queued executions
    await getDb().collection('execution_history').updateMany({
        executionId: payload.executionId,
        status: 'queued'
    }, {
        $set: {
            status: 'cancelled',
            error: 'New execution started'
        }
    });
    
    const res = await getDb().collection('execution_history').insertOne({
        ...payload
    });

    return {
        executionHistoryId: String(res.insertedId)
    };
}