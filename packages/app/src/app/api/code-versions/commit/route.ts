import { NextRequest, NextResponse } from 'next/server';
import { versionControl } from '@/lib/mongodb-version-control';
import authenticationBackend from '../../authentication/authentication-backend';
import { getDb } from '@/lib/db';
import { ObjectId } from 'mongodb';
import { GitHubSyncService } from '@/lib/github-sync';
import { decrypt } from '@/lib/encryption';

/**
 * POST /api/code-versions/commit
 * Commit a new code version to MongoDB
 */
export async function POST(request: NextRequest) {
  try {
    // Authentication check
    const currentUser = await authenticationBackend.getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { automationId, code, files, dependencies, environmentVariables, changeDescription } = body;

    // Input validation
    if (!automationId || typeof automationId !== 'string') {
      return NextResponse.json(
        { error: 'Valid automationId is required' },
        { status: 400 }
      );
    }

    if (!ObjectId.isValid(automationId)) {
      return NextResponse.json(
        { error: 'Invalid automationId format' },
        { status: 400 }
      );
    }

    // Support both single file (code) and multi-file (files) modes
    const isMultiFileMode = !!files;

    if (!isMultiFileMode) {
      // Legacy single file mode validation
      if (!code || typeof code !== 'string') {
        return NextResponse.json(
          { error: 'Valid code string is required' },
          { status: 400 }
        );
      }
    } else {
      // Multi-file mode validation
      if (!Array.isArray(files) || files.length === 0) {
        return NextResponse.json(
          { error: 'Valid files array is required' },
          { status: 400 }
        );
      }

      // Validate each file has required fields
      for (const file of files) {
        if (!file.id || !file.name || typeof file.code !== 'string') {
          return NextResponse.json(
            { error: 'Each file must have id, name, and code' },
            { status: 400 }
          );
        }
      }
    }

    if (dependencies && !Array.isArray(dependencies)) {
      return NextResponse.json(
        { error: 'Dependencies must be an array' },
        { status: 400 }
      );
    }

    if (environmentVariables && !Array.isArray(environmentVariables)) {
      return NextResponse.json(
        { error: 'Environment variables must be an array' },
        { status: 400 }
      );
    }

    // Authorization check - verify user has access to this automation
    const db = getDb();
    const automation = await db.collection('automations').findOne({
      _id: ObjectId.createFromHexString(automationId),
      workspaceId: String(currentUser?.workspace?._id)
    });

    if (!automation) {
      return NextResponse.json(
        { error: 'Automation not found or access denied' },
        { status: 403 }
      );
    }

    // Check if user has edit permission (owner only)
    const canEdit = automation.workspaceId === String(currentUser?.workspace?._id);

    if (!canEdit) {
      return NextResponse.json(
        { error: 'You do not have permission to edit this automation' },
        { status: 403 }
      );
    }

    const version = await versionControl.commitVersion(
      automationId,
      String(currentUser._id),
      isMultiFileMode ? undefined : code,
      dependencies || [],
      environmentVariables || [],
      changeDescription,
      isMultiFileMode ? files : undefined
    );

    // Optional: Sync to GitHub if this automation has a connected repo
    let githubSyncSuccess = false;
    let githubSyncError = null;

    try {
      // Check if this specific automation has a GitHub repo connected
      if (automation.githubRepo?.isConnected) {
        // Get user's GitHub access token
        const githubIntegration = await db.collection('integrations').findOne({
          userId: currentUser.email,
          app: 'github',
          source: 'github',
          isConnected: true
        });

        if (githubIntegration?.accessToken) {
          // Decrypt access token before using
          const decryptedToken = decrypt(githubIntegration.accessToken);

          const githubService = new GitHubSyncService({
            accessToken: decryptedToken,
            owner: automation.githubRepo.repoOwner,
            repo: automation.githubRepo.repoName,
            branch: automation.githubRepo.branch || 'main'
          });

          const syncResult = await githubService.syncVersion({
            automationId,
            automationName: automation.name || 'Unnamed Automation',
            version: version.userVersion,
            code: isMultiFileMode ? undefined : code,
            files: isMultiFileMode ? version.files : undefined,
            message: changeDescription || 'Code update',
            dependencies: version.metadata?.dependencies || [], // Use normalized dependencies from version
            environmentVariables: version.metadata?.environmentVariables || [] // Use sanitized env var names from version
          });

          if (syncResult.success) {
            githubSyncSuccess = true;
            // Update last sync time on automation
            await db.collection('automations').updateOne(
              { _id: automation._id },
              { $set: { 'githubRepo.lastSync': new Date() } }
            );
          } else {
            githubSyncError = syncResult.error;
            console.error('GitHub sync failed:', syncResult.error);
          }
        } else {
          githubSyncError = 'GitHub account not connected';
        }
      }
    } catch (error: any) {
      console.error('Error during GitHub sync:', error);
      githubSyncError = error.message;
      // Don't fail the whole commit if GitHub sync fails
    }

    return NextResponse.json({
      success: true,
      version: version.userVersion,
      timestamp: version.timestamp,
      githubSync: {
        attempted: !!githubSyncSuccess || !!githubSyncError,
        success: githubSyncSuccess,
        error: githubSyncError
      }
    });
  } catch (error: any) {
    console.error('Error committing code version:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to commit code version' },
      { status: 500 }
    );
  }
}