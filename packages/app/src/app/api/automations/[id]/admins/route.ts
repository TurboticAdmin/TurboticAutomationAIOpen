import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import authenticationBackend from "../../../authentication/authentication-backend";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const currentUser = await authenticationBackend.getCurrentUser(req);

        if (!currentUser) {
            return new Response(JSON.stringify({ error: 'Authentication required' }), { 
                headers: { 'Content-Type': 'application/json' }, 
                status: 401 
            });
        }

        const db = getDb();

        // Find the automation
        const automation = await db.collection('automations').findOne({
            _id: ObjectId.createFromHexString(id)
        });

        if (!automation) {
            return new Response(JSON.stringify({ error: 'Automation not found' }), { 
                headers: { 'Content-Type': 'application/json' }, 
                status: 404 
            });
        }

        // Check if user has access (owner or admin)
        const isOwner = String(automation.ownerUserId) === String(currentUser._id);
        const isAdmin = Array.isArray(automation.adminUserIds) && automation.adminUserIds.includes(String(currentUser._id));

        if (!isOwner && !isAdmin) {
            return new Response(JSON.stringify({ error: 'Access denied' }), { 
                headers: { 'Content-Type': 'application/json' }, 
                status: 403 
            });
        }

        // Get admin user details
        const adminUsers = [];
        if (automation.adminUserIds && Array.isArray(automation.adminUserIds)) {
            for (const adminId of automation.adminUserIds) {
                const adminUser = await db.collection('users').findOne({
                    _id: ObjectId.createFromHexString(adminId)
                });
                if (adminUser) {
                    adminUsers.push({
                        _id: String(adminUser._id),
                        email: adminUser.email
                    });
                }
            }
        }

        return new Response(JSON.stringify({ 
            adminUsers,
            isOwner,
            isAdmin
        }), { 
            headers: { 'Content-Type': 'application/json' } 
        });

    } catch (error) {
        console.error('Error getting admin users:', error);
        return new Response(JSON.stringify({ error: 'Failed to get admin users' }), { 
            headers: { 'Content-Type': 'application/json' }, 
            status: 500 
        });
    }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    try {
        const currentUser = await authenticationBackend.getCurrentUser(req);

        if (!currentUser) {
            return new Response(JSON.stringify({ error: 'Authentication required' }), { 
                headers: { 'Content-Type': 'application/json' }, 
                status: 401 
            });
        }

        const { adminEmails } = await req.json();
        const db = getDb();

        // Find the automation
        const automation = await db.collection('automations').findOne({
            _id: ObjectId.createFromHexString(id)
        });

        if (!automation) {
            return new Response(JSON.stringify({ error: 'Automation not found' }), { 
                headers: { 'Content-Type': 'application/json' }, 
                status: 404 
            });
        }

        // Check if user has permission to manage admins (owner or admin)
        const isOwner = String(automation.ownerUserId) === String(currentUser._id);
        const isAdmin = Array.isArray(automation.adminUserIds) && automation.adminUserIds.includes(String(currentUser._id));

        if (!isOwner && !isAdmin) {
            return new Response(JSON.stringify({ error: 'Access denied: only owner or admins can manage admin users' }), { 
                headers: { 'Content-Type': 'application/json' }, 
                status: 403 
            });
        }

        if (!adminEmails) {
            return new Response(JSON.stringify({ error: 'Admin emails are required' }), { 
                headers: { 'Content-Type': 'application/json' }, 
                status: 400 
            });
        }

        // Process admin emails
        const adminEmailList = adminEmails.split(',').map((e: string) => e.trim()).filter((e: string) => e);
        const adminUsers = await db.collection('users').find({ email: { $in: adminEmailList } }).toArray();
        const adminUserIds = adminUsers.map((u: any) => String(u._id));

        // Update automation with new adminUserIds
        await db.collection('automations').updateOne(
            { _id: ObjectId.createFromHexString(id) },
            { $set: { adminUserIds } }
        );

        return new Response(JSON.stringify({ 
            success: true,
            message: `Admin users updated successfully`,
            adminUserIds
        }), { 
            headers: { 'Content-Type': 'application/json' } 
        });

    } catch (error) {
        console.error('Error updating admin users:', error);
        return new Response(JSON.stringify({ error: 'Failed to update admin users' }), { 
            headers: { 'Content-Type': 'application/json' }, 
            status: 500 
        });
    }
} 