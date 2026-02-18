// @ts-nocheck
import { ChatAnthropic } from "@langchain/anthropic";
import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { concat } from "@langchain/core/utils/stream";
import { MemorySaver } from "@langchain/langgraph";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { ObjectId } from "mongodb";
import { getDb } from "./db";
import fs from 'fs';
import path from 'path';
import { convertAIMessageToString } from "./utils";
import z from 'zod';
import { DynamicStructuredTool, DynamicTool } from "@langchain/core/tools";
import { AzureChatOpenAI } from "@langchain/openai";
import { TavilySearch } from "@langchain/tavily";
import { tavily } from '@tavily/core';
import puppeteer from "puppeteer";
import { google} from 'googleapis';
import cronstrue from 'cronstrue';
import { parse as htmlParse } from 'node-html-parser';
import { prettify } from 'htmlfy';
import crypto from 'crypto';
import { decrypt } from "@/lib/encryption";
import { searchAutomationComponents } from "@/app/api/vector-search/vector-search";
import Perplexity from '@perplexity-ai/perplexity_ai';


const CustomGoogleSearch = google.customsearch('v1');

let browser: Browser = null;

type Models = 'gpt-5' | 'gpt-5.1-codex' | 'gpt-4.1-nano' | 'gpt-4o' | 'vision-auto';
async function getModelConfig(model?: Models) {
    if (model === 'gpt-5') {
        console.log('Using gpt-5 model');
        return {
            azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
            azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
            azureOpenAIApiDeploymentName: process.env.GPT5_AZURE_OPENAI_API_DEPLOYMENT_NAME,
            azureOpenAIApiVersion: process.env.GPT5_AZURE_OPENAI_API_VERSION,
            temperature: 1,
        }
    }

    if (model === 'gpt-5.1-codex') {
        console.log('Using gpt-5.1-codex model');
        return {
            azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
            azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
            azureOpenAIApiDeploymentName: process.env.GPT5_1_CODEX_AZURE_OPENAI_API_DEPLOYMENT_NAME,
            azureOpenAIApiVersion: process.env.GPT5_1_CODEX_AZURE_OPENAI_API_VERSION,
            temperature: 1,
        }
    }

    if (model === 'gpt-4.1-nano') {
        console.log('Using gpt-4.1-nano model');
        return {
            azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
            azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
            azureOpenAIApiDeploymentName: 'gpt-4.1-nano',
            azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
            temperature: 0,
        }
    }

    // Vision-capable config: prefer explicit deployment if provided
    if (model === 'gpt-4o' || model === 'vision-auto') {
        console.log('Using vision-capable model');
        const deploymentName = process.env.AZURE_OPENAI_VISION_DEPLOYMENT_NAME || process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME;
        return {
            azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
            azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
            azureOpenAIApiDeploymentName: deploymentName,
            azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
            temperature: 0,
        }
    }

    return {
        azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
        azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
        azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
        azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
        temperature: 0,
    }
}

async function summariseMessages(messages: any[], chatContext: any, model?: Models, lastSummarisedMessageId: string | null) {
    const summariserModel = new AzureChatOpenAI(await getModelConfig(model));

    let previousSummary = chatContext?.summary || 'Not available, start summarising the conversation';
    
    const formattedMessages = messages.filter((m) => m.type !== 'tool').map((m) => {
        let contents: string[] = [''];
        let role = m.type;

        if (typeof m.data.content === 'string') {
            contents.push(`Content: ${m.data.content}`);
        }

        if (m.data?.tool_calls?.length > 0) {
            for (const toolCall of m.data.tool_calls) {
                contents.push(`Tool call: ${toolCall.name}`);
                contents.push(`Tool call arguments: ${JSON.stringify(toolCall.args)}`);
            }
        }

        return [
            `Role: ${role}`,
            contents.map((c) => `  - ${c}`).join('\n')
        ].join('\n')
    })

    const summary = await summariserModel.invoke([
        new SystemMessage({
            content: [
                'You are a summariser agent that is integrated into a chat based agent product',
                'Your primary goal is to summarise the conversation between the user and the agent in a way that is precise and concise.',
                'The objective is to reduce the number of message token in the conversation, so users can chat longer without worrying about the token limit',
                'Example format of the summary:',
                'The user asked about X, Y, and the assistant provided Z',
                'You will be provided both the current summary and the new messages to summarise, you should update the summary to include the new messages',
                '---',
                `Summary so far: ${previousSummary}`,
                `Conversation so far:`,
                ...formattedMessages
            ].join('\n')
        })
    ]);

    let newSummary = summary?.content || '';

    await getDb().collection('chatContext').updateOne({ automationId: chatContext.automationId }, {
        $set: {
            summary: newSummary,
            lastSummarisedMessageId
        }
    });

    return newSummary;
}

async function shrinkMessages(messages: any[], chatContext: any, model?: Models) {
    let preservedMessages: any[] = [];
    let messagesToSummarize: any[] = [];

    let numberOfMessagesPushed = 0;
    let mode: 'preserve' | 'summarize' = 'preserve';
    let lastSummarisedMessageId: string | null = chatContext?.lastSummarisedMessageId || null;

    for (let i = messages.length - 1; i >= 0; i--) {
        const message = messages[i];
        if (mode === 'preserve') {
    
            preservedMessages.unshift(message);
            numberOfMessagesPushed++;
    
            if (numberOfMessagesPushed >= 5 && message.type === 'ai') {
                mode = 'summarize';
            }
        } else {
            if (message?.data?.id === lastSummarisedMessageId) {
                break;
            }

            messagesToSummarize.unshift(message);
        }
    }

    if (messagesToSummarize.length > 0) {
        const lastMessage = messagesToSummarize[messagesToSummarize.length - 1];
        if (lastMessage?.data?.id) {
            lastSummarisedMessageId = lastMessage.data.id;
        }
    }

    const summary = await summariseMessages(messagesToSummarize, chatContext, model, lastSummarisedMessageId);

    return {
        summary,
        preservedMessages,
        messagesToSummarize
    }
}

