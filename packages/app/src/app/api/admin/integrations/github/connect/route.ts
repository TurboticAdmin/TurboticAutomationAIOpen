import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import authenticationBackend from '@/app/api/authentication/authentication-backend';

export async function POST(request: NextRequest) {
  try {
    const currentUser = await authenticationBackend.getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { returnUrl } = body;

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      const missingCredentials = [];
      if (!clientId) missingCredentials.push('Client ID');
      if (!clientSecret) missingCredentials.push('Client Secret');
      
      return NextResponse.json({ 
        error: `GitHub OAuth credentials not configured. Missing: ${missingCredentials.join(', ')}. Please configure GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET environment variables.`,
        missingCredentials: missingCredentials
      }, { status: 500 });
    }

    // Generate state for OAuth security
    const state = Buffer.from(JSON.stringify({
      userId: currentUser.email,
      returnUrl: returnUrl || '/?settingsModal=integrations'
    })).toString('base64url');

    // Build OAuth URL
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/api/admin/integrations/github/callback`;
    const scopes = 'repo user:email';
    const authUrl = `https://github.com/login/oauth/authorize?` +
      `client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&state=${encodeURIComponent(state)}`;

    return NextResponse.json({ authUrl });
  } catch (error: any) {
    console.error('Error initiating GitHub connection:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to initiate GitHub connection' },
      { status: 500 }
    );
  }
}

