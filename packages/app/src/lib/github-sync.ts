import { Octokit } from '@octokit/rest';

/**
 * GitHub Sync Service
 * Syncs automation code versions to user's connected GitHub repository
 */

export interface GitHubSyncConfig {
  accessToken: string;
  owner: string;
  repo: string;
  branch?: string;
}

export interface CodeFile {
  id: string;
  name: string;
  code: string;
  status?: 'added' | 'modified' | 'deleted' | 'unchanged'; // GitHub-like change tracking
  order?: number; // Preserve workflow order (0-based index)
}

export interface SyncVersionOptions {
  automationId: string;
  automationName: string;
  version: string;
  code?: string;             // Single file mode
  files?: CodeFile[];        // Multi-file mode
  message: string;
  dependencies?: any[];
  environmentVariables?: string[]; // Names only, no values
}

export class GitHubSyncService {
  private octokit: Octokit;
  private owner: string;
  private repo: string;
  private branch: string;

  constructor(config: GitHubSyncConfig) {
    this.octokit = new Octokit({
      auth: config.accessToken,
    });
    this.owner = config.owner;
    this.repo = config.repo;
    this.branch = config.branch || 'main';
  }

  /**
   * Sync a code version to GitHub
   * Supports both single file mode (code) and multi-file mode (files)
   */
  async syncVersion(options: SyncVersionOptions): Promise<{ success: boolean; sha?: string; error?: string }> {
    try {
      const isMultiFileMode = !!(options.files && options.files.length > 0);

      // Create a folder structure: automations/{automationId}/
      const folderPath = `automations/${options.automationId}`;
      const metadataFilePath = `${folderPath}/metadata.json`;

      // Get the current ref to ensure we're working with the latest
      const ref = await this.octokit.git.getRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${this.branch}`,
      });

      const latestCommitSha = ref.data.object.sha;

      // Get the tree for the latest commit
      const latestCommit = await this.octokit.git.getCommit({
        owner: this.owner,
        repo: this.repo,
        commit_sha: latestCommitSha,
      });

      const baseTreeSha = latestCommit.data.tree.sha;

      // Create tree entries array
      const treeEntries: any[] = [];

      // Create blobs for code files
      if (isMultiFileMode && options.files) {
        // Multi-file mode: create a blob for each non-deleted file
        const deletedFiles: string[] = [];
        const addedFiles: string[] = [];
        const modifiedFiles: string[] = [];

        for (const file of options.files) {
          const fileName = file.name.endsWith('.js') ? file.name : `${file.name}.js`;
          const filePath = `${folderPath}/${fileName}`;

          // Check if file is marked as deleted
          if (file.status === 'deleted') {
            deletedFiles.push(fileName);
            // Mark file for deletion in GitHub by setting sha to null
            treeEntries.push({
              path: filePath,
              mode: '100644',
              type: 'blob',
              sha: null, // null sha = delete the file
            });
          } else {
            if (file.status === 'added') addedFiles.push(fileName);
            if (file.status === 'modified') modifiedFiles.push(fileName);
            // Create blob for active files
            const fileBlob = await this.octokit.git.createBlob({
              owner: this.owner,
              repo: this.repo,
              content: Buffer.from(file.code).toString('base64'),
              encoding: 'base64',
            });

            treeEntries.push({
              path: filePath,
              mode: '100644',
              type: 'blob',
              sha: fileBlob.data.sha,
            });
          }
        }

        console.log('[GitHub Sync] File changes:', {
          added: addedFiles,
          modified: modifiedFiles,
          deleted: deletedFiles,
          total: options.files.length
        });
      } else {
        // Single file mode: create single code.js file
        const codeBlob = await this.octokit.git.createBlob({
          owner: this.owner,
          repo: this.repo,
          content: Buffer.from(options.code || '').toString('base64'),
          encoding: 'base64',
        });

        const codeFilePath = `${folderPath}/code.js`;
        treeEntries.push({
          path: codeFilePath,
          mode: '100644',
          type: 'blob',
          sha: codeBlob.data.sha,
        });
      }

      // Create metadata
      const metadata = {
        automationId: options.automationId,
        automationName: options.automationName,
        version: options.version,
        mode: isMultiFileMode ? 'multi-file' : 'single-file',
        dependencies: options.dependencies || [],
        environmentVariables: options.environmentVariables || [],
        syncedAt: new Date().toISOString(),
      };

      const metadataBlob = await this.octokit.git.createBlob({
        owner: this.owner,
        repo: this.repo,
        content: Buffer.from(JSON.stringify(metadata, null, 2)).toString('base64'),
        encoding: 'base64',
      });

      treeEntries.push({
        path: metadataFilePath,
        mode: '100644',
        type: 'blob',
        sha: metadataBlob.data.sha,
      });

      // Create a new tree with the updated files
      const newTree = await this.octokit.git.createTree({
        owner: this.owner,
        repo: this.repo,
        base_tree: baseTreeSha,
        tree: treeEntries,
      });

      // Create a new commit
      const commitMessage = `${options.message}\n\nAutomation: ${options.automationName} (${options.automationId})\nVersion: ${options.version}\nSynced from AutomationAI`;

      const newCommit = await this.octokit.git.createCommit({
        owner: this.owner,
        repo: this.repo,
        message: commitMessage,
        tree: newTree.data.sha,
        parents: [latestCommitSha],
      });

      // Update the ref to point to the new commit
      await this.octokit.git.updateRef({
        owner: this.owner,
        repo: this.repo,
        ref: `heads/${this.branch}`,
        sha: newCommit.data.sha,
      });

      return {
        success: true,
        sha: newCommit.data.sha,
      };
    } catch (error: any) {
      console.error('GitHub sync error:', error);
      return {
        success: false,
        error: error.message || 'Failed to sync to GitHub',
      };
    }
  }

  /**
   * Test the connection by fetching repository info
   */
  async testConnection(): Promise<{ success: boolean; repo?: any; error?: string }> {
    try {
      const { data: repo } = await this.octokit.repos.get({
        owner: this.owner,
        repo: this.repo,
      });

      return {
        success: true,
        repo: {
          name: repo.name,
          fullName: repo.full_name,
          private: repo.private,
          defaultBranch: repo.default_branch,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to connect to GitHub repository',
      };
    }
  }

  /**
   * List user's repositories
   */
  static async listUserRepos(accessToken: string): Promise<{ success: boolean; repos?: any[]; error?: string }> {
    try {
      const octokit = new Octokit({ auth: accessToken });
      const { data: repos } = await octokit.repos.listForAuthenticatedUser({
        sort: 'updated',
        per_page: 100,
      });

      return {
        success: true,
        repos: repos.map(repo => ({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          owner: repo.owner.login,
          private: repo.private,
          defaultBranch: repo.default_branch,
          updatedAt: repo.updated_at,
        })),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to list repositories',
      };
    }
  }

  /**
   * Get authenticated user info
   */
  static async getUserInfo(accessToken: string): Promise<{ success: boolean; user?: any; error?: string }> {
    try {
      const octokit = new Octokit({ auth: accessToken });
      const { data: user } = await octokit.users.getAuthenticated();

      return {
        success: true,
        user: {
          login: user.login,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatar_url,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message || 'Failed to get user info',
      };
    }
  }
}
