import { NextRequest, NextResponse } from 'next/server';

function resolveBaseUrl(request: NextRequest): string {
    const headerHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
    const envHost = process.env.PUBLIC_HOSTNAME;
    const host = headerHost || envHost || 'localhost:3000';
    const headerProto = request.headers.get('x-forwarded-proto');
    const isLocalhost = host.startsWith('localhost') || host.startsWith('127.0.0.1');
    const protocol = headerProto || (isLocalhost ? 'http' : 'https');
    const baseUrl = `${protocol}://${host}`;
    // Normalize: remove trailing slash
    return baseUrl.replace(/\/$/, '');
}

export async function GET(req: NextRequest) {
    try {
        const config = {
            google: {
                enabled: false
            },
            microsoft: {
                enabled: false
            },
            otp: {
                enabled: false
            }
        };

        return NextResponse.json(config);
    } catch (error) {
        console.error('Auth config error:', error);
        return NextResponse.json({ error: 'Failed to get auth config' }, { status: 500 });
    }
}
