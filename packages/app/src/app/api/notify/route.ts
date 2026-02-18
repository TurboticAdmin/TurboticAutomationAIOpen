import { NextRequest, NextResponse } from 'next/server';
import sgMail from '@sendgrid/mail';
import authenticationBackend from "../authentication/authentication-backend";

export async function POST(request: NextRequest) {
  try {
    // Check authentication
    const currentUser = await authenticationBackend.getCurrentUser(request);
    
    if (!currentUser) {
      return NextResponse.json({ 
        success: false, 
        message: 'Authentication required' 
      }, { status: 401 });
    }

    const { email, subject, message, feature } = await request.json();

    // Get user information from request headers or cookies
    const userAgent = request.headers.get('user-agent') || 'Unknown';
    const ipAddress = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'Unknown';
    const referer = request.headers.get('referer') || 'Unknown';
    
    // Use authenticated user's email
    const userEmail = currentUser.email || 'Not provided';

    // Send email using SendGrid
    const notificationEmail = process.env.NOTIFICATION_EMAIL || process.env.SUPPORT_EMAIL || 'support@your-domain.com';
    const emailSent = await sendEmail({
      to: notificationEmail,
      subject: subject,
      html: `
        <h2>Feature Notification Request</h2>
        <p><strong>Feature:</strong> ${feature}</p>
        <p><strong>Subject:</strong> ${subject}</p>
        <p><strong>Message:</strong> ${message}</p>
        <p><strong>User Email:</strong> ${userEmail}</p>
        <p><strong>IP Address:</strong> ${ipAddress}</p>
        <p><strong>User Agent:</strong> ${userAgent}</p>
        <p><strong>Referer:</strong> ${referer}</p>
        <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
        <hr>
        <p>A user has requested to be notified when this feature becomes available.</p>
      `,
      text: `
        Feature Notification Request
        
        Feature: ${feature}
        Subject: ${subject}
        Message: ${message}
        User Email: ${userEmail}
        IP Address: ${ipAddress}
        User Agent: ${userAgent}
        Referer: ${referer}
        Timestamp: ${new Date().toISOString()}
        
        A user has requested to be notified when this feature becomes available.
      `
    });

    if (emailSent) {
      return NextResponse.json({ 
        success: true, 
        message: 'Notification request received and email sent successfully' 
      });
    } else {
      return NextResponse.json({ 
        success: false, 
        message: 'Failed to send email notification' 
      }, { status: 500 });
    }

  } catch (error) {
    console.error('Error processing notification request:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to process notification request' },
      { status: 500 }
    );
  }
}

// SendGrid email sending function
async function sendEmail({ to, subject, html, text }: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<boolean> {
  try {
    const fromEmail = process.env.SENDGRID_FROM_EMAIL;
    if (!fromEmail) {
      console.error('SENDGRID_FROM_EMAIL is not configured');
      return false;
    }

    // Initialize SendGrid
    sgMail.setApiKey(process.env.SENDGRID_API_KEY || '');

    // TypeScript doesn't narrow the type after the if check, so we use type assertions
    // We've already checked that fromEmail is not undefined above
    const msg: any = {
      to: to,
      from: fromEmail as string,
      subject: subject,
      text: text,
      html: html,
    };

    await sgMail.send(msg);
    return true;
    
  } catch (error) {
    console.error('Error sending email with SendGrid:', error);
    return false;
  }
} 