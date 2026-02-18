import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db';
import { ObjectId } from 'mongodb';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const { automationId, deviceId } = await req.json();

        if (!id || !automationId || !deviceId) {
            return new Response(JSON.stringify({ 
                error: 'executionId, automationId, and deviceId are required' 
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Find the execution record
        const execution = await getDb().collection('executions').findOne({
            _id: ObjectId.createFromHexString(id),
            automationId: automationId,
            deviceId: deviceId
        });

        if (!execution) {
            return new Response(JSON.stringify({ 
                podExists: false, 
                podRunning: false,
                reason: 'Execution not found for this automation and device combination'
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Check if there's a deployment name (indicating a pod was created)
        if (!execution.deploymentName) {
            return new Response(JSON.stringify({ 
                podExists: false, 
                podRunning: false,
                reason: 'No deployment created for this execution'
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // For now, we'll assume the pod exists if there's a deployment name
        // In a real implementation, you would check the actual Kubernetes pod status
        // This is a simplified version - you might want to add actual Kubernetes API calls
        
        const podExists = true; // Simplified - assume pod exists if deployment name exists
        const podRunning = execution.isEnvActive === true; // Check if execution is marked as active

        return new Response(JSON.stringify({ 
            podExists, 
            podRunning,
            deploymentName: execution.deploymentName,
            isEnvActive: execution.isEnvActive
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('[Pod Status] Error:', error);
        return new Response(JSON.stringify({ 
            error: 'Internal server error',
            podExists: false,
            podRunning: false
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
} 