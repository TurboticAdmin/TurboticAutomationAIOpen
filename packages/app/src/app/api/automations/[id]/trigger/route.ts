import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { triggerRun } from "@/lib/queue";
import { runOnEnvironment } from "@/app/api/run/executions/run-on-environment";
import { decrypt } from "@/lib/encryption";
import { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions } from '@azure/storage-blob';
import { getStorageConfig } from '@/app/utils/util';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const logs: string[] = [];

    try {
    
    // Extract API key from header
    const apiKey = req.headers.get('turbotic-api-key');
    
    const { id } = await params;
    let bodyData: any = {};
    let environmentVariables: any = {};
    
    // Check if request is form data (multipart)
    const contentType = req.headers.get('content-type') || '';
    const isFormData = contentType.includes('multipart/form-data');
    
    if (isFormData) {
        // Handle form data with file uploads
        const formData = await req.formData();
        logs.push('Processing form data request');
        
        // Extract environment variables from FormData using nested bracket notation
        // e.g., environmentVariables[Name] -> Name
        environmentVariables = {};
        for (const [key, value] of formData.entries()) {
            if (key.startsWith('environmentVariables[') && key.endsWith(']')) {
                // Extract the variable name from environmentVariables[key]
                const varName = key.slice('environmentVariables['.length, -1);
                // Skip File objects here - they will be processed in processFileUploads
                if (value instanceof File) {
                    logs.push(`Found file environment variable: ${varName} (will be processed separately)`);
                    // Don't set it here, let processFileUploads handle it
                } else {
                    environmentVariables[varName] = typeof value === 'string' ? value : '';
                    logs.push(`Found environment variable: ${varName}`);
                }
            }
        }
        
        // Extract JSON data from form fields if present
        const jsonData = formData.get('data');
        if (jsonData && typeof jsonData === 'string') {
            bodyData = JSON.parse(jsonData);
            if (bodyData.environmentVariables) {
                // Merge JSON data with FormData variables (FormData overrides JSON)
                environmentVariables = { ...bodyData.environmentVariables, ...environmentVariables };
            }
        }
        
        // Process file uploads
        const uploadedFiles = await processFileUploads(formData, id, logs);
        
        // Merge uploaded files into environment variables
        for (const [varName, fileInfo] of Object.entries(uploadedFiles)) {
            if (environmentVariables[varName]) {
                // Variable already exists in form data
                if (!environmentVariables[varName].valueFile) {
                    environmentVariables[varName] = {
                        ...environmentVariables[varName],
                        valueFile: fileInfo,
                        type: 'file'
                    };
                }
            } else {
                // New variable with file
                environmentVariables[varName] = {
                    valueFile: fileInfo,
                    type: 'file'
                };
            }
            logs.push(`File attached to environment variable: ${varName}`);
        }
    } else {
        // Handle JSON request
        bodyData = await req.json();
        environmentVariables = bodyData.environmentVariables || {};
    }
    let dId = bodyData?.dId || undefined;
    if (!dId) {
        dId = `api-device-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    if (!id || !apiKey || !dId) {
        logs.push('Missing automationId, apiKey, or dId');
        return new Response(JSON.stringify({ error: "automationId, apiKey, and dId are required", logs }), {
            headers: { "Content-Type": "application/json" },
            status: 400
        });
    }

    // Find automation and validate apiKey
    logs.push('Encoded apiKey for lookup');
    const automation = await getDb().collection("automations").findOne({
        _id: ObjectId.createFromHexString(id),
        apiKey: apiKey
    });
    if (!automation) {
        logs.push('Invalid automationId or apiKey');
        return new Response(JSON.stringify({ error: "Invalid automationId or apiKey", logs }), {
            headers: { "Content-Type": "application/json" },
            status: 403
        });
    }

    // Merge environment variables: automation's env vars + body env vars (body overwrites automation)
    // add logic to decrypt the values of the environment variables
    for (const env of automation.environmentVariables || []) {
        // Only decrypt if it's not a file type
        if (!env.valueFile && env.value) {
            env.value = decrypt(env.value as string);
        }
    }
    const mergedEnvVars = [...(automation.environmentVariables || [])];

    // Convert body environment variables to the expected format and merge
    if (environmentVariables && typeof environmentVariables === 'object') {
        for (const [key, value] of Object.entries(environmentVariables)) {
            const existingIndex = mergedEnvVars.findIndex((env: any) => env.name === key);
            
            let newEnvVar: any;
            
            // Check if this is a file input
            if (typeof value === 'object' && value !== null && 'valueFile' in value && (value as any).valueFile) {
                // File input: preserve the file structure
                newEnvVar = {
                    name: key,
                    valueFile: (value as any).valueFile,
                    type: (value as any).type || 'file',
                    value: undefined // Files don't have text values
                };
                logs.push(`Adding file environment variable: ${key}`);
            } else {
                // Text input: decrypt and set as string
                newEnvVar = {
                    name: key,
                    value: typeof value === 'string' ? decrypt(value as string) : JSON.stringify(decrypt(value as string)),
                    type: 'text' // Default type for API-provided variables
                };
            }
            
            if (existingIndex >= 0) {
                // Overwrite existing environment variable
                mergedEnvVars[existingIndex] = newEnvVar;
                logs.push(`Overwrote environment variable: ${key}`);
            } else {
                // Add new environment variable
                mergedEnvVars.push(newEnvVar);
                logs.push(`Added new environment variable: ${key}`);
            }
        }
    }

    // Subscription limits removed for open source

    // Find or create execution record
    let execution;
    let executionId;
    logs.push(`APP_ENV: ${process.env.APP_ENV}`);

    logs.push('Using auto-generated execution ID');
    execution = await getDb().collection("executions").findOne({ deviceId: dId, automationId: id });
    if (!execution) {
        const res = await getDb().collection("executions").insertOne({ deviceId: dId, automationId: id });
        execution = await getDb().collection("executions").findOne({ _id: res.insertedId });
    }
    if (!execution) {
        logs.push('Failed to create or find execution record');
        return new Response(JSON.stringify({ error: "Failed to create execution record", logs }), {
            headers: { "Content-Type": "application/json" },
            status: 500
        });
    }
    executionId = execution._id;
    logs.push(`Auto-generated executionId: ${executionId}`);

    // Insert into execution_history
    const executionHistoryDoc = {
        automationId: id,
        deviceId: dId,
        userId: automation.createdBy,
        userName: "API Trigger",
        userEmail: process.env.API_USER_EMAIL || "api@your-domain.com",
        triggerType: "api",
        triggerSource: "api-key",
        status: "running",
        startedAt: new Date(),
        endedAt: null,
        duration: null,
        exitCode: null,
        errorMessage: null,
        scheduleId: null,
        executionId: String(execution._id),
        triggeredBy: "api",
        triggeredBySystem: "api-key-authentication",
        triggeredAt: new Date(),
        environment: process.env.APP_ENV === 'production' ? 'production' : (process.env.APP_ENV === 'test' ? 'test' : 'development'),
        deploymentMethod: process.env.APP_ENV === 'development' ? 'rabbitmq' : 'kubernetes',
        userAgent: req.headers.get('user-agent') || 'unknown',
        ipAddress: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
        requestHeaders: {
            'user-agent': req.headers.get('user-agent'),
            'x-forwarded-for': req.headers.get('x-forwarded-for'),
            'x-real-ip': req.headers.get('x-real-ip')
        }
    };
    const historyRes = await getDb().collection("execution_history").insertOne(executionHistoryDoc);
    logs.push(`Inserted execution_history with id: ${historyRes.insertedId}`);

    // Store historyId in the execution record
    await getDb().collection("executions").updateOne(
        { _id: execution._id },
        { $set: { historyId: String(historyRes.insertedId) } }
    );
    logs.push('Updated execution with historyId');

    // Insert execution log
    await getDb().collection("execution_logs").insertOne({
        executionId: String(execution._id),
        logs: ["clear", "Triggered execution (API key)"],
        createdAt: new Date()
    });
    logs.push('Inserted execution log for trigger');

    // Choose execution method based on environment
    let runTriggered = false;

    // Environment detection based on APP_ENV
    const isDevelopment = process.env.DISABLE_ENV_CREATION === 'true';
  
    if (isDevelopment) {
        logs.push(`🔧 [Trigger] Development environment detected - using local script-runner`);
        // Development: Use RabbitMQ queue system (local script-runner)
        try {
            // In development mode, use the preset EXECUTION_ID for the queue name
            const queueExecutionId = process.env.EXECUTION_ID || String(execution._id);
            logs.push(`🔧 [Trigger] Using queueExecutionId: ${queueExecutionId}`);
            logs.push(`🔧 [Trigger] process.env.EXECUTION_ID: ${process.env.EXECUTION_ID}`);
            logs.push(`🔧 [Trigger] execution._id: ${execution._id}`);
            await triggerRun(queueExecutionId, false, undefined, mergedEnvVars,undefined,undefined,undefined,"TURBOTIC-EXTERNAL-API");
            logs.push(`triggerRun called successfully (development - RabbitMQ + local script-runner) with executionId: ${queueExecutionId} and ${mergedEnvVars.length} environment variables`);
            runTriggered = true;
        } catch (error) {
            logs.push(`Error triggering run: ${error instanceof Error ? error.message : String(error)}`);
            await getDb().collection("execution_logs").insertOne({
                executionId: String(execution._id),
                logs: [
                    `Error triggering run: ${error instanceof Error ? error.message : String(error)}`
                ],
                createdAt: new Date()
            });
        }
    } 
    else {
        // Test and Production: Send RabbitMQ message to trigger script-runner (same as scheduler)
        logs.push(`Production or Test environment detected - sending RabbitMQ message`);

        try {
            // For test/production, use the same execution ID as the database record
            // This ensures frontend and script-runner use the same ID for log streaming
            const queueExecutionId = String(execution._id);
            logs.push(`🔧 [Trigger] Using same execution ID for queue: ${queueExecutionId}`);
            logs.push(`🔧 [Trigger] This ensures consistent ID flow between frontend and script-runner`);
            logs.push(`🔧 [Trigger] About to call triggerRun with queueExecutionId: ${queueExecutionId}, historyId: ${String(historyRes.insertedId)}, automationId: ${id}`);

            // Update the execution record with the new queue execution ID
            await getDb().collection("executions").updateOne(
                { _id: execution._id },
                { $set: { queueExecutionId: queueExecutionId } }
            );
            logs.push(`🔧 [Trigger] Updated execution record with queueExecutionId: ${queueExecutionId}`);

            await runOnEnvironment(String(execution._id));

            // Get environment variables from automation
            const triggerResult = await triggerRun(queueExecutionId, false, undefined, mergedEnvVars,undefined,undefined,undefined,"TURBOTIC-EXTERNAL-API");
            logs.push(`🔧 [Trigger] triggerRun result: ${triggerResult}`);
            logs.push(`🔧 [Trigger] triggerRun called successfully (Production or Test environment - RabbitMQ message sent) with ${mergedEnvVars.length} environment variables`);
            runTriggered = true;
        } catch (error) {
            logs.push(`❌ [Trigger] Error sending RabbitMQ message: ${error instanceof Error ? error.message : String(error)}`);
            await getDb().collection('execution_logs').insertOne({
                executionId: String(execution._id),
                logs: [
                    `Error sending RabbitMQ message: ${error instanceof Error ? error.message : String(error)}`
                ],
                createdAt: new Date()
            });
        }
    }

    if (runTriggered) {
        logs.push('Automation run has been triggered successfully.');

        // Subscription tracking removed for open source
    }

    // Return immediately with executionId (best practice)
    return new Response(JSON.stringify({
        executionId: String(execution._id),
        historyId: String(historyRes.insertedId),
        status: "triggered",
        message: "Automation execution has been triggered. Use the executionId to poll for status and logs.",
        logs
    }), { headers: { "Content-Type": "application/json" }, status: 200 });
    } catch (error) {
        logs.push(`Error triggering automation: ${error instanceof Error ? error.message : String(error)}`);
        return new Response(JSON.stringify({ error: "Error triggering automation", logs }), {
            headers: { "Content-Type": "application/json" },
            status: 500
        });
    }
}

// Helper function to process file uploads from form data
async function processFileUploads(formData: FormData, automationId: string, logs: string[]): Promise<{ [key: string]: any }> {
    const uploadedFiles: { [key: string]: any } = {};
    
    try {
        const config = getStorageConfig();
        const azureAccountName = config.STORAGE_AZURE_ACCOUNT_NAME as string;
        const azureAccountKey = config.STORAGE_AZURE_ACCOUNT_KEY as string;
        const azureContainerName = config.STORAGE_AZURE_CONTAINER_NAME as string;
        const azureStorageProtocol = config.STORAGE_AZURE_PROTOCOL as string;
        const azureStorageEndpointUrl = config.STORAGE_AZURE_ENDPOINT_URL as string;
        const azureStorageRootFolder = config.azureStorageRootFolder as string;

        const blobServiceClient = BlobServiceClient.fromConnectionString(
            `DefaultEndpointsProtocol=${azureStorageProtocol};AccountName=${azureAccountName};AccountKey=${azureAccountKey};EndpointSuffix=${azureStorageEndpointUrl}`,
        );

        let containerClient: any;
        try {
            containerClient = blobServiceClient.getContainerClient(azureContainerName);
            await containerClient.createIfNotExists();
        } catch (error: any) {
            console.error('Error creating Azure Storage container:', error.message);
            throw error;
        }

        // Get all file entries from form data
        const fileEntries: { varName: string; files: File[] }[] = [];
        
        // Collect all files by environment variable name
        for (const [key, value] of formData.entries()) {
            let varName: string | null = null;
            
            // Handle file_ prefix format (file_myVar or file_myVar[])
            if (key.startsWith('file_')) {
                varName = key.replace('file_', '');
                // Remove array bracket notation if present (file_myVar[] -> myVar)
                varName = varName.replace(/\[]$/, '');
            }
            // Handle environmentVariables[key] format (environmentVariables[INPUT_FILE])
            else if (key.startsWith('environmentVariables[') && key.endsWith(']') && value instanceof File) {
                varName = key.slice('environmentVariables['.length, -1);
            }
            
            // If we found a variable name and the value is a File, add it to the entries
            if (varName && value instanceof File) {
                if (!fileEntries.find(e => e.varName === varName)) {
                    fileEntries.push({ varName, files: [] });
                }
                const entry = fileEntries.find(e => e.varName === varName);
                if (entry) {
                    entry.files.push(value);
                }
            }
        }

        // Process each environment variable's files
        for (const { varName, files } of fileEntries) {
            if (files.length === 0) continue;
            
            const filesUploaded: { fileId: string; fileName: string; url: string; blobName?: string }[] = [];
            
            for (const file of files) {
                // Use unique blob name to prevent overwrites while maintaining compatibility
                const uniqueId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                const blobName = `${azureStorageRootFolder}/${uniqueId}_${file.name}`;
                
                try {
                    const arrayBuffer = await file.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    
                    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
                    
                    await blockBlobClient.uploadData(buffer, {
                        blobHTTPHeaders: { blobContentType: file.type },
                    });
                    
                    const sasToken = generateBlobSASQueryParameters(
                        {
                            containerName: azureContainerName,
                            blobName,
                            permissions: BlobSASPermissions.parse('r'),
                            startsOn: new Date(),
                            expiresOn: new Date(Date.now() + 60 * 60 * 1000 * 24 * 30), // 30 days
                        },
                        blockBlobClient.credential,
                    );
                    
                    const signedUrl = `${blockBlobClient.url}?${sasToken}`;
                    
                    // Save to files collection
                    const fileObject = {
                        name: file.name,
                        url: signedUrl,
                        size: file.size,
                        type: file.type,
                        automationId: automationId,
                        createdAt: new Date(),
                    };
                    const fileId = await getDb().collection('files').insertOne(fileObject);
                    
                    filesUploaded.push({
                        fileId: fileId.insertedId.toString(),
                        fileName: file.name,
                        url: signedUrl,
                        blobName: blobName  // Store blob name for download-from-env API
                    } as any);
                    
                    logs.push(`File uploaded: ${file.name}`);
                } catch (error: any) {
                    console.error(`Error uploading file ${file.name}:`, error);
                    logs.push(`Error uploading file ${file.name}: ${error.message}`);
                }
            }
            
            // Set file info for the environment variable
            if (filesUploaded.length > 0) {
                uploadedFiles[varName] = filesUploaded.length === 1 
                    ? filesUploaded[0]  // Single file: return object
                    : filesUploaded;    // Multiple files: return array
            }
        }
        
        logs.push(`Processed ${fileEntries.length} file environment variables`);
        
    } catch (error: any) {
        console.error('Error in processFileUploads:', error);
        logs.push(`Error processing file uploads: ${error.message}`);
    }
    
    return uploadedFiles;
} 