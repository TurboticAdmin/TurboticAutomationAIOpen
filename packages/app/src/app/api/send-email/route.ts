import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import authenticationBackend from '../authentication/authentication-backend';
import { ObjectId } from 'mongodb';
import { decrypt } from '@/lib/encryption';
import { getMicrosoftAuthToken, hasValidMicrosoftIntegration } from '@/lib/microsoft-auth';
import sgMail from '@sendgrid/mail';

export async function POST(request: NextRequest) {
    try {
        const { to, subject, html, text, from } = await request.json();

        if (!to || !subject || (!html && !text)) {
            return NextResponse.json(
                { error: 'to, subject, and either html or text are required' },
                { status: 400 }
            );
        }

        // Normalize 'to' to array if it's a string
        const toArray = Array.isArray(to) ? to : [to];

        // Check if this request is from a script runner (internal service)
        const scriptRunnerHeader = request.headers.get('X-Script-Runner');
        const isScriptRunner = scriptRunnerHeader === 'true';
        const executionId = request.headers.get('X-Execution-Id');

        let currentUser = null;
        let workspaceId = null;
        let userId = null;
        let userSendGridApiKey = null;

        if (isScriptRunner && executionId) {
            // For script runners, get user info from the execution
            const db = getDb();
            const execution = await db.collection('executions').findOne({
                _id: ObjectId.createFromHexString(executionId)
            });

            if (!execution) {
                return NextResponse.json(
                    { error: 'Execution not found' },
                    { status: 404 }
                );
            }

            const automation = await db.collection('automations').findOne({
                _id: ObjectId.createFromHexString(execution.automationId)
            });

            if (!automation) {
                return NextResponse.json(
                    { error: 'Automation not found' },
                    { status: 404 }
                );
            }

            const workspace = await db.collection('workspaces').findOne({
                _id: ObjectId.createFromHexString(automation.workspaceId)
            });

            if (!workspace) {
                return NextResponse.json(
                    { error: 'Workspace not found' },
                    { status: 404 }
                );
            }

            const user = await db.collection('users').findOne({
                _id: ObjectId.createFromHexString(workspace.ownerUserId)
            });

            if (!user) {
                return NextResponse.json(
                    { error: 'User not found' },
                    { status: 404 }
                );
            }

            workspaceId = workspace._id.toString();
            userId = user._id.toString();
            currentUser = { ...user, workspace };

            // Check if user has their own SendGrid API key
            // Priority: 1. environment_variables_values (workspace-level), 2. automation.environmentVariables
            const workspaceEnvVars = await db.collection('environment_variables_values').findOne({
                workspaceId: workspaceId
            });

            // Helper function to get env var value
            const getEnvVarValue = (envVar: any): string => {
                if (!envVar || envVar.valueFile) return '';
                if (typeof envVar.value === 'string') {
                    return decrypt(envVar.value);
                } else if (envVar.value && typeof envVar.value === 'object') {
                    const rawValue = envVar.value.dev || envVar.value.test || envVar.value.production || '';
                    return rawValue ? decrypt(rawValue) : '';
                }
                return '';
            };

            // Check workspace-level environment variables from environment_variables_values collection
            if (workspaceEnvVars?.environmentVariables) {
                const sendGridEnvVar = workspaceEnvVars.environmentVariables.find(
                    (env: any) => env.name === 'SENDGRID_API_KEY' || env.name === 'SEND_GRID_API_KEY'
                );
                if (sendGridEnvVar) {
                    userSendGridApiKey = getEnvVarValue(sendGridEnvVar);
                }
            }

            // If not found in workspace env vars, check automation.environmentVariables
            if (!userSendGridApiKey && automation.environmentVariables) {
                const sendGridEnvVar = automation.environmentVariables.find(
                    (env: any) => env.name === 'SENDGRID_API_KEY' || env.name === 'SEND_GRID_API_KEY'
                );
                if (sendGridEnvVar) {
                    userSendGridApiKey = getEnvVarValue(sendGridEnvVar);
                }
            }

        } else if (!isScriptRunner) {
            // Get current user from authentication for regular requests
            currentUser = await authenticationBackend.getCurrentUser(request);
            if (!currentUser) {
                return NextResponse.json(
                    { error: 'Authentication required' },
                    { status: 401 }
                );
            }

            if (!currentUser.workspace?._id || !currentUser._id) {
                return NextResponse.json(
                    { error: 'Invalid user context - missing workspace or user ID' },
                    { status: 400 }
                );
            }

            workspaceId = currentUser.workspace._id.toString();
            userId = currentUser._id.toString();

            // Check if user has their own SendGrid API key from environment_variables_values
            const db = getDb();
            const workspaceEnvVars = await db.collection('environment_variables_values').findOne({
                workspaceId: workspaceId
            });

            // Helper function to get env var value
            const getEnvVarValue = (envVar: any): string => {
                if (!envVar || envVar.valueFile) return '';
                if (typeof envVar.value === 'string') {
                    return decrypt(envVar.value);
                } else if (envVar.value && typeof envVar.value === 'object') {
                    const rawValue = envVar.value.dev || envVar.value.test || envVar.value.production || '';
                    return rawValue ? decrypt(rawValue) : '';
                }
                return '';
            };

            if (workspaceEnvVars?.environmentVariables) {
                const sendGridEnvVar = workspaceEnvVars.environmentVariables.find(
                    (env: any) => env.name === 'SENDGRID_API_KEY' || env.name === 'SEND_GRID_API_KEY'
                );
                if (sendGridEnvVar) {
                    userSendGridApiKey = getEnvVarValue(sendGridEnvVar);
                }
            }
        } else {
            return NextResponse.json(
                { error: 'Script runner requests require execution ID' },
                { status: 400 }
            );
        }

        // Determine which email service to use
        // Priority: 1. Outlook (Microsoft integration), 2. User's SendGrid API key, 3. Turbotic's SendGrid
        let emailSent = false;
        let usedOutlook = false;
        let usedUserSendGrid = false;
        let usedTurboticSendGrid = false;
        let errorMessage = '';

        // Get user email for Microsoft integration lookup (integrations use email as userId)
        const userEmail = currentUser.email;
        const hasOutlook = userEmail ? await hasValidMicrosoftIntegration(userEmail) : false;

        if (hasOutlook && userEmail) {
            // Use Outlook/Microsoft Graph API
            console.log('Using Outlook/Microsoft Graph API for email');
            usedOutlook = true;

            try {
                const authResult = await getMicrosoftAuthToken(userEmail);
                
                if (!authResult.success || !authResult.accessToken) {
                    throw new Error(`Failed to get Microsoft auth token: ${authResult.error}`);
                }

                const emailData = {
                    message: {
                        subject,
                        body: {
                            contentType: html ? 'HTML' : 'Text',
                            content: html || text,
                        },
                        toRecipients: toArray.map(email => ({
                            emailAddress: {
                                address: email,
                            },
                        })),
                    },
                };

                const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${authResult.accessToken}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(emailData),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`Microsoft Graph API error: ${response.status} ${response.statusText} - ${errorText}`);
                }

                emailSent = true;
            } catch (error: any) {
                console.error('Error sending email via Outlook:', error);
                errorMessage = error.message || 'Failed to send email via Outlook';
                // Fall through to try SendGrid
            }
        }

        // If Outlook failed or not available, try SendGrid
        if (!emailSent) {
            if (userSendGridApiKey) {
                // User has their own SendGrid API key - use it
                console.log('Using user-provided SendGrid API key');
                usedUserSendGrid = true;

                try {
                    sgMail.setApiKey(userSendGridApiKey);

                    const msg: any = {
                        to: toArray,
                        from: from || process.env.SENDGRID_FROM_EMAIL,
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
                    emailSent = true;
                } catch (error: any) {
                    console.error('Error sending email with user SendGrid:', error);
                    errorMessage = error.message || 'Failed to send email with user SendGrid';
                    // Fall through to try Turbotic SendGrid
                }
            }

            // If user SendGrid failed or not available, use Turbotic's SendGrid
            if (!emailSent) {
                console.log('Using Turbotic SendGrid');
                usedTurboticSendGrid = true;

                const turboticSendGridKey = process.env.SENDGRID_API_KEY || '';

                if (!turboticSendGridKey) {
                    return NextResponse.json(
                        { error: 'SendGrid configuration not available. Please provide your own SendGrid API key or connect Outlook, or contact support.' },
                        { status: 500 }
                    );
                }

                try {
                    sgMail.setApiKey(turboticSendGridKey);

                    const msg: any = {
                        to: toArray,
                        from: from || process.env.SENDGRID_FROM_EMAIL,
                        subject: subject,
                    };

                    // Only include text/html if they have content (SendGrid rejects empty strings)
                    if (text && text.trim()) {
                        msg.text = text;
                    }
                    if (html && html.trim()) {
                        msg.html = html;
                    }

                    // console.log('Sending email with Turbotic SendGrid:', JSON.stringify(msg, null, 2));

                    await sgMail.send(msg);
                    emailSent = true;
                } catch (error: any) {
                    console.error('Error sending email with Turbotic SendGrid:', error);
                    errorMessage = error.message || 'Failed to send email with Turbotic SendGrid';
                }
            }
        }

        if (!emailSent) {
            return NextResponse.json(
                { 
                    error: 'Failed to send email: ' + errorMessage,
                    usedOutlook,
                    usedUserSendGrid,
                    usedTurboticSendGrid
                },
                { status: 500 }
            );
        }

        // Return the response
        return NextResponse.json({
            success: true,
            message: 'Email sent successfully',
            usedOutlook,
            usedUserSendGrid,
            usedTurboticSendGrid
        });

    } catch (error: any) {
        console.error('Send email error:', error);
        return NextResponse.json(
            { error: 'Send email failed: ' + (error.message || 'Unknown error') },
            { status: 500 }
        );
    }
}

