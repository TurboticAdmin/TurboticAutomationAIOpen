import sgMail from '@sendgrid/mail';

/**
 * Send email using Azure Communication Services or SendGrid
 * Priority: Azure Communication Services > SendGrid
 */
export async function sendEmail({
  to,
  subject,
  html,
  text,
  from
}: {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  from?: string;
}): Promise<{ success: boolean; error?: string; service?: string }> {
  const toArray = Array.isArray(to) ? to : [to];
  const fromEmail = from || process.env.SENDGRID_FROM_EMAIL;

  // Check for Azure Communication Services
  const azureConnectionString = process.env.AZURE_COMMUNICATION_CONNECTION_STRING;
  const azureFromEmail = process.env.AZURE_COMMUNICATION_FROM_EMAIL;

  if (azureConnectionString && azureFromEmail) {
    try {
      // Dynamic import for Azure Communication Services
      // If package is not installed, this will throw and fall through to SendGrid
      const { EmailClient } = await import('@azure/communication-email');
      
      const emailClient = new EmailClient(azureConnectionString);
      
      const message = {
        senderAddress: azureFromEmail,
        content: {
          subject: subject,
          plainText: text || html?.replace(/<[^>]*>/g, '') || '',
          html: html || text || ''
        },
        recipients: {
          to: toArray.map(email => ({ address: email }))
        }
      };

      const poller = await emailClient.beginSend(message);
      await poller.pollUntilDone();

      return { success: true, service: 'Azure Communication Services' };
    } catch (error: any) {
      // If package is not installed, error will be caught here
      if (error.code === 'MODULE_NOT_FOUND' || error.message?.includes('Cannot find module')) {
        console.warn('Azure Communication Services package not installed. Falling back to SendGrid.');
      } else {
        console.error('Error sending email with Azure Communication Services:', error);
      }
      // Fall through to SendGrid
    }
  }

  // Check for SendGrid
  const sendGridApiKey = process.env.SENDGRID_API_KEY;
  
  if (sendGridApiKey) {
    try {
      sgMail.setApiKey(sendGridApiKey);

      const msg: any = {
        to: toArray,
        from: fromEmail,
        subject: subject,
      };

      // Only include text/html if they have content (SendGrid rejects empty strings)
      if (text && text.trim()) {
        msg.text = text;
      }
      if (html && html.trim()) {
        msg.html = html;
      }

      await sgMail.send(msg);
      return { success: true, service: 'SendGrid' };
    } catch (error: any) {
      console.error('Error sending email with SendGrid:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to send email with SendGrid',
        service: 'SendGrid'
      };
    }
  }

  // No email service configured
  return {
    success: false,
    error: 'No email service configured. Please configure AZURE_COMMUNICATION_CONNECTION_STRING and AZURE_COMMUNICATION_FROM_EMAIL, or SENDGRID_API_KEY environment variables.'
  };
}

