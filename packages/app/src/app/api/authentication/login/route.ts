import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDb } from '@/lib/db';
import authenticationBackend from '../../../api/authentication/authentication-backend';
import { emailValidator } from '@/lib/email-validation';
import { getIpAddress, getUserAgent } from '@/lib/login-tracking';
import { trackLoginAttempt } from '@/lib/login-tracking';
import { getUTMParams } from '@/lib/utm-persistence';

export async function POST(req: NextRequest) {
    try {
        const { email, password, utm_source, utm_medium, utm_campaign } = await req.json();

        if (!email || !password) {
            return NextResponse.json(
                { error: 'Email and password are required' },
                { status: 400 }
            );
        }

        const normalizedEmail = email.trim().toLowerCase();

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normalizedEmail)) {
            return NextResponse.json(
                { error: 'Invalid email format' },
                { status: 400 }
            );
        }

        // Validate email against whitelist/blacklist
        const validation = await emailValidator.isEmailAllowed(normalizedEmail);
        if (!validation.allowed) {
            await trackLoginAttempt(
                normalizedEmail,
                'password',
                'blocked',
                {
                    ipAddress: getIpAddress(req),
                    userAgent: getUserAgent(req),
                    errorMessage: validation.reason || 'Email not allowed'
                }
            );
            return NextResponse.json(
                { error: validation.reason || 'Email not allowed' },
                { status: 403 }
            );
        }

        const db = getDb();
        const user = await db.collection('users').findOne({ email: normalizedEmail });

        if (!user) {
            await trackLoginAttempt(
                normalizedEmail,
                'password',
                'failed',
                {
                    ipAddress: getIpAddress(req),
                    userAgent: getUserAgent(req),
                    errorMessage: 'User not found'
                }
            );
            return NextResponse.json(
                { error: 'Invalid email or password' },
                { status: 401 }
            );
        }

        // Check if user has a password
        if (!user.password) {
            await trackLoginAttempt(
                normalizedEmail,
                'password',
                'failed',
                {
                    ipAddress: getIpAddress(req),
                    userAgent: getUserAgent(req),
                    errorMessage: 'Password not set for this account'
                }
            );
            return NextResponse.json(
                { error: 'This account does not have a password set. Please use a different login method.' },
                { status: 401 }
            );
        }

        // Verify password
        let passwordMatch = false;
        try {
            // Check if password is hashed (bcrypt hash starts with $2a$ or $2b$)
            if (user.password.startsWith('$2a$') || user.password.startsWith('$2b$')) {
                passwordMatch = await bcrypt.compare(password, user.password);
            } else {
                // Legacy: plain text password (should not happen in production)
                passwordMatch = password === user.password;
            }
        } catch (bcryptError) {
            console.error('Password verification error:', bcryptError);
            await trackLoginAttempt(
                normalizedEmail,
                'password',
                'failed',
                {
                    ipAddress: getIpAddress(req),
                    userAgent: getUserAgent(req),
                    errorMessage: 'Password verification error'
                }
            );
            return NextResponse.json(
                { error: 'Authentication failed' },
                { status: 500 }
            );
        }

        if (!passwordMatch) {
            await trackLoginAttempt(
                normalizedEmail,
                'password',
                'failed',
                {
                    ipAddress: getIpAddress(req),
                    userAgent: getUserAgent(req),
                    errorMessage: 'Invalid password'
                }
            );
            return NextResponse.json(
                { error: 'Invalid email or password' },
                { status: 401 }
            );
        }

        // Password is correct, proceed with login
        const utmParams = {
            utm_source,
            utm_medium,
            utm_campaign
        };

        const { token, user: userData, isNewUser } = await authenticationBackend.login(
            normalizedEmail,
            'password',
            utmParams,
            {
                ipAddress: getIpAddress(req),
                userAgent: getUserAgent(req)
            }
        );

        // Set cookie with appropriate security settings
        const isProduction = process.env.NODE_ENV === 'production';
        const isLocalhost = req.headers.get('host')?.includes('localhost') || req.headers.get('host')?.includes('127.0.0.1');
        const cookieOptions = [
            `token=${token}`,
            'HttpOnly',
            (isProduction && !isLocalhost) ? 'Secure' : '',
            'SameSite=Strict',
            'Max-Age=86400',
            'Path=/'
        ].filter(Boolean).join('; ');

        return new Response(JSON.stringify({
            success: true,
            user: userData,
            isNewUser
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Set-Cookie': cookieOptions
            },
            status: 200
        });

    } catch (error) {
        console.error('Login error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

