import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import { getStorageConfig } from '@/app/utils/util';
import authenticationBackend from '../../authentication/authentication-backend';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    let currentUser: any = null;

    try {
        currentUser = await authenticationBackend.getCurrentUser(req);
        if (!currentUser) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        const { id } = await params;

        if (!id) {
            return NextResponse.json(
                { message: 'File ID is required' },
                { status: 400 }
            );
        }

        // Validate ObjectId format
        if (!ObjectId.isValid(id)) {
            return NextResponse.json(
                { message: 'Invalid file ID format' },
                { status: 400 }
            );
        }

        const db = getDb();
        const file = await db.collection('files').findOne({ _id: new ObjectId(id) });

        if (!file) {
            return NextResponse.json(
                { message: 'File not found' },
                { status: 404 }
            );
        }

        // Get file content from storage (Azure Storage, database, or file system)
        let fileContent: Buffer;
        let contentType: string;

        if (file.blobUrl) {
            // If file is stored in Azure Storage
            try {
                const config = await getStorageConfig();
                const azureAccountName = config.STORAGE_AZURE_ACCOUNT_NAME as string;
                const azureAccountKey = config.STORAGE_AZURE_ACCOUNT_KEY as string;
                const azureContatinerName = config.STORAGE_AZURE_CONTAINER_NAME as string;
                const azureStorageProtocol = config.STORAGE_AZURE_PROTOCOL as string;
                const azureStorageEndpointUrl = config.STORAGE_AZURE_ENDPOINT_URL as string;

                if (!azureAccountName || !azureAccountKey) {
                    console.error('Azure Storage credentials not configured');
                    return NextResponse.json(
                        { message: 'Azure Storage not configured' },
                        { status: 500 }
                    );
                }

                let blobServiceClient: BlobServiceClient;

                if (azureAccountName && azureAccountKey) {
                    const connectionString = `DefaultEndpointsProtocol=${azureStorageProtocol};AccountName=${azureAccountName};AccountKey=${azureAccountKey};EndpointSuffix=${azureStorageEndpointUrl}`;
                    blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
                } else {
                    const url = `${azureStorageProtocol}://${azureAccountName}.${azureStorageEndpointUrl}`;
                    const credential = new StorageSharedKeyCredential(azureAccountName!, azureAccountKey!);
                    blobServiceClient = new BlobServiceClient(url, credential);
                }

                // Determine container and blob name
                let containerName = azureContatinerName;
                let blobName = file.blobName || file.filename || file.originalName;


                if (!containerName || !blobName) {
                    return NextResponse.json(
                        { message: 'Invalid Azure Storage configuration' },
                        { status: 400 }
                    );
                }

                const containerClient = blobServiceClient.getContainerClient(containerName);
                const blobClient = containerClient.getBlobClient(blobName);

                // Download the blob
                const downloadResponse = await blobClient.download();
                const chunks: Uint8Array[] = [];

                for await (const chunk of downloadResponse.readableStreamBody!) {
                    chunks.push(chunk as Uint8Array);
                }

                // Combine chunks into a single buffer
                const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
                fileContent = Buffer.concat(chunks as Buffer[], totalLength);
                contentType = file.mimeType || downloadResponse.contentType || 'application/octet-stream';


            } catch (azureError: any) {
                console.error('Error downloading from Azure Storage:', azureError.message);
                return NextResponse.json(
                    { message: 'Error downloading from Azure Storage', error: azureError.message },
                    { status: 500 }
                );
            }
        } else {
            return NextResponse.json(
                { message: 'File content not available' },
                { status: 404 }
            );
        }

        // Set appropriate headers for file download
        const headers = new Headers();
        headers.set('Content-Type', contentType);
        headers.set('Content-Disposition', `attachment; filename="${file.originalName || file.filename || 'download'}"`);

        if (file.size) {
            headers.set('Content-Length', file.size.toString());
        }

        // Return file as response
        return new NextResponse(fileContent as any, {
            status: 200,
            headers
        });

    } catch (error: any) {
        console.error('Error downloading file:', error.message);
        return NextResponse.json(
            { message: 'Error downloading file', error: error.message },
            { status: 500 }
        );
    }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {

    try {
        const { id } = await params;

        if (!id) {
            return NextResponse.json(
                { message: 'File ID is required' },
                { status: 400 }
            );
        }

        // Validate ObjectId format
        if (!ObjectId.isValid(id)) {
            return NextResponse.json(
                { message: 'Invalid file ID format' },
                { status: 400 }
            );
        }

        const db = getDb();
        const file = await db.collection('files').findOne({ _id: new ObjectId(id) });

        if (!file) {
            return NextResponse.json(
                { message: 'File not found' },
                { status: 404 }
            );
        }

        // If file is stored in Azure Storage, delete the blob
        if (file.blobUrl) {
            try {
                const config = await getStorageConfig();
                const azureAccountName = config.STORAGE_AZURE_ACCOUNT_NAME as string;
                const azureAccountKey = config.STORAGE_AZURE_ACCOUNT_KEY as string;
                const azureContatinerName = config.STORAGE_AZURE_CONTAINER_NAME as string;
                const azureStorageProtocol = config.STORAGE_AZURE_PROTOCOL as string;
                const azureStorageEndpointUrl = config.STORAGE_AZURE_ENDPOINT_URL as string;

                if (azureAccountName && azureAccountKey) {
                    let blobServiceClient: BlobServiceClient;

                    if (azureAccountName && azureAccountKey) {
                        const connectionString = `DefaultEndpointsProtocol=${azureStorageProtocol};AccountName=${azureAccountName};AccountKey=${azureAccountKey};EndpointSuffix=${azureStorageEndpointUrl}`;
                        blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
                    } else {
                        const url = `${azureStorageProtocol}://${azureAccountName}.${azureStorageEndpointUrl}`;
                        const credential = new StorageSharedKeyCredential(azureAccountName!, azureAccountKey!);
                        blobServiceClient = new BlobServiceClient(url, credential);
                    }

                    let containerName = azureContatinerName;
                    let blobName = file.blobName || file.filename || file.originalName;

                    if (file.blobUrl) {
                        const url = new URL(file.blobUrl);
                        const pathParts = url.pathname.split('/');
                        if (pathParts.length >= 3) {
                            containerName = pathParts[1];
                            blobName = pathParts.slice(2).join('/');
                        }
                    }

                    if (containerName && blobName) {
                        const containerClient = blobServiceClient.getContainerClient(containerName);
                        const blobClient = containerClient.getBlobClient(blobName);
                        await blobClient.delete();
                    }
                }
            } catch (azureError: any) {
                console.error('Error deleting from Azure Storage:', azureError.message);
                // Continue with database deletion even if Azure deletion fails
            }
        }

        // Delete from database
        await db.collection('files').deleteOne({ _id: new ObjectId(id) });

        return NextResponse.json(
            { message: 'File deleted successfully' },
            { status: 200 }
        );
    } catch (error: any) {
        console.error('Error deleting file:', error.message);
        return NextResponse.json(
            { message: 'Error deleting file', error: error.message },
            { status: 500 }
        );
    }
}

