import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { NextApiRequest, NextApiResponse } from "next";
import { TavilySearchResults } from "@langchain/community/tools/tavily_search";
import { AzureChatOpenAI } from "@langchain/openai";
import { BinaryOperatorAggregate, MemorySaver } from "@langchain/langgraph";
import { AIMessage, BaseMessage, HumanMessage, SystemMessage, ToolMessage } from "@langchain/core/messages";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { concat } from "@langchain/core/utils/stream";
import { NextRequest } from "next/server";
import { BlobServiceClient, BlobSASPermissions, generateBlobSASQueryParameters } from '@azure/storage-blob';
import { getStorageConfig } from '@/app/utils/util';
import { ChatAnthropic } from "@langchain/anthropic";
import fs from 'fs';
import path from 'path';
import { generateResponse } from "@/lib/game";
import { generateResponseV3 } from "@/lib/game-v3";
import authenticationBackend from "../../authentication/authentication-backend";
import Joi from 'joi';
import { emailValidator } from "@/lib/email-validation";

// Extend Joi with objectId method
declare module 'joi' {
  interface Root {
    objectId(): any;
  }
}

Joi.objectId = require('joi-objectid')(Joi);

async function analyseOutput(output: string) {
    const model = new ChatAnthropic({ temperature: 0, model: 'claude-3-7-sonnet-20250219' });
    const structuredOutputModel = model.withStructuredOutput(z.object({
        code: z.string().describe('Extract the code from the output'),
        librariesToInstall: z.array(
            z.object({
                name: z.string().describe('The name of the library to install'),
                version: z.string().describe('The version of the library to install, if not specified, use latest version')
            })
        ).describe('Extract the libraries to install from the output'),
        environmentVariables: z.array(
            z.object({
                name: z.string().describe('The name of the environment variable'),
                description: z.string().describe('The description of the environment variable')
            })
        ).describe('Extract the environment variables used in the code'),
        globalVariablesWritten: z.array(
            z.string().describe('The global variables written in the code')
        ).describe('Extract the global variables written in the code')
    }));

    const result = await structuredOutputModel.invoke(`Analyse the following output and extract the information: ${output}`);

    return result;
}

// const SAMPLE_CODE_BOILERPLATE = `
// // Import required libraries

// // Load all the environment variables

// global.registerStep('Friendly title for the step', function() {
//     // Logic goes here
// });
// `;

const SAMPLE_CODE_BOILERPLATE = `
// Import required libraries

// Load all the environment variables

(async function() {
    // Logic goes here
})();
`;

const MAX_RUNNING_INSTANCES = process.env.MAX_CHAT_INSTANCES ? parseInt(process.env.MAX_CHAT_INSTANCES) : 3;
let runningInstances: number = 0;

