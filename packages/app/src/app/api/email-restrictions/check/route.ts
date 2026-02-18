import { NextRequest, NextResponse } from 'next/server';
import { emailValidator } from '@/lib/email-validation';
import AccessRequestNotificationService from '@/lib/access-request-notifications';

/**
 * POST - Check if an email is allowed (public endpoint for frontend validation)
 * Includes security: blocks after 10 failed attempts
 */
export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    // Normalize email to lowercase
    const normalizedEmail = email.trim().toLowerCase();

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      return NextResponse.json(
        { allowed: false, reason: 'Invalid email format' },
        { status: 200 }
      );
    }

    // Check if user is blocked due to too many access attempts
    const blockStatus = await AccessRequestNotificationService.checkIfBlocked(normalizedEmail);
    if (blockStatus.blocked) {
      return NextResponse.json(
        {
          allowed: false,
          blocked: true,
          reason: 'Access blocked due to excessive attempts. Please contact support.',
          attemptCount: blockStatus.attemptCount
        },
        { status: 429 }
      );
    }

    // Get request info for access notifications
    const userAgent = req.headers.get('user-agent') || undefined;
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;

    // Check if email is allowed
    const validation = await emailValidator.isEmailAllowed(normalizedEmail);

    // If email is not allowed, notify access request (increments attempt count, blocks after 10)
    if (!validation.allowed) {
      const notificationResult = await AccessRequestNotificationService.notifyAccessRequest({
        userEmail: normalizedEmail,
        attemptedAt: new Date(),
        userAgent,
        ipAddress
      }).catch(error => {
        console.error('Failed to send access request notification:', error);
        return { emailSent: false, blocked: false, attemptCount: 0 };
      });

      // If user got blocked during this request, return blocked status
      if (notificationResult.blocked) {
        return NextResponse.json(
          {
            allowed: false,
            blocked: true,
            reason: 'Access blocked due to excessive attempts. Please contact support.',
            attemptCount: notificationResult.attemptCount
          },
          { status: 429 }
        );
      }

      return NextResponse.json({
        allowed: false,
        reason: validation.reason || 'Your request to access this application has been sent and is being reviewed. Once approved, you will receive an email notification.',
        attemptCount: notificationResult.attemptCount
      });
    }

    return NextResponse.json({
      allowed: true,
      reason: validation.reason
    });
  } catch (error) {
    console.error('Error checking email restrictions:', error);
    return NextResponse.json(
      { error: 'Failed to check email restrictions' },
      { status: 500 }
    );
  }
}

