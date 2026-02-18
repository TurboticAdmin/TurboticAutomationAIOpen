// /api/files
import {  NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { BlobServiceClient, StorageSharedKeyCredential } from '@azure/storage-blob';
import { getStorageConfig } from '@/app/utils/util';
import authenticationBackend from '../authentication/authentication-backend';

export async function POST(req: NextRequest) {
    let currentUser: any = null;
    try {
        currentUser = await authenticationBackend.getCurrentUser(req);
        if (!currentUser) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        const fileData = await req.json();
        const file = await getDb().collection('files').insertOne(fileData);
        return NextResponse.json({ success: true, file });
    }
    catch (error: any) {
        console.error('Error uploading files:', error.message);
        return NextResponse.json({ message: 'Error uploading files', error: error.message }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    let currentUser: any = null;
    try {
        currentUser = await authenticationBackend.getCurrentUser(req);
        if (!currentUser) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        const userId = String(currentUser._id);
        const files = await getDb().collection('files').find({ type: 'output', userId: userId }).sort({ uploadedAt: -1 }).toArray();
        if (files.length > 0) {
            for (const file of files) {
                if (file.automationId) {
                    const automation = await getDb().collection('automations').findOne({ _id: new ObjectId(String(file.automationId)) });
                    if (automation && automation?.title) {
                        file.automationName = automation.title;
                    }
                    // Ensure automationId is included in the response
                    file.automationId = String(file.automationId);
                }
            }
        }
        return NextResponse.json({ success: true, files });
    }
    catch (error: any) {
        console.error('Error fetching files:', error.message);
        return NextResponse.json({ message: 'Error fetching files', error: error.message }, { status: 500 });
    }
}

async function deleteFileFromAzure(file: any) {
    if (!file.blobUrl) return;

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
        throw azureError;
    }
}

export async function DELETE(req: NextRequest) {
    try {

        let currentUser = await authenticationBackend.getCurrentUser(req);
        if (!currentUser) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const body = await req.json();
        const { ids } = body;

        if (!Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json(
                { message: 'Invalid or empty IDs array' },
                { status: 400 }
            );
        }

        const invalidIds = ids.filter((id: string) => !ObjectId.isValid(id));
        if (invalidIds.length > 0) {
            return NextResponse.json(
                { message: 'Invalid file ID format', invalidIds },
                { status: 400 }
            );
        }

        const db = getDb();
        const results = {
            success: [] as Array<{ id: string; filename: string }>,
            failed: [] as Array<{ id: string; error: string }>,
            notFound: [] as Array<{ id: string; error: string }>
        };

        for (const fileId of ids) {
            try {
                const file = await db.collection('files').findOne({ _id: ObjectId.createFromHexString(fileId) });

                if (!file) {
                    results.notFound.push({ id: fileId, error: 'File not found' });
                    continue;
                }

                if (file.blobUrl) {
                    try {
                        await deleteFileFromAzure(file);
                    } catch (azureError: any) {
                        console.error(`Error deleting file ${fileId} from Azure Storage:`, azureError.message);
                    }
                }

                const deleteResult = await db.collection('files').deleteOne({ _id: ObjectId.createFromHexString(fileId) });
                
                if (deleteResult.deletedCount > 0) {
                    results.success.push({ 
                        id: fileId, 
                        filename: file.filename || file.originalName 
                    });
                } else {
                    results.notFound.push({ id: fileId, error: 'File not found in database' });
                }

            } catch (error: any) {
                console.error(`Error deleting file ${fileId}:`, error.message);
                results.failed.push({ 
                    id: fileId, 
                    error: error.message 
                });
            }
        }


        const response = {
            success: results.success.length > 0,
            message: `Bulk delete completed`,
            results,
        };

        return NextResponse.json(response, { status: 200 });
    } catch (error: any) {
        
        return NextResponse.json(
            { message: 'Error deleting file(s)', error: error.message },
            { status: 500 }
        );
    }
}

