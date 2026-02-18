import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import authenticationBackend from "../authentication/authentication-backend";
import { AzureChatOpenAI } from "@langchain/openai";
import { encrypt } from "@/lib/encryption";
import { versionControl } from "@/lib/mongodb-version-control";

export async function DELETE(req: NextRequest) {
    
    const currentUser = await authenticationBackend.getCurrentUser(req);

    if (!currentUser) {
        return new Response(JSON.stringify({ error: 'Authentication required' }), { 
            headers: { 'Content-Type': 'application/json' }, 
            status: 401 
        });
    }

    // Get automationId from URL params
    const url = new URL(req.url);
    const automationId = url.searchParams.get('automationId');
    
    if (!automationId) {
        return new Response(JSON.stringify({ error: 'automationId is required' }), { 
            headers: { 'Content-Type': 'application/json' }, 
            status: 400 
        });
    }

    // Validate ObjectId format
    if (!ObjectId.isValid(automationId)) {
        return new Response(JSON.stringify({ error: 'Invalid automationId format' }), { 
            headers: { 'Content-Type': 'application/json' }, 
            status: 400 
        });
    }

    const db = getDb();
    
    // Check if user owns the automation
    const filter: any = {
        _id: ObjectId.createFromHexString(automationId),
    }

    if (currentUser) {
        filter['$or'] = [
            {
                workspaceId: {
                    $exists: false
                }
            },
            {
                workspaceId: String(currentUser?.workspace?._id)
            }
        ]
    } else {
        filter['workspaceId'] = {
            $exists: false
        }
    }

    const automation = await db.collection('automations').findOne(filter);
    
    if (!automation) {
        return new Response(JSON.stringify({ error: 'Automation not found or you do not have permission to delete it' }), { 
            headers: { 'Content-Type': 'application/json' }, 
            status: 404 
        });
    }

    
    try {
        // Create backup of automation before deletion
        const automationBackup = {
            ...automation,
            originalAutomationId: automationId,
            deletedBy: String(currentUser._id),
            deletedAt: new Date(),
            deletedByEmail: currentUser.email,
            deletedByWorkspace: currentUser.workspace ? String(currentUser.workspace._id) : undefined
        };
        
        // Remove the original _id to avoid conflicts
        delete (automationBackup as any)._id;
        
        // Insert backup into automationsDeleted collection
        await db.collection('automationsDeleted').insertOne(automationBackup);

        // Delete the automation
        const result = await db.collection('automations').deleteOne({
            _id: ObjectId.createFromHexString(automationId)
        });

        if (result.deletedCount === 0) {
            return new Response(JSON.stringify({ error: 'Failed to delete automation' }), { 
                headers: { 'Content-Type': 'application/json' }, 
                status: 500 
            });
        }


        // Also delete any schedules for this automation
        const scheduleDeleteResult = await db.collection('schedules-v2').deleteMany({
            automationId: automationId
        });

        // Also delete any chat context for this automation
        const chatContextDeleteResult = await db.collection('chatContext').deleteMany({
            automationId: automationId
        });

        // Also delete any execution history for this automation
        const executionHistoryDeleteResult = await db.collection('execution_history').deleteMany({
            automationId: automationId
        });

        // Also delete any current executions for this automation
        const executionsDeleteResult = await db.collection('executions').deleteMany({
            automationId: automationId
        });

        // Clean up code versions
        try {
            await versionControl.deleteAutomationVersions(automationId);
        } catch (error) {
            // Don't fail the entire deletion if version cleanup fails
        }

        return new Response(JSON.stringify({ success: true, message: 'Automation deleted successfully' }), { 
            headers: { 'Content-Type': 'application/json' }, 
            status: 200 
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Internal server error' }), { 
            headers: { 'Content-Type': 'application/json' }, 
            status: 500 
        });
    }
}

