import { NextRequest, NextResponse } from "next/server";
import { emailValidator, EmailRestriction } from "@/lib/email-validation";
import authenticationBackend from '@/app/api/authentication/authentication-backend';

// GET - Get email restrictions with pagination
export async function GET(req: NextRequest) {
  try {
    // Check authentication
    const currentUser = await authenticationBackend.getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Parse pagination parameters
    const url = new URL(req.url);
    const page = parseInt(url.searchParams.get('page') || '1');
    const limit = parseInt(url.searchParams.get('limit') || '50');
    
    const restrictions = await emailValidator.getRestrictions(page, limit);
    return NextResponse.json({ 
      restrictions: restrictions.data,
      total: restrictions.total,
      page,
      limit,
      totalPages: Math.ceil(restrictions.total / limit)
    });
  } catch (error) {
    console.error('Error fetching email restrictions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch email restrictions' },
      { status: 500 }
    );
  }
}

// POST - Add new email restriction
export async function POST(req: NextRequest) {
  try {
    // Basic CSRF/same-origin check (quick win)
    const origin = req.headers.get('origin');
    const host = req.headers.get('host');
    if (!origin || !host || !origin.includes(host)) {
      return NextResponse.json({ error: 'Invalid origin' }, { status: 403 });
    }

    // Check authentication
    const currentUser = await authenticationBackend.getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await req.json();
    
    // Extract only the fields we need - explicitly ignore 'id' field to prevent IDOR vulnerability
    const { pattern, type, priority, description, createdBy, canChat, canRunCode } = body;

    // Validate required fields
    if (!pattern || !type) {
      return NextResponse.json(
        { error: 'Pattern and type are required' },
        { status: 400 }
      );
    }

    if (!['whitelist', 'blacklist'].includes(type)) {
      return NextResponse.json(
        { error: 'Type must be either "whitelist" or "blacklist"' },
        { status: 400 }
      );
    }

    // Validate pattern format
    if (typeof pattern !== 'string' || pattern.trim().length === 0) {
      return NextResponse.json(
        { error: 'Pattern must be a non-empty string' },
        { status: 400 }
      );
    }

    // Validate priority (1-10, default 5)
    let validatedPriority = 5;
    if (priority !== undefined) {
      const numPriority = Number(priority);
      if (isNaN(numPriority) || numPriority < 1 || numPriority > 10) {
        return NextResponse.json(
          { error: 'Priority must be a number between 1 and 10' },
          { status: 400 }
        );
      }
      validatedPriority = numPriority;
    }

    const restrictionId = await emailValidator.addRestriction({
      pattern: pattern.trim(),
      type,
      priority: validatedPriority,
      description: description?.trim(),
      createdBy: createdBy || currentUser?.email,
      canChat: canChat !== undefined ? canChat : true,
      canRunCode: canRunCode !== undefined ? canRunCode : true
    });

    return NextResponse.json({ 
      success: true, 
      restrictionId,
      message: `${type} rule added successfully` 
    });
  } catch (error) {
    console.error('Email restrictions API: Error adding email restriction:', error);
    return NextResponse.json(
      { error: 'Failed to add email restriction' },
      { status: 500 }
    );
  }
} 