export async function reviewCode(code: string, summaryOfRequirement: string) {
    const GAME_PROMPT = fs.readFileSync(path.join(process.cwd(), 'prompts', 'game2_prompt.md'), 'utf-8');

    const agentModel = new AzureChatOpenAI(await getModelConfig('gpt-4')).bindTools([]);

    const structuredModel = agentModel.withStructuredOutput(z.object({
        issues: z.array(
            z.enum(
                [
                    'Script will not run anything',
                    'Script will keep on running until someone stops it',
                    'Contains line require(\'node-fetch\') even though the script runtime is Node 22.x'
                ]
            ).describe('The issues found in the code')
        ),
        description: z.string().describe('The description of the issues found in the code')
    }));
    
    const result = await structuredModel.invoke([
        new SystemMessage({
            content: [
                GAME_PROMPT,
                '---',
                'Act as a code reviewer. Please analyse the given code and provide the potential code issues that does not align with the overall objective of the tool.',
                'The overall summary of the requirement of the code is:',
                summaryOfRequirement,
                '---',
                'The code is:',
                code,
            ].join('\n')
        })
    ]);

    return result;
}

async function getSearchResult(query: string) {
    const client = new Perplexity({
        apiKey: process.env.PERPLEXITY_API_KEY
    });

    const search = await client.search.create({
        query,
        maxResults: 5,
        maxTokensPerPage: 1024
    });

    console.log('Search', query, search);

    return JSON.stringify(search);
}

