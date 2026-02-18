import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import authenticationBackend from '@/app/api/authentication/authentication-backend';
import { MICROSOFT_APP_CONFIGS } from '@/lib/microsoft-scope';

export async function POST(request: NextRequest) {
  try {
    const currentUser = await authenticationBackend.getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { app, returnUrl } = body;

    if (!app) {
      return NextResponse.json({ error: 'App is required' }, { status: 400 });
    }

    if (!MICROSOFT_APP_CONFIGS[app as keyof typeof MICROSOFT_APP_CONFIGS]) {
      return NextResponse.json({ 
        error: `Invalid app type. Supported apps: ${Object.keys(MICROSOFT_APP_CONFIGS).join(', ')}` 
      }, { status: 400 });
    }

    const appConfig = MICROSOFT_APP_CONFIGS[app as keyof typeof MICROSOFT_APP_CONFIGS];
    console.log(appConfig);
    const appEnvName = app.toUpperCase();
    const clientId = process.env[`MICROSOFT_${appEnvName}_CLIENT_ID`] || process.env.MICROSOFT_CLIENT_ID;
    const clientSecret = process.env[`MICROSOFT_${appEnvName}_CLIENT_SECRET`] || process.env.MICROSOFT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      // Format app name: capitalize first letter
      const appName = app.charAt(0).toUpperCase() + app.slice(1);
      const missingCredentials = [];
      if (!clientId) missingCredentials.push('Client ID');
      if (!clientSecret) missingCredentials.push('Client Secret');
      
      return NextResponse.json({ 
        error: `Microsoft ${appName} OAuth credentials not configured. Missing: ${missingCredentials.join(', ')}. Please configure MICROSOFT_${appEnvName}_CLIENT_ID and MICROSOFT_${appEnvName}_CLIENT_SECRET environment variables.`,
        app: appName,
        missingCredentials: missingCredentials
      }, { status: 500 });
    }

    // Generate state for OAuth security
    const state = Buffer.from(JSON.stringify({
      userId: currentUser.email,
      app,
      returnUrl: returnUrl || '/?settingsModal=integrations'
    })).toString('base64url');

    // Build OAuth URL
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin}/api/admin/integrations/microsoft/callback`;
    const scopes = appConfig.scopes.join(' ');
    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
      `client_id=${encodeURIComponent(clientId)}` +
      `&response_type=code` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_mode=query` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&state=${encodeURIComponent(state)}`;

    return NextResponse.json({ authUrl });
  } catch (error: any) {
    console.error('Error initiating Microsoft connection:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to initiate Microsoft connection' },
      { status: 500 }
    );
  }
}

