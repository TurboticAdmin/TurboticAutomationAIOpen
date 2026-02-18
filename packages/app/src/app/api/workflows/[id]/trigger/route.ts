import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import authenticationBackend from "../../../authentication/authentication-backend";
import { Buffer } from 'buffer';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const currentUser = await authenticationBackend.getCurrentUser(req);

        if (!currentUser) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Subscription limits removed for open source

        const { id: workflowId } = await params;

        // Handle temporary workflow execution (for unsaved workflows)
        if (workflowId === 'temp') {
            const body = await req.json();
            const { workflowData } = body;
            
            if (!workflowData || !workflowData.nodes || !workflowData.edges) {
                return new Response(JSON.stringify({ error: 'Invalid workflow data' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            // Create execution record for temporary workflow
            const executionData = {
                workflowId: 'temp',
                status: 'running',
                startedAt: new Date(),
                completedAt: null,
                error: null,
                results: [],
                createdBy: String(currentUser._id),
                workspaceId: currentUser.workspace ? String(currentUser.workspace._id) : undefined
            };

            const executionResult = await getDb().collection('workflow_executions').insertOne(executionData);
            const executionId = executionResult.insertedId.toString();

            try {
                await executeWorkflow(workflowData, executionId, currentUser, req);

                // Subscription tracking removed for open source
            } catch (error: any) {
                console.error('Temporary workflow execution error:', error);
                await getDb().collection('workflow_executions').updateOne(
                    { _id: executionResult.insertedId },
                    {
                        $set: {
                            status: 'failed',
                            completedAt: new Date(),
                            error: error?.message || 'Unknown error'
                        }
                    }
                );
            }

            return new Response(JSON.stringify({
                executionId,
                status: 'started',
                message: 'Workflow execution started successfully. Check logs for real-time progress.'
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Find the workflow
        const filter: any = {
            _id: ObjectId.createFromHexString(workflowId),
            createdBy: String(currentUser._id)
        };

        // Reuse workspaceId from limit check above (already validated)
        if (workspaceId) {
            filter.workspaceId = workspaceId;
        }

        const workflow = await getDb().collection('workflows').findOne(filter);

        if (!workflow) {
            return new Response(JSON.stringify({ error: 'Workflow not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (workflow.status !== 'active') {
            return new Response(JSON.stringify({ error: 'Workflow is not active' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Create execution record
        const executionData = {
            workflowId: workflow._id,
            status: 'running',
            startedAt: new Date(),
            completedAt: null,
            error: null,
            results: [],
            createdBy: String(currentUser._id),
            workspaceId: currentUser.workspace ? String(currentUser.workspace._id) : undefined
        };

        const executionResult = await getDb().collection('workflow_executions').insertOne(executionData);
        const executionId = executionResult.insertedId.toString();

        // Start workflow execution (this would be handled by a background job in production)
        // For now, we'll simulate the execution
        try {
            await executeWorkflow(workflow, executionId, currentUser, req);

            // Subscription tracking removed for open source
        } catch (error: any) {
            console.error('Workflow execution error:', error);
            // Update execution with error
            await getDb().collection('workflow_executions').updateOne(
                { _id: executionResult.insertedId },
                {
                    $set: {
                        status: 'failed',
                        completedAt: new Date(),
                        error: error?.message || 'Unknown error'
                    }
                }
            );
        }

        return new Response(JSON.stringify({
            executionId,
            status: 'started'
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error triggering workflow:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// Helper function to execute workflow
async function executeWorkflow(workflow: any, executionId: string, currentUser: any, req: NextRequest) {
    const { nodes, edges } = workflow;
    
    // Find trigger node
    const triggerNode = nodes.find((node: any) => node.type === 'trigger');
    if (!triggerNode) {
        throw new Error('No trigger node found');
    }

    // Execute workflow nodes in order
    const executionResults: any[] = [];
    const visitedNodes = new Set<string>();
    
    // Start from trigger node
    await executeNode(triggerNode, nodes, edges, executionResults, visitedNodes, currentUser, req);

    // Update execution record
    await getDb().collection('workflow_executions').updateOne(
        { _id: ObjectId.createFromHexString(executionId) },
        {
            $set: {
                status: 'completed',
                completedAt: new Date(),
                results: executionResults
            }
        }
    );

    // Update workflow stats
    await getDb().collection('workflows').updateOne(
        { _id: workflow._id },
        {
            $inc: { totalRuns: 1, successfulRuns: 1 },
            $set: { lastRun: new Date() }
        }
    );
}

// Helper function to execute a single node
async function executeNode(node: any, nodes: any[], edges: any[], results: any[], visited: Set<string>, currentUser: any, req: NextRequest) {
    if (visited.has(node.id)) {
        return; // Prevent infinite loops
    }
    visited.add(node.id);

    let nodeResult: any = { 
        nodeId: node.id, 
        nodeType: node.type, 
        nodeName: node.data?.label || node.data?.automationName || node.type,
        success: true 
    };

    try {
        switch (node.type) {
            case 'trigger':
                // Trigger nodes don't need execution
                nodeResult.message = `Trigger activated: ${node.data?.triggerType || 'manual'} trigger`;
                break;

            case 'automation':
                // Execute the automation
                const automationId = node.data.automationId;
                if (automationId) {
                    nodeResult.message = `Starting automation: ${node.data?.automationName || 'Unknown automation'}`;
                    const automationResult = await executeAutomation(automationId, currentUser, req);
                    nodeResult.automationResult = automationResult;
                    nodeResult.message = `Automation completed: ${automationResult?.message || 'Success'}`;
                    
                    // Include the automation logs in the node result
                    if (automationResult?.logs && Array.isArray(automationResult.logs)) {
                        nodeResult['logs'] = automationResult.logs;
                        console.log(`[Workflow] Added ${automationResult.logs.length} logs to node result for automation: ${automationId}`);
                    }
                } else {
                    nodeResult.message = 'No automation selected';
                }
                break;

            case 'condition':
                // Evaluate condition
                const condition = node.data.condition;
                if (condition) {
                    // Simple condition evaluation (in production, use a proper expression evaluator)
                    const result = evaluateCondition(condition, results);
                    nodeResult.conditionResult = result;
                    
                    // Find next nodes based on condition result
                    const nextNodes = findNextNodes(node.id, edges, result ? 'true' : 'false');
                    for (const nextNodeId of nextNodes) {
                        const nextNode = nodes.find((n: any) => n.id === nextNodeId);
                        if (nextNode) {
                            await executeNode(nextNode, nodes, edges, results, visited, currentUser, req);
                        }
                    }
                }
                break;

            default:
                nodeResult.message = `Unknown node type: ${node.type}`;
        }
    } catch (error: any) {
        nodeResult.success = false;
        nodeResult.error = error?.message || 'Unknown error';
    }

    results.push(nodeResult);

    // Find and execute next nodes (for non-condition nodes)
    if (node.type !== 'condition') {
        const nextNodes = findNextNodes(node.id, edges);
        for (const nextNodeId of nextNodes) {
            const nextNode = nodes.find((n: any) => n.id === nextNodeId);
            if (nextNode) {
                await executeNode(nextNode, nodes, edges, results, visited, currentUser, req);
            }
        }
    }
}

// Helper function to find next nodes
function findNextNodes(nodeId: string, edges: any[], condition?: string): string[] {
    return edges
        .filter((edge: any) => {
            if (edge.source === nodeId) {
                if (condition && edge.sourceHandle) {
                    return edge.sourceHandle === condition;
                }
                return true;
            }
            return false;
        })
        .map((edge: any) => edge.target);
}

// Helper function to execute an automation
async function executeAutomation(automationId: string, currentUser: any, req: NextRequest) {
    try {
        // Get the automation to retrieve its API key
        const automation = await getDb().collection('automations').findOne({
            _id: ObjectId.createFromHexString(automationId),
            createdBy: String(currentUser._id)
        });

        if (!automation) {
            throw new Error('Automation not found or access denied');
        }

        // Use the existing execution route instead of the automation trigger
        // Pass the authentication headers from the original request
        const authHeaders: Record<string, string> = {
            'Content-Type': 'application/json'
        };
        
        // Copy authentication headers from the original request
        const cookie = req.headers.get('cookie');
        if (cookie) {
            authHeaders['cookie'] = cookie;
            console.log(`[Workflow] Passing cookie header: ${cookie.substring(0, 50)}...`);
        } else {
            console.log(`[Workflow] No cookie header found in original request`);
        }
        
        const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || (process.env.PUBLIC_HOSTNAME ? `https://${process.env.PUBLIC_HOSTNAME}` : 'http://localhost:3000')}/api/run/executions`, {
            method: 'POST',
            headers: authHeaders,
            body: JSON.stringify({
                automationId: automationId,
                dId: automation.dId || `workflow-device-${Date.now()}`,
                environmentVariables: automation.environmentVariables || [],
                forceFreshCode: true,
                docVersion: automation.docVersion || null
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Automation execution failed: ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();
        
        // The execution route returns a different format, so we need to adapt it
        const adaptedResult: any = {
            executionId: result.executionId,
            historyId: result.historyId,
            status: result.status || 'ready',
            message: `Automation execution ${result.status === 'ready' ? 'started' : result.status}`,
            logs: []
        };
        
        // If we have a historyId, poll for logs until completion
        if (result.historyId) {
            try {
                console.log(`[Workflow] Polling for logs from automation execution using historyId: ${result.historyId}`);
                
                // Poll for logs until the automation completes (max 5 minutes)
                const maxPollTime = 5 * 60 * 1000; // 5 minutes
                const pollInterval = 2000; // 2 seconds
                const startTime = Date.now();
                let logs: string[] = [];
                let finalStatus = 'running';
                
                while (Date.now() - startTime < maxPollTime) {
                    // Wait before polling
                    await new Promise(resolve => setTimeout(resolve, pollInterval));
                    
                    // Fetch logs from the automation execution using historyId
                    console.log(`[Workflow] Making logs request to: /api/dashboard/executions/${result.historyId}/logs`);
                    console.log(`[Workflow] Auth headers:`, Object.keys(authHeaders));
                    
                    const logsResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || (process.env.PUBLIC_HOSTNAME ? `https://${process.env.PUBLIC_HOSTNAME}` : 'http://localhost:3000')}/api/dashboard/executions/${result.historyId}/logs`, {
                        headers: authHeaders
                    });
                    
                    if (logsResponse.ok) {
                        const logsData = await logsResponse.json();
                        if (logsData.logs && Array.isArray(logsData.logs)) {
                            logs = logsData.logs;
                            console.log(`[Workflow] Retrieved ${logs.length} logs from automation execution`);
                        }
                        
                        // Check if execution is completed
                        if (logsData.execution && (logsData.execution.status === 'completed' || logsData.execution.status === 'failed')) {
                            console.log(`[Workflow] Automation execution completed with status: ${logsData.execution.status}`);
                            finalStatus = logsData.execution.status; // Track final status
                            break;
                        }
                    } else {
                        console.log(`[Workflow] Failed to fetch logs, status: ${logsResponse.status}`);
                    }
                }
                
                adaptedResult.logs = logs;
                adaptedResult.status = finalStatus; // Set final status
                console.log(`[Workflow] Final logs for automation: ${logs.length} entries, status: ${finalStatus}`);
                
            } catch (logError) {
                console.error('Error polling automation logs:', logError);
                // Don't fail the automation if we can't get logs
            }
        }
        
        return adaptedResult;
    } catch (error) {
        console.error('Error executing automation:', error);
        throw error;
    }
}

// Advanced condition evaluator with support for complex logic
function evaluateCondition(condition: string, results: any[], context: any = {}): boolean {
    try {
        // Create a safe evaluation context
        const evalContext = {
            // Previous results
            results,
            // Latest result
            lastResult: results.length > 0 ? results[results.length - 1] : null,
            // Context data
            ...context,
            // Helper functions
            hasError: () => results.some(r => !r.success),
            hasSuccess: () => results.some(r => r.success),
            countSuccess: () => results.filter(r => r.success).length,
            countErrors: () => results.filter(r => !r.success).length,
            // String helpers
            contains: (str: string, substr: string) => str?.includes(substr) || false,
            startsWith: (str: string, prefix: string) => str?.startsWith(prefix) || false,
            endsWith: (str: string, suffix: string) => str?.endsWith(suffix) || false,
            // Number helpers
            isGreater: (a: number, b: number) => a > b,
            isLess: (a: number, b: number) => a < b,
            isEqual: (a: any, b: any) => a === b,
            // Array helpers
            arrayLength: (arr: any[]) => arr?.length || 0,
            arrayContains: (arr: any[], item: any) => arr?.includes(item) || false,
            // Boolean helpers
            and: (...args: boolean[]) => args.every(Boolean),
            or: (...args: boolean[]) => args.some(Boolean),
            not: (value: boolean) => !value
        };

        // Simple expression parser for common patterns
        const normalizedCondition = condition.toLowerCase().trim();
        
        // Handle common patterns
        if (normalizedCondition === 'true' || normalizedCondition === '1') return true;
        if (normalizedCondition === 'false' || normalizedCondition === '0') return false;
        
        // Check for error conditions
        if (normalizedCondition.includes('haserror') || normalizedCondition.includes('has_error')) {
            return evalContext.hasError();
        }
        
        if (normalizedCondition.includes('hassuccess') || normalizedCondition.includes('has_success')) {
            return evalContext.hasSuccess();
        }
        
        // Check for specific automation results
        if (normalizedCondition.includes('automation.success')) {
            const automationResults = results.filter(r => r.nodeType === 'automation' && r.success);
            return automationResults.length > 0;
        }
        
        if (normalizedCondition.includes('automation.failed')) {
            const automationResults = results.filter(r => r.nodeType === 'automation' && !r.success);
            return automationResults.length > 0;
        }
        
        // Check for specific data conditions
        if (normalizedCondition.includes('data.status') && evalContext.lastResult?.automationResult?.status) {
            const status = evalContext.lastResult.automationResult.status;
            if (normalizedCondition.includes('success')) return status === 'success';
            if (normalizedCondition.includes('error')) return status === 'error';
            if (normalizedCondition.includes('pending')) return status === 'pending';
        }
        
        // Check for count conditions
        const countMatch = normalizedCondition.match(/(\w+)\.count\s*[><=]\s*(\d+)/);
        if (countMatch) {
            const [, type, operator, count] = countMatch;
            const actualCount = type === 'success' ? evalContext.countSuccess() : evalContext.countErrors();
            const targetCount = parseInt(count);
            
            switch (operator) {
                case '>': return actualCount > targetCount;
                case '<': return actualCount < targetCount;
                case '>=': return actualCount >= targetCount;
                case '<=': return actualCount <= targetCount;
                case '=': return actualCount === targetCount;
                default: return false;
            }
        }
        
        // For complex expressions, use a whitelist-based safe evaluator
        // SECURITY: Do NOT use Function constructor as it allows arbitrary code execution
        try {
            // Whitelist of allowed operations and patterns
            const allowedPatterns = [
                /^context\.(lastResult|results|hasError|hasSuccess|countSuccess|countErrors)\(\)$/,
                /^context\.results\[\d+\](\.\w+)*$/,
                /^context\.lastResult(\.\w+)*$/,
            ];

            // Check if condition matches any allowed pattern
            const trimmedCondition = condition.trim();
            const isAllowed = allowedPatterns.some(pattern => pattern.test(trimmedCondition));

            if (!isAllowed) {
                console.warn('Unsafe condition expression detected:', condition);
                // Fall back to simple string matching for safety
                return normalizedCondition.includes('true') || normalizedCondition.includes('success');
            }

            // Only evaluate if it's in our whitelist
            const safeEval = new Function('context', `return ${trimmedCondition}`);
            return Boolean(safeEval(evalContext));
        } catch {
            // If complex evaluation fails, fall back to simple string matching
            return normalizedCondition.includes('true') || normalizedCondition.includes('success');
        }
        
    } catch (error) {
        console.error('Error evaluating condition:', error);
        return false;
    }
} 