export async function generateResponse(automationId: string, message: string, model?: Models, cb?: any, currentCodeFromFrontend?: string, abortSignal?: AbortSignal) {
    let GAME_PROMPT = fs.readFileSync(path.join(process.cwd(), 'prompts', 'game2_prompt.md'), 'utf-8');

    if (model === 'gpt-5') {
        console.log('Using gpt-5 optimised prompt');
        GAME_PROMPT = fs.readFileSync(path.join(process.cwd(), 'prompts', 'game2_prompt_5_optimised.md'), 'utf-8');
    }

    if (model === 'gpt-5.1-codex') {
        console.log('Using gpt-5.1-codex optimised prompt');
        GAME_PROMPT = fs.readFileSync(path.join(process.cwd(), 'prompts', 'game2_prompt_5_optimised.md'), 'utf-8');
    }

    if (!message) {
        throw new Error('No message provided');
    }

    const automation: any = await getDb().collection('automations').findOne({ _id: ObjectId.createFromHexString(automationId as any) });
    let chatContext: any = await getDb().collection('chatContext').findOne({ automationId });

    automation.initialChatTriggered = true;

    if (!chatContext) {
        chatContext = {
            messages: []
        }
    }

    chatContext.messages.push((new HumanMessage({ content: message })).toDict());

    let triggerMode: any = null;
    let usedEnvironmentVariables: any[] = [];
  
    const agentTools: any[] = [
        // new DynamicStructuredTool({
        //     name: 'plan-actions',
        //     description: [
        //         'Use this tool to plan the action to be taken',
        //         'The tool will perform the action to be taken and return the plan to context so the response can be driven by the plan',
        //     ].join('\n'),
        //     schema: z.object({
        //         plan: z.string().describe([
        //             'Write here what you are going to do in order to achieve the objective',
        //             'You can include details like:',
        //             '- What user is asking for',
        //             '- What to search the web for latest documentation or examples',
        //             '- What tools to integrate with',
        //             '- Should you use REST API or SDK',
        //             '- Remember all the rules you must follow in order to adhere with the platforms limitation',
        //             '- Make sure to avoid things like silent error',
        //             '- Use AI to generate stuff, summarise stuff or perform cognitive analysis.',
        //             '- Don\'t use node-fetch library, use fetch API instead'
        //         ].join('\n')),
        //     }),
        //     async func({ plan }) {
        //         return [
        //             'Here is the plan to be taken:',
        //             plan
        //         ].join('\n');
        //     },
        // }),
        new DynamicStructuredTool({
            name: 'write-code-in-monaco-editor',
            description: [
                'Use this tool to write code in the monaco editor',
                'The tool will return the review report of the code by the code reviewer agent',
                'The review report will contain the issues found in the code and the description of the issues',
                'If any issues are found, please rewrite the code to fix the issues',
            ].join('\n'),
            schema: z.object({
                code: z.string().describe('The revised code to replace the current code in the monaco editor'),
                shortSummaryOfRequirement: z.string().describe('The short summary of the requirement of the code'),
                environmentVariablesUsed: z.array(z.string()).describe('List of environment variables used in the code'),
                dependenciesUsed: z.array(
                    z.object({
                        name: z.string().describe('The name of the dependency'),
                        version: z.enum(['latest']).describe('Usually the latest'),
                    })
                ).describe('List of dependencies used in the code')
            }),
            async func({ code, shortSummaryOfRequirement, environmentVariablesUsed }) {
                // console.log('write-code-in-monaco-editor environmentVariablesUsed', JSON.stringify(environmentVariablesUsed));
                // Store environment variables used in the code for later processing
                usedEnvironmentVariables = environmentVariablesUsed || [];
                return 'The code is written to monaco editor successfully. Please use review-code tool to review the code now.';
            },
        }),
        new DynamicStructuredTool({
            name: 'review-code',
            description: [
                'Use this tool to review the code in the monaco editor',
                'The tool will review the code in the monaco editor'
            ].join('\n'),
            schema: z.object({
                issues: z.array(
                    z.enum(
                        [
                            'Script does not have a main function or equivalent to start executing its logic',
                            'Script will keep on running until someone stops it',
                            'Contains line require(\'node-fetch\') even though the script runtime is Node 22.x',
                            'Script must prefer rest API when integrating Azure OpenAI API (instead of the npm package)',
                            'try catch block is not throwing error when the code fails, which can cause the script to exit with code 0 even when there is an error'
                        ]
                    ).describe('The issues found in the code')
                ),
                description: z.string().describe('The description of the issues found in the code')
            }),
            async func({ issues, description }) {
                if (issues.length > 0) {
                    return [
                        'The code has been written to monaco editor successfully with following issues:',
                        description,
                        'Please correct the issues and rewrite the code using the `write-code-in-monaco-editor` tool. Or clear the code and inform the user about the limitations. No confirmation needed for correcting the issues.'
                    ].join('\n');
                }

                return 'Code has no issues';
            },
        }),
        new DynamicStructuredTool({
            name: 'search-web',
            description: [
                'Use this tool ONLY for searching technical documentation, APIs, libraries, and development resources.',
                'DO NOT use this tool for general content searches like people, influencers, news, or marketing content.',
                'Use searchWebWithTurboticAI() helper function for general content searches instead.',
                'Valid use cases:',
                '- NodeJS or REST Hubspot API documentation',
                '- NodeJS or REST OpenAI API documentation',
                '- GitHub repositories for specific libraries',
                '- Official documentation sites',
                '- NPM package pages',
                '- Technical tutorials and guides'
            ].join('\n'),
            schema: z.object({
                query: z.string().describe('The query to search the web for'),
            }),
            async func({ query }) {
                return await getSearchResult(query);
            },
        }),
        new DynamicStructuredTool({
            name: 'extract-content-from-url',
            description: [
                'Use this tool to extract content from a url',
                'If it is a npm package page or github repository page, use this tool to extract the content of the readme file',
                'Useful for extracting only the information available within the given url'
            ].join('\n'),
            schema: z.object({
                url: z.string().describe('The url to extract content from, Version specific documentation URL of the dependency. The URL must be coming from web search results. And the URL must include the version number of the dependency.')
            }),
            async func({ url }) {
                // const browser = await getBrowser();

                try {
                    const browser = await puppeteer.launch({
                        headless: true,
                        args: ["--no-sandbox", "--disable-setuid-sandbox"],
                    });

                    const page = await browser.newPage();
                    await page.goto(url, { waitUntil: 'domcontentloaded' });

                    const text = await page.evaluate(() => {
                        return document.body.innerText;
                    });

                    console.log('text', text);

                    await page.close();
                    await browser.close();

                    return text.slice(0, 5000); // Limit output length to avoid flooding
                } catch (error: any) {
                    await browser.close();
                    return `Failed to load or parse ${url}: ${error.message}`;
                }
            }
        }),
        new DynamicStructuredTool({
            name: 'set-script-trigger-mode',
            description: [
                'Use this tool to set the script trigger mode',
                'If you want to trigger the script manually, set the mode to manual',
                'If you want to trigger the script based on a cron expression, set the mode to time-based',
                'IMPORTANT: When setting a schedule time, the cron expression hour should be in the SPECIFIED TIMEZONE, NOT UTC.',
                'Example: For "10 AM IST" use cronExpression "0 10 * * *" with timezone "Asia/Kolkata" (NOT "0 4 * * *").',
                'The cron expression format is: minute hour day month day-of-week (e.g., "0 10 * * *" for 10:00 AM daily).',
                'The timezone parameter should be a valid IANA timezone (e.g., "America/New_York", "Asia/Kolkata", "Europe/London").',
                'DO NOT convert the hour to UTC - use the exact hour the user requested in their timezone.'
            ].join('\n'),
            schema: z.object({
                mode: z.enum(['manual', 'time-based']).describe('The mode to set the script trigger mode to'),
                cronExpression: z.string().nullable().describe('The cron expression with hour in the specified timezone (format: minute hour day month day-of-week, e.g., "0 10 * * *" for 10 AM)'),
                timezone: z.string().nullable().describe('The IANA timezone identifier (e.g., "Asia/Kolkata" for IST, "America/New_York" for EST). The cron hour is interpreted in this timezone.')
            }),
            async func({ mode, cronExpression, timezone }) {
                let result = 'Noted on the action';
                let cronExpressionFriendly = undefined;
                if (mode === 'time-based') {
                    try {
                        if (!cronExpression) {
                            return 'No cron expression provided, it is mandatory if time-based is selected';
                        }

                        if (!timezone) {
                            return 'Timezone is required when setting a time-based schedule';
                        }

                        cronExpressionFriendly = cronstrue.toString(cronExpression, {
                            verbose: true,
                            throwExceptionOnParseError: false
                        });
                        
                        // Append timezone info to the friendly description for clarity
                        if (timezone && cronExpressionFriendly) {
                            cronExpressionFriendly = `${cronExpressionFriendly} (${timezone})`;
                        }

                        const now = new Date();
                        const op = await getDb().collection('schedules-v2').updateOne({
                            automationId,
                        }, {
                            $set: {
                                cronExpression,
                                timezone,
                                mode,
                                cronExpressionFriendly,
                                updatedAt: now
                            },
                            $setOnInsert: {
                                createdAt: now,
                                emailNotificationsEnabled: true,
                                emailOnCompleted: true,
                                emailOnFailed: true
                            }
                        }, { upsert: true });

                        console.log('op', op);

                        result = `Frequency set to: ${cronExpressionFriendly}`;

                        // Update automation's triggerMode and enable it
                        await getDb().collection('automations').updateOne(
                            { _id: ObjectId.createFromHexString(automationId) },
                            { $set: { triggerMode: mode, triggerEnabled: true } }
                        );

                        // Update the outer triggerMode variable to notify frontend
                        triggerMode = { triggerMode: mode, cronExpressionFriendly, timezone };
                    } catch (e: any) {
                        return `Invalid cron expression: ${e.message}`;
                    }
                } else {
                    // Delete schedule when switching to manual mode
                    await getDb().collection('schedules-v2').deleteOne({ automationId });

                    // Update automation's triggerMode to manual and disable trigger
                    await getDb().collection('automations').updateOne(
                        { _id: ObjectId.createFromHexString(automationId) },
                        { $set: { triggerMode: mode, triggerEnabled: false } }
                    );

                    // Update the outer triggerMode variable to notify frontend (null schedule)
                    triggerMode = { triggerMode: mode, cronExpressionFriendly: null, timezone: null };
                }

                return result;
            },
        }),
        new DynamicStructuredTool({
            name: 'set-environment-variables',
            description: [
                'The tool is already capable of setting environment variable while applying the code',
                'However, sometimes users might want to take help of AI to set the values of the environment variables',
                'Or create a new environment variable altogether',
                'In such cases, use this tool to set the environment variables',
            ].join('\n'),
            schema: z.object({
                environmentVariables: z.array(z.object({
                    name: z.string().describe('The name of the environment variable to create or update the value of'),
                    value: z.string().describe('The value of the environment variable to set')
                })).describe('The environment variables to set'),
            }),
            async func({ environmentVariables }) {
                let result = 'Noted on the action';
                return result;
            },
        }),
    ];

    const isVectorSearchToolInvoked = process.env.ENABLE_VECTOR_SEARCH === 'true' || false;

    if(isVectorSearchToolInvoked){
        agentTools.push(new DynamicStructuredTool({
            name: 'search-locally',
            description: [
                'Use this tool to search locally for existing code patterns that can be reused.',
                'This tool searches through previously successful automation scripts stored locally to find similar integration patterns.',
                'Use this BEFORE writing new code to see if there are proven patterns you can adapt.',
                'Examples of what to search for:',
                '- "HubSpot contacts fetch" - to find HubSpot contact retrieval patterns',
                '- "SendGrid email send" - to find email sending patterns',
                '- "MongoDB query" - to find database query patterns',
                '- "OpenAI completion" - to find AI generation patterns'
            ].join('\n'),
            schema: z.object({
                query: z.string().describe('The search query for automation components (e.g., "HubSpot contacts", "email send", "database query")'),
            }),
            async func({ query }) {
                try {

                    console.log(`!!!!!! search-locally invoked !!!!!!!!!!!!!`);

                    const components = await searchAutomationComponents(
                        query,
                        automation?.workspaceId
                    );

                    console.log(`!!!!!! search-locally found ${components?.length} similar automation components !!!!!!!!!!!!!`);

                    if (components && components.length > 0) {
                        const componentInfo = components.map(comp => ({
                            name: comp.name,
                            description: comp.name,
                            script: comp.script.substring(0, 500) + (comp.script.length > 500 ? '...' : ''),
                            environmentVariables: comp.environmentVariables,
                            dependencies: comp.dependencies
                        }));

                        // console.log(`!!!!!! search-locally found ${components.length} similar automation components !!!!!!!!!!!!!`);

                        return JSON.stringify({
                            found: true,
                            count: components.length,
                            components: componentInfo,
                            message: `Found ${components.length} similar automation code patterns. You can adapt these proven code patterns for your automation.`
                        });
                    }

                    return JSON.stringify({
                        found: false,
                        message: 'No similar automation or code patterns found. You can proceed with searching the web for the required code patterns.'
                    });
                } catch (error: any) {
                    console.error('Search similar automation or code patterns error:', error);
                    return `Search failed: ${error.message}`;
                }
            },
        }))
    }

    const agentModel = new AzureChatOpenAI(await getModelConfig(model));

    const agentCheckpointer = new MemorySaver();
    const agent = createReactAgent({
        llm: agentModel,
        tools: agentTools,
        checkpointSaver: agentCheckpointer,
    });

    const { preservedMessages, summary } = await shrinkMessages(chatContext.messages, chatContext, model);

    const messages: any[] = preservedMessages.map((m: any) => {
        switch (m.type) {
            case 'human':
                return new HumanMessage(m.data);
            case 'ai':
                return new AIMessage(m.data);
            case 'tool':
                return new ToolMessage(m.data);
        }
    });

    let gathered: any[] = [];

    console.log('Streaming...');

    const encoder = new TextEncoder();

    let currentCode = '';

    // Use currentCodeFromFrontend if provided, otherwise fall back to database
    if (currentCodeFromFrontend) {
        currentCode = String(currentCodeFromFrontend).split('\n').map((line: string, index: number) => `Line ${index + 1}: ${line}`).join('\n');
    } else if (automation?.code) {
        currentCode = String(automation.code).split('\n').map((line: string, index: number) => `Line ${index + 1}: ${line}`).join('\n');
    }

    const environmentVariables: any = await getDb().collection('environment_variables_values').findOne({ workspaceId: String(automation?.workspaceId) });

    // Get the list of existing environment variables from workspace
    const existingEnvVars = environmentVariables?.environmentVariables || [];
    const existingEnvVarNames = existingEnvVars.map((env: any) => env.name).join(', ');

    // console.log(`Existing environment variables: ${existingEnvVarNames}`);

    const stream = new ReadableStream({
        async start(controller) {
            // Fetch schedule data from schedules-v2 (single source of truth)
            const schedule = await getDb().collection('schedules-v2').findOne({ automationId });

            const systemMessageContent = [
                'Today is: ' + new Date().toLocaleDateString(),
                GAME_PROMPT,
                [
                    `The current code in the monaco editor is:`,
                    currentCode || '// Empty editor - no code yet',
                    '---',
                    `Current trigger mode: ${automation?.triggerMode || 'manual'}`,
                    `Current cron expression: ${schedule?.cronExpression || 'not set'}`,
                    `Current cron expression timezone: ${schedule?.timezone || 'not set'}`,
                    `Current cron expression friendly: ${schedule?.cronExpressionFriendly || 'not set'}`,
                    'Current environment variables set:',
                    automation?.environmentVariables?.map((env: any) => `${env.name}: ${env.value ? 'set' : 'not set'}`).join('\n'),
                    '---',
                    'Available workspace environment variables for reuse:',
                    existingEnvVarNames ? existingEnvVarNames : 'No existing environment variables in workspace',
                    'IMPORTANT: If the new script needs environment variables, prioritize reusing existing ones from the workspace list above. Only suggest new environment variables if absolutely necessary and they don\'t already exist in the workspace.',
                    ...(() => {
                        if (summary) {
                            return [
                                '---',
                                'Summary of the conversation so far:',
                                summary
                            ]
                        }
                        return []
                    })(),
                    '---',
                    'Please search the web and write the latest and accurate code in the monaco editor that meets the requirement, review the code and ensure no issues are found'
                ].filter(Boolean).join('\n')
            ].join('\n');

            // Add a final reminder about current code AFTER the conversation history
            const finalCodeReminder = new SystemMessage({
                content: [
                    '═══════════════════════════════════════════════════════════════',
                    '🔴 REMINDER: IGNORE ALL PREVIOUS CODE REFERENCES 🔴',
                    '═══════════════════════════════════════════════════════════════',
                    'Before you proceed, remember:',
                    `- Current code timestamp: ${new Date().toISOString()}`,
                    '- The ONLY valid code is shown in the first system message',
                    '- ALL code mentioned in conversation history above is OUTDATED',
                    '- If user\'s change requests were rejected, the code does NOT contain those changes',
                    '- When user asks to modify/delete something, FIRST verify it exists in current code',
                    '- DO NOT say "already done" unless you can see the change in the current code from first message',
                    '═══════════════════════════════════════════════════════════════'
                ].join('\n')
            });

            const msgs = [
                new SystemMessage({
                    content: systemMessageContent
                }),
                ...messages,
                finalCodeReminder
            ]

            let controllerClosed = false;
            const abortController = new AbortController();
            
            // If an external abort signal is provided, listen to it and abort our controller
            if (abortSignal) {
                // Check if already aborted
                if (abortSignal.aborted) {
                    try {
                        abortController.abort();
                    } catch (e) {
                        // Ignore abort errors
                    }
                } else {
                    abortSignal.addEventListener('abort', () => {
                        try {
                            abortController.abort();
                        } catch (e) {
                            // Ignore abort errors
                        }
                    });
                }
            }

            let hb: NodeJS.Timeout = setInterval(() => {
                try {
                    const pingData = { ping: true };
                    controller.enqueue(encoder.encode(`${JSON.stringify(pingData)}\n`));
                } catch (e) {
                    clearInterval(hb);
                }
            }, 10 * 1000);

            try {
                for await (const chunk of await agent.stream({
                    messages: msgs
                }, { configurable: { thread_id: "123" }, signal: abortController.signal, streamMode: 'messages', recursionLimit: 100 })) {
                    //  console.log('Pushing chunk...');
                    try {
                        // Skip if chunk is empty or chunk[0] is undefined
                        if (!chunk || !chunk[0]) {
                            continue;
                        }

                        // Skip if chunk[0] doesn't have an id property
                        if (!chunk[0].id) {
                            continue;
                        }

                        // await new Promise(resolve => setTimeout(resolve, 1000));
                        if (gathered.length === 0) {
                            gathered.push(chunk[0]);
                        } else {
                            const lastMessageId = gathered[gathered.length - 1]?.id;
                            if (chunk[0].id !== lastMessageId) {
                                gathered.push(chunk[0]);
                            } else {
                                gathered[gathered.length - 1] = concat(gathered[gathered.length - 1], chunk[0]);
                            }
                        }

                        if (!controllerClosed) {
                            try {
                                const chunkData = chunk[0].toDict();
                                const jsonString = JSON.stringify(chunkData);
                                controller.enqueue(encoder.encode(`${jsonString}\n`));
                            } catch (jsonError) {
                                console.error('Error serializing chunk to JSON:', jsonError);
                                // Send error chunk instead of crashing
                                const errorChunk = {
                                    type: 'error',
                                    data: { content: 'Error processing response chunk' }
                                };
                                controller.enqueue(encoder.encode(`${JSON.stringify(errorChunk)}\n`));
                            }
                        }
                    } catch (e) {
                        console.log('Error 2', e);
                        abortController.abort();
                    }
                }

                if (triggerMode && !controllerClosed) {
                    try {
                        const frequencyData = {
                            type: 'frequency-set',
                            data: triggerMode
                        };
                        controller.enqueue(encoder.encode(`${JSON.stringify(frequencyData)}\n`));
                    } catch (jsonError) {
                        console.error('Error serializing frequency data:', jsonError);
                    }
                }
    
                const op = await getDb().collection('automations').updateOne({ _id: ObjectId.createFromHexString(automationId as any) }, {
                    $set: {
                        initialChatTriggered: true
                    }
                });

                if (gathered.length > 0) {
                    chatContext.messages.push(...gathered.map((g) => g.toDict()));
                    const op = await getDb().collection('chatContext').updateOne({ automationId }, { $set: { 
                        messages: chatContext.messages.filter((m) => {
                            if (m.type === 'ai') {
                                if (m?.data?.tool_calls?.length > 0) {
                                    return m?.data?.tool_calls.some((tc: any) => tc.name === 'extract') === false;
                                }
                            }
                            
                            return true;
                        }) 
                    } }, { upsert: true });
                    console.log('Updated chat context', op);
                } 

                
                if (usedEnvironmentVariables.length > 0) {
                    let scriptUsedEnvironmentVariables: any = [];
                    for (const envVar of usedEnvironmentVariables) {
                        const existingEnvVar = existingEnvVars.find((env: any) => env.name === envVar);
                        if (existingEnvVar && existingEnvVar.value) {
                            // Check if value is an object (multi-environment structure)
                            if (typeof existingEnvVar.value === 'object') {
                                // Multi-environment structure
                                if(effectiveRuntimeEnvironment === 'dev') {
                                    scriptUsedEnvironmentVariables.push({
                                        name: envVar,
                                        value: decrypt(existingEnvVar.value.dev)
                                    });
                                } else if(effectiveRuntimeEnvironment === 'test') {
                                    scriptUsedEnvironmentVariables.push({
                                        name: envVar,
                                        value: decrypt(existingEnvVar.value.test)
                                    });
                                }
                                else if(effectiveRuntimeEnvironment === 'production') {
                                    scriptUsedEnvironmentVariables.push({
                                        name: envVar,
                                        value: decrypt(existingEnvVar.value.production)
                                    });
                                }
                            } else {
                                // Single value (applies to all environments)
                                scriptUsedEnvironmentVariables.push({
                                    name: envVar,
                                    value: decrypt(existingEnvVar.value)
                                });
                            }
                        }
                        else {
                            scriptUsedEnvironmentVariables.push({
                                name: envVar,
                                value: ""
                            });
                        }
                    }
                    try {
                        const envVarsData = {
                            type: 'used-environment-variables',
                            data: scriptUsedEnvironmentVariables
                        };
                        controller.enqueue(encoder.encode(`${JSON.stringify(envVarsData)}\n`));
                    } catch (jsonError) {
                        console.error('Error serializing environment variables data:', jsonError);
                    }
                }

                if (!controllerClosed) {
                    controller.close();
                    controllerClosed = true;
                }
            } catch (e: any) {
                // If this is an abort error, don't send error message to client
                if (e.name === 'AbortError' || abortController.signal.aborted) {
                    if (!controllerClosed) {
                        controller.close();
                        controllerClosed = true;
                    }
                    return;
                }
                
                if (!controllerClosed) {
                    try {
                        const errorData = {
                            type: 'error',
                            data: {
                                content: e.message || 'Unknown error occurred'
                            }
                        };
                        controller.enqueue(encoder.encode(`${JSON.stringify(errorData)}\n`));
                    } catch (jsonError) {
                        console.error('Error serializing error data:', jsonError);
                        // Send a simple error message if JSON serialization fails
                        controller.enqueue(encoder.encode(`{"type":"error","data":{"content":"Error occurred"}}\n`));
                    }
                    
                    controller.close();
                    controllerClosed = true;
                }
            } finally {
                clearInterval(hb);
                await Promise.resolve(cb && cb());
            }
        }
    });

    return stream;
}
function doesStringContainsOnlyText(str: string) {
    // Check if string contains only letters (no numbers or special characters)
    return /^[a-zA-Z]+$/.test(str);
}