export async function POST(req: NextRequest) {
    const contentType = req.headers.get('content-type') || '';
    let automationId: string | null = null;
    let model: any = undefined;
    let currentCode: any = undefined;
    let version: any = undefined;
    let message: any = null;
    let images: File[] = [];

    if (contentType.includes('multipart/form-data')) {
        const form = await req.formData();
        automationId = String(form.get('automationId') || '');
        model = form.get('model') as any;
        currentCode = form.get('currentCode') as any;
        version = form.get('version') as any;
        const textMessage = String(form.get('message') || '').trim();
        images = (form.getAll('images') as File[]).filter(Boolean);

        if (!textMessage && images.length === 0) {
            return new Response('No message provided', { status: 400 });
        }

        // Upload images (if any) to Azure Blob and build multimodal content
        let imageUrls: string[] = []; // For storage/display purposes
        let imageBase64Data: string[] = []; // For AI model (base64 encoded)
        if (images.length > 0) {
            const config = getStorageConfig();
            const accountName = config.STORAGE_AZURE_ACCOUNT_NAME as string;
            const accountKey = config.STORAGE_AZURE_ACCOUNT_KEY as string;
            const containerName = config.STORAGE_AZURE_CONTAINER_NAME as string;
            const protocol = config.STORAGE_AZURE_PROTOCOL as string;
            const endpointSuffix = config.STORAGE_AZURE_ENDPOINT_URL as string;
            const rootFolder = (config as any).azureStorageRootFolder as string;

            const connStr = `DefaultEndpointsProtocol=${protocol};AccountName=${accountName};AccountKey=${accountKey};EndpointSuffix=${endpointSuffix}`;
            const blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
            const containerClient = blobServiceClient.getContainerClient(containerName);
            await containerClient.createIfNotExists();

            for (const file of images) {
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const blobName = `${rootFolder}/chat/${automationId}/${timestamp}_${file.name}`;
                const blockBlobClient = containerClient.getBlockBlobClient(blobName);
                const arrayBuffer = await file.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                
                // Convert to base64 for AI model
                const base64String = buffer.toString('base64');
                const mimeType = (file as any).type || 'image/jpeg';
                const dataUrl = `data:${mimeType};base64,${base64String}`;
                imageBase64Data.push(dataUrl);
                
                // Upload to Azure Blob for storage
                await blockBlobClient.upload(buffer, buffer.length, {
                    blobHTTPHeaders: { blobContentType: mimeType }
                });
                const sas = generateBlobSASQueryParameters({
                    containerName,
                    blobName,
                    permissions: BlobSASPermissions.parse('r'),
                    startsOn: new Date(),
                    expiresOn: new Date(Date.now() + 1000 * 60 * 60 * 24 * 90) // 90 days
                }, (blockBlobClient as any).credential).toString();
                const blobUrl = `${blockBlobClient.url}?${sas}`;
                imageUrls.push(blobUrl);

                try {
                    await getDb().collection('files').insertOne({
                        name: file.name,
                        url: blobUrl,
                        size: (file as any).size,
                        type: mimeType,
                        automationId,
                        createdAt: new Date(),
                        context: 'chat'
                    });
                } catch (e) {
                    console.error('[Chat API] Failed to persist file metadata', e);
                }
            }

            // Force a vision-capable model if not provided
            if (!model) {
                model = 'gpt-4o';
            }
        }

        // Build multimodal message content (text + images)
        // Use base64 data URLs for AI model instead of Azure Blob URLs to avoid 403 errors
        const multimodalContent: any[] = [];
        if (textMessage) {
            multimodalContent.push({ type: 'text', text: textMessage });
        }
        if (imageBase64Data.length > 0) {
            multimodalContent.push(...imageBase64Data.map((dataUrl) => ({ type: 'image_url', image_url: { url: dataUrl } })));
        }
        message = multimodalContent.length > 0 ? multimodalContent : textMessage;
    } else {
        const body = await req.json();
        automationId = body.automationId;
        message = body.message;
        model = body.model;
        currentCode = body.currentCode;
        version = body.version;
        if (!message) {
            return new Response('No message provided', { status: 400 });
        }
    }

    // Check user chat capability
    const currentUser = await authenticationBackend.getCurrentUser(req);
    if (currentUser?.email) {
        const capabilities = await emailValidator.getUserCapabilities(currentUser.email);
        if (!capabilities.canChat) {
            return new Response('Chat capability is disabled for your account', { status: 403 });
        }
    }

    // Subscription limits removed for open source

    if (runningInstances >= MAX_RUNNING_INSTANCES) {
        return new Response('Too many instances running', { status: 429 });
    }

    runningInstances++;
    console.log(`Added running instances ${runningInstances}/${MAX_RUNNING_INSTANCES}`);

    let lockReleasedAlready = false;
    const releaseLock = async () => {
        if (lockReleasedAlready) {
            return;
        }

        await new Promise(resolve => setTimeout(resolve, 2000));
        lockReleasedAlready = true;
        runningInstances--;
        console.log(`Removed running instances ${runningInstances}/${MAX_RUNNING_INSTANCES}`);
    }

    try {
        let generateResponseFn = generateResponse;
        
        if (version === '3') {
            generateResponseFn = generateResponseV3;
        }

        const stream = await generateResponseFn(automationId as any, message, model, async () => {
            await releaseLock();
        }, currentCode, req.signal);

        // Subscription tracking removed for open source

        return new Response(stream, {
            headers: {
                "Content-Type": "text/plain",
                "Transfer-Encoding": "chunked",
                "Cache-Control": "no-cache",
                "Connection": "keep-alive"
            }
        });
    } catch (e: any) {
        await releaseLock();

        // Check if this is an Azure OpenAI content filter error
        if (e.code === 'content_filter' || e.error?.code === 'content_filter') {
            return new Response(JSON.stringify({
                error: 'Content Policy Violation',
                message: e.message || e.error?.message || 'The response was filtered due to the prompt triggering content management policy.',
                code: 'content_filter',
                details: 'Please modify your prompt and try again. Avoid content that may violate content policies.'
            }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Log unexpected errors
        console.error('Unexpected chat error:', e);
        return new Response(e.message, { status: 400 });
    }
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const automationId = searchParams.get('automationId');

    const schema = Joi.object({
        automationId: Joi.objectId()
    });

    const { error, value } = schema.validate({ automationId });
    if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { 'Content-Type': 'application/json' },
            status: 400
        });
    }
    
    // Debug: Log the automationId being passed
    console.log('[Chat API] Received automationId:', automationId, 'Type:', typeof automationId, 'Length:', automationId?.length);

    const currentUser = await authenticationBackend.getCurrentUser(req);
    if (!currentUser) {
        return new Response(JSON.stringify({ error: 'Authentication required' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 401
        });
    }

    // Check if user owns the automation OR has shared access
    const automation: any = await getDb().collection('automations').findOne({
        _id: ObjectId.createFromHexString(automationId as any),
        $or: [
            { workspaceId: String(currentUser?.workspace?._id) },
            { 'sharedWith.userId': String(currentUser._id) }
        ]
    });

    if (!automation) {
        return new Response(JSON.stringify({ error: 'Automation not found' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 404
        });
    }

    let chatContext: any = await getDb().collection('chatContext').findOne({ automationId });

    if (!chatContext) {
        chatContext = {
            messages: []
        }
    }

    chatContext.initialChatTriggered = automation.initialChatTriggered;
    chatContext.initialImages = automation.images;
    
    // Use the first human message as the initial prompt, or fall back to automation title
    if (chatContext.messages && chatContext.messages.length > 0) {
        const firstHumanMessage = chatContext.messages.find((msg: any) => msg.type === 'human');
        chatContext.initialPrompt = firstHumanMessage ? firstHumanMessage.data.content : automation.description;
    } else {
        chatContext.initialPrompt = automation.description;
    }

    return new Response(JSON.stringify(chatContext), {
        headers: {
            'Content-Type': 'application/json'
        }
    });
}

export async function PATCH(req: NextRequest) {
    const payload = await req.json();

    runningInstances = payload.runningInstances;

    return new Response('Running instances updated', { status: 200 });
}

export async function DELETE(req: NextRequest) {
    const { automationId } = await req.json();

    await getDb().collection('chatContext').updateOne({ automationId }, { $set: { messages: [] } });

    return new Response('Chat cleared', { status: 200 });
}