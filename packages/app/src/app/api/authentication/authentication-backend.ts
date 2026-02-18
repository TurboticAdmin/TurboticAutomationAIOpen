import { getDb } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import jwt from 'jsonwebtoken';
import { ObjectId } from "mongodb";
import { createMarketingTrackingRecord, UTMParameters } from "@/lib/marketing-tracking";
import { trackLoginAttempt } from "@/lib/login-tracking";

export default {
    login: async (email: string, authProvider: string = 'email', utmParams?: UTMParameters, trackingOptions?: { ipAddress?: string; userAgent?: string }) => {
        if (!process.env.JWT_SECRET) {
            throw new Error('JWT_SECRET is not set');
        }

        // Normalize email to lowercase for consistency
        const normalizedEmail = email.toLowerCase();

        const db = getDb();
        let user: any = await db.collection('users').findOne({ email: normalizedEmail });

        const isNewUser = !user;

        if (!user) {
            user = {
                email: normalizedEmail,
                authProvider: authProvider,
                createdAt: new Date()
            }

            const result = await db.collection('users').insertOne(user);
            user._id = result.insertedId;
        } else {
            // Update auth provider if not set
            if (!user.authProvider) {
                await db.collection('users').updateOne(
                    { _id: user._id },
                    { $set: { authProvider: authProvider } }
                );
                user.authProvider = authProvider;
            }
            
            // Ensure we have the latest user data including avatar
            user = await db.collection('users').findOne({ email: normalizedEmail });
        }

        let workspace: any = await db.collection('workspaces').findOne({
            ownerUserId: String(user._id)
        });

        if (!workspace) {
            workspace = {
                ownerUserId: String(user._id),
                name: 'Default Workspace'
            }

            const result = await db.collection('workspaces').insertOne(workspace);
            workspace._id = result.insertedId;
        }

        user.workspace = workspace;

        // Create marketing tracking record for new users
        if (isNewUser && utmParams && (utmParams.utm_source || utmParams.utm_medium || utmParams.utm_campaign)) {
            try {
                // Default free tier limits (subscription logic removed for open source)
                const freeLimits = {
                    executionsPerMonth: 20,
                    chats: 10,
                    automations: 3
                };
                await createMarketingTrackingRecord(
                    String(user._id),
                    normalizedEmail,
                    String(workspace._id),
                    utmParams,
                    {
                        tier: 'FREE', // Default tier for new users
                        billingPeriod: 'monthly',
                        customLimits: {
                            executionsPerMonth: freeLimits.executionsPerMonth,
                            chats: freeLimits.chats,
                            automations: freeLimits.automations
                        }
                    }
                );
            } catch (error) {
                console.error('[Auth Backend] Error creating marketing tracking record:', error);
                // Don't fail login if marketing tracking fails
            }
        }

        const token = jwt.sign({
            email: normalizedEmail,
            _id: String(user._id)
        }, process.env.JWT_SECRET, { expiresIn: '1d' });

        // Track successful login
        // Map auth provider to valid tracking types (password/email -> otp)
        const trackingAuthProvider: 'otp' | 'google' | 'microsoft' | 'appscan' = 
            authProvider === 'password' || authProvider === 'email' ? 'otp' : 
            authProvider as 'otp' | 'google' | 'microsoft' | 'appscan';
        await trackLoginAttempt(
            normalizedEmail,
            trackingAuthProvider,
            'success',
            {
                ipAddress: trackingOptions?.ipAddress,
                userAgent: trackingOptions?.userAgent,
                isNewUser,
                userId: String(user._id)
            }
        );

        return {
            token,
            user,
            workspace,
            isNewUser
        };
    },
    getCurrentUser: async (req: NextRequest) => {
        try {
            if (!process.env.JWT_SECRET) {
                throw new Error('JWT_SECRET is not set');
            }
    
            // Try to get token from Authorization header first (for marketplace server)
            let token = req.headers.get('authorization')?.replace('Bearer ', '');
            
            // If no Bearer token, try to get from cookies (for main app)
            if (!token) {
                token = req.cookies.get('token')?.value;
            }
    
            if (!token) {
                return null;
            }
    
            const decoded: any = jwt.verify(token, process.env.JWT_SECRET);
    
            const db = getDb();
            const user: any = await db.collection('users').findOne({ _id: ObjectId.createFromHexString(String(decoded._id)) });
    
            if (!user) {
                return null;
            }
    
            const workspace: any = await db.collection('workspaces').findOne({
                ownerUserId: String(user._id)
            });
    
            user.workspace = workspace;
            // Ensure we return the complete user object with all fields including avatarDataUrl
            return user || null;
        } catch (e) {
            console.error('[Auth Backend] Error getting current user:', e);
            return null;
        }
    }
}