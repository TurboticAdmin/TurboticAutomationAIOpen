import { NextRequest, NextResponse } from 'next/server';
import { BlobServiceClient } from '@azure/storage-blob';
import { getStorageConfig } from '@/app/utils/util';

export async function POST(request: NextRequest) {
    try {

        const { envVariables } = await request.json();

        if (!envVariables || !Array.isArray(envVariables)) {
            return NextResponse.json(
                { error: 'Invalid environment variables provided' },
                { status: 400 }
            );
        }

        // Check if environment variables contain file references
        const fileEnvVars = envVariables.filter((envVar: any) => {
            // Handle single file (object)
            if (envVar.valueFile && typeof envVar.valueFile === 'object' && !Array.isArray(envVar.valueFile)) {
                return envVar.valueFile.url && envVar.valueFile.fileName;
            }
            // Handle multiple files (array)
            if (envVar.valueFile && Array.isArray(envVar.valueFile)) {
                return envVar.valueFile.length > 0 && envVar.valueFile.every((file:any) => file.url && file.fileName);
            }
            return false;
        });

        if (fileEnvVars.length === 0) {
            return NextResponse.json({
                message: 'No file-related environment variables found',
                downloadedFiles: []
            });
        }

        // Get Azure Storage configuration
        const config = getStorageConfig();

        const azureAccountName = config.STORAGE_AZURE_ACCOUNT_NAME as string;
        const azureAccountKey = config.STORAGE_AZURE_ACCOUNT_KEY as string;
        const azureContainerName = config.STORAGE_AZURE_CONTAINER_NAME as string;
        const azureStorageProtocol = config.STORAGE_AZURE_PROTOCOL as string;
        const azureStorageEndpointUrl = config.STORAGE_AZURE_ENDPOINT_URL as string;
        const azureStorageRootFolder = config.azureStorageRootFolder as string;

        if (!azureAccountName || !azureAccountKey || !azureContainerName) {
            return NextResponse.json(
                { error: 'Azure Storage configuration not found' },
                { status: 500 }
            );
        }

        // Create Blob Service Client
        const connectionString = `DefaultEndpointsProtocol=${azureStorageProtocol};AccountName=${azureAccountName};AccountKey=${azureAccountKey};EndpointSuffix=${azureStorageEndpointUrl}`;
        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerClient = blobServiceClient.getContainerClient(azureContainerName);

        const downloadedFiles: any[] = [];

        // Process each file-related environment variable
        for (const envVar of fileEnvVars) {
            try {
                // Handle single file
                if (typeof envVar.valueFile === 'object' && !Array.isArray(envVar.valueFile)) {
                    // Use blobName if provided, otherwise construct from fileName
                    const blobName = envVar.valueFile.blobName || `${azureStorageRootFolder}/${envVar.valueFile.fileName}`;
                    const fileData = await downloadFileAsBase64(
                        containerClient, 
                        blobName, 
                        envVar.name, 
                        envVar.valueFile.fileName
                    );

                    if (fileData) {
                        downloadedFiles.push({
                            envVarName: envVar.name,
                            fileName: envVar.valueFile.fileName,
                            contentBase64: fileData.contentBase64,
                            contentType: fileData.contentType,
                            blobName
                        });
                    }
                }
                // Handle multiple files
                else if (Array.isArray(envVar.valueFile)) {
                    for (const file of envVar.valueFile) {
                        // Use blobName if provided, otherwise construct from fileName
                        const blobName = file.blobName || `${azureStorageRootFolder}/${file.fileName}`;
                        const fileData = await downloadFileAsBase64(
                            containerClient, 
                            blobName, 
                            envVar.name, 
                            file.fileName
                        );

                        if (fileData) {
                            downloadedFiles.push({
                                envVarName: envVar.name,
                                fileName: file.fileName,
                                contentBase64: fileData.contentBase64,
                                contentType: fileData.contentType,
                                blobName
                            });
                        }
                    }
                }
            } catch (error) {
                console.error(`Error processing environment variable ${envVar.name}:`, error);
            }
        }

        return NextResponse.json({
            message: 'Files fetched successfully',
            downloadedFiles,
            totalFiles: downloadedFiles.length
        });

    } catch (error: any) {
        console.error('Error downloading files from environment variables:', error);
        return NextResponse.json(
            { error: 'Failed to download files: ' + error.message },
            { status: 500 }
        );
    }
}

async function downloadFileAsBase64(containerClient: any, blobName: string, envVarName: string, fileName: string): Promise<{ contentBase64: string, contentType: string } | null> {
    try {
        const blockBlobClient = containerClient.getBlockBlobClient(blobName);
        
        // Check if blob exists
        const exists = await blockBlobClient.exists();
        if (!exists) {
            return null;
        }

        // Download the blob to buffer
        const downloadResponse = await blockBlobClient.download();
        const chunks: Uint8Array[] = [];
        const readable = downloadResponse.readableStreamBody;
        if (!readable) return null;
        await new Promise<void>((resolve, reject) => {
            readable.on('data', (d: Buffer) => chunks.push(new Uint8Array(d)));
            readable.on('end', () => resolve());
            readable.on('error', (e: any) => reject(e));
        });
        const buffer = Buffer.concat(chunks.map(c => Buffer.from(c)));
        const contentBase64 = buffer.toString('base64');
        const contentType = downloadResponse.contentType || 'application/octet-stream';
        return { contentBase64, contentType };
    } catch (error) {
        console.error(`Error downloading file ${fileName}:`, error);
        return null;
    }
}
