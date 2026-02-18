import { getDb } from "@/lib/db";
import { NextRequest } from "next/server";
import { ObjectId } from "mongodb";
import { authenticateDashboardAccess, createDashboardAuthErrorResponse } from "@/lib/dashboard-auth";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    // Check dashboard authentication (user auth + allowlist)
    const authResult = await authenticateDashboardAccess(req);
    if (!authResult.success) {
        return createDashboardAuthErrorResponse(authResult);
    }

    const { id } = await params;

    if (!id) {
        return new Response("Execution ID is required", {
            status: 400
        });
    }

    try {
        // First, check if this is a workflow execution
        const workflowExecution = await getDb().collection('workflow_executions').findOne({
            _id: ObjectId.createFromHexString(id)
        });

        if (workflowExecution) {
            // This is a workflow execution - get logs from all automation executions within this workflow
            const logs: string[] = [];
            
            // Add workflow start log
            logs.push(`[WORKFLOW] Execution started at ${workflowExecution.startedAt}`);
            
            if (workflowExecution.results && Array.isArray(workflowExecution.results)) {
                for (const result of workflowExecution.results) {
                    const nodeType = result.nodeType?.toUpperCase() || 'UNKNOWN';
                    const nodeName = result.nodeName || 'Unknown Node';
                    logs.push(`[${nodeType}] ${nodeName}: ${result.message || 'Executed'}`);
                    
                    if (result.automationResult) {
                        logs.push(`  └─ Automation ID: ${result.automationResult.executionId || 'N/A'}`);
                        logs.push(`  └─ Status: ${result.automationResult.status || 'Unknown'}`);
                        
                        // If there are actual automation logs, include them
                        if (result.automationResult.logs && Array.isArray(result.automationResult.logs)) {
                            result.automationResult.logs.forEach((log: string) => {
                                logs.push(`    └─ ${log}`);
                            });
                        }
                    }
                    
                    if (result.conditionResult !== undefined) {
                        logs.push(`  └─ Condition result: ${result.conditionResult}`);
                    }
                    
                    if (result.error) {
                        logs.push(`  └─ ERROR: ${result.error}`);
                    }
                }
            }
            
            if (workflowExecution.completedAt) {
                logs.push(`[WORKFLOW] Execution completed at ${workflowExecution.completedAt}`);
            } else if (workflowExecution.status === 'failed') {
                logs.push(`[WORKFLOW] Execution failed: ${workflowExecution.error || 'Unknown error'}`);
            } else {
                logs.push('[WORKFLOW] Execution is still running...');
            }

            return new Response(JSON.stringify({
                logs: logs,
                execution: {
                    id: workflowExecution._id,
                    type: 'workflow',
                    status: workflowExecution.status || 'running',
                    startedAt: workflowExecution.startedAt,
                    completedAt: workflowExecution.completedAt,
                    error: workflowExecution.error,
                    results: workflowExecution.results
                }
            }), {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }

        // Check if this is a regular automation execution
        const execution = await getDb().collection('execution_history').findOne({
            _id: ObjectId.createFromHexString(id)
        });

        if (!execution) {
            return new Response("Execution not found", {
                status: 404
            });
        }

        // For dashboard presentation, prioritize execution_history_logs for completed executions
        // For running executions, fall back to execution_logs
        let processedLogs: string[] = [];

        // First try to get logs from execution_history_logs (for dashboard presentation)
        const historyLogs = await getDb().collection('execution_history_logs')
            .find({ executionHistoryId: String(execution._id) })
            .sort({ createdAt: 1 })
            .toArray();

        if (historyLogs.length > 0) {
            // Use execution_history_logs for dashboard presentation
            processedLogs = historyLogs.reduce((acc: string[], log) => {
                if (Array.isArray(log?.logs)) {
                    acc.push(...log.logs);
                }
                return acc;
            }, []);
        } else {
            // Fall back to execution_logs for running executions
            // Get the corresponding execution record from the executions collection
            const executionRecord = await getDb().collection('executions').findOne({
                automationId: execution.automationId,
                deviceId: execution.deviceId
            });

            if (executionRecord) {
                const executionLogs = await getDb().collection('execution_logs')
                    .find({ executionId: String(executionRecord._id) })
                    .sort({ createdAt: 1 })
                    .toArray();

                processedLogs = executionLogs.reduce((acc: string[], log) => {
                    if (Array.isArray(log?.logs)) {
                        acc.push(...log.logs);
                    }
                    return acc;
                }, []);
            }
        }

        return new Response(JSON.stringify({
            logs: processedLogs,
            execution: {
                id: execution._id,
                type: 'automation',
                automationId: execution.automationId,
                status: execution.status,
                startedAt: execution.startedAt,
                endedAt: execution.endedAt,
                duration: execution.duration,
                exitCode: execution.exitCode,
                errorMessage: execution.errorMessage
            }
        }), {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    } catch (error) {
        console.error('Error fetching dashboard logs:', error);
        return new Response("Internal server error", {
            status: 500
        });
    }
}