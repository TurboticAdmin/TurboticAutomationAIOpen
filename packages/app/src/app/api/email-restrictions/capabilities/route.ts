import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { emailValidator } from '@/lib/email-validation';
import authenticationBackend from '../../authentication/authentication-backend';

/**
 * PATCH - Bulk update capabilities for email restrictions matching a pattern
 */
export async function PATCH(request: NextRequest) {
  try {
    // Basic CSRF/same-origin check
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

    const { pattern, canChat, canRunCode } = await request.json();

    // Validate input
    if (!pattern || typeof pattern !== 'string') {
      return NextResponse.json(
        { error: 'Pattern is required and must be a string' },
        { status: 400 }
      );
    }

    if (typeof canChat !== 'boolean' || typeof canRunCode !== 'boolean') {
      return NextResponse.json(
        { error: 'canChat and canRunCode must be boolean values' },
        { status: 400 }
      );
    }

    const db = getDb();

    // Find all matching restrictions (for whitelisted users matching the pattern)
    const matchingRestrictions = await db
      .collection('email_restrictions')
      .find({
        pattern: pattern,
        type: 'whitelist'
      })
      .toArray();

    if (matchingRestrictions.length === 0) {
      return NextResponse.json(
        { error: 'No matching whitelist restrictions found for this pattern' },
        { status: 404 }
      );
    }

    // Update capabilities for all matching restrictions
    const result = await db.collection('email_restrictions').updateMany(
      {
        pattern: pattern,
        type: 'whitelist'
      },
      {
        $set: {
          canChat,
          canRunCode,
          lastModified: new Date(),
          lastModifiedBy: adminCheck.currentUser.email
        }
      }
    );

    // Clear the validator cache
    emailValidator.clearCache();

    return NextResponse.json({
      message: `Successfully updated capabilities for ${result.modifiedCount} restriction(s)`,
      modifiedCount: result.modifiedCount,
      canChat,
      canRunCode
    });

  } catch (error) {
    console.error('Error in bulk capability update:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST - Bulk update capabilities for multiple email patterns
 */
export async function POST(request: NextRequest) {
  try {
    // Basic CSRF/same-origin check
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

    const { emails, canChat, canRunCode } = await request.json();

    // Validate input
    if (!emails || !Array.isArray(emails) || emails.length === 0) {
      return NextResponse.json(
        { error: 'Emails array is required and must not be empty' },
        { status: 400 }
      );
    }

    if (typeof canChat !== 'boolean' || typeof canRunCode !== 'boolean') {
      return NextResponse.json(
        { error: 'canChat and canRunCode must be boolean values' },
        { status: 400 }
      );
    }

    const db = getDb();

    // Filter valid emails
    const validEmails = emails
      .map((email: string) => email.trim())
      .filter((email: string) => email && email.includes('@'));

    if (validEmails.length === 0) {
      return NextResponse.json(
        { error: 'No valid email addresses found' },
        { status: 400 }
      );
    }

    // Update capabilities for all matching email patterns
    const result = await db.collection('email_restrictions').updateMany(
      {
        pattern: { $in: validEmails },
        type: 'whitelist'
      },
      {
        $set: {
          canChat,
          canRunCode,
          lastModified: new Date(),
          lastModifiedBy: adminCheck.currentUser.email
        }
      }
    );

    // Clear the validator cache
    emailValidator.clearCache();

    return NextResponse.json({
      message: `Successfully updated capabilities for ${result.modifiedCount} user(s)`,
      modifiedCount: result.modifiedCount,
      requestedCount: validEmails.length,
      canChat,
      canRunCode
    });

  } catch (error) {
    console.error('Error in bulk capability update:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * GET - Get current capabilities for a specific email
 * Anyone can check their own capabilities, only admins can check others
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');

    if (!email) {
      return NextResponse.json(
        { error: 'Email parameter is required' },
        { status: 400 }
      );
    }

    // Check authentication and verify they're checking their own email
    const currentUser = await authenticationBackend.getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Verify they're checking their own email
    if (currentUser.email !== email) {
      return NextResponse.json(
        { error: 'Unauthorized: You can only check your own capabilities' },
        { status: 403 }
      );
    }

    const capabilities = await emailValidator.getUserCapabilities(email);

    return NextResponse.json({
      email,
      ...capabilities
    });

  } catch (error) {
    console.error('Error getting user capabilities:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
