import { getDb } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { isValidObjectId } from "@/app/api/automations/[id]/route";
import authenticationBackend from "@/app/api/authentication/authentication-backend";
import { AzureChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";
import { getModelConfig } from "@/app/api/web-summary/util";


// Generate execution summary using Azure OpenAI
async function getSummary(automationCode: string, executionLogs: string[]): Promise<string> {
    try {
        const model = new AzureChatOpenAI(await getModelConfig());

        const logsText = executionLogs.join('\n');

        const prompt = `You are an expert automation execution analyst. Analyze the automation code and its execution logs to provide a step-by-step summary of what happened during the automation run.

Automation Code:
${automationCode}

Execution Logs:
${logsText}

Generate a concise, human-readable summary describing what the automation accomplished based on both:
- the automations intended purpose (from the code)
- the actual execution results (from the logs)
 
Instructions:
1. Understand from the automation code what its main goal is (e.g., send emails, sync contacts, update records, generate reports, etc.).
2. From the logs, extract only the final results that reflect whether those goals were achieved.
3. Ignore all low-level or technical steps (e.g., installations, dependency warnings, npm audits, debug info).
4. Express the summary as short bullet points describing only the *meaningful outcomes*.
5. End with one final line indicating overall status:
   - “✅ Run completed successfully” if exit code = 0
   - “❌ Run failed (Exit code X)” if exit code ≠ 0
6. Keep language user-friendly and outcome-focused — describe it as what the automation *did* or *failed to do*, not how.
 
Example outputs:
 
✅ Success:
• Added 3 new HubSpot contacts  
• Sent 3 welcome emails  
✅ Run completed successfully
 
❌ Failure:
• Tried to send 5 campaign emails  
• Failed to authenticate with SendGrid  
❌ Run failed (Exit code 1)`;

        const response = await model.invoke([
            new SystemMessage({
                content: prompt
            })
        ]);

        return response.content as string;
    } catch (error) {
        console.error('Error generating execution summary:', error);
        return `Failed to generate summary: ${error instanceof Error ? error.message : 'Unknown error'}`;
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
        const automationId = String(searchParams.get('automationId'));
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
        const executionLogs: any[] = (await getDb().collection('execution_logs').find({ executionHistoryId: String(id) }).sort({ $natural: -1 }).toArray()).reverse();
        if (!executionLogs) {
            return NextResponse.json({ error: 'Execution history not found' }, { status: 404 });
        }
        if (executionLogs.length === 0) {
            return NextResponse.json({ error: 'Execution history not found' }, { status: 404 });
        }
        const processedLogs: any = executionLogs.reduce((acc, log) => {
            if (Array.isArray(log?.logs)) {
                acc.push(...log.logs);
            }
            return acc;
        }, []);
        let latestLogs: string[] = [];
        if (processedLogs.length > 0) {
            for (const log of processedLogs.reverse()) {
                latestLogs.unshift(log);
                if (log === 'Triggered execution') {
                    break;
                }
            }
        }

        const automation = await getDb().collection('automations').findOne({
            _id: ObjectId.createFromHexString(automationId)
        });
        if (!automation) {
            return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
        }

        // For v3 automations, code is in individual steps, not automation.code
        // Combine all step codes for the summary
        let automationCode = automation.code || '';
        if ((!automationCode || automationCode === '') && automation.v3Steps && Array.isArray(automation.v3Steps)) {
            automationCode = automation.v3Steps
                .map((step: any, index: number) => `// Step ${index + 1}: ${step.name || 'Unnamed Step'}\n${step.code || ''}`)
                .join('\n\n');
        }

        if (!automationCode || automationCode === '') {
            return NextResponse.json({ error: 'Automation code not found' }, { status: 404 });
        }

        // Generate AI summary of the execution logs based on automation code
        const summary = await getSummary(automationCode, latestLogs);
        // add logic to send the output files in the latest logs

        const executionHistory: any = await getDb().collection('execution_history').findOne({
            _id: new ObjectId(String(id))
        });
        const outputFiles: any = executionHistory?.outputFiles || [];

        return NextResponse.json({
            summary,
            logs: latestLogs,
            automationId: automationId,
            executionHistoryId: id,
            outputFiles: outputFiles
        });
    } catch (error) {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}