function extractElementSelector(elem: HTMLElement, totalSiblings: number = 1, index: number = 1): null | string {
    const elemId = elem.id;
    if (elemId && doesStringContainsOnlyText(elemId)) {
        return `#${elemId}`;
    }

    let selector = String(elem?.tagName).toLowerCase();

    if (totalSiblings > 1) {
        selector = `${selector}:nth-child(${index})`;
    }

    if (selector && selector?.toLowerCase() === 'null') {
        return null;
    }

    return selector;
}

function traverseAndExtractSelectors(elem: HTMLElement, collector: (string | null)[] = []): (string | null)[] {
    let totalSiblings: number = 1, index: number = 0;

    if (elem.parentNode) {
        totalSiblings = elem.parentNode?.children?.length || 1;
        let parent = elem.parentNode as HTMLElement;
        if (parent && parent?.children?.length > 1) {
            for (const item of parent.children) {
                index++;
                if (item === elem) {
                    break;
                }
            }
        }
    }

    const mainSelector = extractElementSelector(elem, totalSiblings, index);
    collector.unshift(mainSelector);

    if (elem.parentNode) {
        if (elem.classList.contains('QFieH')) {
            console.log('dz', elem.parentNode, totalSiblings, index);
        }
        
        traverseAndExtractSelectors(elem.parentNode as HTMLElement, collector);
    }

    return collector;
}

