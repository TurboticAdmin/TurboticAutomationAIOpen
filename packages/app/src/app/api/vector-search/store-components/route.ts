import { NextRequest } from "next/server";
import { storeAutomationComponents } from "@/app/api/vector-search/vector-search";

export async function POST(req: NextRequest) {
    try {
        const { automationId, script ,workspaceId } = await req.json();

        if (!automationId || !script) {
            return new Response(JSON.stringify({ 
                error: 'automationId and script are required' 
            }), { 
                headers: { 'Content-Type': 'application/json' }, 
                status: 400     
            });
        }

        // Store automation components in vector search
        await storeAutomationComponents(
            automationId,
            script,
            workspaceId
        );

        return new Response(JSON.stringify({ 
            success: true, 
            message: 'Components stored successfully' 
        }), { 
            headers: { 'Content-Type': 'application/json' }, 
            status: 200 
        });

    } catch (error: any) {
        console.error('Error storing automation components:', error);
        return new Response(JSON.stringify({ 
            error: 'Failed to store components',
            details: error.message 
        }), { 
            headers: { 'Content-Type': 'application/json' }, 
            status: 500 
        });
    }
}
