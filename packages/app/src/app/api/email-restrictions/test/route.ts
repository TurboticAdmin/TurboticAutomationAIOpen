import { NextRequest, NextResponse } from "next/server";
import { emailValidator } from "@/lib/email-validation";
import authenticationBackend from '@/app/api/authentication/authentication-backend';

// POST - Test email pattern against sample emails
export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const currentUser = await authenticationBackend.getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const { pattern, testEmails } = body;

    if (!pattern || !testEmails || !Array.isArray(testEmails)) {
      return NextResponse.json(
        { error: 'Pattern and testEmails array are required' },
        { status: 400 }
      );
    }

    const result = emailValidator.testPattern(pattern, testEmails);

    return NextResponse.json({ 
      success: true, 
      result 
    });
  } catch (error) {
    console.error('Error testing email pattern:', error);
    return NextResponse.json(
      { error: 'Failed to test email pattern' },
      { status: 500 }
    );
  }
} 