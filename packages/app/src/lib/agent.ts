// Agent state management - no direct MongoDB access

type Action = {
    items: Array<{
        type: 'text' | 'function';
        content: string;
        functionCallStatus?: string,
        functionExecutionStatus?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped',

        functionCallId?: string;
        functionCallArguments?: any;
        functionCallResult?: any;
    }>
}

function transformResponseToAction(response: any): Action {
    if (!response || !response.output) {
        return { items: [] };
    }

    const items = response.output.map((item: any) => {
        if (item.type === 'function_call') {
            let functionCallStatus: string = item.status;
            let functionCallArguments: any = null;
            let functionExecutionStatus: 'pending' | 'running' | 'completed' | 'failed' | 'skipped' = 'pending';
            
            if (item.arguments) {
                try {
                    functionCallArguments = JSON.parse(item.arguments);
                } catch {
                    functionCallArguments = item.arguments;
                }
            }

            return {
                type: 'function' as const,
                content: item.name || '',
                functionCallStatus,
                functionExecutionStatus,
                functionCallId: item.call_id || item.id,
                functionCallArguments
            };
        } else if (item.type === 'message') {
            // Extract text from message content array
            let text = '';
            if (item.content && Array.isArray(item.content)) {
                // Find all output_text parts and concatenate them
                const textParts = item.content
                    .filter((part: any) => part.type === 'output_text' && part.text)
                    .map((part: any) => part.text);
                text = textParts.join('');
            }
            // Fallback: if content is not structured yet, try to get text from the item directly
            if (!text && item.text) {
                text = item.text;
            }
            
            return {
                type: 'text' as const,
                content: text
            };
        } else if (item.type === 'text') {
            return {
                type: 'text' as const,
                content: item.text || item.content || ''
            };
        } else {
            // Fallback for unknown types
            return {
                type: 'text' as const,
                content: JSON.stringify(item)
            };
        }
    });

    return { items };
}

/**
 * Frontend-friendly function to get agent response via API route
 * This function calls the /api/agent/chat endpoint which proxies to Azure OpenAI
 * @param message - The user message
 * @param updateAction - Callback function to receive action updates
 * @param tools - Array of tools/functions available to the agent
 * @param previousResponseId - Optional ID of the previous response to chain context
 * @param functionCallOutputs - Optional array of function call outputs to pass back to the API (format: { type: "function_call_output", call_id: string, output: string })
 * @returns Promise that resolves when the stream is complete
 */
