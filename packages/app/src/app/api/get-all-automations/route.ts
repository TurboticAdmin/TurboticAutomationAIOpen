import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import authenticationBackend from "../authentication/authentication-backend";
import { Buffer } from 'buffer';

// Helper function to format last run time
function formatLastRun(lastRunDate: Date): string {
    const now = new Date();
    const diffInMs = now.getTime() - lastRunDate.getTime();
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
    
    if (diffInMinutes < 1) {
        return 'Just now';
    } else if (diffInMinutes < 60) {
        return `${diffInMinutes} minutes ago`;
    } else if (diffInHours < 24) {
        return `${diffInHours} hours ago`;
    } else if (diffInDays < 7) {
        return `${diffInDays} days ago`;
    } else {
        return lastRunDate.toLocaleDateString();
    }
}

function decodeKey(encoded: string) {
  try {
    return Buffer.from(encoded, 'base64').toString('utf-8');
  } catch {
    return encoded;
  }
}

export async function POST(req: NextRequest) {
    const startTime = Date.now();
    let currentUser: any = null;
    try {
        currentUser = await authenticationBackend.getCurrentUser(req);
        if (!currentUser) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // If no workspace is found, return all automations for testing purposes
        if (!currentUser.workspace) {
            const automations = await getDb().collection('automations').find({}).toArray();
            
            // Get execution history for each automation to calculate run counts
            const itemsWithRunCounts = await Promise.all(
                automations.map(async (automation) => {
                    const executionHistory = await getDb().collection('execution_history').find({
                        automationId: automation._id.toString(),
                        userId: ObjectId.createFromHexString(String(currentUser._id))
                    }).toArray();

                    // Filter out running executions for totals
                    const completedExecutions = executionHistory.filter(exec => exec.status !== 'running');
                    const totalRuns = completedExecutions.length;
                    const successfulRuns = executionHistory.filter(exec => exec.status === 'completed').length;
                    const successRate = totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0;

                    // Get the last run
                    const lastRun = executionHistory.length > 0 
                        ? executionHistory[executionHistory.length - 1].createdAt 
                        : null;

                    return {
                        ...automation,
                        totalRuns,
                        successfulRuns,
                        successRate,
                        lastRun: lastRun ? formatLastRun(lastRun) : 'Never',
                        adminUserIds: automation.adminUserIds || [],
                        apiKey: decodeKey(automation.apiKey)
                    };
                })
            );

            return new Response(JSON.stringify({ 
                items: itemsWithRunCounts,
                total: itemsWithRunCounts.length 
            }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Parse cursor-based pagination params from request body
        let lastId: string | null = null;
        let limit = 20; // Default page size
        let search = null;
        let status = null;
        try {
            const body = await req.json();
            if (typeof body.lastId === 'string') lastId = body.lastId;
            if (typeof body.limit === 'number') limit = body.limit;
            if (typeof body.search === 'string') search = body.search?.trim();
            if (typeof body.status === 'string') status = body.status?.trim();
        } catch (e) {}

        // Build the filter for automations owned by the user
        const ownedFilter = {
            $or: [
                { workspaceId: String(currentUser.workspace._id) },
                { createdBy: String(currentUser._id) }
            ]
        };
        
        // Build filter for owned automations only
        let filter: any = ownedFilter;

        // Add cursor-based pagination filter
        if (lastId) {
            try {
                const lastIdObject = new ObjectId(lastId);
                filter = {
                    $and: [
                        filter,
                        { _id: { $lt: lastIdObject } }
                    ]
                };
            } catch (error) {
                console.warn('Invalid lastId provided:', lastId);
                // Continue without cursor filter if lastId is invalid
            }
        }

        if (status) {
            const searchFilter = { status: status }
             if (filter.$and) {
                filter.$and.push(searchFilter);
            } else {
                filter = {
                    $and: [
                        filter,
                        searchFilter
                    ]
                };
            }
            
        }

        if (search) {
            // Normalize spaces and create flexible pattern to match multiple spaces
            const normalizedSearch = search.replace(/\s+/g, ' ');
            const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const escapedSearch = escapeRegex(normalizedSearch);
            const flexiblePattern = escapedSearch.replace(/ /g, '\\s+');

            const searchFilter = {
                $or: [
                    { title: { $regex: flexiblePattern, $options: 'i' } },
                    { description: { $regex: flexiblePattern, $options: 'i' } }
                ]
            };

            if (filter.$and) {
                filter.$and.push(searchFilter);
            } else {
                filter = {
                    $and: [
                        filter,
                        searchFilter
                    ]
                };
            }
        }

        // Aggregation pipeline for efficient stats with cursor-based pagination
        const automations = await getDb().collection('automations').aggregate([
            { $match: filter },
            { $sort: { _id: -1 } }, // Sort by _id descending for cursor pagination
            { $limit: limit },
            { $lookup: {
                from: 'execution_history',
                let: { automationId: { $toString: '$_id' } },
                pipeline: [
                    { $match: { $expr: { $eq: ['$automationId', '$$automationId'] } } }
                ],
                as: 'executions'
            }},
            { $lookup: {
                from: 'automation_shares',
                localField: '_id',
                foreignField: 'originalAutomationId',
                as: 'shares'
            }},
            { $addFields: {
                totalRuns: {
                    $size: {
                        $filter: {
                            input: '$executions',
                            as: 'exec',
                            cond: { $ne: ['$$exec.status', 'running'] }
                        }
                    }
                },
                successfulRuns: {
                    $size: {
                        $filter: {
                            input: '$executions',
                            as: 'exec',
                            cond: { $eq: ['$$exec.status', 'completed'] }
                        }
                    }
                },
                lastRun: {
                    $cond: [
                        { $gt: [ { $size: '$executions' }, 0 ] },
                        { $max: '$executions.createdAt' },
                        null
                    ]
                },
            }},
            { $project: {
                _id: 1,
                title: 1,
                description: 1,
                code: 1,
                environmentVariables: 1,
                dependencies: 1,
                workspaceId: 1,
                createdBy: 1,
                createdAt: 1,
                updatedAt: 1,
                isPublished: 1,
                status: 1,
                initialChatTriggered: 1,
                version: 1,
                v3Steps: 1,
                totalRuns: 1,
                successfulRuns: 1,
                lastRun: 1,
                marketplaceSource: 1,
                adminUserIds: 1,
                cost: 1,
                currency: 1
            }}
        ]).toArray();

        // Map/format lastRun and decode apiKey
        const itemsWithRunCounts = automations.map(automation => {
            // Owner has full access
            const canEdit = automation.workspaceId === String(currentUser.workspace._id) || 
                           automation.createdBy === String(currentUser._id);
            
            const includeEnvironmentVariables = automation.workspaceId === String(currentUser.workspace._id) || 
                                              automation.createdBy === String(currentUser._id);
            
            const isOwner = automation.workspaceId === String(currentUser.workspace._id) ||
                           automation.createdBy === String(currentUser._id);

            return {
            ...automation,
                environmentVariables: automation.environmentVariables || [],
                canEdit,
                includeEnvironmentVariables,
                isOwner,
            lastRun: automation.lastRun ? formatLastRun(new Date(automation.lastRun)) : 'Never',
            apiKey: decodeKey(automation.apiKey)
            };
        });

        // Get the next cursor (last _id from current results)
        const nextCursor = itemsWithRunCounts.length > 0 
            ? (itemsWithRunCounts[itemsWithRunCounts.length - 1] as any)._id.toString()
            : null;

        // Check if there are more results
        const hasMore = itemsWithRunCounts.length === limit;

        return new Response(JSON.stringify({ 
            items: itemsWithRunCounts,
            total: itemsWithRunCounts.length,
            nextCursor,
            hasMore,
            pageSize: limit
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        // const executionTime = Date.now() - startTime; - COMMENTED OUT
        
        // Log error with performance metrics - COMMENTED OUT
        console.error('Error fetching automations:', {
            error: error instanceof Error ? error.message : error,
            // executionTime, - COMMENTED OUT
            endpoint: '/api/get-all-automations',
            userId: currentUser?._id || 'unknown'
        });
        
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

export async function GET(req: NextRequest) {
    const startTime = Date.now();
    
    const response = new Response(JSON.stringify({ 
        status: 'ok',
        message: 'get-all-automations endpoint is working'
    }), { 
        headers: { 'Content-Type': 'application/json' },
        status: 200
    });

    
    return response;
}