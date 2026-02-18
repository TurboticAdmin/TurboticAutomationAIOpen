import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import authenticationBackend from '@/app/api/authentication/authentication-backend';
import { decrypt } from '@/lib/encryption';
import { Octokit } from '@octokit/rest';

export async function GET(request: NextRequest) {
  try {
    const currentUser = await authenticationBackend.getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const db = getDb();
    
    // Get user's GitHub integration
    const githubIntegration = await db.collection('integrations').findOne({
      userId: currentUser.email,
      app: 'github',
      source: 'github',
      isConnected: true
    });

    if (!githubIntegration?.accessToken) {
      return NextResponse.json({ 
        error: 'GitHub account not connected',
        repos: []
      }, { status: 400 });
    }

    // Decrypt access token and fetch repos
    const accessToken = decrypt(githubIntegration.accessToken);
    const octokit = new Octokit({ auth: accessToken });

    // Fetch user's repositories
    const reposResponse = await octokit.repos.listForAuthenticatedUser({
      type: 'all',
      sort: 'updated',
      per_page: 100
    });

    const repos = reposResponse.data.map(repo => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      owner: repo.owner.login,
      private: repo.private,
      defaultBranch: repo.default_branch || 'main',
      url: repo.html_url,
      description: repo.description
    }));

    return NextResponse.json({ repos });
  } catch (error: any) {
    console.error('Error fetching GitHub repositories:', error);
    return NextResponse.json(
      { 
        error: error.message || 'Failed to fetch repositories',
        repos: []
      },
      { status: 500 }
    );
  }
}