export async function getResponseFromAPI(
    message: string,
    updateAction: (action: Action) => void,
    tools: any[] = [],
    previousResponseId?: string,
    functionCallOutputs?: Array<{ type: 'function_call_output'; call_id: string; output: string }>
): Promise<any> {
    // Use absolute URL if we're in a browser environment
    const isBrowser = typeof window !== 'undefined';
    const apiUrl = isBrowser ? '/api/agent/chat' : `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/agent/chat`;
    
    const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            message,
            tools: tools.map((t) => {
                const { func, ...rest } = t;
                return rest;
            }),
            previousResponseId,
            functionCallOutputs
        })
    });

    if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `HTTP error! status: ${res.status}`);
    }

    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    let response: any = null;
    const functionCallArguments: Record<string, string> = {};
    const textContent: Record<string, string> = {};

    while (true) {
        const { done, value } = await reader?.read() || { done: true, value: null };
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        
        // SSE events are separated by double newlines
        const events = buffer.split('\n\n');
        // Keep the last incomplete event in buffer
        buffer = events.pop() || '';

        for (const event of events) {
            if (!event.trim()) continue;

            const lines = event.split('\n');
            let eventType = '';
            let dataLine = '';

            for (const line of lines) {
                if (line.startsWith('event: ')) {
                    eventType = line.replace('event: ', '').trim();
                } else if (line.startsWith('data: ')) {
                    dataLine = line.replace('data: ', '').trim();
                }
            }

            if (!eventType || !dataLine) continue;

            try {
                const payload = JSON.parse(dataLine);

                switch (eventType) {
                    case 'response.created':
                    case 'response.in_progress': {
                        if (payload.response) {
                            response = { ...payload.response };
                            if (!response.output) {
                                response.output = [];
                            }
                            updateAction(transformResponseToAction(response));
                        }
                        break;
                    }

                    case 'response.output_item.added': {
                        if (payload.item && response) {
                            const item = { ...payload.item };
                            if (item.type === 'function_call' && !item.arguments) {
                                item.arguments = '';
                            }
                            if (item.type === 'message' && !item.content) {
                                item.content = [];
                            }
                            response.output[payload.output_index] = item;
                            if (item.id && item.type === 'function_call') {
                                functionCallArguments[item.id] = '';
                            }
                            if (item.id && item.type === 'message') {
                                textContent[item.id] = '';
                            }
                            updateAction(transformResponseToAction(response));
                        }
                        break;
                    }

                    case 'response.content_part.added': {
                        if (payload.part && payload.item_id && response) {
                            const outputItem = response.output[payload.output_index];
                            if (outputItem && outputItem.id === payload.item_id) {
                                if (!outputItem.content) {
                                    outputItem.content = [];
                                }
                                const part = { ...payload.part };
                                if (part.type === 'output_text' && !part.text) {
                                    part.text = '';
                                }
                                outputItem.content[payload.content_index] = part;
                                if (part.type === 'output_text') {
                                    const textKey = `${payload.item_id}_${payload.content_index}`;
                                    textContent[textKey] = '';
                                }
                            }
                            updateAction(transformResponseToAction(response));
                        }
                        break;
                    }

                    case 'response.output_text.delta': {
                        if (payload.item_id && payload.delta && response) {
                            const textKey = `${payload.item_id}_${payload.content_index}`;
                            if (!textContent[textKey]) {
                                textContent[textKey] = '';
                            }
                            textContent[textKey] += payload.delta;
                            
                            const outputItem = response.output[payload.output_index];
                            if (outputItem && outputItem.id === payload.item_id) {
                                if (!outputItem.content) {
                                    outputItem.content = [];
                                }
                                if (!outputItem.content[payload.content_index]) {
                                    outputItem.content[payload.content_index] = { type: 'output_text', text: '' };
                                }
                                outputItem.content[payload.content_index].text = textContent[textKey];
                            }
                            updateAction(transformResponseToAction(response));
                        }
                        break;
                    }

                    case 'response.output_text.done': {
                        if (payload.item_id && payload.text && response) {
                            const textKey = `${payload.item_id}_${payload.content_index}`;
                            textContent[textKey] = payload.text;
                            
                            const outputItem = response.output[payload.output_index];
                            if (outputItem && outputItem.id === payload.item_id) {
                                if (!outputItem.content) {
                                    outputItem.content = [];
                                }
                                if (!outputItem.content[payload.content_index]) {
                                    outputItem.content[payload.content_index] = { type: 'output_text', text: '' };
                                }
                                outputItem.content[payload.content_index].text = payload.text;
                            }
                            updateAction(transformResponseToAction(response));
                        }
                        break;
                    }

                    case 'response.content_part.done': {
                        if (payload.part && payload.item_id && response) {
                            const outputItem = response.output[payload.output_index];
                            if (outputItem && outputItem.id === payload.item_id) {
                                if (!outputItem.content) {
                                    outputItem.content = [];
                                }
                                outputItem.content[payload.content_index] = { ...payload.part };
                            }
                            updateAction(transformResponseToAction(response));
                        }
                        break;
                    }

                    case 'response.function_call_arguments.delta': {
                        if (payload.item_id && payload.delta && response) {
                            if (!functionCallArguments[payload.item_id]) {
                                functionCallArguments[payload.item_id] = '';
                            }
                            functionCallArguments[payload.item_id] += payload.delta;
                            
                            const outputItem = response.output[payload.output_index];
                            if (outputItem && outputItem.id === payload.item_id) {
                                outputItem.arguments = functionCallArguments[payload.item_id];
                            }
                            updateAction(transformResponseToAction(response));
                        }
                        break;
                    }

                    case 'response.function_call_arguments.done': {
                        if (payload.item_id && payload.arguments && response) {
                            functionCallArguments[payload.item_id] = payload.arguments;
                            
                            const outputItem = response.output[payload.output_index];
                            if (outputItem && outputItem.id === payload.item_id) {
                                outputItem.arguments = payload.arguments;
                            }
                            updateAction(transformResponseToAction(response));
                        }
                        break;
                    }

                    case 'response.output_item.done': {
                        if (payload.item && response) {
                            const item = { ...payload.item };
                            response.output[payload.output_index] = item;
                            updateAction(transformResponseToAction(response));
                        }
                        break;
                    }

                    case 'response.completed': {
                        if (payload.response) {
                            response = { ...payload.response };
                            updateAction(transformResponseToAction(response));
                        }
                        break;
                    }
                }
            } catch (error) {
                console.error('Error parsing event:', error, 'Event:', event);
            }
        }
    }

    return response;
}

export default class Agent {
    async getResponse(message: string, updateAction: (action: Action) => void, functionCallOutputs?: Array<{ type: 'function_call_output'; call_id: string; output: string }>) {
        // Extract response ID from latestResponse if available for context chaining
        const previousResponseId = this.latestResponse?.id || null;
        
        return await getResponseFromAPI(
            message, 
            updateAction, 
            this.tools.map((t) => {
                const { func, ...rest } = t;
                return {
                    ...rest
                }
            }),
            previousResponseId || undefined,
            functionCallOutputs
        );
    }

    stateId: string | null = null;
    latestResponse: any | null = null;
    action: Action | null = null;
    tools: any[] = [];

    constructor(stateId?: string) {
        this.stateId = stateId || null;
    }

