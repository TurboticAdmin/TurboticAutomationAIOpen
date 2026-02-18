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
    const { repoOwner, repoName, branch } = body;

    if (!repoOwner || !repoName) {
      return NextResponse.json({
        error: 'Repository owner and name are required'
      }, { status: 400 });
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

    // Decrypt access token and verify repo access
    const accessToken = decrypt(githubIntegration.accessToken);
    const octokit = new Octokit({ auth: accessToken });

    // Verify repository exists and user has access
    const repo = await octokit.repos.get({
      owner: repoOwner,
      repo: repoName,
    });

    // Update automation with GitHub repo info
    await db.collection('automations').updateOne(
      { _id: automation._id },
      {
        $set: {
          githubRepo: {
            isConnected: true,
            repoOwner: repo.data.owner.login,
            repoName: repo.data.name,
            repoFullName: repo.data.full_name,
            branch: branch || repo.data.default_branch || 'main',
            isPrivate: repo.data.private,
            url: repo.data.html_url,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        }
      }
    );

    return NextResponse.json({
      success: true,
      repo: {
        owner: repo.data.owner.login,
        name: repo.data.name,
        fullName: repo.data.full_name,
        url: repo.data.html_url,
        private: repo.data.private,
        branch: branch || repo.data.default_branch
      }
    });

  } catch (error: any) {
    console.error('Error connecting to GitHub repository:', error);

    if (error.status === 404) {
      return NextResponse.json({
        error: 'Repository not found or you do not have access'
      }, { status: 404 });
    }

    return NextResponse.json(
      { error: error.message || 'Failed to connect repository' },
      { status: 500 }
    );
  }
}