export async function PUT(req: NextRequest) {
    let body;
    try {
        body = await req.json();
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Invalid JSON in request body' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 400
        });
    }

    const { automationId, payload } = body || {};

    // Validate automationId
    if (!automationId || typeof automationId !== 'string' || automationId.length !== 24) {
        return new Response(JSON.stringify({ error: 'Invalid automation ID' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 400
        });
    }

    const currentUser = await authenticationBackend.getCurrentUser(req);
    if (!currentUser) {
        return new Response(JSON.stringify({ error: 'Authentication required' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 401
        });
    }

    let automation = await getDb().collection('automations').findOne({
        _id: ObjectId.createFromHexString(automationId)
    });

    if (!automation) {
        return new Response(JSON.stringify({ error: 'Automation not found' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 404
        });
    }

    const {
        _id,
        title,
        description,
        code,
        environmentVariables,
        dependencies,
        isPublished,
        status,
        // Schedule fields removed - now managed in schedules-v2 collection only
        // cronExpression,
        // cronExpressionFriendly,
        // cronExpressionTimezone,
        triggerMode,
        triggerEnabled,
        workspaceId,
        // Email notification fields removed - now managed in schedules-v2 collection only
        // emailNotificationsEnabled,
        // emailOnCompleted,
        // emailOnFailed,
        // scheduleDescription,
        v3Steps,
        version,
        runtimeEnvironment,
        useMultiEnv
    } = payload;

    let envVariablesTemp = JSON.parse(JSON.stringify(environmentVariables));
    if (workspaceId && environmentVariables && environmentVariables.length > 0) {
        // Encrypt environment variable values based on structure
        // Respect useMultiEnv preference - only convert to multi-env if useMultiEnv is true
        environmentVariables.forEach((env: any) => {
            // Support both Any structure (env.value) and multi-env structure (env.value.dev/test/production)
            if (env.value && typeof env.value === 'object' && !Array.isArray(env.value)) {
                // Multi-environment structure - only encrypt non-empty values
                if (env.value.dev !== undefined || env.value.test !== undefined || env.value.production !== undefined) {
                    env.value.dev = env.value.dev ? encrypt(env.value.dev as string) : undefined;
                    env.value.test = env.value.test ? encrypt(env.value.test as string) : undefined;
                    env.value.production = env.value.production ? encrypt(env.value.production as string) : undefined;
                }
            } else if (env.value && typeof env.value === 'string') {
                // Any single value structure (applies to all environments)
                // Only convert to multi-env structure if useMultiEnv is true
                if (useMultiEnv === true) {
                    // Convert to multi-env structure when useMultiEnv is enabled
                    const encryptedValue = env.value.trim() ? encrypt(env.value as string) : undefined;
                    env.value = {
                        dev: encryptedValue,
                        test: encryptedValue,
                        production: encryptedValue
                    };
                } else {
                    // Keep as single string value when useMultiEnv is false
                    env.value = env.value.trim() ? encrypt(env.value as string) : '';
                }
            }
        });
    }


        // here add logic to store the env variables in the separate collection
        if (currentUser?.workspace?._id && envVariablesTemp && envVariablesTemp.length > 0) {
            try {
                // Get existing environment variables for this workspace
                const existingDoc = await getDb().collection('environment_variables_values').findOne({
                    workspaceId: String(currentUser?.workspace?._id)
                });

                let existingEnvVars = existingDoc?.environmentVariables || [];

                // Create a map of existing variables by name for quick lookup
                const existingVarsMap = new Map();
                existingEnvVars.forEach((env: any) => {
                    existingVarsMap.set(env.name, env);
                });

                // Process new environment variables - support both old and new structure
                const newEnvVars = envVariablesTemp.filter((env: any) => {
                    if (env.value && typeof env.value === 'object') {
                        // New structure: at least one environment value must exist
                        return env.name && (env.value.dev || env.value.test || env.value.production);
                    } else {
                        // Old structure
                        return env.name && env.value;
                    }
                }).map((env: any) => {
                    if (env.value && typeof env.value === 'object') {
                        // New multi-environment structure
                        return {
                            name: env.name,
                            value: {
                                dev: env.value.dev ? encrypt(env.value.dev) : undefined,
                                test: env.value.test ? encrypt(env.value.test) : undefined,
                                production: env.value.production ? encrypt(env.value.production) : undefined
                            },
                            id: env.id || `env-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            source: "user"
                        };
                    } else {
                        // Old single value structure
                        return {
                            name: env.name,
                            value: encrypt(env.value), // Encrypt the value before storing
                            id: env.id || `env-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            source: "user"
                        };
                    }
                });

                // Merge with existing variables, replacing duplicates by name
                const mergedEnvVars = [...existingEnvVars];

                newEnvVars.forEach((newEnv: any) => {
                    const existingIndex = mergedEnvVars.findIndex((existing: any) => existing.name === newEnv.name);
                    if (existingIndex >= 0) {
                        // Replace existing variable with new encrypted value
                        // mergedEnvVars[existingIndex] = newEnv;
                    } else {
                        // Add new variable (already encrypted)
                        mergedEnvVars.push(newEnv);
                    }
                });

                // Update the document with merged environment variables
                await getDb().collection('environment_variables_values').updateOne({
                    workspaceId: String(currentUser?.workspace?._id)
                }, {
                    $set: {
                        environmentVariables: mergedEnvVars,
                        updatedAt: new Date()
                    }
                }, {
                    upsert: true
                });
            } catch (error) {
                console.error('Error updating environment variables:', error);
            }
        }

    const updateData: any = {
            title,
            description,
            code,
            environmentVariables: environmentVariables,
            dependencies,
            isPublished,
            status,
            v3Steps
        };

        // Only include triggerMode and triggerEnabled if they have actual values
        // Don't overwrite with null/undefined
        if (triggerMode !== null && triggerMode !== undefined) {
            updateData.triggerMode = triggerMode;
        }
        if (triggerEnabled !== null && triggerEnabled !== undefined) {
            updateData.triggerEnabled = triggerEnabled;
        }
        
        // Only include version if it's provided
        if (version !== undefined) {
            updateData.version = version;
        }
        
        // Include runtimeEnvironment if provided
        if (runtimeEnvironment !== undefined) {
            updateData.runtimeEnvironment = runtimeEnvironment;
        }
        
        // Include useMultiEnv if provided
        if (useMultiEnv !== undefined) {
            updateData.useMultiEnv = useMultiEnv;
        }

        await getDb().collection('automations').updateOne({
            _id: ObjectId.createFromHexString(automationId)
        }, {
            $set: updateData
        });

        // here add logic to store the env variables in the separate collection
        if (workspaceId && envVariablesTemp && envVariablesTemp.length > 0) {
            try {
                // Get existing environment variables for this workspace
                const existingDoc = await getDb().collection('environment_variables_values').findOne({
                    workspaceId: workspaceId
                });

                let existingEnvVars = existingDoc?.environmentVariables || [];

                // Create a map of existing variables by name for quick lookup
                const existingVarsMap = new Map();
                existingEnvVars.forEach((env: any) => {
                    existingVarsMap.set(env.name, env);
                });

                // Process new environment variables - support both old and new structure
                const newEnvVars = envVariablesTemp.filter((env: any) => {
                    if (env.value && typeof env.value === 'object') {
                        // New structure: at least one environment value must exist
                        return env.name && env.value;
                    } else {
                        // Old structure
                        return env.name && env.value;
                    }
                }).map((env: any) => {
                    if (env.value && typeof env.value === 'object') {
                        // New multi-environment structure
                        return {
                            name: env.name,
                            value: {
                                dev: env.value.dev ? encrypt(env.value.dev) : undefined,
                                test: env.value.test ? encrypt(env.value.test) : undefined,
                                production: env.value.production ? encrypt(env.value.production) : undefined
                            },
                            id: env.id || `env-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            source: "user"
                        };
                    } else {
                        // Old single value structure
                        return {
                            name: env.name,
                            value: encrypt(env.value), // Encrypt the value before storing
                            id: env.id || `env-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                            source: "user"
                        };
                    }
                });
                // Merge with existing variables, replacing duplicates by name
                const mergedEnvVars = [...existingEnvVars];

                newEnvVars.forEach((newEnv: any) => {
                    const existingIndex = mergedEnvVars.findIndex((existing: any) => existing.name === newEnv.name);
                    if (existingIndex >= 0) {
                        // Replace existing variable with new encrypted value
                        // mergedEnvVars[existingIndex] = newEnv;
                    } else {
                        // Add new variable (already encrypted)
                        mergedEnvVars.push(newEnv);
                    }
                });
                // Update the document with merged environment variables
                await getDb().collection('environment_variables_values').updateOne({
                    workspaceId: workspaceId
                }, {
                    $set: {
                        environmentVariables: mergedEnvVars,
                        updatedAt: new Date()
                    }
                }, {
                    upsert: true
                });
            } catch (error) {
                console.error('Error updating environment variables:', error);
            }
        }


        return new Response(JSON.stringify({ success: true, message: 'Automation updated successfully' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200
        });
}

async function generateTitleFromPrompt(prompt: string): Promise<string> {
    try {
        const titlePrompt = `Generate a concise, professional title for this automation request. 

        Requirements:
        - Maximum 50 characters
        - Be specific and descriptive about what the automation does
        - Use clear, professional language
        - Avoid generic words like "automation" or "script"
        - Focus on the main action or purpose
        - Return only the title text, no formatting or explanations

        Automation request:
        ${prompt.substring(0, 500)}${prompt.length > 500 ? '...' : ''}`;

        const model = new AzureChatOpenAI({
            azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
            azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
            azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
            azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
            temperature: 0
        });

        const response = await model.invoke(titlePrompt);
        let title = response.content as string;

        // Clean up the response
        title = title
            .replace(/^```.*?\n?/g, '')
            .replace(/```$/g, '')
            .replace(/^["']|["']$/g, '')
            .trim();
        
        // Limit to 100 characters
        if (title.length > 100) {
            title = title.substring(0, 100) + '...';
        }

        return title || 'New Automation';
    } catch (error) {
        // fallback title generation
        let cleanPrompt = prompt.trim();

        // Remove common prefixes
        const prefixes = [
            'automate',
            'create automation for',
            'build automation for',
            'make automation for',
            'create a script for',
            'build a script for',
            'make a script for'
        ];
        
        for (const prefix of prefixes) {
            if (cleanPrompt.toLowerCase().startsWith(prefix.toLowerCase())) {
                cleanPrompt = cleanPrompt.substring(prefix.length).trim();
                break;
            }
        }
        
        // Capitalize first letter and limit length
        cleanPrompt = cleanPrompt.charAt(0).toUpperCase() + cleanPrompt.slice(1);

        // Limit to 200 characters and add ellipsis if needed (increased from 50 to support longer automation names)
        if (cleanPrompt.length > 200) {
            cleanPrompt = cleanPrompt.substring(0, 197) + '...';
        }

        return cleanPrompt || 'New Automation';
    }
}

async function convertFileToBase64(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const base64 = buffer.toString('base64');
    const mimeType = file.type || 'image/jpeg';
    return `data:${mimeType};base64,${base64}`;
}

async function convertImagesToBase64(images: File[]): Promise<string[]> {
    return Promise.all(images.map(convertFileToBase64));
}

export async function POST(req: NextRequest) {
    const contentType = req.headers.get('content-type') || '';
    let prompt: string = '';
    let images: File[] = [];

    // Handle both JSON and FormData requests
    if (contentType.includes('multipart/form-data')) {
        const form = await req.formData();
        prompt = String(form.get('prompt') || '').trim();
        images = (form.getAll('promptImages') as File[]).filter(Boolean);
    } else {
        const body = await req.json();
        prompt = body.prompt || '';
    }

    if (!prompt && images.length === 0) {
        return new Response(JSON.stringify({
            error: 'Prompt or images required'
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 400
        });
    }

    const currentUser = await authenticationBackend.getCurrentUser(req);

    // Check if user is authenticated
    if (!currentUser) {
        return new Response(JSON.stringify({
            error: 'Authentication required',
            requiresAuth: true
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 401
        });
    }

    // Subscription limits removed for open source

    if (process.env.APP_ENV === 'development' && (
        prompt === `Fetch yesterday's orders from MongoDB, summarize them using Open AI, and email the summary via SendGrid` || 
        prompt === `Fetch last 10 added contact from Hubspot, and summarise all the leads using open ai and send the summary to me via sendgrid` ||
        prompt === `Visit turbotic.com, find the book a demo button and click it and fill the demo form` ||
        prompt === `Visit https://zapier.com/pricing in a browser and summarise the pricing page using Azure OpenAI and send the summary to me via sendgrid`
    )) {
        let existingId = '681b0645bc0098a00f39d498';
        let now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        const title = await generateTitleFromPrompt(prompt)
        
        // Convert images to base64 before saving
        const imagesBase64 = images.length > 0 ? await convertImagesToBase64(images) : [];
        
        await getDb().collection('automations').updateOne({
            _id: ObjectId.createFromHexString(existingId as any)
        }, {
            $set: {
                title,
                description: prompt,
                code: '',
                environmentVariables: [],
                dependencies: [],
                createdAt: now,
                initialChatTriggered: false,
                isPublished: false, // Create as unpublished
                status: 'draft', // Default status for new automations
                workspaceId: currentUser.workspace ? String(currentUser.workspace._id) : undefined,
                createdBy: String(currentUser._id),
                images: imagesBase64,
                runtimeEnvironment: 'dev'
            }
        }, { upsert: true });

        // Create initial chat context with the user's prompt
        await getDb().collection('chatContext').deleteMany({
            automationId: existingId
        });

        return new Response(JSON.stringify({ automationId: existingId }), { headers: { 'Content-Type': 'application/json' } });
    }

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const dateStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    const title =  await generateTitleFromPrompt(prompt);

    // Convert images to base64 before saving
    const imagesBase64 = images.length > 0 ? await convertImagesToBase64(images) : [];

    const automationData = {
        title,
        description: prompt,
        code: '',
        environmentVariables: [],
        dependencies: [],
        createdAt: now,
        updatedAt: now,
        initialChatTriggered: false,
        isPublished: false, // Create as unpublished
        status: 'draft', // Default status for new automations
        workspaceId: currentUser.workspace ? String(currentUser.workspace._id) : undefined,
        createdBy: String(currentUser._id),
        adminUserIds: [String(currentUser._id)], // Add creator as admin
        apiKey: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2), // Simple random key
        version: '3',
        images : imagesBase64,
                runtimeEnvironment: 'dev'
    };

    const op = await getDb().collection('automations').insertOne(automationData);
    const automationId = op.insertedId.toString();

    // Note: Images are handled by the frontend after redirect
    // The frontend will send the initial chat message with images to /api/gen/chat

    return new Response(JSON.stringify({ automationId }), { headers: { 'Content-Type': 'application/json' } });
}

export async function PATCH(req: NextRequest) {
    let body;
    try {
        body = await req.json();
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Invalid JSON in request body' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 400
        });
    }

    const { automationId } = body || {};
    const currentUser = await authenticationBackend.getCurrentUser(req);

    // Check if user is authenticated
    if (!currentUser) {
        return new Response(JSON.stringify({
            error: 'Authentication required',
            requiresAuth: true
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 401
        });
    }

    // Subscription limits removed for open source

    // Find the automation to clone
    const filter: any = {
        _id: ObjectId.createFromHexString(automationId as any),
    }

    if (currentUser) {
        filter['$or'] = [
            {
                workspaceId: {
                    $exists: false
                }
            },
            {
                workspaceId: String(currentUser?.workspace?._id)
            }
        ]
    } else {
        filter['workspaceId'] = {
            $exists: false
        }
    }

    let automation = await getDb().collection('automations').findOne(filter);
    
    
    if (!automation) {
        return new Response(JSON.stringify({ error: 'Automation not found' }), { 
            headers: { 'Content-Type': 'application/json' }, 
            status: 404 
        });
    }

    // Check if user is in adminUserIds
    const userId = String(currentUser._id);
    if (!automation.adminUserIds || !Array.isArray(automation.adminUserIds) || !automation.adminUserIds.includes(userId)) {
        return new Response(JSON.stringify({ error: 'You do not have permission to clone this automation. Only admins can clone automations.' }), { 
            headers: { 'Content-Type': 'application/json' }, 
            status: 403 
        });
    }

    // Create a clone of the automation
    const cloneData = {
        title: `(Copy) ${automation.title}`,
        code: automation.code || '',
        environmentVariables: automation.environmentVariables || [],
        dependencies: automation.dependencies || [],
        description: automation.description || '',
        cost: automation.cost || 0,
        currency: automation.currency || 'USD',
        workspaceId: String(currentUser?.workspace?._id) || automation.workspaceId,
        createdAt: new Date(),
        updatedAt: new Date(),
        isPublished: false, // Start as unpublished
        initialChatTriggered: true, // Set to true for cloned automations
        version: automation.version || '3',
        v3Steps: automation.v3Steps || [],
        createdBy: userId,
        adminUserIds: [userId], // Set the cloner as the admin
        apiKey: Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2), // Generate new API key
    };

    const op = await getDb().collection('automations').insertOne(cloneData);

    return new Response(JSON.stringify({ 
        automationId: op.insertedId.toString(),
        message: 'Automation cloned successfully'
    }), { 
        headers: { 'Content-Type': 'application/json' } 
    });
}