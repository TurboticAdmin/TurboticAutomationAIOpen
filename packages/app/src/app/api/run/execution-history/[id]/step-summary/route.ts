import { getDb } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { isValidObjectId } from "@/app/api/automations/[id]/route";
import authenticationBackend from "@/app/api/authentication/authentication-backend";
import { AzureChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { getModelConfig } from "@/app/api/web-summary/util";


// Generate step summary using Azure OpenAI
async function getStepSummary(
    stepId: string,
    stepStatus: string,
    stepName: string,
    stepDescription: string,
    automationCode: string,
    executionLogs: string[]
): Promise<string> {
    try {
        const model = new AzureChatOpenAI(await getModelConfig());

        const logsText = executionLogs.length > 0 ? executionLogs.join('\n') : 'No logs available for this step';

        const statusDescription = {
            'pending': 'Step was queued but not yet executed',
            'running': 'Step is currently executing',
            'completed': 'Step has successfully completed',
            'failed': 'Step encountered an error and could not complete',
            'cancelled': 'Step was stopped due to user intervention or a previous failure'
        }[stepStatus] || 'Unknown status';

        const prompt = `You are an expert automation execution analyst. Analyze a specific step in the automation workflow and provide a detailed summary of what happened.

Step Information:
- Step ID: ${stepId}
- Step Name: ${stepName || 'Unnamed Step'}
- Step Status: ${stepStatus} (${statusDescription})
- Step Description: ${stepDescription || 'No description available'}

Automation Code:
${automationCode}

Step Execution Logs:
${logsText}

Generate a detailed, human-readable summary describing what this specific step accomplished during the automation run.

Instructions:
1. Focus ONLY on this specific step and its activities (identified by stepId: ${stepId}).
2. Analyze the logs to determine what this step actually did (e.g., extracted data, made API calls, processed files, etc.).
3. Ignore logs and activities from other steps in the workflow.
4. If the step has 'failed' or 'cancelled' status, provide specific details about what went wrong based on the logs.
5. If logs are sparse or unavailable, infer likely actions based on the step description and automation code.
6. Format the summary as bullet points describing the actual outcomes and actions.
7. Keep the summary concise but informative - users should understand exactly what happened with this step.

Example outputs:

Completed Step:
• Authenticated with HubSpot API using credentials from environment variables
• Retrieved 25 contacts from the "Sales Leads" list
• Parsed contact data and extracted email addresses
• Validated all email addresses are in correct format
• Successfully retrieved contact data without errors

Failed Step:
• Attempted to authenticate with external API
• Received authentication error: "Invalid API key"
• Step execution halted due to authentication failure
• No data was retrieved from the API

Generate the summary now:`;

        const response = await model.invoke([
            new SystemMessage({
                content: prompt
            })
        ]);

        return response.content as string;
    } catch (error) {
        console.error('Error generating step summary:', error);
        return `Failed to generate step summary: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let currentUser: any;
    try {
        currentUser = await authenticationBackend.getCurrentUser(req);
        if (!currentUser) {
            return new Response(JSON.stringify({ error: 'Authentication required' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 401
            });
        }

        const { id } = await params;
        const { searchParams } = new URL(req.url);
        
        const stepId = String(searchParams.get('stepId'));
        const stepStatus = String(searchParams.get('stepStatus'));
        const automationId = String(searchParams.get('automationId'));
        const runTokenId = String(searchParams.get('runTokenId'));

        // Validate required parameters
        if (!stepId) {
            return new Response(JSON.stringify({ error: 'stepId is required' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 400
            });
        }

        if (!stepStatus) {
            return new Response(JSON.stringify({ error: 'stepStatus is required' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 400
            });
        }

        if (!isValidObjectId(automationId)) {
            return new Response(JSON.stringify({ error: 'Invalid automation ID format' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 400
            });
        }

        if (!isValidObjectId(id)) {
            return new Response(JSON.stringify({ error: 'Invalid execution history ID format' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 400
            });
        }

        // Get the automation to retrieve the workflow and code
        const automation = await getDb().collection('automations').findOne({
            _id: ObjectId.createFromHexString(automationId)
        });

        if (!automation) {
            return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
        }

        // Get the step information from the workflow
        let stepInfo: any = null;
        if (automation.v3Steps && Array.isArray(automation.v3Steps)) {
            stepInfo = automation.v3Steps.find((step: any) => step.id === stepId);
        }

        if (!stepInfo) {
            return NextResponse.json({ error: 'Step not found in automation' }, { status: 404 });
        }

        // For v3 automations, code is in individual steps, not automation.code
        const automationCode = stepInfo.code || automation.code || 'No code available';

        if (!automationCode || automationCode === '') {
            return NextResponse.json({ error: 'Step code not found' }, { status: 404 });
        }

        // Get execution logs for this execution history
        const executionLogs: any[] = await getDb().collection('execution_logs').find({ 
            executionHistoryId: String(id) 
        }).sort({ $natural: -1 }).toArray();

        // Process logs to extract relevant ones
        const processedLogs: any = executionLogs.reduce((acc, log) => {
            if (Array.isArray(log?.logs)) {
                acc.push(...log.logs);
            }
            return acc;
        }, []);

        // Filter logs to get relevant logs for this specific step
        // Try to match logs that might be related to this step
        let relevantLogs: string[] = [];
        if (processedLogs.length > 0) {
            relevantLogs = processedLogs
                .filter((log: any) => {
                    const logStr = String(log);
                    // Look for logs that might be related to this step
                    // This is a simple heuristic - can be improved
                    return logStr.toLowerCase().includes(stepInfo.name?.toLowerCase() || '') ||
                           logStr.toLowerCase().includes(stepInfo.description?.toLowerCase() || '');
                })
                .slice(0, 20); // Limit to last 20 relevant logs
        }

        // If no specific logs found, use the most recent logs from the execution
        if (relevantLogs.length === 0 && processedLogs.length > 0) {
            relevantLogs = processedLogs.slice(-20); // Last 20 logs
        }

        // Generate AI summary of the step
        const summary = await getStepSummary(
            stepId,
            stepStatus,
            stepInfo.name || 'Unnamed Step',
            stepInfo.description || '',
            automationCode,
            relevantLogs
        );

        return NextResponse.json({
            summary,
            stepId,
            stepStatus,
            stepName: stepInfo.name,
            stepDescription: stepInfo.description,
            executionHistoryId: id,
            automationId: automationId,
            logs: relevantLogs
        });

    } catch (error) {
        console.error('Error in step summary API:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

