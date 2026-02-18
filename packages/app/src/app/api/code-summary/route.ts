import { NextRequest, NextResponse } from 'next/server';
import { AzureChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import authenticationBackend from '../authentication/authentication-backend';

// Simple diff generator for code changes
function generateDiff(oldCode: string, newCode: string): string {
    const oldLines = oldCode.split('\n');
    const newLines = newCode.split('\n');
    
    let diff = '';
    let i = 0, j = 0;
    
    while (i < oldLines.length || j < newLines.length) {
        if (i >= oldLines.length) {
            // Only new lines remain
            diff += `+ ${newLines[j]}\n`;
            j++;
        } else if (j >= newLines.length) {
            // Only old lines remain
            diff += `- ${oldLines[i]}\n`;
            i++;
        } else if (oldLines[i] === newLines[j]) {
            // Lines are identical
            diff += `  ${oldLines[i]}\n`;
            i++;
            j++;
        } else {
            // Lines are different - find the best match
            let found = false;
            for (let k = j + 1; k < Math.min(j + 10, newLines.length); k++) {
                if (oldLines[i] === newLines[k]) {
                    // Found match - add new lines
                    for (let l = j; l < k; l++) {
                        diff += `+ ${newLines[l]}\n`;
                    }
                    diff += `  ${oldLines[i]}\n`;
                    i++;
                    j = k + 1;
                    found = true;
                    break;
                }
            }
            
            if (!found) {
                // No match found - treat as deletion and addition
                diff += `- ${oldLines[i]}\n`;
                diff += `+ ${newLines[j]}\n`;
                i++;
                j++;
            }
        }
    }
    
    return diff.trim();
}

async function getModelConfig() {
  return {
    azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
    azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
    azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
    temperature: 0.1, // Low temperature for consistent, concise summaries
  };
}

// Helper function to generate diff for multiple files
function generateMultiFileDiff(oldFiles: Array<{id: string, name: string, code: string}>, newFiles: Array<{id: string, name: string, code: string}>) {
    const oldFileMap = new Map(oldFiles.map(f => [f.id, f]));
    const newFileMap = new Map(newFiles.map(f => [f.id, f]));
    
    const changes: string[] = [];
    
    // Track all file IDs (from both old and new)
    const allFileIds = new Set([...oldFileMap.keys(), ...newFileMap.keys()]);
    
    for (const fileId of allFileIds) {
        const oldFile = oldFileMap.get(fileId);
        const newFile = newFileMap.get(fileId);
        
        if (!oldFile && newFile) {
            // File was added
            changes.push(`\n=== Added File: ${newFile.name} ===`);
            const diff = generateDiff('', newFile.code);
            if (diff) {
                changes.push(diff);
            } else {
                changes.push('+ (new file created)');
            }
        } else if (oldFile && !newFile) {
            // File was deleted
            changes.push(`\n=== Deleted File: ${oldFile.name} ===`);
            const diff = generateDiff(oldFile.code, '');
            if (diff) {
                changes.push(diff);
            }
        } else if (oldFile && newFile && oldFile.code !== newFile.code) {
            // File was modified
            changes.push(`\n=== Modified File: ${newFile.name} ===`);
            const diff = generateDiff(oldFile.code, newFile.code);
            if (diff) {
                changes.push(diff);
            }
        }
    }
    
    return changes.join('\n');
}

export async function POST(request: NextRequest) {
    try {
        // Check authentication
        const currentUser = await authenticationBackend.getCurrentUser(request);
        if (!currentUser) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { oldCode, newCode, oldFiles, newFiles } = body;

        // Validate that we have the required fields
        const hasSingleFile = oldCode !== undefined && newCode !== undefined;
        const hasMultiFile = oldFiles !== undefined && newFiles !== undefined;

        if (!hasSingleFile && !hasMultiFile) {
            return NextResponse.json({ 
                error: 'Invalid request: provide either (oldCode, newCode) or (oldFiles, newFiles)',
                received: { 
                    hasOldCode: oldCode !== undefined, 
                    hasNewCode: newCode !== undefined,
                    hasOldFiles: oldFiles !== undefined,
                    hasNewFiles: newFiles !== undefined
                }
            }, { status: 400 });
        }

        let diff = '';
        let promptContext = '';

        // Handle multi-file mode
        if (hasMultiFile) {
            if (!Array.isArray(oldFiles) || !Array.isArray(newFiles)) {
                return NextResponse.json({ 
                    error: 'Invalid request: oldFiles and newFiles must be arrays' 
                }, { status: 400 });
            }
            
            const multiFileDiff = generateMultiFileDiff(oldFiles, newFiles);
            if (!multiFileDiff || multiFileDiff.trim() === '') {
                return NextResponse.json({ summary: 'No changes detected' });
            }
            
            diff = multiFileDiff;
            promptContext = `This is a multi-file codebase change. Analyze all file changes and generate a concise summary.`;
        } else if (hasSingleFile) {
            // Single file mode - handle null/undefined as empty strings
            const oldCodeStr = oldCode ?? '';
            const newCodeStr = newCode ?? '';
            
            diff = generateDiff(oldCodeStr, newCodeStr);
            if (!diff || diff.trim() === '') {
                return NextResponse.json({ summary: 'No changes detected' });
            }
            promptContext = `This is a single file code change.`;
        }

        // Get model configuration
        const modelConfig = await getModelConfig();
        const model = new AzureChatOpenAI(modelConfig);

        const prompt = `${promptContext}

Analyze the code changes below and generate a concise, descriptive summary of what was modified.

Code Changes (diff format):
${diff}

Requirements:
1. Generate a short summary (1-2 sentences) that describes what was changed
2. Focus on the primary modification or addition being made
3. Include the service/API name if applicable (SendGrid, HubSpot, Microsoft, Slack, etc.)
4. Include the main action (Send, Fetch, Create, Update, Delete, Process, Handle, etc.)
5. Include the data type being handled if relevant (email, contacts, users, files, etc.)
6. Use professional, clear language
7. Avoid technical jargon in the summary
8. Focus on what was ADDED or CHANGED, not what the entire code does
9. For multi-file changes, summarize the overall impact across all files

Generate only the summary text, no explanations or additional text.`;

        const response = await model.invoke([
            new SystemMessage({
                content: prompt
            })
        ]);

        const summary = response.content as string;

        // Clean up the response
        const cleanSummary = summary
            .replace(/^["']|["']$/g, '') // Remove quotes
            .replace(/^Summary:\s*/i, '') // Remove "Summary:" prefix
            .replace(/^The code\s*/i, '') // Remove "The code" prefix
            .replace(/^These changes\s*/i, '') // Remove "These changes" prefix
            .trim();

        // Fallback if summary is too generic or empty
        if (!cleanSummary || cleanSummary.toLowerCase().includes('no changes detected')) {
            return NextResponse.json({ summary: 'Code updated' });
        }

        return NextResponse.json({ summary: cleanSummary });

    } catch (error) {
        console.error('Error generating code summary:', error);
        return NextResponse.json(
            { error: 'Failed to generate code summary' },
            { status: 500 }
        );
    }
}
