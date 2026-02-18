import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { encrypt } from '@/lib/encryption';
import { MICROSOFT_APP_CONFIGS } from '@/lib/microsoft-scope';

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
    let stateData: { userId: string; app: string; returnUrl?: string };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
    } catch (e) {
      return NextResponse.redirect(new URL('/?error=invalid_state', request.url));
    }

    const { userId, app, returnUrl } = stateData;

    if (!MICROSOFT_APP_CONFIGS[app as keyof typeof MICROSOFT_APP_CONFIGS]) {
      return NextResponse.redirect(new URL('/?error=invalid_app', request.url));
    }

    const appConfig = MICROSOFT_APP_CONFIGS[app as keyof typeof MICROSOFT_APP_CONFIGS];
    const appEnvName = app.toUpperCase();
    const clientId = process.env[`MICROSOFT_${appEnvName}_CLIENT_ID`] || process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env[`MICROSOFT_${appEnvName}_CLIENT_SECRET`] || process.env.MICROSOFT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      return NextResponse.redirect(new URL('/?error=oauth_not_configured', request.url));
    }

    // Exchange code for tokens
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/api/admin/integrations/microsoft/callback`;
    const tokenResponse = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code: code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: appConfig.scopes.join(' ')
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return NextResponse.redirect(new URL('/?error=token_exchange_failed', request.url));
    }

    const tokenData = await tokenResponse.json();
    const expiresAt = new Date(Date.now() + (tokenData.expires_in * 1000));

    // Get user info from Microsoft Graph
    const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
      },
    });

    let microsoftUsername = userId;
    if (userResponse.ok) {
      const userData = await userResponse.json();
      microsoftUsername = userData.userPrincipalName || userData.mail || userId;
    }

    // Save integration to database
    const db = getDb();
    await db.collection('integrations').updateOne(
      {
        userId: userId,
        app: app,
        source: 'microsoft'
      },
      {
        $set: {
          userId: userId,
          app: app,
          source: 'microsoft',
          accessToken: encrypt(tokenData.access_token),
          refreshToken: encrypt(tokenData.refresh_token || ''),
          expiresAt: expiresAt,
          isConnected: true,
          microsoftUsername: microsoftUsername,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    // Redirect back to settings or returnUrl
    const redirectUrl = returnUrl || '/?settingsModal=integrations&success=Microsoft';
    return NextResponse.redirect(new URL(redirectUrl, request.url));
  } catch (error: any) {
    console.error('Error in Microsoft OAuth callback:', error);
    return NextResponse.redirect(new URL('/?error=oauth_callback_error', request.url));
  }
}

