import fs from 'fs-extra';
import path from 'path';
import { ChildProcess, exec } from 'child_process';
import AdmZip from 'adm-zip';
const RUN_DIRECTORY = path.join(process.cwd(), 'run');
import generateScript from './generate-script';
import performanceNow from 'performance-now';


if (!fs.existsSync(RUN_DIRECTORY)) {
    fs.mkdirSync(RUN_DIRECTORY, { recursive: true });
}

export class Runner {
    executionHistory: any;
    automationId: string;
    runDirectory: string;
    envVariables: any[] = [];
    dependencies: any[] = [];
    running: boolean = false;
    __stdoutBuffer: string = '';
    __stderrBuffer: string = '';
    runtimeEnvironment: 'dev' | 'test' | 'production' = 'dev';
    runFrom?: string;

    constructor(automationId: string) {
        this.automationId = automationId;
        this.runDirectory = path.join(RUN_DIRECTORY, automationId);
        fs.mkdirSync(this.runDirectory, { recursive: true });
    }

    private _installProcess: ChildProcess;
    async installDependencies() {
        if (this.dependencies.length === 0) {
            return;
        }

        return new Promise<void>((resolve, reject) => {
            const cmd = `npm install ${this.dependencies.map((dep) => `${dep.name}@${dep.version}`).join(' ')}`;

            console.log(cmd);

            this._installProcess = exec(cmd, {
                cwd: this.runDirectory,
                env: {
                    ...process.env,
                }
            });

            this._installProcess.stdout?.on('data', (data) => {
                console.log('stdout', data.toString());
                this.pushLogs(data.toString());
            });

            this._installProcess.stderr?.on('data', (data) => {
                console.log('stderr', data.toString());
                this.pushLogs(data.toString());
            });

            this._installProcess.on('close', (code) => {
                console.log(`Installation complete with exit code ${code}`);
                this.pushLogs(`Installation complete with exit code ${code}`);
                if (code > 0) {
                    this.pushLogs(`Run complete with exit code ${code === null ? 0 : code}`);
                }
                
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Installation failed with exit code ${code}`));
                }
            });
        });
    }

    automationVersion: "2" | "3" = "2";
    
    async downloadCode() {
        try {
            console.log(`Current user ID:`, this.executionHistory.userId);
            console.log(`Runtime environment:`, this.executionHistory.runtimeEnvironment || 'default');

            const headers: Record<string, string> = {
                'X-Script-Runner': 'true',
                'User-Agent': 'TurboticAI-ScriptRunner/1.0',
                'X-Current-User-Id': String(this.executionHistory.userId)
            };

            // Pass runtime environment to get correct env var values
            if (this.executionHistory.runtimeEnvironment) {
                headers['X-Runtime-Environment'] = this.executionHistory.runtimeEnvironment;
            }

            const response = await fetch(`${process.env.AUTOMATIONAI_ENDPOINT}/api/automations/${this.automationId}`, {
                headers
            });
            
            if (!response.ok) {
                throw new Error(`Failed to fetch automation: ${response.status} ${response.statusText}`);
            }
            
            const responseText = await response.text();
            if (!responseText) {
                throw new Error('Empty response from automation API');
            }
            
            let automation;
            try {
                automation = JSON.parse(responseText);
            } catch (parseError) {
                console.error('JSON parse error. Response text:', responseText);
                throw new Error(`Invalid JSON response: ${parseError.message}`);
            }
            
            this.runtimeEnvironment = automation?.runtimeEnvironment || 'dev';
            this.runFrom = this.__queuePayload?.runFrom || undefined;
            
            if (automation?.version === "3") {
                this.automationVersion = "3";

                fs.emptyDirSync(this.runDirectory);

                let metadata: any = {
                    steps: []
                }

                const executionFiles: string[] = [];

                if (automation?.v3Steps?.length > 0) {
                    let index = 0;
                    for (const step of automation?.v3Steps) {
                        index++;
                        const fileName = `step-${index}.js`;
                        executionFiles.push(fileName);
                        fs.writeFileSync(path.join(this.runDirectory, fileName), generateScript(step.code || ''));
                        metadata.steps.push({
                            title: step.name,
                            fileName: fileName,
                            stepId: step.id
                        });
                    }
                }

                fs.writeFileSync(path.join(this.runDirectory, 'metadata.json'), JSON.stringify(metadata, null, 2));
                executionFiles.push('metadata.json');

                this.executionFiles = executionFiles;

                console.log('Latest code pulled');
            } else {  
                fs.mkdirSync(this.runDirectory, { recursive: true });
                fs.writeFileSync(path.join(this.runDirectory, 'code.js'), generateScript(automation?.code || ''));
                console.log('Latest code pulled');
            }

            // Use environment variables from queue payload if provided, otherwise use automation's env vars
            if (this.__queuePayload?.environmentVariables && this.__queuePayload.environmentVariables.length > 0) {
                // Process queue payload env vars to handle old and new structures
                this.envVariables = this.__queuePayload.environmentVariables;
                console.log(`Using ${this.envVariables.length} environment variables from queue payload`);
            } else if (automation?.environmentVariables) {
                // Process automation env vars to handle old and new structures
                this.envVariables = automation.environmentVariables.map((envVar: any) => {
                    // Handle new multi-environment structure for value
                    if (envVar.value && typeof envVar.value === 'object' && !Array.isArray(envVar.value)) {
                        // Check if it's the new multi-environment structure (has dev/test/production keys)
                        if (envVar.value.dev !== undefined || envVar.value.test !== undefined || envVar.value.production !== undefined) {
                            // Extract the appropriate environment's value
                            let extractedValue: string | undefined;
                            if (this.runtimeEnvironment === 'dev' && envVar.value.dev !== undefined) {
                                extractedValue = envVar.value.dev;
                            } else if (this.runtimeEnvironment === 'test' && envVar.value.test !== undefined) {
                                extractedValue = envVar.value.test;
                            } else if (this.runtimeEnvironment === 'production' && envVar.value.production !== undefined) {
                                extractedValue = envVar.value.production;
                            } else {
                                // Fallback to first available environment
                                extractedValue = envVar.value.dev !== undefined ? envVar.value.dev : 
                                                (envVar.value.test !== undefined ? envVar.value.test : envVar.value.production);
                            }
                            return {
                                ...envVar,
                                value: extractedValue
                            };
                        }
                    }
                    // Old structure or already processed - return as is
                    return envVar;
                });
                console.log(`Using ${this.envVariables.length} environment variables from automation`);
            }
            
            if (automation?.dependencies) {
                this.dependencies = automation.dependencies;
            }
        } catch (error) {
            console.error('Error downloading code:', error);
            // Create a default empty script to prevent complete failure
            fs.writeFileSync(path.join(this.runDirectory, 'code.js'), generateScript(''));
            console.log('Created empty script due to download error');
            throw error;
        }
    }

    async downloadFilesFromEnvVariables() {
        try {

            if (this?.runFrom?.toLowerCase() === "turbotic-external-api") {

                console.log('Downloading files from environment variables for Turbotic External API');

                const fileEnvVars = this.envVariables.filter((envVar) => {
                    // Handle single file (object)
                    if (envVar.valueFile && typeof envVar.valueFile === 'object' && !Array.isArray(envVar.valueFile)) {
                        return envVar.valueFile.url && envVar.valueFile.fileName;
                    }
                    // Handle multiple files (array)
                    if (envVar.valueFile && Array.isArray(envVar.valueFile)) {
                        return envVar.valueFile.length > 0 && envVar.valueFile.every(file => file.url && file.fileName);
                    }
                    return false;
                });

                if (fileEnvVars.length === 0) {
                    console.log('No file-related environment variables found');
                    return;
                }

                console.log(`Found ${fileEnvVars.length} file-related environment variables`);
                // Call the API endpoint to download files
                const apiUrl = process.env.AUTOMATIONAI_ENDPOINT + '/api/download-from-env';
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Script-Runner': 'true',
                        'User-Agent': 'TurboticAI-ScriptRunner/1.0'
                    },
                    body: JSON.stringify({ envVariables: fileEnvVars, automationId: this.automationId })
                });

                if (!response.ok) {
                    throw new Error(`API call failed: ${response.statusText}`);
                }

                const result = await response.json();

                if (result.error) {
                    throw new Error(result.error);
                }

                console.log(`Files fetched successfully: ${result.totalFiles} files`);

                // Group files by environment variable name
                const filesByEnvVar: { [key: string]: any[] } = {};
                for (const downloadedFile of result.downloadedFiles) {
                    if (!filesByEnvVar[downloadedFile.envVarName]) {
                        filesByEnvVar[downloadedFile.envVarName] = [];
                    }
                    filesByEnvVar[downloadedFile.envVarName].push(downloadedFile);
                }
                // Process each environment variable
                for (const [envVarName, files] of Object.entries(filesByEnvVar)) {
                    try {
                        const envVar = this.envVariables.find((env: any) => env.name === envVarName);
                        if (!envVar) continue;

                        if (files.length === 1) {
                            const downloadedFile = files[0];
                            const fileName = downloadedFile.fileName || `${Date.now()}_${envVarName}`;
                            const localFilePath = path.join(this.runDirectory, fileName);
                            const buffer = Buffer.from(downloadedFile.contentBase64, 'base64');
                            fs.writeFileSync(localFilePath as any, buffer as any);

                            // Check if it's a ZIP file and extract it
                            if (fileName.toLowerCase().endsWith('.zip')) {
                                const extractedFiles = await this.extractZipFile(localFilePath, envVarName);
                                if (extractedFiles.length > 0) {
                                    envVar.value = JSON.stringify(extractedFiles);
                                    // store only the file names in the extractedFiles array
                                    envVar.extractedFiles = extractedFiles.map((file) => file.fileName);
                                    console.log(`Extracted ${extractedFiles.length} files from ZIP ${envVarName}`);
                                } else {
                                    envVar.value = localFilePath;
                                    console.log(`ZIP extraction failed, using ZIP file ${envVarName}`);
                                }
                            } else {
                                envVar.value = localFilePath;
                                console.log(`Wrote single file ${envVarName} to ${localFilePath}`);
                            }
                        } else {
                            // Multiple files - set as array of paths
                            const filePaths: { filePath: string, fileName: string }[] = [];
                            for (const downloadedFile of files) {
                                const fileName = downloadedFile.fileName || `${Date.now()}_${envVarName}_${files.indexOf(downloadedFile)}`;
                                const localFilePath = path.join(this.runDirectory, fileName);
                                const buffer = Buffer.from(downloadedFile.contentBase64, 'base64');
                                fs.writeFileSync(localFilePath as any, buffer as any);

                                // Check if it's a ZIP file and extract it
                                if (fileName.toLowerCase().endsWith('.zip')) {
                                    const extractedFiles = await this.extractZipFile(localFilePath, `${envVarName}_${files.indexOf(downloadedFile)}`);
                                    filePaths.push(...extractedFiles);
                                    console.log(`Extracted ${extractedFiles.length} files from ZIP ${fileName}`);
                                } else {
                                    filePaths.push({
                                        filePath: localFilePath,
                                        fileName: fileName
                                    });
                                }
                            }

                            envVar.value = JSON.stringify(filePaths);
                            console.log(`Wrote ${filePaths.length} files for ${envVarName}`);
                        }
                    } catch (e) {
                        console.error(`Failed to write files for environment variable ${envVarName}:`, e);
                    }
                }

                console.log('Files downloaded from environment variables & local file path updated in env variables');
                return;

            }
            else {

                console.log('Downloading files from environment variables for the Turbotic AI platform');

                let environmentStrategy = this.runtimeEnvironment;

                console.log(`Using environment strategy: ${environmentStrategy}`);

                // Process environment variables to extract the correct environment's valueFile
                const processedEnvVars = this.envVariables.map((envVar) => {
                    if (!envVar.valueFile) {
                        return envVar;
                    }
                    
                    // Create a copy to avoid mutating the original
                    const processedEnvVar = { ...envVar };
                    
                    // Handle multi-environment structure for valueFile
                    if (typeof envVar.valueFile === 'object' && !Array.isArray(envVar.valueFile)) {
                        // Check if it's the new multi-environment structure (has dev/test/production keys)
                        if (envVar.valueFile.dev !== undefined || envVar.valueFile.test !== undefined || envVar.valueFile.production !== undefined) {
                            // Extract the appropriate environment's file(s)
                            // Each environment can contain either a single file object or an array of file objects
                            let extractedValue: any = null;
                            if (environmentStrategy === 'dev' && envVar.valueFile.dev !== undefined) {
                                extractedValue = envVar.valueFile.dev;
                            }
                            else if (environmentStrategy === 'test' && envVar.valueFile.test !== undefined) {
                                extractedValue = envVar.valueFile.test;
                            }
                            else if (environmentStrategy === 'production' && envVar.valueFile.production !== undefined) {
                                extractedValue = envVar.valueFile.production;
                            }
                            else {
                                // Fallback to first available environment
                                extractedValue = envVar.valueFile.dev !== undefined ? envVar.valueFile.dev : 
                                                (envVar.valueFile.test !== undefined ? envVar.valueFile.test : 
                                                envVar.valueFile.production);
                            }
                            
                            // Assign the extracted value back to valueFile
                            processedEnvVar.valueFile = extractedValue;
                        }
                        // If it's the old structure (single file object), keep it as is
                    }
                    // If it's an array, check if it contains multi-environment structures
                    else if (Array.isArray(envVar.valueFile)) {
                        // Process each file item to handle multi-environment structures
                        const processedFiles: any[] = [];
                        for (const file of envVar.valueFile) {
                            // Check if this file item has multi-environment structure
                            if (file && typeof file === 'object' && !Array.isArray(file)) {
                                if (file.dev !== undefined || file.test !== undefined || file.production !== undefined) {
                                    // Extract the appropriate environment's file
                                    let extractedFile: any = null;
                                    if (environmentStrategy === 'dev' && file.dev !== undefined) {
                                        extractedFile = file.dev;
                                    }
                                    else if (environmentStrategy === 'test' && file.test !== undefined) {
                                        extractedFile = file.test;
                                    }
                                    else if (environmentStrategy === 'production' && file.production !== undefined) {
                                        extractedFile = file.production;
                                    }
                                    else {
                                        // Fallback to first available environment
                                        extractedFile = file.dev !== undefined ? file.dev : 
                                                      (file.test !== undefined ? file.test : file.production);
                                    }
                                    processedFiles.push(extractedFile);
                                } else {
                                    // Not a multi-environment structure, keep as is
                                    processedFiles.push(file);
                                }
                            } else {
                                // Not an object, keep as is
                                processedFiles.push(file);
                            }
                        }
                        processedEnvVar.valueFile = processedFiles;
                    }
                    return processedEnvVar;
                });

                // Check if environment variables contain file references
                const fileEnvVars = processedEnvVars.filter((envVar) => {
                    // Handle single file (object)
                    if (envVar.valueFile && typeof envVar.valueFile === 'object' && !Array.isArray(envVar.valueFile)) {
                        return envVar.valueFile.url && envVar.valueFile.fileName;
                    }
                    // Handle multiple files (array)
                    if (envVar.valueFile && Array.isArray(envVar.valueFile)) {
                        return envVar.valueFile.length > 0 && envVar.valueFile.every(file => file.url && file.fileName);
                    }
                    return false;
                });

                if (fileEnvVars.length === 0) {
                    console.log('No file-related environment variables found');
                    return;
                }

                console.log(`Found ${fileEnvVars.length} file-related environment variables`);

                // Call the API endpoint to download files
                const apiUrl = process.env.AUTOMATIONAI_ENDPOINT + '/api/download-from-env';
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Script-Runner': 'true',
                        'User-Agent': 'TurboticAI-ScriptRunner/1.0'
                    },
                    body: JSON.stringify({ envVariables: fileEnvVars, automationId: this.automationId })
                });

                if (!response.ok) {
                    throw new Error(`API call failed: ${response.statusText}`);
                }

                const result = await response.json();

                if (result.error) {
                    throw new Error(result.error);
                }

                console.log(`Files fetched successfully: ${result.totalFiles} files`);

                // Group files by environment variable name
                const filesByEnvVar: { [key: string]: any[] } = {};
                for (const downloadedFile of result.downloadedFiles) {
                    if (!filesByEnvVar[downloadedFile.envVarName]) {
                        filesByEnvVar[downloadedFile.envVarName] = [];
                    }
                    filesByEnvVar[downloadedFile.envVarName].push(downloadedFile);
                }

                // Update this.envVariables with processed values for consistency
                this.envVariables = processedEnvVars;

                // Process each environment variable
                for (const [envVarName, files] of Object.entries(filesByEnvVar)) {
                    try {
                        const envVar = processedEnvVars.find((env: any) => env.name === envVarName);
                        if (!envVar) continue;

                        if (files.length === 1) {
                            const downloadedFile = files[0];
                            const fileName = downloadedFile.fileName || `${Date.now()}_${envVarName}`;
                            const localFilePath = path.join(this.runDirectory, fileName);
                            const buffer = Buffer.from(downloadedFile.contentBase64, 'base64');
                            fs.writeFileSync(localFilePath as any, buffer as any);

                            // Check if it's a ZIP file and extract it
                            if (fileName.toLowerCase().endsWith('.zip')) {
                                const extractedFiles = await this.extractZipFile(localFilePath, envVarName);
                                if (extractedFiles.length > 0) {
                                    envVar.value = JSON.stringify(extractedFiles);
                                    // store only the file names in the extractedFiles array
                                    envVar.extractedFiles = extractedFiles.map((file) => file.fileName);
                                    console.log(`Extracted ${extractedFiles.length} files from ZIP ${envVarName}`);
                                } else {
                                    envVar.value = localFilePath;
                                    console.log(`ZIP extraction failed, using ZIP file ${envVarName}`);
                                }
                            } else {
                                envVar.value = localFilePath;
                                console.log(`Wrote single file ${envVarName} to ${localFilePath}`);
                            }
                        } else {
                            // Multiple files - set as array of paths
                            const filePaths: { filePath: string, fileName: string }[] = [];
                            for (const downloadedFile of files) {
                                const fileName = downloadedFile.fileName || `${Date.now()}_${envVarName}_${files.indexOf(downloadedFile)}`;
                                const localFilePath = path.join(this.runDirectory, fileName);
                                const buffer = Buffer.from(downloadedFile.contentBase64, 'base64');
                                fs.writeFileSync(localFilePath as any, buffer as any);

                                // Check if it's a ZIP file and extract it
                                if (fileName.toLowerCase().endsWith('.zip')) {
                                    const extractedFiles = await this.extractZipFile(localFilePath, `${envVarName}_${files.indexOf(downloadedFile)}`);
                                    filePaths.push(...extractedFiles);
                                    console.log(`Extracted ${extractedFiles.length} files from ZIP ${fileName}`);
                                } else {
                                    filePaths.push({
                                        filePath: localFilePath,
                                        fileName: fileName
                                    });
                                }
                            }

                            // Store filepaths as an array in envVar.value
                            const filePathsArray: string[] = [];
                            for (const filePath of filePaths) {
                                filePathsArray.push(filePath.filePath);
                            }
                            envVar.value = filePathsArray;
                            console.log(`Wrote ${filePaths.length} files for ${envVarName}`);
                        }
                    } catch (e) {
                        console.error(`Failed to write files for environment variable ${envVarName}:`, e);
                    }
                }

                console.log('Files downloaded from environment variables & local file path updated in env variables');
                return;
            }

        } catch (error) {
            console.error('Error downloading files from environment variables:', error);
        }
    }

    private async extractZipFile(zipFilePath: string, envVarName: string): Promise<{ filePath: string, fileName: string }[]> {
        try {
            const zip = new AdmZip(zipFilePath);
            const extractedFiles: { filePath: string, fileName: string }[] = [];
            
            // Extract all files directly to run directory
            zip.extractAllTo(this.runDirectory, true);
            
            // Get all extracted files from run directory
            const getAllFiles = (dir: string): string[] => {
                let files: string[] = [];
                const items = fs.readdirSync(dir);
                
                for (const item of items) {
                    const fullPath = path.join(dir, item);
                    const stat = fs.statSync(fullPath);
                    
                    if (stat.isDirectory()) {
                        files = files.concat(getAllFiles(fullPath));
                    } else {
                        files.push(fullPath);
                    }
                }
                
                return files;
            };
            
            const extractedFilePaths = getAllFiles(this.runDirectory);
            
            // Filter to only include files that were extracted from this ZIP (not existing files)
            const zipFileName = path.basename(zipFilePath);
            const zipBaseName = path.parse(zipFileName).name;
            
            // Convert to our format - only include files that are likely from this ZIP
            for (const filePath of extractedFilePaths) {
                const fileName = path.basename(filePath);
                // Skip the ZIP file itself and code.js
                if (fileName !== zipFileName && fileName !== 'code.js') {
                    extractedFiles.push({
                        filePath: filePath,
                        fileName: fileName
                    });
                }
            }
            
            // Clean up the ZIP file
            fs.unlinkSync(zipFilePath);
            
            console.log(`Extracted ${extractedFiles.length} files from ${path.basename(zipFilePath)} to run directory`);
            return extractedFiles;
            
        } catch (error) {
            console.error(`Error extracting ZIP file ${zipFilePath}:`, error);
            return [];
        }
    }

    __logBuffer: any[] = [];
    __logPushTimer: NodeJS.Timeout;
    __killAfterLogPush: boolean = false;
    __logPushPaused: boolean = false;
    async pushLogs(data: string) {
        if (String(data).startsWith('Checking dependencies...')) {
            this.__logPushPaused = false;
        }

        if (this.__logPushPaused === true) {
            return;
        }

        if (String(data).startsWith('Run complete with exit code')) {
            this.__logPushPaused = true;
        }

        clearTimeout(this.__logPushTimer);
        this.__logBuffer.push(data);

        this.__logPushTimer = setTimeout(async () => {
            const logToPush = [...this.__logBuffer];
            this.__logBuffer = [];

            try {
                await fetch(`${process.env.AUTOMATIONAI_ENDPOINT}/api/run/logs`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        "executionId": process.env.EXECUTION_ID,
                        "logs": logToPush,
                        "executionHistoryId": this.executionHistory._id
                    })
                });
                console.log('Logs pushed', logToPush);
            } catch (e) {
                console.log(data);
            } finally {
                if (this.__killAfterLogPush === true) {
                    this.__ack();
                    await new Promise((resolve) => setTimeout(resolve, 3000));
                    process.exit(0);
                }
            }
        }, 1000);

        
    }

    async fetchLatestExecutionHistory() {
        try {
        const response = await fetch(`${process.env.AUTOMATIONAI_ENDPOINT}/api/run/execution-history`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                executionId: process.env.EXECUTION_ID
            })
        });
        const executionHistory = await response.json();
        this.executionHistory = executionHistory;

        return executionHistory;
        } catch (error) {
            console.error('Error fetching latest execution history:', error);
            return null;
        }
    }

    async refreshExecutionHistory() {
        if (!this.executionHistory) {
            throw new Error('Execution history not found');
        }

        const response = await fetch(`${process.env.AUTOMATIONAI_ENDPOINT}/api/run/execution-history`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                historyId: this.executionHistory._id
            })
        });
        const executionHistory = await response.json();
        this.executionHistory = executionHistory;

        return executionHistory;
    }

    async updateExecutionHistory(payload: any) {
        try {
            if (!this.executionHistory || !this.executionHistory._id) {
                console.error(`[UpdateExecutionHistory] No execution history or ID found!`, this.executionHistory);
                throw new Error('No execution history ID available');
            }
            
            const response = await fetch(`${process.env.AUTOMATIONAI_ENDPOINT}/api/run/execution-history`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ...payload,
                    executionHistoryId: String(this.executionHistory._id)
                })
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`[UpdateExecutionHistory] Failed to update execution history: ${response.status} ${response.statusText}`, errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }
            
            this.executionHistory = {
                ...this.executionHistory,
                ...payload
            };
            
            const executionHistory = await response.json();

            return executionHistory;
        } catch (error) {
            console.error(`[UpdateExecutionHistory] Error updating execution history:`, error);
            throw error;
        }
    }

    processBufferedOutput(buffer: string, isStdout: boolean = true): string {
        const lines = buffer.split('\n');
        // Keep the last partial line in the buffer
        const remainingBuffer = lines.pop() || '';
        
        // Push complete lines to logs (including empty lines to preserve formatting)
        for (const line of lines) {
            console.log(isStdout ? 'stdout' : 'stderr', line);
            this.pushLogs(line);
        }
        
        return remainingBuffer;
    }

    private _runProcess: ChildProcess;
    private _autokillTimeout: NodeJS.Timeout;
    async runCode() {
        return new Promise<number>((resolve) => {
            let resume = false;
            let runTokenId: string | undefined = undefined;
            let runFromStepId: string | undefined = undefined;
            let runOne: boolean = false;
            let temporaryRunTokenId: string | undefined = undefined;

            resume = this.__queuePayload?.resume === true;
            runFromStepId = this.__queuePayload?.runFromStepId;
            runOne = this.__queuePayload?.runOne === true;
            runTokenId = this.__queuePayload?.runTokenId;
            temporaryRunTokenId = this.__queuePayload?.temporaryRunTokenId;

            if (!runTokenId) {
                resume = false;
            }

            const cmd = this.automationVersion === "3" ? `script-frame -a ${resume === true ? 'resume' : 'run'} ${resume === true ? '-t ' + runTokenId : ''} -e ${process.env.EXECUTION_ID} -u ${process.env.AUTOMATIONAI_ENDPOINT} ${runFromStepId ? '-s ' + runFromStepId : ''} ${runOne ? '-o' : ''} ${temporaryRunTokenId ? '--tempTokenId ' + temporaryRunTokenId : ''}` : `node code.js`;

            // Reset buffers for new run
            this.__stdoutBuffer = '';
            this.__stderrBuffer = '';

            const customEnv = this.envVariables.reduce((acc, curr) => {
                // If value is an array, stringify it so it can be parsed back in the automation script
                acc[curr.name] = Array.isArray(curr.value) ? JSON.stringify(curr.value) : curr.value;
                return acc;
            }, {});

            const triggerAutokill = () => {
                const minutes = 2;
                clearTimeout(this._autokillTimeout);
                this._autokillTimeout = setTimeout(async () => {
                    console.log('Autokilling process');
                    try {
                        this._runProcess.kill('SIGKILL');
                    } catch (e) {
                        console.error(e);
                    }

                    const message = `Process autokilled because script was running for ${minutes} minute${minutes > 1 ? 's' : ''} without any new logs. Indicating that it is waiting for input or connection to close or hang.`;
                    this.pushLogs(message);
                
                    await this.updateExecutionHistory({
                        status: 'errored',
                        endedAt: new Date(),
                        error: message
                    });

                    this.__killAfterLogPush = true;
                    this.pushLogs(`Run complete with exit code 137`);
                }, 1000 * 60 * minutes);
            }

            this._runProcess = exec(cmd, {
                cwd: this.runDirectory,
                env: {
                    ...process.env,
                    NODE_ENV: 'production',
                    ...customEnv
                }
            });

            // Listen to stdout data
            this._runProcess.stdout?.on('data', (data) => {
                this.__stdoutBuffer += data.toString();
                this.__stdoutBuffer = this.processBufferedOutput(this.__stdoutBuffer, true);
                triggerAutokill();
            });

            // Listen to stderr data
            this._runProcess.stderr?.on('data', (data) => {
                this.__stderrBuffer += data.toString();
                this.__stderrBuffer = this.processBufferedOutput(this.__stderrBuffer, false);
                triggerAutokill();
            });

            // Listen for process completion
            this._runProcess.on('close', (code) => {
                clearTimeout(this._autokillTimeout);
                
                // Process any remaining buffered output
                if (this.__stdoutBuffer.trim()) {
                    console.log('stdout', this.__stdoutBuffer);
                    this.pushLogs(this.__stdoutBuffer);
                    this.__stdoutBuffer = '';
                }
                if (this.__stderrBuffer.trim()) {
                    console.log('stderr', this.__stderrBuffer);
                    this.pushLogs(this.__stderrBuffer);
                    this.__stderrBuffer = '';
                }
                
                // this.socket.emit('execution_complete', { exitCode: code });
                const exitCode = isNaN(code) ? 137 : code;
                this.pushLogs(`Run complete with exit code ${exitCode === null ? 0 : exitCode}`);
                resolve(exitCode);
            });
        });
    }

    async stop() {
        if (this._installProcess) {
            try {
                this._installProcess.kill('SIGKILL');
            } catch (e) {
                console.error(e);
            }
        }

        if (this._runProcess) {
            try {
                this._runProcess.kill('SIGKILL');
                clearTimeout(this._autokillTimeout);
            } catch (e) {
                console.error(e);
            }
        }

        this.running = false;

        const message = 'Run stopped by user';
        await this.updateExecutionHistory({
            status: 'stopped',
            endedAt: new Date(),
            error: message
        });
        
        this.__killAfterLogPush = true;
        this.pushLogs(`Run complete with exit code 137`);

        clearInterval(this.cancelCheckInterval);
    }

    private shouldContinue() {
        if (this.executionHistory?.cancelRequested === true) {
            return false;
        }

        return true;
    }

    private cancelCheckInterval: NodeJS.Timeout;
    async __run() {
        let startTime, endTime;
        try {
            clearInterval(this.cancelCheckInterval);

            await this.fetchLatestExecutionHistory();

            this.cancelCheckInterval = setInterval(async () => {
                console.log('Checking for cancellation');
                try {
                    await this.refreshExecutionHistory();
                    if (this.executionHistory?.cancelRequested === true) {
                        clearInterval(this.cancelCheckInterval);

                        this.pushLogs('Cancellation requested, stopping run');
                        
                        await this.stop();
                        return;
                    }
                } catch (e) {
                    console.error(e);
                }
            }, 5 * 1000);

            await this.updateExecutionHistory({
                status: 'running',
                startedAt: new Date()
            });

            startTime = performanceNow();

            this.running = true;
            console.log('Starting run');
            await this.pushLogs('clear');

            if (this.shouldContinue()) {
                await this.downloadCode();
                //download files from env variables
                try {
                    await this.downloadFilesFromEnvVariables();
                } catch (error) {
                    console.error('Error downloading files from env variables:', error);
                }
            }

            if (this.shouldContinue()) {
                await this.pushLogs('Checking dependencies...');
                await this.installDependencies();
                await new Promise((resolve) => setTimeout(resolve, 800));
            }

            if (this.shouldContinue()) {
                await this.pushLogs('clear');
                await this.pushLogs('Running latest changes...');
                const exitCode = await this.runCode();

                endTime = performanceNow();
    
                if (exitCode === 0 || exitCode === 2) {
                    await this.updateExecutionHistory({
                        status: 'completed',
                        endedAt: new Date(),
                        durationInMs: (endTime - startTime).toFixed(3),
                    });
                    
                    //upload artifacts to blob storage
                    try {
                        await this.uploadArtifactsToBlobStorage();
                    } catch (error) {
                        console.error('Error uploading artifacts to blob storage:', error);
                    }

                    // Store automation components in vector search after successful execution
                    try {
                        const isVectorSearchToolInvoked = process.env.ENABLE_VECTOR_SEARCH === 'true' || false;
                        if (isVectorSearchToolInvoked) {
                            await this.storeAutomationComponents();
                        }
                    } catch (error) {
                        console.error('Error storing automation components:', error);
                    }
                    
                } else {
                    await this.updateExecutionHistory({
                        status: 'errored',
                        endedAt: new Date(),
                        error: `Run failed with exit code ${exitCode}`,
                        durationInMs: (endTime - startTime).toFixed(3)
                    });
                }
            }
        } catch (error) {
            endTime = performanceNow();

            try {
                await this.updateExecutionHistory({
                    status: 'errored',
                    endedAt: new Date(),
                    error: error,
                    durationInMs: (endTime - startTime).toFixed(3)
                });
            } catch (error) {
                console.error(error);
            }

            this.running = false;
            console.error(error);
            this.pushLogs(`Run complete with exit code 500`);
        } finally {
            this.running = false;
            clearInterval(this.cancelCheckInterval);
        }
    }

    private __ack: () => void;
    private __queuePayload: any;
    async run(_ack: () => void, _queuePayload: any) {
        this.__queuePayload = _queuePayload;
        this.__ack = _ack;
        return this.__run();
    }

    async storeAutomationComponents() {
        try {
            // Read the executed script
            const scriptPath = path.join(this.runDirectory, 'code.js');
            if (!fs.existsSync(scriptPath)) {
                console.log('No script file found to analyze');
                return;
            }

            const script = fs.readFileSync(scriptPath, 'utf8');
            
            // Call the vector search service to store components
            const vectorStoreResponse = await fetch(`${process.env.AUTOMATIONAI_ENDPOINT}/api/vector-search/store-components`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Script-Runner': 'true',
                    'User-Agent': 'TurboticAI-ScriptRunner/1.0'
                },
                body: JSON.stringify({
                    automationId: this.automationId,
                    script: script,
                    workspaceId: this.executionHistory?.workspaceId || ''
                })
            });
        } catch (error) {
            console.error('Error in storeAutomationComponents:', error);
        }
    }

    executionFiles: string[] = ['code.js'];
    async uploadArtifactsToBlobStorage() {
        try {
            for(const envVar of this.envVariables) {
                // Handle single file (object)
                if (envVar.valueFile && typeof envVar.valueFile === 'object' && !Array.isArray(envVar.valueFile)) {
                    if(envVar.extractedFiles && envVar.extractedFiles.length > 0 && envVar.valueFile.fileName.toLowerCase().endsWith('.zip')) {
                        this.executionFiles.push(...envVar.extractedFiles);
                    }
                    else if (envVar.valueFile.url && envVar.valueFile.fileName) {
                        this.executionFiles.push(envVar.valueFile.fileName);
                    }
                }
                // Handle multiple files (array)
                else if (envVar.valueFile && Array.isArray(envVar.valueFile)) {
                    for (const file of envVar.valueFile) {
                        if (file.url && file.fileName) {
                            this.executionFiles.push(file.fileName);
                        }
                    }
                }
            }
            const currentFiles = fs.readdirSync(this.runDirectory);
            let outputFiles = currentFiles.filter((file) => !this.executionFiles.includes(file));

            if (outputFiles.length === 0) {
                console.log('No artifacts found to upload');
                return;
            }
            console.log(`Found ${outputFiles.length} artifacts to upload`);
            
            // Create a zip of all PDFs if there are 3 or more PDFs (convenience feature)
            const pdfFiles = outputFiles.filter(f => f.toLowerCase().endsWith('.pdf'));
            if (pdfFiles.length >= 3) {
                try {
                    const zip = new AdmZip();
                    for (const pdfFile of pdfFiles) {
                        const pdfPath = path.join(this.runDirectory, pdfFile);
                        zip.addLocalFile(pdfPath, '', pdfFile);
                    }
                    const zipFileName = 'all_pdfs.zip';
                    const zipPath = path.join(this.runDirectory, zipFileName);
                    zip.writeZip(zipPath);
                    console.log(`Created zip file with ${pdfFiles.length} PDFs: ${zipFileName}`);
                    // Add zip to output files if not already there
                    if (!outputFiles.includes(zipFileName)) {
                        outputFiles.push(zipFileName);
                    }
                } catch (zipError) {
                    console.error('Error creating PDF zip file:', zipError);
                }
            }
            
            // Limit to first 50 files (increased from 10 to handle more artifacts)
            const MAX_ARTIFACTS = 50;
            if (outputFiles.length > MAX_ARTIFACTS) {
                outputFiles = outputFiles.slice(0, MAX_ARTIFACTS);
                console.log(`Processing first ${MAX_ARTIFACTS} files due to length limit`);
            }

            // Prepare artifacts data for API
            const artifacts = [];
            for (const fileName of outputFiles) {
                try {
                    const filePath = path.join(this.runDirectory, fileName);
                    const stats = fs.statSync(filePath);
                    
                    // Skip directories
                    if (stats.isDirectory()) {
                        continue;
                    }

                    const fileContent = fs.readFileSync(filePath);
                    const contentBase64 = fileContent.toString('base64');
                    const mimeType = this.getMimeTypeFromFileName(fileName);

                    artifacts.push({
                        fileName,
                        contentBase64,
                        size: stats.size,
                        mimeType
                    });

                } catch (error) {
                    console.error(`Error preparing artifact ${fileName}:`, error);
                }
            }

            if (artifacts.length === 0) {
                console.log('No valid artifacts to upload');
                return;
            }

            // Call the API endpoint to upload artifacts
            const apiUrl = process.env.AUTOMATIONAI_ENDPOINT + '/api/upload-artifacts';
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Script-Runner': 'true',
                    'User-Agent': 'TurboticAI-ScriptRunner/1.0'
                },
                body: JSON.stringify({ 
                    artifacts,
                    automationId: this.automationId ,
                    userId: this.executionHistory.userId
                })
            });

            if (!response.ok) {
                throw new Error(`API call failed: ${response.statusText}`);
            }

            const result = await response.json();
            
            if (result.error) {
                throw new Error(result.error);
            }

            console.log(`Artifacts uploaded successfully: ${result.totalFiles} files`);
            
            // Process uploaded files and update execution history
            for (const uploadedFile of result.uploadedFiles) {
                try {
                    // Update execution history with file ID
                    const updatePayload = {
                        outputFiles: this.executionHistory.outputFiles || []
                    };
                    
                    if (!updatePayload.outputFiles.some((f: any) => f.fileId === uploadedFile.fileId)) {
                        updatePayload.outputFiles.push({
                            fileId: uploadedFile.fileId,
                            fileName: uploadedFile.fileName
                        });
                    }

                    await this.updateExecutionHistory(updatePayload);
                    console.log(`Execution history updated with file ID: ${uploadedFile.fileId}`);

                    // Remove local file after successful upload
                    const filePath = path.join(this.runDirectory, uploadedFile.fileName);
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                        console.log(`Local artifact removed: ${uploadedFile.fileName}`);
                    }

                } catch (error) {
                    console.error(`Error processing uploaded file ${uploadedFile.fileName}:`, error);
                }
            }

            console.log('Artifact upload process completed');

        } catch (error) {
            console.error('Error in uploadArtifactsToBlobStorage:', error);
        }
    }

    getMimeTypeFromFileName(fileName: string): string {
        const extension = path.extname(fileName).toLowerCase();
        
        const mimeTypes: { [key: string]: string } = {
            '.txt': 'text/plain',
            '.json': 'application/json',
            '.xml': 'application/xml',
            '.csv': 'text/csv',
            '.pdf': 'application/pdf',
            '.zip': 'application/zip',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.xls': 'application/vnd.ms-excel',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.doc': 'application/msword',
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.log': 'text/plain',
            '.md': 'text/markdown'
        };
        
        return mimeTypes[extension] || 'application/octet-stream';
    }
}