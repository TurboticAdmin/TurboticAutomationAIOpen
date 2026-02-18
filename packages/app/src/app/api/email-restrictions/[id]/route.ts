import { NextRequest, NextResponse } from "next/server";
import { emailValidator } from "@/lib/email-validation";
import authenticationBackend from '../../authentication/authentication-backend';

// PUT - Update an email restriction
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const currentUser = await authenticationBackend.getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await req.json();

    const { pattern, type, priority, description, canChat, canRunCode } = body;

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

    const success = await emailValidator.updateRestriction(id, {
      pattern: pattern.trim(),
      type,
      priority: validatedPriority,
      description: description?.trim(),
      canChat: canChat !== undefined ? canChat : true,
      canRunCode: canRunCode !== undefined ? canRunCode : true
    });

    if (success) {
      return NextResponse.json({ 
        success: true, 
        message: `${type} rule updated successfully` 
      });
    } else {
      return NextResponse.json(
        { error: 'Restriction not found' },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('Email restrictions API: Error updating email restriction:', error);
    return NextResponse.json(
      { error: 'Failed to update email restriction' },
      { status: 500 }
    );
  }
}

// DELETE - Remove an email restriction
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Check authentication
    const currentUser = await authenticationBackend.getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { id } = await params;
    
    const success = await emailValidator.removeRestriction(id);
    
    if (success) {
      return NextResponse.json({ 
        success: true, 
        message: 'Restriction deleted successfully' 
      });
    } else {
      return NextResponse.json(
        { error: 'Restriction not found' },
        { status: 404 }
      );
    }
  } catch (error) {
    console.error('Email restrictions API: Error deleting email restriction:', error);
    return NextResponse.json(
      { error: 'Failed to delete email restriction' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // ... existing code ...
} 