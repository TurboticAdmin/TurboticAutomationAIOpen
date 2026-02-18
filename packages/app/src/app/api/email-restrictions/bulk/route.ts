import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import authenticationBackend from '../../../api/authentication/authentication-backend';

export async function POST(request: NextRequest) {
  try {
    // Basic CSRF/same-origin check (quick win)
    const origin = request.headers.get('origin');
    const host = request.headers.get('host');
    if (!origin || !host || !origin.includes(host)) {
      return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
    }

    // Check authentication
    const currentUser = await authenticationBackend.getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { emails, type, priority, description, canChat, canRunCode } = await request.json();

    // Validate input
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json(
        { error: 'Emails array is required and must not be empty' },
        { status: 400 }
      );
    }

    if (!type || !['whitelist', 'blacklist'].includes(type)) {
      return NextResponse.json(
        { error: 'Type must be either "whitelist" or "blacklist"' },
        { status: 400 }
      );
    }

    if (!priority || priority < 1 || priority > 10) {
      return NextResponse.json(
        { error: 'Priority must be between 1 and 10' },
        { status: 400 }
      );
    }

    // Filter and validate emails
    const validEmails = emails
      .map((email: string) => email.trim())
      .filter((email: string) => email && email.includes('@'))
      .filter((email: string) => !email.startsWith('#')); // Ignore comment lines

    if (validEmails.length === 0) {
      return NextResponse.json(
        { error: 'No valid email addresses found' },
        { status: 400 }
      );
    }

    // Check for duplicates
    const db = getDb();
    const existingRestrictions = await db
      .collection('email_restrictions')
      .find({ pattern: { $in: validEmails } })
      .toArray();

    const existingPatterns = new Set(existingRestrictions.map((r: any) => r.pattern));
    const newEmails = validEmails.filter(email => !existingPatterns.has(email));

    if (newEmails.length === 0) {
      return NextResponse.json(
        { error: 'All email addresses already exist as restrictions' },
        { status: 400 }
      );
    }

    // Create restrictions
    const restrictionsToAdd = newEmails.map(email => ({
      pattern: email,
      type,
      priority,
      description: description?.trim() || `Bulk imported ${type} restriction`,
      canChat: canChat !== undefined ? canChat : true,
      canRunCode: canRunCode !== undefined ? canRunCode : true,
      createdAt: new Date().toISOString(),
      createdBy: adminCheck.currentUser.email // Use authenticated user instead of 'bulk-import'
    }));

    const result = await db.collection('email_restrictions').insertMany(restrictionsToAdd);

    return NextResponse.json({
      message: `Successfully added ${newEmails.length} restrictions`,
      addedCount: newEmails.length,
      skippedCount: validEmails.length - newEmails.length,
      addedEmails: newEmails,
      skippedEmails: validEmails.filter(email => existingPatterns.has(email))
    });

  } catch (error) {
    console.error('Error in bulk email restrictions:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 