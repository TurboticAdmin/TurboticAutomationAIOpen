import { getDb } from '@/lib/db';
import { ObjectId } from 'mongodb';
import crypto from 'crypto';

export interface CodeFile {
  id: string;
  name: string;
  code: string;
  status?: 'added' | 'modified' | 'deleted' | 'unchanged'; // GitHub-like change tracking
  order?: number; // Preserve workflow order (0-based index)
}

// Helper to generate AI summary for code changes
async function generateAISummary(
  oldCode: string | undefined,
  newCode: string | undefined,
  oldFiles: CodeFile[] | undefined,
  newFiles: CodeFile[] | undefined
): Promise<string> {
  try {
    // Import Azure OpenAI for server-side AI generation
    const { AzureChatOpenAI } = await import('@langchain/openai');
    const { SystemMessage } = await import('@langchain/core/messages');

    // Simple diff generator (extracted from API route)
    function generateDiff(oldCode: string, newCode: string): string {
      const oldLines = oldCode.split('\n');
      const newLines = newCode.split('\n');
      
      let diff = '';
      let i = 0, j = 0;
      
      while (i < oldLines.length || j < newLines.length) {
        if (i >= oldLines.length) {
          diff += `+ ${newLines[j]}\n`;
          j++;
        } else if (j >= newLines.length) {
          diff += `- ${oldLines[i]}\n`;
          i++;
        } else if (oldLines[i] === newLines[j]) {
          diff += `  ${oldLines[i]}\n`;
          i++;
          j++;
        } else {
          let found = false;
          for (let k = j + 1; k < Math.min(j + 10, newLines.length); k++) {
            if (oldLines[i] === newLines[k]) {
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
            diff += `- ${oldLines[i]}\n`;
            diff += `+ ${newLines[j]}\n`;
            i++;
            j++;
          }
        }
      }
      
      return diff.trim();
    }

    // Multi-file diff generator
    function generateMultiFileDiff(oldFiles: CodeFile[], newFiles: CodeFile[]): string {
      const oldFileMap = new Map(oldFiles.map(f => [f.id, f]));
      const newFileMap = new Map(newFiles.map(f => [f.id, f]));
      
      const changes: string[] = [];
      const allFileIds = new Set([...oldFileMap.keys(), ...newFileMap.keys()]);
      
      for (const fileId of allFileIds) {
        const oldFile = oldFileMap.get(fileId);
        const newFile = newFileMap.get(fileId);
        
        if (!oldFile && newFile) {
          changes.push(`\n=== Added File: ${newFile.name} ===`);
          const diff = generateDiff('', newFile.code);
          if (diff) {
            changes.push(diff);
          } else {
            changes.push('+ (new file created)');
          }
        } else if (oldFile && !newFile) {
          changes.push(`\n=== Deleted File: ${oldFile.name} ===`);
          const diff = generateDiff(oldFile.code, '');
          if (diff) {
            changes.push(diff);
          }
        } else if (oldFile && newFile && oldFile.code !== newFile.code) {
          changes.push(`\n=== Modified File: ${newFile.name} ===`);
          const diff = generateDiff(oldFile.code, newFile.code);
          if (diff) {
            changes.push(diff);
          }
        }
      }
      
      return changes.join('\n');
    }

    let diff = '';
    let promptContext = '';

    // Handle multi-file mode
    if (oldFiles && newFiles && oldFiles.length >= 0 && newFiles.length >= 0) {
      const multiFileDiff = generateMultiFileDiff(oldFiles, newFiles);
      if (!multiFileDiff || multiFileDiff.trim() === '') {
        return 'No changes detected';
      }
      diff = multiFileDiff;
      promptContext = 'This is a multi-file codebase change. Analyze all file changes and generate a concise summary.';
    } else if (oldCode !== undefined && newCode !== undefined) {
      diff = generateDiff(oldCode, newCode);
      if (!diff || diff.trim() === '') {
        return 'No changes detected';
      }
      promptContext = 'This is a single file code change.';
    } else {
      return 'Code updated';
    }

    // Get model configuration
    const modelConfig = {
      azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
      azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
      azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
      azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
      temperature: 0.1,
    };

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

    const response = await model.invoke([new SystemMessage({ content: prompt })]);

    const summary = (response.content as string)
      .replace(/^["']|["']$/g, '')
      .replace(/^Summary:\s*/i, '')
      .replace(/^The code\s*/i, '')
      .replace(/^These changes\s*/i, '')
      .trim();

    if (!summary || summary.toLowerCase().includes('no changes detected')) {
      return 'Code updated';
    }

    return summary;
  } catch (error) {
    console.error('[Version Control] Error generating AI summary:', error);
    return 'Code updated';
  }
}

/**
 * MongoDB Version Control Service
 * Provides simple, efficient version control using MongoDB as the storage backend
 * No external dependencies, no GitHub API limits, perfect for multi-tenant SaaS
 */

export interface CodeVersion {
  _id?: ObjectId;
  automationId: string;
  userId: string;
  version: number;          // Sequential: 1, 2, 3...
  userVersion: string;      // Display: "v1", "v2", "v3"
  code?: string;            // Legacy single file mode
  files?: CodeFile[];       // Multi-file mode (v3 steps) - COMPLETE file snapshot
  codeHash: string;         // SHA-256 for deduplication
  message: string;
  timestamp: Date;
  metadata: {
    automationId: string;
    dependencies?: any[];
    environmentVariables?: string[]; // Names only, no sensitive values
    aiModel?: string;
    totalFiles?: number;    // Total number of files in this version
    changedFiles?: number;  // Number of files that were changed (added/modified/deleted)
  };
}

export interface VersionStats {
  totalVersions: number;
  firstVersion: Date | null;
  lastVersion: Date | null;
  changeFrequency: string;
}

export class MongoDBVersionControl {
  private collectionName = 'code_versions';

  /**
   * Generate SHA-256 hash of code for deduplication
   * Supports both single file and multi-file mode
   */
  private generateCodeHash(code?: string, files?: CodeFile[]): string {
    let content: string;

    if (files && files.length > 0) {
      // Multi-file mode: concatenate all file codes sorted by id for consistency
      content = files
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(f => `${f.id}:${f.name}:${f.code}`)
        .join('|||');
    } else {
      // Single file mode
      content = code || '';
    }

    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Get the next version number for an automation
   */
  private async getNextVersion(automationId: string): Promise<number> {
    const db = getDb();
    const collection = db.collection(this.collectionName);

    const latestVersion = await collection
      .find({ automationId })
      .sort({ version: -1 })
      .limit(1)
      .toArray();

    return latestVersion.length > 0 ? latestVersion[0].version + 1 : 1;
  }

  /**
   * Commit a new code version (GitHub-like storage)
   * - Stores COMPLETE file snapshot (all files, not just changes)
   * - Marks each file with status: added/modified/deleted/unchanged
   * - Tracks totalFiles and changedFiles in metadata
   * - Automatically deduplicates if code hasn't changed from the latest version
   * - For rollbacks, always creates a new version even if code matches an older version
   * - Supports both single file mode (code) and multi-file mode (files)
   */
  async commitVersion(
    automationId: string,
    userId: string,
    code?: string,
    dependencies: any[] = [],
    environmentVariables: any[] = [],
    changeDescription?: string,
    files?: CodeFile[]
  ): Promise<CodeVersion> {
    const db = getDb();
    const collection = db.collection(this.collectionName);

    // Validate that either code or files is provided
    const isMultiFileMode = !!(files && files.length > 0);
    if (!isMultiFileMode && !code) {
      throw new Error('Either code or files must be provided');
    }

    // Get latest version for comparison
    const latestVersion = await collection
      .find({ automationId })
      .sort({ version: -1 })
      .limit(1)
      .toArray();

    let completeFiles: CodeFile[] | undefined;
    let changedFilesCount = 0;

    // For multi-file mode: Create complete file snapshot with change tracking
    if (isMultiFileMode && files) {
      const previousFiles = latestVersion.length > 0 ? latestVersion[0].files : [];
      const previousFileMap = new Map<string, CodeFile>(
        (previousFiles || []).map((f: CodeFile) => [f.id, f])
      );
      const currentFileMap = new Map(files.map(f => [f.id, f]));

      completeFiles = [];

      // Process all current files (add status tracking)
      for (const file of files) {
        const previousFile = previousFileMap.get(file.id);
        let status: CodeFile['status'] = 'unchanged';

        if (!previousFile || previousFile.status === 'deleted') {
          // New file (or previously deleted file being re-added)
          status = 'added';
          changedFilesCount++;
        } else if (previousFile.code !== file.code || previousFile.name !== file.name) {
          // Modified file (compare actual content, not status)
          status = 'modified';
          changedFilesCount++;
        }

        completeFiles.push({
          id: file.id,
          name: file.name,
          code: file.code,
          status,
          order: (file as any).order ?? previousFile?.order, // Preserve order from input or previous version
        });
      }

      // Add deleted files (files that existed in previous but not in current)
      if (previousFiles) {
        for (const prevFile of previousFiles) {
          // Skip if it was already marked as deleted in previous version
          if (!currentFileMap.has(prevFile.id) && prevFile.status !== 'deleted') {
            // File was deleted
            completeFiles.push({
              id: prevFile.id,
              name: prevFile.name,
              code: '', // Empty code for deleted files
              status: 'deleted',
              order: prevFile.order, // Preserve order from previous version
            });
            changedFilesCount++;
          }
        }
      }
    }

    // Debug logging
    const addedFiles = completeFiles?.filter(f => f.status === 'added') || [];
    const modifiedFiles = completeFiles?.filter(f => f.status === 'modified') || [];
    const deletedFiles = completeFiles?.filter(f => f.status === 'deleted') || [];
    
    console.log('[Version Control] Commit summary:', {
      filesCount: completeFiles?.length || 0,
      changedFilesCount,
      addedFiles: addedFiles.length,
      modifiedFiles: modifiedFiles.length,
      deletedFiles: deletedFiles.length,
      fileStatuses: completeFiles?.map(f => ({ name: f.name, status: f.status })),
      changeDescription,
      isMultiFileMode,
      dependenciesReceived: dependencies?.length || 0
    });

    // Generate code hash for deduplication using complete file set
    const codeHash = this.generateCodeHash(code, completeFiles);

    // Check if this exact code exists in the LATEST version only
    // This allows rollbacks to create new versions even if code matches older versions
    if (latestVersion.length > 0 && latestVersion[0].codeHash === codeHash) {
      // Code is identical to the latest version, no need to create a new one
      return latestVersion[0] as CodeVersion;
    }

    // Get next version number
    const versionNumber = await this.getNextVersion(automationId);
    const userVersion = `v${versionNumber}`;

    // Strip sensitive values from environment variables (keep only names)
    const sanitizedEnvVars = (environmentVariables || []).map(env => env?.name || 'unknown');

    // Normalize dependencies to objects format: { name, version, id? }
    // Handle both string format ["package-name"] and object format [{ name, version }]
    const normalizedDeps = (dependencies || []).map((dep: any, index: number) => {
      if (typeof dep === 'string') {
        // Convert string to object format
        return {
          id: `dep-${index}-${Date.now()}`,
          name: dep,
          version: 'latest' // Default version for string-only deps
        };
      } else if (dep && typeof dep === 'object') {
        // Preserve object format, ensure it has required fields
        return {
          id: dep.id || `dep-${index}-${Date.now()}`,
          name: dep.name || dep,
          version: dep.version || 'latest'
        };
      }
      return { id: `dep-${index}`, name: 'unknown', version: 'latest' };
    });

    // Generate AI-based commit message when generic or missing
    let finalMessage = changeDescription || 'Code updated';
    
    // Check if we need to generate an AI summary
    const isGenericMessage = !changeDescription || 
                             changeDescription.toLowerCase().includes('no changes detected') ||
                             changeDescription === 'Updated workflow steps' ||
                             changeDescription === 'Code updated';
    
    if (isGenericMessage && changedFilesCount > 0) {
      try {
        if (isMultiFileMode) {
          // Multi-file mode: generate AI summary from file diffs
          const previousFiles = latestVersion.length > 0 ? latestVersion[0].files || [] : [];
          // Filter out deleted files from previous version for comparison
          const oldFilesForAI = previousFiles.filter((f: CodeFile) => f.status !== 'deleted');
          const newFilesForAI = completeFiles?.filter(f => f.status !== 'deleted') || [];
          
          if (oldFilesForAI.length > 0 || newFilesForAI.length > 0) {
            const aiSummary = await generateAISummary(undefined, undefined, oldFilesForAI, newFilesForAI);
            if (aiSummary && aiSummary !== 'No changes detected') {
              finalMessage = aiSummary;
            }
          }
        } else {
          // Single file mode: generate AI summary from code diff
          const oldCodeForAI = latestVersion.length > 0 ? latestVersion[0].code || '' : '';
          const newCodeForAI = code || '';
          
          if (oldCodeForAI || newCodeForAI) {
            const aiSummary = await generateAISummary(oldCodeForAI, newCodeForAI, undefined, undefined);
            if (aiSummary && aiSummary !== 'No changes detected') {
              finalMessage = aiSummary;
            }
          }
        }
      } catch (error) {
        console.error('[Version Control] Failed to generate AI summary, using fallback:', error);
        // Fallback to default message if AI generation fails
        finalMessage = changeDescription || 'Code updated';
      }
    }

    // Create new version document with complete file snapshot
    const newVersion: Omit<CodeVersion, '_id'> = {
      automationId,
      userId,
      version: versionNumber,
      userVersion,
      ...(isMultiFileMode ? { files: completeFiles } : { code }),
      codeHash,
      message: finalMessage,
      timestamp: new Date(),
      metadata: {
        automationId,
        dependencies: normalizedDeps, // Use normalized dependency objects
        environmentVariables: sanitizedEnvVars,
        ...(isMultiFileMode ? {
          totalFiles: completeFiles?.filter(f => f.status !== 'deleted').length || 0,
          changedFiles: changedFilesCount,
        } : {
          totalFiles: 1,
          changedFiles: latestVersion.length > 0 && latestVersion[0].code !== code ? 1 : 0,
        }),
      },
    };

    const result = await collection.insertOne(newVersion);

    return {
      ...newVersion,
      _id: result.insertedId,
    } as CodeVersion;
  }

  /**
   * Get version history for an automation
   */
  async getVersionHistory(
    automationId: string,
    limit: number = 50
  ): Promise<CodeVersion[]> {
    const db = getDb();
    const collection = db.collection(this.collectionName);

    const versions = await collection
      .find({ automationId })
      .sort({ version: -1 })
      .limit(limit)
      .toArray();

    return versions.map(v => ({
      _id: v._id,
      automationId: v.automationId,
      userId: v.userId,
      version: v.version,
      userVersion: v.userVersion,
      ...(v.code ? { code: v.code } : {}),
      ...(v.files ? { files: v.files } : {}),
      codeHash: v.codeHash,
      message: v.message,
      timestamp: v.timestamp,
      metadata: v.metadata,
    })) as CodeVersion[];
  }

  /**
   * Get a specific version by version string (e.g., "v1", "v2")
   */
  async getVersion(
    automationId: string,
    userVersion: string
  ): Promise<CodeVersion | null> {
    const db = getDb();
    const collection = db.collection(this.collectionName);

    const version = await collection.findOne({
      automationId,
      userVersion,
    });

    if (!version) {
      return null;
    }

    return {
      _id: version._id,
      automationId: version.automationId,
      userId: version.userId,
      version: version.version,
      userVersion: version.userVersion,
      ...(version.code ? { code: version.code } : {}),
      ...(version.files ? { files: version.files } : {}),
      codeHash: version.codeHash,
      message: version.message,
      timestamp: version.timestamp,
      metadata: version.metadata,
    } as CodeVersion;
  }

  /**
   * Get the latest version for an automation
   */
  async getLatestVersion(automationId: string): Promise<CodeVersion | null> {
    const db = getDb();
    const collection = db.collection(this.collectionName);

    const version = await collection
      .find({ automationId })
      .sort({ version: -1 })
      .limit(1)
      .toArray();

    if (version.length === 0) {
      return null;
    }

    const v = version[0];
    return {
      _id: v._id,
      automationId: v.automationId,
      userId: v.userId,
      version: v.version,
      userVersion: v.userVersion,
      ...(v.code ? { code: v.code } : {}),
      ...(v.files ? { files: v.files } : {}),
      codeHash: v.codeHash,
      message: v.message,
      timestamp: v.timestamp,
      metadata: v.metadata,
    } as CodeVersion;
  }

  /**
   * Get version statistics for an automation
   */
  async getVersionStats(automationId: string): Promise<VersionStats> {
    const db = getDb();
    const collection = db.collection(this.collectionName);

    const versions = await collection
      .find({ automationId })
      .sort({ version: 1 })
      .toArray();

    if (versions.length === 0) {
      return {
        totalVersions: 0,
        firstVersion: null,
        lastVersion: null,
        changeFrequency: 'No versions yet',
      };
    }

    const firstVersion = versions[0].timestamp;
    const lastVersion = versions[versions.length - 1].timestamp;

    // Calculate change frequency
    let changeFrequency = 'Multiple versions';
    if (versions.length > 1) {
      const daysSinceFirst = Math.max(
        1,
        Math.floor((lastVersion.getTime() - firstVersion.getTime()) / (1000 * 60 * 60 * 24))
      );
      const versionsPerDay = versions.length / daysSinceFirst;

      if (versionsPerDay >= 10) {
        changeFrequency = 'Very active (10+ changes/day)';
      } else if (versionsPerDay >= 5) {
        changeFrequency = 'Active (5+ change/day)';
      } else if (daysSinceFirst <= 2) {
        changeFrequency = 'Recent changes';
      } else {
        changeFrequency = `${versions.length} versions over ${daysSinceFirst} days`;
      }
    } else {
      changeFrequency = 'Single version';
    }

    return {
      totalVersions: versions.length,
      firstVersion,
      lastVersion,
      changeFrequency,
    };
  }

  /**
   * Delete all versions for an automation (cleanup)
   */
  async deleteAutomationVersions(automationId: string): Promise<void> {
    const db = getDb();
    const collection = db.collection(this.collectionName);

    await collection.deleteMany({ automationId });
  }

  /**
   * Create indexes for optimal performance
   * Should be called once during app initialization
   */
  async createIndexes(): Promise<void> {
    const db = getDb();
    const collection = db.collection(this.collectionName);

    // Index for fast version listing
    await collection.createIndex({ automationId: 1, version: -1 });

    // Index for deduplication checks
    await collection.createIndex({ automationId: 1, codeHash: 1 });

    // Index for user queries
    await collection.createIndex({ userId: 1, timestamp: -1 });
  }
}

// Export singleton instance
export const versionControl = new MongoDBVersionControl();
