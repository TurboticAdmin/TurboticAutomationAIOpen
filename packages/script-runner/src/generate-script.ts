const PRE_SCRIPT = (executionId: string) => `
    const { parentPort } = require('worker_threads');

    let __script_frame_context = JSON.parse(process.env?.HYDRATED_CONTEXT || '{}');
    async function setContext(key, value) {
        __script_frame_context[key] = value;
        parentPort.postMessage({
            type: 'setContext',
            key,
            value
        });
    }

    function getContext(key) {
        const c = __script_frame_context[key];

        if (!c) {
            throw new Error(\`Context key \${key} not set\`);
        }

        return c;
    }

    const publishScreenshot = async (base64Screenshot) => {
        const response = await global.fetch('${process.env.AUTOMATIONAI_ENDPOINT}/api/screenshots', {
            method: 'POST',
            body: JSON.stringify({
                base64Screenshot,
                executionId: '${executionId}'
            })
        });

        if (!response.ok) {
            console.log('Failed to publish screenshot', response);
            throw new Error('Failed to publish screenshot');
        }
    }

    const simplifyHtml = async (html) => {
        const response = await global.fetch('${process.env.AUTOMATIONAI_ENDPOINT}/api/gen/extract-text', {
            method: 'POST',
            body: JSON.stringify({
                html
            })
        });

        if (!response.ok) {
            throw new Error('Failed to simplify HTML');
        }

        const data = await response.text();
        return data;
    }

    const findSelectorsUsingAI = async (html, promptToFindSelectors) => {
        const response = await global.fetch('${process.env.AUTOMATIONAI_ENDPOINT}/api/gen/find-selectors', {
            method: 'POST',
            body: JSON.stringify({
                html,
                promptToFindSelectors
            })
        });

        if (!response.ok) {
            throw new Error('Failed to find selectors using AI');
        }

        const data = (await response.json())?.selectors?.selector;
        return data;
    }

    // Microsoft Graph API Authentication Functions
    const getMicrosoftAccessTokenFromTurbotic = async (type) => {
        const response = await global.fetch('${process.env.AUTOMATIONAI_ENDPOINT}/api/admin/integrations/microsoft/auth-token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                executionId: '${executionId}',
                type: type
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(\`Microsoft authentication failed: \${errorData.error || response.statusText}\`);
        }

        const data = await response.json();
        return data.accessToken;
    }

    const hasMicrosoftIntegration = async () => {
        const response = await global.fetch('${process.env.AUTOMATIONAI_ENDPOINT}/api/admin/integrations/microsoft/check', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                executionId: '${executionId}'
            })
        });

        if (!response.ok) {
            return false;
        }

        const data = await response.json();
        return data.hasIntegration;
    }

    // Ping Search Helper Functions
        const searchWebWithTurboticAI = async (query, options = {}) => {
            try {
                console.log('🔍 Searching Web for: ' + query);
                
                // Call the dedicated API endpoint
                const response = await global.fetch('${process.env.AUTOMATIONAI_ENDPOINT}/api/web-search', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Script-Runner': 'true',
                        'X-Execution-Id': '${executionId}',
                    },
                    body: JSON.stringify({
                        query: query,
                        options: options
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error('Search API failed: ' + response.statusText + ' - ' + errorData.error);
                }

                const result = await response.json();
                return result;

            } catch (error) {
                console.error('Search web error:', error);
                throw new Error('Search web failed: ' + error.message);
            }
    }

    // OpenAI Chat Helper Function
    // Uses user's OpenAI API key if available, otherwise falls back to Turbotic's Azure OpenAI
    const TurboticOpenAI = async (messages, options = {}) => {
        try {
            const {
                model = 'gpt-4',
                temperature = 0.7,
                max_tokens = null
            } = options;

            console.log('🤖 Calling OpenAI with ' + messages.length + ' message(s)');
            
            // Call the dedicated API endpoint
            const response = await global.fetch('${process.env.AUTOMATIONAI_ENDPOINT}/api/openai-chat', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Script-Runner': 'true',
                    'X-Execution-Id': '${executionId}',
                },
                body: JSON.stringify({
                    messages: messages,
                    model: model,
                    temperature: temperature,
                    max_tokens: max_tokens,
                    options: options
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error('OpenAI API failed: ' + response.statusText + ' - ' + (errorData.error || 'Unknown error'));
            }

            const result = await response.json();
            return result;

        } catch (error) {
            console.error('OpenAI chat error:', error);
            throw new Error('OpenAI chat failed: ' + error.message);
        }
    }

    // Email Sending Helper Function
    // Priority: 1. Outlook (if user has Microsoft integration), 2. User's SendGrid API key, 3. Turbotic's SendGrid
    const sendEmailViaTurbotic = async (emailData, options = {}) => {
        try {
            const {
                to,
                subject,
                html = null,
                text = null,
                from = null
            } = emailData;

            if (!to || !subject || (!html && !text)) {
                throw new Error('to, subject, and either html or text are required');
            }

            console.log('📧 Sending email to: ' + (Array.isArray(to) ? to.join(', ') : to));
            
            // Call the dedicated API endpoint
            const response = await global.fetch('${process.env.AUTOMATIONAI_ENDPOINT}/api/send-email', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Script-Runner': 'true',
                    'X-Execution-Id': '${executionId}',
                },
                body: JSON.stringify({
                    to: to,
                    subject: subject,
                    html: html,
                    text: text,
                    from: from,
                    options: options
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error('Send email failed: ' + response.statusText + ' - ' + (errorData.error || 'Unknown error'));
            }

            const result = await response.json();
            return result;

        } catch (error) {
            console.error('Send email error:', error);
            throw new Error('Send email failed: ' + error.message);
        }
    }


    const pingUrls = async (urls, options = {}) => {
        const {
            timeout = 5000,
            maxRetries = 3
        } = options;

        try {
            console.log('🏓 Pinging ' + urls.length + ' URLs...');

            const pingResults = [];
            for (const url of urls) {
                let lastError = null;
                let success = false;
                let latency = 0;

                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                        const startTime = Date.now();
                        const response = await global.fetch(url, { 
                            method: 'HEAD', 
                            signal: AbortSignal.timeout(timeout) 
                        });
                        latency = Date.now() - startTime;
                        
                        if (response.ok) {
                            success = true;
                            break;
                        }
                    } catch (error) {
                        lastError = error.message;
                        if (attempt < maxRetries) {
                            await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
                        }
                    }
                }

                pingResults.push({
                    url: url,
                    success: success,
                    latency: latency,
                    error: success ? null : lastError,
                    timestamp: new Date()
                });
            }

            const successfulPings = pingResults.filter(r => r.success).length;
            const averageLatency = pingResults
                .filter(r => r.success)
                .reduce((sum, r) => sum + r.latency, 0) / successfulPings || 0;

            return {
                results: pingResults,
                totalUrls: urls.length,
                successfulPings,
                failedPings: urls.length - successfulPings,
                averageLatency: Math.round(averageLatency),
                timeout,
                maxRetries
            };

        } catch (error) {
            console.error('Ping test error:', error);
            throw new Error('Ping test failed: ' + error.message);
        }
    }
`;

export default function generateScript(rawScript: string) {
    const executionId = process.env.EXECUTION_ID;
    console.log(`[Script Generation] EXECUTION_ID: ${executionId}`);
    console.log(`[Script Generation] AUTOMATIONAI_ENDPOINT: ${process.env.AUTOMATIONAI_ENDPOINT}`);
    
    // Replace any usage of require('node-fetch') with globalThis.fetch in the provided raw script
    const transformedRawScript = rawScript.replace(/require\(["']node-fetch["']\)/g, 'globalThis.fetch');

    const generatedScript = `
        ${PRE_SCRIPT(executionId)}
        ${transformedRawScript}
    `;
    
    // Log a preview of the generated script
    const preview = generatedScript.substring(0, 500);
    console.log(`[Script Generation] Generated script preview:`, preview);
    
    return generatedScript;
}