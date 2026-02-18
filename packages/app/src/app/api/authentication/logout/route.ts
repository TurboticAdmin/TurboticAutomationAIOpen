import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import bcrypt from 'bcryptjs';
import sgMail from "@sendgrid/mail";
import authenticationBackend from "../authentication-backend";

export async function GET(req: NextRequest) {
    // Set cookie with appropriate security settings based on environment
    const isProduction = process.env.NODE_ENV === 'production';
    const isLocalhost = req.headers.get('host')?.includes('localhost') || req.headers.get('host')?.includes('127.0.0.1');
    const cookieOptions = [
        'token=',
        'HttpOnly',
        'Max-Age=0',
        'Path=/',
        'SameSite=Lax',
        (isProduction && !isLocalhost) ? 'Secure' : ''
    ].filter(Boolean).join('; ');

    return new Response('OK', { 
        headers: { 
            'Set-Cookie': cookieOptions
        }
    });
}

export async function POST(req: NextRequest) {
    // Set cookie with appropriate security settings based on environment
    const isProduction = process.env.NODE_ENV === 'production';
    const isLocalhost = req.headers.get('host')?.includes('localhost') || req.headers.get('host')?.includes('127.0.0.1');
    const cookieOptions = [
        'token=',
        'HttpOnly',
        'Max-Age=0',
        'Path=/',
        'SameSite=Lax',
        (isProduction && !isLocalhost) ? 'Secure' : ''
    ].filter(Boolean).join('; ');

    return new Response('OK', { 
        headers: { 
            'Set-Cookie': cookieOptions
        }
    });
}