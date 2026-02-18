// app/api/upload/route.ts
import { NextResponse } from 'next/server';
import { BlobServiceClient , generateBlobSASQueryParameters, BlobSASPermissions } from '@azure/storage-blob';
import { getDb } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { getStorageConfig } from '@/app/utils/util';

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const automationId = form.get('automationId') as string;
    const varriableName = form.get('varriableName') as string;
    const userId = form.get('userId') as string;
    const uploadMode = form.get('uploadMode') as string || 'single';
    const files = form.getAll('file') as File[];
    if (files.length === 0) {
      return NextResponse.json({ message: 'No files uploaded' }, { status: 200 });
    }
    const filesUploaded = await uploadFile(automationId, files, varriableName, userId, uploadMode);
    return NextResponse.json({ success: true, filesUploaded });
  }
  catch (error: any) {
    console.error('Error uploading files:', error.message);
    return NextResponse.json({ message: 'Error uploading files', error: error.message }, { status: 500 });
  }
}


async function uploadFile(automationId: string, files: File[], varriableName: string, userId: string, uploadMode: string) {

  console.log('Uploading files to Azure Storage Blob');

  const config = getStorageConfig();
  const azureAccountName = config.STORAGE_AZURE_ACCOUNT_NAME as string;
  const azureAccountKey = config.STORAGE_AZURE_ACCOUNT_KEY as string;
  const azureContatinerName = config.STORAGE_AZURE_CONTAINER_NAME as string;
  const azureStorageProtocol = config.STORAGE_AZURE_PROTOCOL as string;
  const azureStorageEndpointUrl = config.STORAGE_AZURE_ENDPOINT_URL as string;
  const azureStorageRootFolder = config.azureStorageRootFolder as string;

  console.log(
    `\n DefaultEndpointsProtocol=${azureStorageProtocol} AccountName=${azureAccountName} EndpointSuffix=${azureStorageEndpointUrl}`,
  );

  const blobServiceClient = BlobServiceClient.fromConnectionString(
    `DefaultEndpointsProtocol=${azureStorageProtocol};AccountName=${azureAccountName};AccountKey=${azureAccountKey};EndpointSuffix=${azureStorageEndpointUrl}`,
  );

  let containerClient: any;

  try {
    containerClient =
      blobServiceClient.getContainerClient(azureContatinerName);
    await containerClient.createIfNotExists();
  } catch (error: any) {
    console.error('Error creating Azure Storage container:', error.message);
    throw error;
  }

  const filesUploaded: { fileId: string, fileName: string, url: string }[] = [];
  
  // Handle zip extraction if upload mode is 'zip'
  let filesToProcess = files;
  if (uploadMode === 'zip') {
    filesToProcess = await extractZipFiles(files);
  }
  
  for (const file of filesToProcess) {
    const blobName = `${azureStorageRootFolder}/${file.name}`;
    const signedUrl = await uploadToAzureStorage(blobName, file);
    const fileObject = {
      name: file.name,
      url: signedUrl,
      size: file.size,
      type: file.type,
      automationId: automationId,
      userId: userId,
    };
    const fileId = await getDb().collection('files').insertOne(fileObject);
    filesUploaded.push({fileId:fileId.insertedId.toString(), fileName: file.name,url:signedUrl});
  }

  // update automation.environmentVariables with the fileId (filesUploaded)
  const automation = await getDb().collection('automations').findOne({ _id: new ObjectId(automationId) });
  if (automation && automation.environmentVariables && automation.environmentVariables.length > 0) {
    const enviromentVariables = automation.environmentVariables as any[];
    const enviromentVariableIndex = enviromentVariables.findIndex(v => v.name === varriableName);
    if (enviromentVariableIndex !== -1) {
      await getDb().collection('automations').updateOne(
        { _id: new ObjectId(automationId) }, 
        { $set: { 
          'environmentVariables.$[elem].type': uploadMode === 'single' ? 'file' : 'files',
          'environmentVariables.$[elem].valueFile': uploadMode === 'single' ? filesUploaded[0] : filesUploaded,
          'environmentVariables.$[elem].value': ''
        }},
        {
          arrayFilters: [{ 'elem.name': varriableName }]
        }
      );
    }
  }

  console.log(`${filesUploaded.length} files uploaded to Azure Storage Blob`);

  return filesUploaded;

  async function uploadToAzureStorage(blobName: string, file: any) {
    const blockBlobClient = containerClient.getBlockBlobClient(
      blobName
    );

    console.log(`Uploading ${file.name} to Azure Storage Blob`);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      await blockBlobClient.uploadData(buffer, {
        blobHTTPHeaders: { blobContentType: file.mimetype },
      });

      const sasToken = generateBlobSASQueryParameters(
        {
          containerName: azureContatinerName,
          blobName,
          permissions: BlobSASPermissions.parse('r'),
          startsOn: new Date(),
          expiresOn: new Date(Date.now() + 60 * 60 * 1000),
        },
        blockBlobClient.credential,
      );

      const signedUrl = `${blockBlobClient.url}?${sasToken}`;
      return signedUrl;
    } catch (error: any) {
      console.error(
        'Error uploading to Azure Storage Blob:',
        error.message,
      );
      throw error;
    }
  };

}

// Helper function to extract files from ZIP archives
async function extractZipFiles(files: File[]): Promise<File[]> {
  const extractedFiles: File[] = [];
  
  for (const file of files) {
    if (file.name.toLowerCase().endsWith('.zip')) {
      try {
        // For now, we'll treat ZIP files as single files
        // In a production environment, you would want to use a proper ZIP library
        // like 'adm-zip' or 'yauzl' to extract the contents
        console.log(`ZIP file detected: ${file.name}. Currently treating as single file.`);
        extractedFiles.push(file);
      } catch (error) {
        console.error(`Error processing ZIP file ${file.name}:`, error);
        // If processing fails, add the original ZIP file
        extractedFiles.push(file);
      }
    } else {
      // Non-ZIP files are added as-is
      extractedFiles.push(file);
    }
  }
  
  return extractedFiles;
} 