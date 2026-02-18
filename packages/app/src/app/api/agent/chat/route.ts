import { NextRequest } from 'next/server';
import authenticationBackend from '../../authentication/authentication-backend';

export async function POST(req: NextRequest) {
    try {
        // Check authentication
        const currentUser = await authenticationBackend.getCurrentUser(req);
        if (!currentUser) {
            return new Response(JSON.stringify({ error: 'Authentication required' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const { message, tools = [], previousResponseId, functionCallOutputs = [] } = await req.json();

        // Allow empty message only if we have a previousResponseId (for continuing after function execution)
        if (!message && !previousResponseId) {
            return new Response(JSON.stringify({ error: 'Message is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Check if API key is configured
        if (!process.env.AZURE_OPENAI_API_KEY) {
            return new Response(JSON.stringify({ error: 'Azure OpenAI API key not configured' }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Build request body
        const requestBody: any = {
            model: 'gpt-4.1',
            stream: true,
            tools
        };

        const systemPrompt = { role: 'system', content: 'You are a helpful assistant. You must use the given tools and help you user with their request. You can retry upto 3 times if things does not go as expected. If the tool response is not satisfactory, you can retry upto 3 times without asking for confirmation.' };

        // Build input array
        // If we have function call outputs, use them as input (for continuing after function execution)
        // Otherwise, use the message as input
        if (functionCallOutputs && functionCallOutputs.length > 0) {
            // When continuing after function execution, input should be the function call outputs
            requestBody.input = [systemPrompt, ...functionCallOutputs, { role: 'user', content: 'Please retry any non satisfactory function calls.' }];
        } else if (message) {
            // For new messages, use the message as input
            requestBody.input = [systemPrompt, { role: 'user', content: message }];
        }

        // Add previous response ID for context chaining if provided
        if (previousResponseId) {
            requestBody.previous_response_id = previousResponseId;
        }

        // Make request to Azure OpenAI
        // Use environment variable for Azure OpenAI endpoint, with fallback to constructed URL
        const azureOpenAIEndpoint = process.env.AZURE_OPENAI_RESPONSES_ENDPOINT || 
                                    (process.env.AZURE_OPENAI_API_INSTANCE_NAME 
                                      ? `https://${process.env.AZURE_OPENAI_API_INSTANCE_NAME}.openai.azure.com/openai/v1/responses`
                                      : 'https://turbotic-dev-openai-sweden.openai.azure.com/openai/v1/responses');
        const res = await fetch(azureOpenAIEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.AZURE_OPENAI_API_KEY}`
            },
            body: JSON.stringify(requestBody)
        });

        if (!res.ok) {
            const errorText = await res.text();
            return new Response(JSON.stringify({ error: `Azure OpenAI API error: ${errorText}` }), {
                status: res.status,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Create a ReadableStream to forward the SSE response
        const stream = new ReadableStream({
            async start(controller) {
                const reader = res.body?.getReader();

                if (!reader) {
                    controller.close();
                    return;
                }

                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        // Forward the chunk to the client
                        controller.enqueue(value);
                    }
                } catch (error) {
                    console.error('Error streaming response:', error);
                    controller.error(error);
                } finally {
                    controller.close();
                }
            }
        });

        // Return the stream with appropriate headers for SSE
        return new Response(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no' // Disable buffering in nginx
            }
        });
    } catch (error: any) {
        console.error('Error in agent chat API:', error);
        return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

