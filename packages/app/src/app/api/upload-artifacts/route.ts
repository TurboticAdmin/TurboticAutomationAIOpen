import { NextRequest, NextResponse } from 'next/server';
import { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } from '@azure/storage-blob';
import { getStorageConfig } from '@/app/utils/util';
import { getDb } from '@/lib/db';
import { ObjectId } from 'mongodb';

export async function POST(request: NextRequest) {
    try {
        const { artifacts, automationId , userId } = await request.json();

        if (!artifacts || !Array.isArray(artifacts) || !automationId) {
            return NextResponse.json(
                { error: 'Invalid artifacts or automationId provided' },
                { status: 400 }
            );
        }

        if (artifacts.length === 0) {
            return NextResponse.json({
                message: 'No artifacts found to upload',
                uploadedFiles: []
            });
        }

        console.log(`Found ${artifacts.length} artifacts to upload for automation ${automationId}`);

        // Get Azure Storage configuration
        const config = getStorageConfig();
        const storageAccountName = config.STORAGE_AZURE_ACCOUNT_NAME as string;
        const storageAccountKey = config.STORAGE_AZURE_ACCOUNT_KEY as string;
        const storageContainerName = config.STORAGE_AZURE_CONTAINER_NAME as string;
        const storageProtocol = config.STORAGE_AZURE_PROTOCOL as string;
        const storageEndpointUrl = config.STORAGE_AZURE_ENDPOINT_URL as string;
        const azureStorageRootFolder = config.azureStorageRootFolder as string;

        if (!storageAccountName || !storageAccountKey || !storageContainerName) {
            return NextResponse.json(
                { error: 'Azure Storage configuration not found' },
                { status: 500 }
            );
        }

        // Create Blob Service Client
        const connectionString = `DefaultEndpointsProtocol=${storageProtocol};AccountName=${storageAccountName};AccountKey=${storageAccountKey};EndpointSuffix=${storageEndpointUrl}`;
        const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
        const containerClient = blobServiceClient.getContainerClient(storageContainerName);

        // Limit to first 50 files (increased from 10 to handle more artifacts)
        const MAX_ARTIFACTS = 50;
        const filesToProcess = artifacts.length > MAX_ARTIFACTS ? artifacts.slice(0, MAX_ARTIFACTS) : artifacts;
        if (artifacts.length > MAX_ARTIFACTS) {
            console.log(`Only processing first ${MAX_ARTIFACTS} files due to length limit`);
        }

        const uploadedFiles: any[] = [];
        const db = getDb();

        // Process each artifact file
        for (const artifact of filesToProcess) {
            try {
                const { fileName, contentBase64, size, mimeType } = artifact;

                console.log(`Uploading artifact: ${fileName}`);

                // Generate unique blob name
                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const blobName = `${azureStorageRootFolder}/artifacts/${automationId}/${timestamp}_${fileName}`;
                
                // Upload file to Azure Blob storage
                const blockBlobClient = containerClient.getBlockBlobClient(blobName);
                const fileContent = Buffer.from(contentBase64, 'base64');
                
                await blockBlobClient.upload(fileContent, fileContent.length, {
                    blobHTTPHeaders: {
                        blobContentType: mimeType || getMimeTypeFromFileName(fileName)
                    }
                });

                console.log(`Artifact uploaded successfully: ${blobName}`);

                // Generate SAS token for access
                const sasToken = generateBlobSasToken(
                    containerClient,
                    storageContainerName,
                    blobName
                );

                const blobUrl = `${blockBlobClient.url}?${sasToken}`;

                // Save file information to files collection
                const fileData = {
                    name: fileName,
                    originalName: fileName,
                    blobName: blobName,
                    blobUrl: blobUrl,
                    size: size || fileContent.length,
                    mimeType: mimeType || getMimeTypeFromFileName(fileName),
                    type: 'output',
                    automationId: automationId,
                    createdAt: new Date(),
                    uploadedBy: 'system',
                    userId: userId
                };

                const result = await db.collection('files').insertOne(fileData);
                
                uploadedFiles.push({
                    fileName,
                    blobName,
                    blobUrl,
                    fileId: result.insertedId.toString(),
                    size: fileData.size
                });

            } catch (error) {
                console.error(`Error uploading artifact ${artifact.fileName}:`, error);
            }
        }

        return NextResponse.json({
            message: 'Artifacts uploaded successfully',
            uploadedFiles,
            totalFiles: uploadedFiles.length
        });

    } catch (error: any) {
        console.error('Error uploading artifacts:', error);
        return NextResponse.json(
            { error: 'Failed to upload artifacts: ' + error.message },
            { status: 500 }
        );
    }
}

function generateBlobSasToken(containerClient: any,containerName: string, blobName: string): string {
    const permissions = BlobSASPermissions.parse('r');

    return generateBlobSASQueryParameters({
        containerName,
        blobName,
        permissions,
        expiresOn: new Date(new Date().valueOf() + 365 * 24 * 60 * 60 * 1000), // 1 year
        startsOn: new Date()
    }, containerClient.credential).toString();
}

function getMimeTypeFromFileName(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const mimeTypes: { [key: string]: string } = {
        'txt': 'text/plain',
        'json': 'application/json',
        'csv': 'text/csv',
        'html': 'text/html',
        'css': 'text/css',
        'js': 'application/javascript',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'gif': 'image/gif',
        'pdf': 'application/pdf',
        'zip': 'application/zip',
        'xml': 'application/xml',
        'log': 'text/plain'
    };
    return mimeTypes[ext || ''] || 'application/octet-stream';
}