const nodeTypeMap = {
    1: 'element',
    2: 'attribute',
    3: 'text',
    4: 'comment',
    5: 'document',
    6: 'doctype',
    7: 'fragment',
}

async function htmlToTokens(html: string) {
    const tokens: { nodeId: number, node?: string, tagName: string, selector: string, text: string, attributes: any[] }[] = [];
    const root = htmlParse(html);

    let nodeId = 100;

    const traverse = (node: HTMLElement | Element) => {
        const tagName = String(node?.tagName).toLowerCase();
        const contentEditable = String(node?.getAttribute && node?.getAttribute('contenteditable')) === 'true' || false;
        if (tagName === 'script' || tagName === 'style' || tagName === 'svg' || tagName === 'noscript') {
            return;
        } else if (['title', 'a', 'button', 'input', 'textarea', 'select', 'option', 'label', 'p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].indexOf(tagName) > -1 || contentEditable === true) {
            let text = String((node as HTMLElement)?.innerText).replace(/\t/g, '').replace(/\n/g, '').replace(/\s+/g, ' ').trim()
            
            const valueAttr = node?.getAttribute('value');

            if (tagName === 'input' || tagName === 'textarea' || contentEditable === true) {
                const id = node?.getAttribute('id');
                if (id) {
                    const label = root.querySelector(`label[for="${id}"]`);
                    if (label) {
                        text = String(label?.innerText).replace(/\t/g, '').replace(/\n/g, '').replace(/\s+/g, ' ').trim()
                    }
                }
                const placeholder = node?.getAttribute('placeholder');
                const ariaLabel = node?.getAttribute('aria-label');
                text = String(`${text}${placeholder ? ` Placeholder: ${placeholder}` : ''}${ariaLabel ? ` Aria label: ${ariaLabel}` : ''}${valueAttr ? ` Value: ${valueAttr}` : ''}`).trim();
            }

            const typeAttr = node?.getAttribute('type');
            const nameAttr = node?.getAttribute('name');
            const roleAttr = node?.getAttribute('role');

            const attributes: any[] = [];

            if (contentEditable === true) {
                attributes.push({
                    name: 'contenteditable',
                    value: 'true'
                });
            }

            if (roleAttr) {
                attributes.push({
                    name: 'role',
                    value: roleAttr
                });
            }

            if (typeAttr) {
                attributes.push({
                    name: 'type',
                    value: typeAttr
                });
            }

            if (nameAttr) {
                attributes.push({
                    name: 'name',
                    value: nameAttr
                });
            }

            if (valueAttr) {
                attributes.push({
                    name: 'value',
                    value: valueAttr
                });
            }

            if (contentEditable === true && node?.getAttribute('aria-label') === 'To') {
                console.log('dz', node?.getAttribute('aria-label'), traverseAndExtractSelectors(node as HTMLElement).filter(Boolean).join(' > '));
            }

            tokens.push({
                nodeId: nodeId++,
                tagName,
                selector: traverseAndExtractSelectors(node as HTMLElement).filter(Boolean).join(' > '),
                text,
                attributes
            })
        } else {
            // @ts-ignore
            if (node.nodeType === 3) {
                const text = (node as HTMLElement).innerText.replace(/\t/g, '').replace(/\n/g, '').replace(/\s+/g, ' ').trim();
                if (text) {
                    tokens.push({
                        nodeId: nodeId++,
                        node: 'text',
                        tagName: '',
                        selector: '',
                        text,
                        attributes: []
                    })
                }
            }

            for (const child of node.childNodes) {
                traverse(child as HTMLElement);
            }
        }
    }

    traverse(root as any);

    return tokens;
}

export async function findSelectors(html: string, promptToFindSelectors: string) {
    const tokens = await htmlToTokens(html);
    const filteredTokens = tokens.filter((t) => Boolean(t.text));

    // return filteredTokens;


    const model = new AzureChatOpenAI(await getModelConfig(model));

    const structuredModelToFindAllNodeIds = model.withStructuredOutput(z.object({
        intention: z.enum(['click', 'type', 'select']).describe([
            'The intention of the user to interact with the element',
            'Click: The user wants to click on the element',
            'Type: The user wants to type in the element (must be an input or textarea or any input field',
            'Select: The user wants to select the element'
        ].join('\n')),
        nodeIds: z.array(
            z.number().describe([
                'The node ids of the elements matching the prompt'
            ].join('\n'))
        )
    }));

    const result = await structuredModelToFindAllNodeIds.invoke([
        new SystemMessage({
            content: [
                'You will be given a list of tokens extracted from a html page',
                'You must find the node id of the element matching the prompt',
                'The prompt is:',
                promptToFindSelectors,
                'The list of tokens is:',
                JSON.stringify(filteredTokens)
            ].join('\n')
        })
    ]);
    
    let matchingNodeId = null;

    if (result.nodeIds.length < 1) {
        return {
            selector: null,
            intention: null,
            __node: null
        }
    }

    if (result.nodeIds.length > 1) {
        const matchedNodes = filteredTokens.filter((t) => result.nodeIds.indexOf(t.nodeId) > -1);
        console.log('Matching nodes', matchedNodes);

        const structuredModelToFindSingleNode = model.withStructuredOutput(z.object({
            nodeId: z.number().describe([
                'The node id of the element matching the prompt'
            ].join('\n'))
        }));

        const result2 = await structuredModelToFindSingleNode.invoke([
            new SystemMessage({
                content: [
                    'You will be given a list of tokens extracted from a html page',
                    'You must find the node id of the element matching the prompt',
                    'The prompt is:',
                    promptToFindSelectors,
                    'The list of tokens is:',
                    JSON.stringify(matchedNodes)
                ].join('\n')
            })
        ]);

        matchingNodeId = result2?.nodeId;

    } else {
        matchingNodeId = result.nodeIds[0];
    }

    const nodeId = matchingNodeId;
    const node = filteredTokens.find((t) => t.nodeId === nodeId);

    console.log('Matched node', node);

    return {
        selector: node?.selector,
        intention: result?.intention,
        __node: node
    };
}

function convertTokenToHtml(token: any) {
    let tag = 'div';

    switch (token.node) {
        case 'text':
            tag = 'span';
            break;
        default:
            tag = token.tagName;
            break;
    }

    return `<${tag}${token.attributes.map((attr: any) => ` ${attr.name}="${attr.value}"`).join('')}>${token.text}</${tag}>`;
}

function generateHtmlFromTokens(tokens: any[]) {
    const { headTags, bodyTags } = tokens.reduce((acc, tok) => {
        if (tok.tagName === 'title') {
            acc.headTags.push(tok);
        } else {
            acc.bodyTags.push(tok);
        }

        return acc;
    }, { headTags: [], bodyTags: [] });

    
    let res = (
        `<html><head>${headTags.map(convertTokenToHtml).join('')}</head><body>${bodyTags.map(convertTokenToHtml).join('')}</body></html>`
    );

    res = prettify(res);

    return res;
}

export async function extractTextFromHtml(html: string) {
    const tokens = await htmlToTokens(html);
    const filteredTokens = tokens.filter((t) => Boolean(t.text));

    // return filteredTokens;

    const out = generateHtmlFromTokens(filteredTokens);

    return out;
}

function hashString(input) {
    return crypto
        .createHash('sha256')   // choose the algorithm: 'sha256', 'sha512', 'md5', etc.
        .update(input)          // add the string
        .digest('hex');         // output format: 'hex' | 'base64' | 'latin1'
}

export async function explainLogs(automationId: string, logs: string[], executionStatus: string) {
    const GAME_PROMPT = fs.readFileSync(path.join(process.cwd(), 'prompts', 'game2_prompt.md'), 'utf-8');
    
    const automation: any = await getDb().collection('automations').findOne({ _id: ObjectId.createFromHexString(automationId as any) });

    if (!automation) {
        throw new Error('Automation not found');
    }

    const code = automation?.code;

    const fullPrompt = [
        GAME_PROMPT,
        '---',
        'The current code in monaco editor is:',
        code,
        '---',
        'You are an AI integrated into the log explainer. You will be given the latest logs from running the automation',
        'Your life goal is to help the non technical user to understand what is happening and what he should do next with the code he has developed.',
        'Please analyse the log and help the non technical user to understand what is happening and what he should do next',
        `Current status of the automation is: ${executionStatus}`,
        'List of logs:',
        '---',
        logs.length > 0 ? logs.join('\n') : 'No logs produced yet',
        '---'
    ].join('\n');

    const hash = hashString(fullPrompt);
    const cachedResult = await getDb().collection('cachedExplainerLogs').findOne({ hash });

    if (cachedResult?.result) {
        return cachedResult.result;
    }

    const model = new AzureChatOpenAI(await getModelConfig('gpt-4.1-nano'));

    const structuredModel = model.withStructuredOutput(z.object({
        explanation: z.string().describe([
            'Assume the user is a non technical user. Generate friendly, short and consice explanation of the logs',
            'Examples:',
            '- Fetching data from API',
            '- Analysing data using vendor',
            '- Sending email using vendor / tech',
            'etc...'
        ].join('\n')),
        whatToDoNext: z.string().describe([
            'Assume the user is a non technical user. Generate the next steps the user should take to fix the issue in friendly, short and concise manner',
            'Examples:',
            '- Automation is successful, please check the output in the logs or files.',
            '- Try fixing the code using AI',
            '- Make sure to provide all necessary environment variables',
            '- Check if the vendor / tech is working correctly',
            '- Check with your IT team to ensure your API keys have enough permissions',
            'etc...'
        ].join('\n'))
    }));

    const result = await structuredModel.invoke([
        new SystemMessage({
            content: fullPrompt
        })
    ]);

    await getDb().collection('cachedExplainerLogs').insertOne({ hash, result });

    return result;
}

export async function updateWorkflowStep(automationId: string, logs: string[], executionStatus: string, finalWorkflow: any) {
    const GAME_PROMPT = fs.readFileSync(path.join(process.cwd(), 'prompts', 'game2_prompt.md'), 'utf-8');
    
    if (finalWorkflow?.steps?.length === 0) {
        return finalWorkflow;
    }

    const automation: any = await getDb().collection('automations').findOne({ _id: ObjectId.createFromHexString(automationId as any) });

    if (!automation) {
        throw new Error('Automation not found');
    }

    const code = automation?.code;

    const fullPrompt = [
        GAME_PROMPT,
        '---',
        'The current code in monaco editor is:',
        code,
        '---',
        'Act as an AI behind the workflow display widget. Where you have to analyse the running code and the latest log and update the workflow accordingly',
        'The current workflow is:',
        JSON.stringify(finalWorkflow),
        '---',
        'The latest logs are:',
        '---',
        logs.length > 0 ? logs.join('\n') : 'No logs produced yet',
        '---',
        'There are some marker logs which you can use to understand the status of the workflow, I have explained them below:',
        'Marker 1: "Triggered execution": This means the workflow has been triggered, the next step would be to install necessary dependencies',
        'Marker 2: "Running latest changes...": This means the actual code is about to run',
        '> After marker 2, you can expect the logs from the script',
        'Marker 3: "Run complete with exit code": This means the script has finished running, based on the exit code you can understand the status of the script',
        '---',
        'Please update the status of each step in the workflow based on the latest logs and the current code',
    ].join('\n');

    const hashedPrompt = hashString(fullPrompt);
    const cachedResult = await getDb().collection('cachedWorkflowUpdates').findOne({ automationId, hash: hashedPrompt });

    if (cachedResult?.result) {
        return cachedResult.result;
    }

    const model = new AzureChatOpenAI(await getModelConfig());

    const structuredModel = model.withStructuredOutput(z.object({
        ...finalWorkflow.steps.reduce((acc, step) => {
            acc[step.id] = z.object({
                status: z.enum(['pending', 'running', 'completed', 'failed', 'cancelled']).describe([
                    `Status of step "${step.name || step.id}": ${step.description || 'No description available'}`,
                    'pending: Step is queued and waiting to be executed',
                    'running: Step is currently being executed and processing', 
                    'completed: Step has finished successfully and produced the expected output',
                    'failed: Step encountered an error and could not complete successfully',
                    'cancelled: Step was stopped due to a previous step failure or manual intervention'
                ].join('\n')),
                explanation: z.string().describe([
                    'Analyze the step code AND execution logs to generate specific sub-steps that show what actually happened.',
                    'Break down the step into detailed sub-actions based on the code execution and log messages.',
                    'Format: List each sub-step that occurred during execution.',
                    'Examples:',
                    'If step is "Fetch contacts from HubSpot", show sub-steps like:',
                    '• Got HubSpot token via environment variable',
                    '• Accessing HubSpot API endpoint',
                    '• Fetched 150 contacts from HubSpot',
                    '• Validated contact data format',
                    'If step is "Send email notification", show sub-steps like:',
                    '• Connected to SMTP server',
                    '• Validated recipient email addresses',
                    '• Composed email message',
                    '• Sent email to 5 recipients',
                    'Base sub-steps on actual code functions and log messages from execution.',
                    'DO NOT use generic descriptions like "Processing data" or "Handling requests".'
                ].join('\n'))
            });
            return acc;
        }, {})
    }));

    const result = await structuredModel.invoke([
        new SystemMessage({
            content: fullPrompt
        })
    ]);

    for (const step of finalWorkflow.steps) {
        step.status = result[step.id]?.status;
        step.explanation = result[step.id]?.explanation;
    }

    await getDb().collection('cachedWorkflowUpdates').insertOne({ automationId, hash: hashedPrompt, result: finalWorkflow });

    // await getDb().collection('test_workflows').insertOne({ automationId, workflow: finalWorkflow, logs, executionStatus });

    return finalWorkflow;
}

export async function generateWorkflow(automationId: string, newCode?: string, runtimeEnvironmentOverride?: 'dev' | 'test' | 'production') {
    const automation = await getDb().collection('automations').findOne({ _id: ObjectId.createFromHexString(automationId as any) });

    if (!automation) {
        throw new Error('Automation not found');
    }

    // Determine effective runtime environment: override takes precedence over automation default
    const effectiveRuntimeEnvironment = runtimeEnvironmentOverride || automation?.runtimeEnvironment || 'dev';

    let code = automation?.code;

    if (newCode) {
        code = newCode;
    }

    if (!code) {
        return {
            steps: []
        }
    }

    const hashedCode = hashString(code);
    const cachedResult = await getDb().collection('cachedWorkflows').findOne({ automationId, hash: hashedCode });

    if (cachedResult?.result) {
        return cachedResult.result;
    }

    const model = new AzureChatOpenAI(await getModelConfig());

    const vendorIcons = [
        "airtable",
        "ansible",
        "apache-airflow",
        "apache-kafka",
        "apache",
        "asana",
        "atlassian",
        "azure",
        "bitbucket",
        "box",
        "braintree",
        "calendly",
        "canva",
        "circleci",
        "cisco",
        "clickup",
        "cloudflare",
        "confluence",
        "datadog",
        "docker",
        "dropbox",
        "elastic",
        "fastly",
        "figma",
        "fortinet",
        "github-actions",
        "github",
        "gitlab",
        "gmail",
        "google-cloud",
        "google-drive",
        "grafana",
        "hashicorp",
        "hubspot",
        "insomnia",
        "intercom",
        "jenkins",
        "jira",
        "kibana",
        "kubernetes",
        "looker",
        "mailchimp",
        "miro",
        "mixpanel",
        "mongodb",
        "mysql",
        "netlify",
        "new-relic",
        "nginx",
        "notion",
        "okta",
        "pagerduty",
        "palo-alto-networks",
        "paypal",
        "postgresql",
        "prometheus",
        "quickbooks",
        "red-hat",
        "redis",
        "salesforce",
        "sap",
        "sendgrid",
        "sentry",
        "shopify",
        "slack",
        "snowflake",
        "splunk",
        "stripe",
        "terraform",
        "trello",
        "twilio",
        "ubuntu",
        "vercel",
        "woocommerce",
        "wordpress",
        "xero",
        "zapier",
        "zendesk",
        "zoom",
        "other"
    ];

    const structuredModel = model.withStructuredOutput(z.object({
        steps: z.array(
            z.object({
                title: z.string().describe('The title of the step. E.g. Summarising using OpenAI'),
                icon: z.enum(['web', 'api', 'database', 'crm', 'email', 'notification', 'file', 'calendar', 'settings', 'other']).describe('The icon to display for the step'),
                vendorIcon: z.string([
                    "We have icons for the following vendors:",
                    ...vendorIcons
                ].join('\n')).describe([
                    'The icon of the vendor to display for the step. Choose other if the vendor is not listed or not applicable'
                ].join('\n'))
            })
        ).describe([
            'The steps of the workflow'
        ].join('\n')).describe(
            [
                'Example steps:',
                'Step 1: Start',
                'Step 2: Fetch data from API',
                'Step 3: Process data',
                'Step 4: Send email',
                'Step 5: End'
            ].join('\n')
        )
    }));

    const result = await structuredModel.invoke([
        new SystemMessage({
            content: [
                'You are a workflow generator. Analyse the given code and convert it into workflow steps that can be easily understood by a non technical user.',
                'The code is:',
                code
            ].join('\n')
        })
    ]);

    let i = 0;
    for (const step of result.steps) {
        i++;
        step.id = `step-${i}`;
    }

    await getDb().collection('automation_workflows').updateOne({ automationId }, { $set: { workflow: result } }, { upsert: true });
    await getDb().collection('cachedWorkflows').updateOne({ automationId, hash: hashedCode }, { $set: { result } }, { upsert: true });

    return result;
}