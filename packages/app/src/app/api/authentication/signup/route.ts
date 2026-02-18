import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDb } from '@/lib/db';
import authenticationBackend from '../authentication-backend';
import { emailValidator } from '@/lib/email-validation';
import { getIpAddress, getUserAgent } from '@/lib/login-tracking';
import { trackLoginAttempt } from '@/lib/login-tracking';

export async function POST(req: NextRequest) {
    try {
        const { email, password, name, utm_source, utm_medium, utm_campaign } = await req.json();

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

        // Validate password strength
        if (password.length < 8) {
            return NextResponse.json(
                { error: 'Password must be at least 8 characters long' },
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
        
        // Check if user already exists
        const existingUser = await db.collection('users').findOne({ email: normalizedEmail });
        if (existingUser) {
            return NextResponse.json(
                { error: 'An account with this email already exists. Please login instead.' },
                { status: 409 }
            );
        }

        // Hash password
        const saltRounds = 10;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Create user
        const user = {
            email: normalizedEmail,
            password: hashedPassword,
            name: name || normalizedEmail.split('@')[0],
            authProvider: 'password',
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await db.collection('users').insertOne(user);
        const userId = result.insertedId;

        // Proceed with login to create workspace and return token
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
            isNewUser: true
        }), {
            headers: {
                'Content-Type': 'application/json',
                'Set-Cookie': cookieOptions
            },
            status: 201
        });

    } catch (error) {
        console.error('Signup error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

