import { NextRequest } from "next/server";
import { generateResponse } from "@/lib/game";

export async function POST(req: NextRequest) {
    const { code, output, automationId } = await req.json();

    if (!code || !output || !automationId) {
        return new Response('Missing required parameters: code, output, or automationId', { status: 400 });
    }

    try {
        // Extract only the last error message instead of all logs
        let lastError = '';
        
        // Look for the last error message in the output
        for (let i = output.length - 1; i >= 0; i--) {
            const log = output[i];
            // Check if this log contains an error (case insensitive)
            if (log.toLowerCase().includes('error') || 
                log.toLowerCase().includes('exception') || 
                log.toLowerCase().includes('failed') ||
                log.toLowerCase().includes('cannot') ||
                log.toLowerCase().includes('missing') ||
                log.toLowerCase().includes('undefined') ||
                log.toLowerCase().includes('null') ||
                log.toLowerCase().includes('syntax') ||
                log.toLowerCase().includes('reference') ||
                log.toLowerCase().includes('type') ||
                log.toLowerCase().includes('module not found') ||
                log.toLowerCase().includes('cannot find module') ||
                (log.toLowerCase().includes('exit code') && log.toLowerCase().includes('1'))) {
                lastError = log;
                break;
            }
        }
        
        // If no specific error found, use the last few logs (but not all)
        if (!lastError) {
            const lastFewLogs = output.slice(-3); // Take last 3 logs
            lastError = lastFewLogs.join('\n');
        }

        // Create a debug message that includes the code and only the last error
        const debugMessage = `The script is not working as expected. Here is the latest error:\n${lastError}\n\nPlease analyze the code and fix the error. If the issue is something I need to check outside of code, please let me know.`;

        // Use the existing generatePlan function with the debug message
        const stream = await generateResponse(automationId, debugMessage, undefined, undefined, code);

        return new Response(stream, {
            headers: {
                "Content-Type": "text/plain",
                "Transfer-Encoding": "chunked",
                "Cache-Control": "no-cache",
            }
        });
    } catch (e: any) {
        console.error('[Debug API] Error:', e);
        return new Response(e.message || 'Internal server error', { status: 500 });
    }
} 