    private async saveState(): Promise<string> {
        const isBrowser = typeof window !== 'undefined';
        const baseUrl = isBrowser ? '' : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

        if (!this.stateId) {
            // Create new state
            const res = await fetch(`${baseUrl}/api/agent/state`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    latestAction: this.action,
                    latestResponse: this.latestResponse
                })
            });

            if (!res.ok) {
                const error = await res.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(error.error || `Failed to save state: ${res.status}`);
            }

            const data = await res.json();
            this.stateId = data.stateId;
            
            // @ts-ignore
            return this.stateId;
        } else {
            // Update existing state
            const res = await fetch(`${baseUrl}/api/agent/state`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    stateId: this.stateId,
                    latestAction: this.action,
                    latestResponse: this.latestResponse
                })
            });

            if (!res.ok) {
                const error = await res.json().catch(() => ({ error: 'Unknown error' }));
                throw new Error(error.error || `Failed to update state: ${res.status}`);
            }

            return this.stateId;
        }
    }

    async loadState(stateId: string): Promise<void> {
        const isBrowser = typeof window !== 'undefined';
        const baseUrl = isBrowser ? '' : (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000');

        const res = await fetch(`${baseUrl}/api/agent/state?stateId=${stateId}`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            }
        });

        if (!res.ok) {
            const error = await res.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(error.error || `Failed to load state: ${res.status}`);
        }

        const data = await res.json();
        this.stateId = data.stateId;
        this.action = data.latestAction;
        this.latestResponse = data.latestResponse;
    }

    async performTask(message: string, updateAction?: (action: Action) => void, recursionDepth: number = 0, providedFunctionCallOutputs?: Array<{ type: 'function_call_output'; call_id: string; output: string }>) {
        // Prevent infinite recursion (max 10 levels)
        const MAX_RECURSION_DEPTH = 10;
        if (recursionDepth >= MAX_RECURSION_DEPTH) {
            console.warn('Maximum recursion depth reached. Stopping agent loop.');
            return;
        }

        if (!this.action) {
            this.action = { items: [] };
        }

        const response = await this.getResponse(message, (action: Action) => {
            this.action = action;
            // Call the provided callback if available (for real-time updates)
            if (updateAction) {
                updateAction(action);
            } else {
                // Default behavior: log to console
                console.clear();    
                console.log(require('util').inspect(action, { depth: null, colors: true }));
            }
        }, providedFunctionCallOutputs);

        console.log('response', response);

        this.latestResponse = response;

        // Track if any function calls were executed and collect their results
        let hasExecutedFunctions = false;
        const functionCallOutputs: Array<{ type: 'function_call_output'; call_id: string; output: string }> = [];

        for (const _function of this.action?.items) {
            if (_function.type !== 'function') continue;

            const tool = this.tools.find((t) => t.name === _function.content);
            if (tool) {
                try {
                    // Mark as running before execution
                    _function.functionExecutionStatus = 'running';
                    if (updateAction && this.action) {
                        updateAction(this.action);
                    }

                    const result = await tool.func(_function.functionCallArguments);

                    _function.functionCallResult = result;
                    _function.functionExecutionStatus = 'completed';
                    hasExecutedFunctions = true;
                    
                    // Collect function call result for passing back to API
                    // Format: { type: "function_call_output", call_id: "...", output: "..." }
                    // output should be a JSON string
                    if (_function.functionCallId) {
                        const outputString = typeof result === 'string' ? result : JSON.stringify(result);
                        functionCallOutputs.push({
                            type: 'function_call_output',
                            call_id: _function.functionCallId,
                            output: outputString
                        });
                    }
                    
                    // Update action after tool execution if callback provided
                    if (updateAction && this.action) {
                        updateAction(this.action);
                    }
                } catch (error) {
                    console.error('Error executing tool:', error);
                    _function.functionCallResult = error;
                    _function.functionExecutionStatus = 'failed';
                    hasExecutedFunctions = true;
                    
                    // Collect function call error result for passing back to API
                    if (_function.functionCallId) {
                        const errorOutput = typeof error === 'string' ? error : JSON.stringify({ error: String(error) });
                        functionCallOutputs.push({
                            type: 'function_call_output',
                            call_id: _function.functionCallId,
                            output: errorOutput
                        });
                    }
                    
                    // Update action after tool error if callback provided
                    if (updateAction && this.action) {
                        updateAction(this.action);
                    }
                }
            }
        }

        if (!updateAction) {
            console.log('Action:', require('util').inspect(this.action, { depth: null, colors: true }));
        }

        await this.saveState();

        // If function calls were executed, recursively call performTask to continue the conversation
        // Pass the function call outputs back to the API so it can continue with that context
        if (hasExecutedFunctions && functionCallOutputs.length > 0) {
            console.log(`Recursively continuing agent conversation (depth: ${recursionDepth + 1})...`);
            console.log('Passing function call outputs:', functionCallOutputs);
            
            // Recursively call performTask with function call outputs
            // performTask will handle calling getResponse with the outputs and processing any new function calls
            await this.performTask('', updateAction, recursionDepth + 1, functionCallOutputs);
        }
    }

    async markTaskAsCompleted(taskId: string) {

    }
}