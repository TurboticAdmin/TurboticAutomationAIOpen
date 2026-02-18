export function getStorageConfig() {
    const config = {
        STORAGE_AZURE_ACCOUNT_NAME: process.env.STORAGE_AZURE_ACCOUNT_NAME,
        STORAGE_AZURE_ACCOUNT_KEY: process.env.STORAGE_AZURE_ACCOUNT_KEY,
        STORAGE_AZURE_CONTAINER_NAME: process.env.STORAGE_AZURE_CONTAINER_NAME,
        STORAGE_AZURE_ENDPOINT_URL: process.env.STORAGE_AZURE_ENDPOINT_URL || 'core.windows.net',
        STORAGE_AZURE_PROTOCOL: process.env.STORAGE_AZURE_PROTOCOL || 'https',
        azureStorageRootFolder: 'turbotic-ai-automation'
    }
    return config;
}