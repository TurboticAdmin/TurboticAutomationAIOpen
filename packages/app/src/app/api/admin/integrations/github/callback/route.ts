import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { encrypt } from '@/lib/encryption';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code');
    const state = searchParams.get('state');
    const error = searchParams.get('error');

    if (error) {
      return NextResponse.redirect(new URL(`/?error=${encodeURIComponent(error)}`, request.url));
    }

    if (!code || !state) {
      return NextResponse.redirect(new URL('/?error=missing_oauth_params', request.url));
    }

    // Decode state
    let stateData: { userId: string; returnUrl?: string };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
    } catch (e) {
      return NextResponse.redirect(new URL('/?error=invalid_state', request.url));
    }

    const { userId, returnUrl } = stateData;

    const clientId = process.env.GITHUB_CLIENT_ID;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(new URL('/?error=oauth_not_configured', request.url));
    }

    // Exchange code for tokens
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/api/admin/integrations/github/callback`;
    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return NextResponse.redirect(new URL('/?error=token_exchange_failed', request.url));
    }

    const tokenData = await tokenResponse.json();

    if (tokenData.error) {
      console.error('GitHub OAuth error:', tokenData.error_description || tokenData.error);
      return NextResponse.redirect(new URL('/?error=' + encodeURIComponent(tokenData.error), request.url));
    }

    // Get user info from GitHub
    const userResponse = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    let githubUsername = userId;
    if (userResponse.ok) {
      const userData = await userResponse.json();
      githubUsername = userData.login || userId;
    }

    // Save integration to database
    const db = getDb();
    await db.collection('integrations').updateOne(
      {
        userId: userId,
        app: 'github',
        source: 'github'
      },
      {
        $set: {
          userId: userId,
          app: 'github',
          source: 'github',
          accessToken: encrypt(tokenData.access_token),
          isConnected: true,
          githubUsername: githubUsername,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    // Redirect back to settings or returnUrl
    const redirectUrl = returnUrl || '/?settingsModal=integrations&success=GitHub';
    return NextResponse.redirect(new URL(redirectUrl, request.url));
  } catch (error: any) {
    console.error('Error in GitHub OAuth callback:', error);
    return NextResponse.redirect(new URL('/?error=oauth_callback_error', request.url));
  }
}

