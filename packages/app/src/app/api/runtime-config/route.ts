import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'ws://localhost:3000';
  const hostname = process.env.PUBLIC_HOSTNAME || 'localhost';

  return NextResponse.json({
    socketUrl,
    environment: process.env.APP_ENV || 'development',
    hostname,
    timestamp: new Date().toISOString()
  });
} 