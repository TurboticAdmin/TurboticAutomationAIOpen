import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import authenticationBackend from '../authentication/authentication-backend';
import { ObjectId } from 'mongodb';
import OpenAI from 'openai';
import { decrypt } from '@/lib/encryption';

export async function POST(request: NextRequest) {
    try {
        const { messages, model = 'gpt-4', temperature = 0.7, max_tokens, options = {} } = await request.json();

        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json(
                { error: 'Messages array is required' },
                { status: 400 }
            );
        }

        // Check if this request is from a script runner (internal service)
        const scriptRunnerHeader = request.headers.get('X-Script-Runner');
        const isScriptRunner = scriptRunnerHeader === 'true';
        const executionId = request.headers.get('X-Execution-Id');

        let currentUser = null;
        let workspaceId = null;
        let userId = null;
        let userOpenAIApiKey = null;
        let userAzureOpenAIConfig: {
            apiKey: string;
            instanceName: string;
            deploymentName: string;
            apiVersion: string;
        } | null = null;

        if (isScriptRunner && executionId) {
            // For script runners, get user info from the execution
            const db = getDb();
            const execution = await db.collection('executions').findOne({
                _id: ObjectId.createFromHexString(executionId)
            });

            if (!execution) {
                return NextResponse.json(
                    { error: 'Execution not found' },
                    { status: 404 }
                );
            }

            const automation = await db.collection('automations').findOne({
                _id: ObjectId.createFromHexString(execution.automationId)
            });

            if (!automation) {
                return NextResponse.json(
                    { error: 'Automation not found' },
                    { status: 404 }
                );
            }

            const workspace = await db.collection('workspaces').findOne({
                _id: ObjectId.createFromHexString(automation.workspaceId)
            });

            if (!workspace) {
                return NextResponse.json(
                    { error: 'Workspace not found' },
                    { status: 404 }
                );
            }

            const user = await db.collection('users').findOne({
                _id: ObjectId.createFromHexString(workspace.ownerUserId)
            });

            if (!user) {
                return NextResponse.json(
                    { error: 'User not found' },
                    { status: 404 }
                );
            }

            workspaceId = workspace._id.toString();
            userId = user._id.toString();
            currentUser = { ...user, workspace };

            // Check if user has their own Azure OpenAI or OpenAI API key
            // Priority: 1. environment_variables_values (workspace-level), 2. automation.environmentVariables
            const workspaceEnvVars = await db.collection('environment_variables_values').findOne({
                workspaceId: workspaceId
            });

            // Helper function to get env var value
            const getEnvVarValue = (envVar: any): string => {
                if (!envVar || envVar.valueFile) return '';
                if (typeof envVar.value === 'string') {
                    return decrypt(envVar.value);
                } else if (envVar.value && typeof envVar.value === 'object') {
                    const rawValue = envVar.value.dev || envVar.value.test || envVar.value.production || '';
                    return rawValue ? decrypt(rawValue) : '';
                }
                return '';
            };

            // Check workspace-level environment variables from environment_variables_values collection
            if (workspaceEnvVars?.environmentVariables) {
                // Check for Azure OpenAI config first
                const azureApiKey = workspaceEnvVars.environmentVariables.find((env: any) => env.name === 'AZURE_OPENAI_API_KEY');
                const azureInstanceName = workspaceEnvVars.environmentVariables.find((env: any) => env.name === 'AZURE_OPENAI_API_INSTANCE_NAME');
                const azureDeploymentName = workspaceEnvVars.environmentVariables.find((env: any) => env.name === 'AZURE_OPENAI_API_DEPLOYMENT_NAME');
                const azureApiVersion = workspaceEnvVars.environmentVariables.find((env: any) => env.name === 'AZURE_OPENAI_API_VERSION');

                if (azureApiKey && azureInstanceName) {
                    const apiKey = getEnvVarValue(azureApiKey);
                    const instanceName = getEnvVarValue(azureInstanceName);
                    const deploymentName = getEnvVarValue(azureDeploymentName) || 'gpt-4.1';
                    const apiVersion = getEnvVarValue(azureApiVersion) || '2025-01-01-preview';

                    if (apiKey && instanceName) {
                        userAzureOpenAIConfig = {
                            apiKey,
                            instanceName,
                            deploymentName,
                            apiVersion
                        };
                    }
                }

                // Check for OpenAI API key if Azure OpenAI not found
                if (!userAzureOpenAIConfig) {
                    const openAIEnvVar = workspaceEnvVars.environmentVariables.find(
                        (env: any) => env.name === 'OPENAI_API_KEY' || env.name === 'OPEN_AI_API_KEY'
                    );
                    if (openAIEnvVar) {
                        userOpenAIApiKey = getEnvVarValue(openAIEnvVar);
                    }
                }
            }

            // If not found in workspace env vars, check automation.environmentVariables
            if (!userAzureOpenAIConfig && !userOpenAIApiKey && automation.environmentVariables) {
                // Check for Azure OpenAI config first
                const azureApiKey = automation.environmentVariables.find((env: any) => env.name === 'AZURE_OPENAI_API_KEY');
                const azureInstanceName = automation.environmentVariables.find((env: any) => env.name === 'AZURE_OPENAI_API_INSTANCE_NAME');
                const azureDeploymentName = automation.environmentVariables.find((env: any) => env.name === 'AZURE_OPENAI_API_DEPLOYMENT_NAME');
                const azureApiVersion = automation.environmentVariables.find((env: any) => env.name === 'AZURE_OPENAI_API_VERSION');

                if (azureApiKey && azureInstanceName) {
                    const apiKey = getEnvVarValue(azureApiKey);
                    const instanceName = getEnvVarValue(azureInstanceName);
                    const deploymentName = getEnvVarValue(azureDeploymentName) || 'gpt-4.1';
                    const apiVersion = getEnvVarValue(azureApiVersion) || '2025-01-01-preview';

                    if (apiKey && instanceName) {
                        userAzureOpenAIConfig = {
                            apiKey,
                            instanceName,
                            deploymentName,
                            apiVersion
                        };
                    }
                }

                // Check for OpenAI API key if Azure OpenAI not found
                if (!userAzureOpenAIConfig) {
                    const openAIEnvVar = automation.environmentVariables.find(
                        (env: any) => env.name === 'OPENAI_API_KEY' || env.name === 'OPEN_AI_API_KEY'
                    );
                    if (openAIEnvVar) {
                        userOpenAIApiKey = getEnvVarValue(openAIEnvVar);
                    }
                }
            }

        } else if (!isScriptRunner) {
            // Get current user from authentication for regular requests
            currentUser = await authenticationBackend.getCurrentUser(request);
            if (!currentUser) {
                return NextResponse.json(
                    { error: 'Authentication required' },
                    { status: 401 }
                );
            }

            if (!currentUser.workspace?._id || !currentUser._id) {
                return NextResponse.json(
                    { error: 'Invalid user context - missing workspace or user ID' },
                    { status: 400 }
                );
            }

            workspaceId = currentUser.workspace._id.toString();
            userId = currentUser._id.toString();

            // Check if user has their own Azure OpenAI or OpenAI API key from environment_variables_values
            const db = getDb();
            const workspaceEnvVars = await db.collection('environment_variables_values').findOne({
                workspaceId: workspaceId
            });

            // Helper function to get env var value
            const getEnvVarValue = (envVar: any): string => {
                if (!envVar || envVar.valueFile) return '';
                if (typeof envVar.value === 'string') {
                    return decrypt(envVar.value);
                } else if (envVar.value && typeof envVar.value === 'object') {
                    const rawValue = envVar.value.dev || envVar.value.test || envVar.value.production || '';
                    return rawValue ? decrypt(rawValue) : '';
                }
                return '';
            };

            if (workspaceEnvVars?.environmentVariables) {
                // Check for Azure OpenAI config first
                const azureApiKey = workspaceEnvVars.environmentVariables.find((env: any) => env.name === 'AZURE_OPENAI_API_KEY');
                const azureInstanceName = workspaceEnvVars.environmentVariables.find((env: any) => env.name === 'AZURE_OPENAI_API_INSTANCE_NAME');
                const azureDeploymentName = workspaceEnvVars.environmentVariables.find((env: any) => env.name === 'AZURE_OPENAI_API_DEPLOYMENT_NAME');
                const azureApiVersion = workspaceEnvVars.environmentVariables.find((env: any) => env.name === 'AZURE_OPENAI_API_VERSION');

                if (azureApiKey && azureInstanceName) {
                    const apiKey = getEnvVarValue(azureApiKey);
                    const instanceName = getEnvVarValue(azureInstanceName);
                    const deploymentName = getEnvVarValue(azureDeploymentName) || 'gpt-4.1';
                    const apiVersion = getEnvVarValue(azureApiVersion) || '2025-01-01-preview';

                    if (apiKey && instanceName) {
                        userAzureOpenAIConfig = {
                            apiKey,
                            instanceName,
                            deploymentName,
                            apiVersion
                        };
                    }
                }

                // Check for OpenAI API key if Azure OpenAI not found
                if (!userAzureOpenAIConfig) {
                    const openAIEnvVar = workspaceEnvVars.environmentVariables.find(
                        (env: any) => env.name === 'OPENAI_API_KEY' || env.name === 'OPEN_AI_API_KEY'
                    );
                    if (openAIEnvVar) {
                        userOpenAIApiKey = getEnvVarValue(openAIEnvVar);
                    }
                }
            }
        } else {
            return NextResponse.json(
                { error: 'Script runner requests require execution ID' },
                { status: 400 }
            );
        }

        // Determine which API to use
        // Priority: 1. User's Azure OpenAI, 2. User's OpenAI API key, 3. Turbotic's Azure OpenAI
        let completion: any;
        let usedUserAzureOpenAI = false;
        let usedUserKey = false;
        let usedTurboticKey = false;

        if (userAzureOpenAIConfig) {
            // User has their own Azure OpenAI configuration - use it
            console.log('Using user-provided Azure OpenAI');
            usedUserAzureOpenAI = true;
            
            const azureEndpoint = `https://${userAzureOpenAIConfig.instanceName}.openai.azure.com/openai/deployments/${userAzureOpenAIConfig.deploymentName}/chat/completions?api-version=${userAzureOpenAIConfig.apiVersion}`;

            const requestBody: any = {
                messages: messages,
                temperature: temperature,
            };

            if (max_tokens) {
                requestBody.max_tokens = max_tokens;
            }

            const response = await fetch(azureEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': userAzureOpenAIConfig.apiKey,
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Azure OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            completion = await response.json();
        } else if (userOpenAIApiKey) {
            // User has their own OpenAI API key - use standard OpenAI API
            console.log('Using user-provided OpenAI API key');
            usedUserKey = true;
            
            const openai = new OpenAI({
                apiKey: userOpenAIApiKey,
            });

            const requestParams: any = {
                model: model,
                messages: messages,
                temperature: temperature,
            };

            if (max_tokens) {
                requestParams.max_tokens = max_tokens;
            }

            completion = await openai.chat.completions.create(requestParams);
        } else {
            // Use Turbotic's Azure OpenAI (fetched from Azure Key Vault via environment variables)
            console.log('Using Turbotic Azure OpenAI');
            usedTurboticKey = true;
            
            const apiKey = process.env.AZURE_OPENAI_API_KEY || '';
            const instanceName = process.env.AZURE_OPENAI_API_INSTANCE_NAME || '';
            const deploymentName = process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME || 'gpt-4.1';
            const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2025-01-01-preview';

            if (!apiKey || !instanceName) {
                return NextResponse.json(
                    { error: 'Azure OpenAI configuration not available. Please provide your own OpenAI API key or Azure OpenAI configuration, or contact support.' },
                    { status: 500 }
                );
            }

            // Use Azure OpenAI endpoint directly
            const azureEndpoint = `https://${instanceName}.openai.azure.com/openai/deployments/${deploymentName}/chat/completions?api-version=${apiVersion}`;

            const requestBody: any = {
                messages: messages,
                temperature: temperature,
            };

            if (max_tokens) {
                requestBody.max_tokens = max_tokens;
            }

            const response = await fetch(azureEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': apiKey,
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Azure OpenAI API error: ${response.status} ${response.statusText} - ${errorText}`);
            }

            completion = await response.json();
        }

        // Return the response
        return NextResponse.json({
            content: completion.choices?.[0]?.message?.content || '',
            model: completion.model || model,
            usage: completion.usage,
            finish_reason: completion.choices?.[0]?.finish_reason,
            usedUserAzureOpenAI: usedUserAzureOpenAI,
            usedUserKey: usedUserKey,
            usedTurboticKey: usedTurboticKey
        });

    } catch (error: any) {
        console.error('OpenAI chat error:', error);
        return NextResponse.json(
            { error: 'OpenAI chat failed: ' + (error.message || 'Unknown error') },
            { status: 500 }
        );
    }
}

