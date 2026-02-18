import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import authenticationBackend from '../../authentication/authentication-backend';

export async function PUT(req: NextRequest) {
  const user = await authenticationBackend.getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  const { name } = await req.json();
  
  // Validate name
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  }
  
  if (name.length > 50) {
    return NextResponse.json({ error: 'Name must be less than 50 characters' }, { status: 400 });
  }
  
  if (name.trim().length === 0) {
    return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
  }
  
  // Sanitize name (remove potentially harmful characters)
  const sanitizedName = name.trim().replace(/[<>\"'&]/g, '');
  
  const result = await getDb().collection('users').updateOne(
    { _id: user._id },
    { $set: { name: sanitizedName } }
  );
  
  if (result.matchedCount === 0) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
  
  return NextResponse.json({ success: true, name: sanitizedName });
}

export async function GET(req: NextRequest) {
  const user = await authenticationBackend.getCurrentUser(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  
  return NextResponse.json({ 
    success: true, 
    profile: {
      name: user.name || '',
      email: user.email,
      avatar: user.avatarDataUrl || null
    }
  });
}
