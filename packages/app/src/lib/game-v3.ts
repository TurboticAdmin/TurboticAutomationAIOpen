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

// Consolidated anti-placeholder instructions used across all code generation tools
const ANTI_PLACEHOLDER_INSTRUCTIONS = [
    '',
    'CRITICAL REQUIREMENTS - READ CAREFULLY:',
    '- Output ONLY one code block with the complete file content.',
    '- ABSOLUTELY FORBIDDEN: Do NOT use placeholders such as `/* ... unchanged ... */`, `// unchanged`, `// ... (rest of the original code remains unchanged) ...`, `/* ... unchanged ... */`, `// changed`, `...`, or ANY similar placeholders.',
    '- ABSOLUTELY FORBIDDEN: Do NOT say that parts are "unchanged" or omit them for brevity.',
    '- ABSOLUTELY FORBIDDEN: Do NOT use ellipsis (...) to indicate omitted code.',
    '- ABSOLUTELY FORBIDDEN: Do NOT write comments like "rest of code unchanged" or "remaining code stays the same".',
    '- Never remove or omit any existing function, class, or code unless I explicitly say "DELETE" that part.',
    '- If you modify any function or block, include the entire updated function or block in full.',
    '- Preserve all other code exactly as it appears in the input - copy it line by line.',
    '- For files with 100+ lines, you MUST include ALL lines - no exceptions.',
    '- Do not add any explanation, comments, or text outside the code block.',
    '',
    'REMEMBER: The output will overwrite the entire file. If you leave anything out, it is PERMANENTLY LOST.',
    'REMEMBER: Users will lose their code if you use placeholders or omit sections.',
    'REMEMBER: Always return the full, self-contained file with EVERY line included.',
    'REMEMBER: Even if the file is 500+ lines, you MUST include ALL of it.',
].join('\n');
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

    // Vision-capable config
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

            const orphanedMessages = (() => {
                const toolResponses = preservedMessages?.filter((m) => m?.type === 'tool') || [];
                return toolResponses.filter((res) => {
                    const toolCallId = res?.data?.tool_call_id;
                    const matchingToolCall = preservedMessages.find((m) => {
                        if (m?.type !== 'ai') return false;
                        const calls = m?.data?.tool_calls || m?.data?.additional_kwargs?.tool_calls || [];
                        return Array.isArray(calls) && calls.find((call: any) => (call?.id || call?.tool_call_id || call?.function?.id) === toolCallId);
                    });
                    return !Boolean(matchingToolCall);
                });
            })()
    
            if (numberOfMessagesPushed >= 5 && message.type === 'ai' && orphanedMessages.length === 0) {
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

// Reorders messages so that any assistant message with tool_calls is
// immediately followed by the corresponding tool response messages.
// If a tool response is missing, the tool_calls are stripped from the assistant message
// to prevent protocol errors.
function sanitizeMessagesForLangChain(messages: any[]): any[] {
    if (!Array.isArray(messages) || messages.length === 0) return Array.isArray(messages) ? messages.slice() : [];

    const result: any[] = [];
    const consumedToolMessageIndexes = new Set<number>();

    // Helper to find the next unconsumed tool message responding to a specific id
    function findNextToolResponse(startIndex: number, toolCallId: string): number | null {
        for (let j = startIndex + 1; j < messages.length; j++) {
            if (consumedToolMessageIndexes.has(j)) continue;
            const candidate = messages[j];
            if (candidate?.type === 'tool' && candidate?.data?.tool_call_id === toolCallId) {
                return j;
            }
        }
        return null;
    }

    for (let i = 0; i < messages.length; i++) {
        if (consumedToolMessageIndexes.has(i)) continue;
        const msg = messages[i];

        // Only reorder around assistant messages that requested tools
        if (msg?.type === 'ai') {
            const toolCalls = msg?.data?.tool_calls || msg?.data?.additional_kwargs?.tool_calls || [];
            if (Array.isArray(toolCalls) && toolCalls.length > 0) {
                // Try to gather matching tool responses for each tool_call id in order
                const matchingToolIndexes: number[] = [];
                for (const tc of toolCalls) {
                    const toolCallId = tc?.id || tc?.function?.id || tc?.tool_call_id || tc?.call_id;
                    if (!toolCallId) {
                        matchingToolIndexes.push(null as any);
                        continue;
                    }
                    const foundIndex = findNextToolResponse(i, toolCallId);
                    matchingToolIndexes.push(foundIndex as any);
                }

                const allFound = matchingToolIndexes.every((idx) => typeof idx === 'number' && idx !== null);

                // If all tool responses are found, emit assistant then those tool messages immediately
                if (allFound) {
                    result.push(msg);
                    for (let k = 0; k < matchingToolIndexes.length; k++) {
                        const idx = matchingToolIndexes[k] as number;
                        if (typeof idx === 'number') {
                            result.push(messages[idx]);
                            consumedToolMessageIndexes.add(idx);
                        }
                    }
                    continue;
                }

                // If one or more tool responses are missing, strip tool_calls to avoid protocol error
                const sanitizedAi = { ...msg, data: { ...msg?.data } };
                if (sanitizedAi?.data) {
                    if (sanitizedAi.data.tool_calls) sanitizedAi.data.tool_calls = [];
                    if (sanitizedAi.data.additional_kwargs?.tool_calls) {
                        sanitizedAi.data.additional_kwargs = {
                            ...sanitizedAi.data.additional_kwargs,
                            tool_calls: []
                        };
                    }
                }
                result.push(sanitizedAi);
                continue;
            }
        }

        // Default behavior: keep message as-is
        result.push(msg);
    }

    return result;
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

let counter = 0;

async function generateChangeSummaryForLatestCode(steps: Array<{ id: string; name: string; code: string }>, whatToChange: string, model?: Models) {
    try {
        const summariserModel = new AzureChatOpenAI(await getModelConfig(model));
        let GAME_PROMPT = fs.readFileSync(path.join(process.cwd(), 'prompts', 'game3_prompt.md'), 'utf-8');

        const stepsText = steps.length > 0
            ? steps.map((s, idx) => [
                `Step ${idx + 1}: ${s.name}`,
                `ID: ${s.id}`,
                'Code:',
                s.code || '',
                '---'
            ].join('\n')).join('\n')
            : 'No steps currently exist.';

        const summaryMsg = await summariserModel.invoke([
            new SystemMessage({
                content: [
                    GAME_PROMPT,
                    '---',
                    'You are an AI assistant embedded in a code automation editor.',
                    'Given the latest set of steps (with code) and a requested change, produce a crisp, actionable plan.',
                    'Focus on exactly which steps to modify, what to add/remove, and any environment variables or dependencies impacted.',
                    'Respond with 3-7 bullet points, then end with a single-line summary starting with: NEXT_ACTION_SUMMARY: ...',
                    '---',
                    'Requested change:',
                    whatToChange || 'N/A',
                    '---',
                    'Latest code snapshot (version 3):',
                    stepsText,
                    'Write the summary from a reviewer perspective, something like "The user has modified the code to..."'
                ].join('\n')
            })
        ]);

        return typeof summaryMsg?.content === 'string' ? summaryMsg.content : convertAIMessageToString(summaryMsg);
    } catch (e: any) {
        return `Unable to generate summary: ${e?.message || 'Unknown error'}`;
    }
}

export async function generateResponseV3(automationId: string, message: string, model?: Models, cb?: any, currentCodeFromFrontend?: string, abortSignal?: AbortSignal, runtimeEnvironmentOverride?: 'dev' | 'test' | 'production') {
    let GAME_PROMPT = fs.readFileSync(path.join(process.cwd(), 'prompts', 'game3_prompt.md'), 'utf-8');

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

    // Determine effective runtime environment: override takes precedence over automation default
    const effectiveRuntimeEnvironment = runtimeEnvironmentOverride || automation?.runtimeEnvironment || 'dev';
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
let usedDependencies: any[] = [];
  
    const agentTools: any[] = [
        new DynamicStructuredTool({
            name: 'create-step',
            description: [
                'Use this tool to create a new step in the automation',
                'Each automation consists of multiple sequential steps that run in order',
                'IMPORTANT: Only create new steps when the requirement truly needs additional steps. If modifying existing steps can achieve the goal, use update-step instead',
                'IMPORTANT WORKFLOW: Plan all steps first in your thinking, then create ALL steps at once using multiple create-step calls, THEN update all steps with update-step',
                'Call this tool multiple times in a row to create all steps needed for the automation (e.g., if you need 3 steps, call this tool 3 times in a row)',
                'After adding new steps, clean up any unnecessary or obsolete steps using delete-step'
            ].join('\n'),
            schema: z.object({
                name: z.string().describe('A descriptive name for the step WITHOUT step numbers (e.g., "Fetch Data" not "Step 1: Fetch Data") - the UI automatically displays step numbers'),
                index: z.number().describe('The position/index of this step (1-based: first step is 1, second step is 2, etc.)'),
            }),
            async func({ name, index }) {
                // Generate a temporary stepId for the AI to use in subsequent calls
                const now = new Date();
                const stepId = `${now.getTime()}_${counter++}`;
                // Just return the step data with the stepId, don't update DB
                // Frontend will handle the DB update and use its own stepId
                return JSON.stringify({ stepName: name, action: 'create-step', tempStepId: stepId, index });
            },
        }),
        new DynamicStructuredTool({
            name: 'update-step',
            description: [
                'Use this tool to update an existing step (both name and code)',
                'PREFERRED: Always use this tool to modify existing steps when the user wants to change functionality',
                'If the requirement can be achieved by modifying an existing step, use this tool instead of creating new steps',
                'IMPORTANT WORKFLOW: After creating ALL steps with create-step, use this tool to update ALL steps',
                'Call this tool multiple times in a row to update all steps (e.g., if you created 3 steps, call this tool 3 times in a row)',
                'The code you write should be self-contained and use setContext()/getContext() for data sharing'
            ].join('\n'),
            schema: z.object({
                stepId: z.string().describe('The ID of the step to update (obtained from create-step response or from frontend)'),
                name: z.string().optional().describe('Optional: New name for the step (without step numbers)'),
                currentStateOfTheCode: z.string().describe('A short description of the current state of the code that needs an update'),
                whatToChange: z.string().describe('The what to change in the code'),
                code: z.string().describe([
                    'The complete code for this step. Make sure to include full code not only the updated parts. The full code will over write the existing code in the monaco editor.',
                    'You are editing a source code file that will be completely overwritten in the Monaco editor.',
                    '',
                    'You will always output the FULL, FINAL CONTENT of the file, not a diff.',
                    ANTI_PLACEHOLDER_INSTRUCTIONS,
                ].join('\n')),
                environmentVariablesUsed: z.array(z.string()).describe('List of environment variables used in the code'),
                dependenciesUsed: z.array(
                    z.object({
                        name: z.string().describe('The name of the dependency'),
                        version: z.enum(['latest']).describe('Usually the latest'),
                    })
                ).describe('List of dependencies used in the code')
            }),
            async func({ stepId, name, code, environmentVariablesUsed, dependenciesUsed }) {
                // Store environment variables and dependencies for later processing
                usedEnvironmentVariables = environmentVariablesUsed || [];
                usedDependencies = dependenciesUsed || [];
                
                // Just return the step update data, don't update DB
                // Frontend will handle the DB update
                return JSON.stringify({ 
                    stepId, 
                    name,
                    code, 
                    action: 'update-step',
                    environmentVariablesUsed,
                    dependenciesUsed
                });
            },
        }),
        new DynamicStructuredTool({
            name: 'delete-step',
            description: [
                'Use this tool to delete an existing step from the automation',
                'Only use this if the user explicitly asks to remove a step'
            ].join('\n'),
            schema: z.object({
                stepId: z.string().describe('The ID of the step to delete'),
            }),
            async func({ stepId }) {
                // Just return the step deletion data, don't update DB
                // Frontend will handle the DB update
                return JSON.stringify({ stepId, action: 'delete-step' });
            },
        }),
        new DynamicStructuredTool({
            name: 'review-code',
            description: [
                'Use this tool to review the automation step code you generated',
                'The tool will validate the code against platform constraints'
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
                        'The code has been written with following issues:',
                        description,
                        'Please correct the issues and rewrite the code using the `update-step` tool. Or clear the code and inform the user about the limitations. No confirmation needed for correcting the issues.'
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
        new DynamicStructuredTool({
            name: 'read-latest-code',
            description: [
                'ALWAYS call this before generating or updating code to ensure you use the latest user-edited code.',
                'Returns the most recent automation code state (version 3 only).',
                'Returns all steps with id, name, and code.',
                'Prefer this tool over any code present in the conversation context.'
            ].join('\n'),
            schema: z.object({
                whatToChange: z.string().describe('The what change is user asking in the latest code?'),
            }),
            async func({ whatToChange }) {
                try {
                    const steps = Array.isArray(automation?.v3Steps)
                        ? automation.v3Steps.map((step: any) => ({
                            id: step.id,
                            name: step.name,
                            code: step.code || ''
                        }))
                        : [];
                    const summary = await generateChangeSummaryForLatestCode(steps, whatToChange, model);
                    return JSON.stringify({ version: '3', steps, summaryOfUserModifiedCode: summary });
                } catch (e: any) {
                    return JSON.stringify({ error: e?.message || 'Failed to read latest code' });
                }
            }
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
    const sanitizedPreservedMessages = sanitizeMessagesForLangChain(preservedMessages);

    const messages: any[] = sanitizedPreservedMessages.map((m: any) => {
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
            // Build steps metadata only (code intentionally omitted). Model must call read-latest-code.
            const stepsMeta = automation?.v3Steps?.length > 0
                ? automation.v3Steps.map((step: any, index: number) =>
                    `Step ${index + 1}: ${step.name}\nID: ${step.id}`
                ).join('\n')
                : 'No steps created yet. Create the first step using the create-step tool.';

            // Fetch schedule data from schedules-v2 (single source of truth)
            const schedule = await getDb().collection('schedules-v2').findOne({ automationId });

            const systemMessageContent = [
                'Today is: ' + new Date().toLocaleDateString(),
                GAME_PROMPT,
                [
                    'The current automation version: 3',
                    'Current steps (metadata only, code intentionally omitted):',
                    stepsMeta,
                    'IMPORTANT: Before writing or updating any step code, call the tool "read-latest-code" to fetch the latest code snapshot. Do NOT rely on any code from this conversation.',
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
                    'Please search the web and manage steps intelligently. PREFER MODIFYING EXISTING STEPS: If the requirement can be achieved by modifying existing step code, use update-step instead of creating new ones. Only create new steps when truly needed. After adding steps, clean up unnecessary ones with delete-step. CRITICAL WORKFLOW FOR NEW AUTOMATIONS: 1) Analyze the requirement and plan ALL steps needed, 2) Create ALL steps at once using multiple create-step calls with indices, 3) Then update ALL steps with code using multiple update-step calls. Step names should be WITHOUT step numbers. Review the code and ensure no issues are found. Do not use node-fetch library since the node runtime already has the fetch API built in.'
                ].filter(Boolean).join('\n')
            ].join('\n');

            // Add a final reminder instructing to use the read-latest-code tool
            const finalCodeReminder = new SystemMessage({
                content: [
                    '═══════════════════════════════════════════════════════════════',
                    '🔴 REMINDER: NEVER TRUST EMBEDDED CODE. FETCH LATEST VIA TOOL 🔴',
                    '═══════════════════════════════════════════════════════════════',
                    'Before you proceed, remember:',
                    `- Current time: ${new Date().toISOString()}`,
                    '- The ONLY valid source of truth is the "read-latest-code" tool',
                    '- ALL code quoted in the conversation may be OUTDATED or edited by the user',
                    '- When modifying code, FIRST call "read-latest-code" and apply changes on that snapshot',
                    '- DO NOT claim a change is present unless you verified it in the latest snapshot',
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
                console.error(e);
                controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'error', data: { content: e.message || 'Unknown error occurred' } })}\n`));
                
                // Only log unexpected errors, not content filter or abort errors
                if (e.code !== 'content_filter' && e.error?.code !== 'content_filter' && e.name !== 'AbortError') {
                    console.error(e);
                }

                // If this is an abort error, don't send error message to client
                if (e.name === 'AbortError' || abortController.signal.aborted) {
                    if (!controllerClosed) {
                        controller.close();
                        controllerClosed = true;
                    }
                    return;
                }

                if (!controllerClosed) {
                    // Determine error message
                    const isContentFilter = e.code === 'content_filter' || e.error?.code === 'content_filter';
                    const errorMessage = isContentFilter
                        ? 'Your message was blocked by the content policy. Please rephrase your request and avoid content that may violate content policies.'
                        : (e.message || 'Unknown error occurred');

                    // Try to send error to client
                    try {
                        const errorData = { type: 'error', data: { content: errorMessage } };
                        controller.enqueue(encoder.encode(`${JSON.stringify(errorData)}\n`));
                    } catch {
                        // Stream already closed, error won't reach client
                    }

                    // Close stream
                    try {
                        controller.close();
                    } catch {
                        // Already closed
                    }
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
