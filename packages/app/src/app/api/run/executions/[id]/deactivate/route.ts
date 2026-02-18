import { getDb } from "@/lib/db";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import amqplib from 'amqplib';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const { automationId, deviceId, keepPodActive = false } = await req.json();

        if (!id || !automationId || !deviceId) {
            return new Response(JSON.stringify({ 
                error: 'executionId, automationId, and deviceId are required' 
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Find and update the execution record - only match by ID since deviceId might be different
        // Only set isEnvActive to false if keepPodActive is false (to keep pod running for reuse)
        const updateData: any = {};
        if (!keepPodActive) {
            updateData.isEnvActive = false;
        }
        
        const result = await getDb().collection('executions').updateOne(
            {
                _id: ObjectId.createFromHexString(id)
            },
            { $set: updateData }
        );

        // Also update the execution history status to 'stopped'
        try {
            const historyResult = await getDb().collection('execution_history').updateMany(
                {
                    executionId: id,
                    automationId: automationId,
                    status: { $in: ['running', 'pending'] } // Only update if still running or pending
                },
                { 
                    $set: { 
                        status: 'stopped',
                        endedAt: new Date(),
                        errorMessage: 'Execution stopped by user'
                    }
                }
            );

            // Calculate duration for updated records
            if (historyResult.modifiedCount > 0) {
                const histories = await getDb().collection('execution_history').find({
                    executionId: id,
                    automationId: automationId,
                    status: 'stopped'
                }).toArray();

                for (const history of histories) {
                    if (history.startedAt) {
                        try {
                            const startTime = history.startedAt instanceof Date ? history.startedAt : new Date(history.startedAt);
                            if (!isNaN(startTime.getTime())) {
                                const endTime = new Date();
                                const durationMs = endTime.getTime() - startTime.getTime();

                                await getDb().collection('execution_history').updateOne(
                                    { _id: history._id },
                                    { $set: { duration: durationMs } }
                                );
                            }
                        } catch (error) {
                            console.warn('Failed to calculate duration for history:', history._id, error);
                        }
                    }
                }
            }

        } catch (historyError) {
            console.error('❌ [Deactivate] Error updating execution history:', historyError);
            // Don't fail the entire request if history update fails
        }

        // Send stop message to RabbitMQ
        try {
            const RABBIT_MQ_ENDPOINT = process.env.RABBIT_MQ_ENDPOINT;
            if (RABBIT_MQ_ENDPOINT) {
                const queueName = `executionq-${id}`;
                const conn = await amqplib.connect(RABBIT_MQ_ENDPOINT);
                const channel = await conn.createChannel();
                
                // Use the same queue declaration parameters as the script runner
                await channel.assertQueue(queueName, {
                    durable: true,
                    expires: 60000, // 60 seconds
                    maxLength: 1,
                    arguments: {
                        'x-overflow': 'drop-head'
                    }
                });
                
                await channel.sendToQueue(queueName, Buffer.from(JSON.stringify({ type: 'stop' })), { persistent: true });
                await channel.close();
                await conn.close();
            } else {
                console.warn('⚠️ [Deactivate] RABBIT_MQ_ENDPOINT not set, cannot send stop message');
            }
        } catch (err) {
            console.error('❌ [Deactivate] Failed to send stop message to RabbitMQ:', err);
        }

        if (result.matchedCount === 0) {
            console.log(`⚠️ [Deactivate] No execution found for ID: ${id}`);
            return new Response(JSON.stringify({ 
                success: false,
                message: 'Execution not found'
            }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (result.modifiedCount === 0) {
            return new Response(JSON.stringify({ 
                success: true,
                message: 'Execution was already inactive'
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({ 
            success: true,
            message: 'Execution deactivated successfully'
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ 
            error: 'Internal server error',
            details: error instanceof Error ? error.message : 'Unknown error'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
} 