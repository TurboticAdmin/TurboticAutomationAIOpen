import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ObjectId } from 'mongodb';
import authenticationBackend from '../../../../authentication/authentication-backend';
import { decrypt } from '@/lib/encryption';
import { Octokit } from '@octokit/rest';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authentication check
    const currentUser = await authenticationBackend.getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { repoName, description, isPrivate } = body;

    if (!repoName) {
      return NextResponse.json({ error: 'Repository name is required' }, { status: 400 });
    }

    const db = getDb();
    const { id } = await params;

    // Get automation to verify ownership
    const automation = await db.collection('automations').findOne({
      _id: ObjectId.createFromHexString(id),
      $or: [
        { workspaceId: String(currentUser?.workspace?._id) },
        { 'sharedWith.userId': String(currentUser._id) }
      ]
    });

    if (!automation) {
      return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
    }

    // Check if automation already has a connected repo
    if (automation.githubRepo?.isConnected) {
      return NextResponse.json({
        error: 'Automation already connected to a repository. Disconnect first.'
      }, { status: 400 });
    }

    // Get user's GitHub integration
    const githubIntegration = await db.collection('integrations').findOne({
      userId: currentUser.email,
      app: 'github',
      source: 'github',
      isConnected: true
    });

    if (!githubIntegration?.accessToken) {
      return NextResponse.json({
        error: 'GitHub account not connected. Please connect in Settings > Integrations.'
      }, { status: 400 });
    }

    // Decrypt access token
    const accessToken = decrypt(githubIntegration.accessToken);
    const octokit = new Octokit({ auth: accessToken });

    // Create repository on GitHub
    const repoResponse = await octokit.repos.createForAuthenticatedUser({
      name: repoName,
      description: description || `Automation: ${automation.name}`,
      private: isPrivate !== false, // Default to private
      auto_init: true, // Initialize with README
    });

    const repo = repoResponse.data;

    // Update automation with GitHub repo info
    await db.collection('automations').updateOne(
      { _id: automation._id },
      {
        $set: {
          githubRepo: {
            isConnected: true,
            repoOwner: repo.owner.login,
            repoName: repo.name,
            repoFullName: repo.full_name,
            branch: repo.default_branch || 'main',
            isPrivate: repo.private,
            url: repo.html_url,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        }
      }
    );

    return NextResponse.json({
      success: true,
      repo: {
        owner: repo.owner.login,
        name: repo.name,
        fullName: repo.full_name,
        url: repo.html_url,
        private: repo.private,
        branch: repo.default_branch
      }
    });

  } catch (error: any) {
    console.error('Error creating GitHub repository:', error);

    // Handle GitHub API errors
    if (error.status === 422) {
      return NextResponse.json({
        error: 'Repository name already exists or is invalid'
      }, { status: 400 });
    }

    return NextResponse.json(
      { error: error.message || 'Failed to create repository' },
      { status: 500 }
    );
  }
}
