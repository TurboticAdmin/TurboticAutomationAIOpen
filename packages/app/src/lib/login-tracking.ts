import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";

export interface LoginAttempt {
  _id?: ObjectId;
  email: string;
  authProvider: 'otp' | 'google' | 'microsoft' | 'appscan';
  status: 'success' | 'failed' | 'blocked' | 'expired';
  ipAddress?: string;
  userAgent?: string;
  errorMessage?: string;
  isNewUser?: boolean;
  userId?: string;
  createdAt: Date;
}

/**
 * Track a login attempt
 */
export async function trackLoginAttempt(
  email: string,
  authProvider: 'otp' | 'google' | 'microsoft' | 'appscan',
  status: 'success' | 'failed' | 'blocked' | 'expired',
  options?: {
    ipAddress?: string;
    userAgent?: string;
    errorMessage?: string;
    isNewUser?: boolean;
    userId?: string;
  }
): Promise<void> {
  try {
    const db = getDb();
    const loginAttempt: LoginAttempt = {
      email: email.toLowerCase(),
      authProvider,
      status,
      ipAddress: options?.ipAddress,
      userAgent: options?.userAgent,
      errorMessage: options?.errorMessage,
      isNewUser: options?.isNewUser,
      userId: options?.userId,
      createdAt: new Date()
    };

    await db.collection('login_attempts').insertOne(loginAttempt);
  } catch (error) {
    // Don't fail login if tracking fails
    console.error('[Login Tracking] Error tracking login attempt:', error);
  }
}

/**
 * Extract IP address from request
 */
export function getIpAddress(req: Request): string | undefined {
  // Check various headers for IP address
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  
  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp;
  }
  
  return undefined;
}

/**
 * Extract User-Agent from request
 */
export function getUserAgent(req: Request): string | undefined {
  return req.headers.get('user-agent') || undefined;
}

