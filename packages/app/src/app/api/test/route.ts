import Agent from "@/lib/agent";

export async function POST(request: Request) {
    const agent = new Agent();

    agent.tools = [
        {
            name: "turn_on_light",
            type: 'function',
            description: 'Turn on the light',
            parameters: {
                type: 'object',
                properties: {
                    light_id: { type: 'string', description: 'The id of the light to turn on' }
                }
            },
            func: async ({ light_id }: { light_id: string }) => {
                return 'Light ' + light_id + ' turned on successfully';
            }
        }
    ]

    const message = 'Can you turn on light 1001, 1002 and 1003';
    
    await agent.performTask(message);

    return new Response(JSON.stringify({ message }), {
        headers: { 'Content-Type': 'application/json' }
    });
}