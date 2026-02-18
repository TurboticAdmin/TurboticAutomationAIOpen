import { getDb } from "@/lib/db";
import { NextRequest } from "next/server";
import { triggerRun } from "@/lib/queue";
import { runOnEnvironment } from "./run-on-environment";
import { ObjectId } from "mongodb";
import authenticationBackend from "../../authentication/authentication-backend";
import createExecutionHistory from "@/app/extensions/execution-history";
import Joi from 'joi';
import { generateWorkflow } from "@/lib/game";
import { emailValidator } from "@/lib/email-validation";
// Removed execution tracking imports - using direct notification sending

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
    const { dId, automationId, isScheduled = false, resume, runTokenId, runFromStepId, runOne, temporaryRunTokenId, scheduleRuntimeEnvironment, runtimeEnvironment } = await req.json();

    const schema = Joi.object({
        automationId: Joi.string().alphanum().min(3).max(25).required(),
        dId: Joi.string().alphanum().min(3).max(25).required()
    });

    const { error, value } = schema.validate({ automationId, dId });
    if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { 'Content-Type': 'application/json' },
            status: 400
        });
    }

    // Fetch automation early to calculate effective runtime environment
    const automation = await getDb().collection('automations').findOne({
        _id: ObjectId.createFromHexString(automationId)
    });

    // Calculate effective runtime environment for this execution
    // Priority: manual override > schedule override > automation default > 'dev'
    const effectiveRuntimeEnvironment = runtimeEnvironment || scheduleRuntimeEnvironment || automation?.runtimeEnvironment || 'dev';

    const existingExecutionHistory = await getDb().collection('execution_history').findOne({
        automationId,
        deviceId: dId,
        status: { $in: ['queued', 'running'] }
    });

    if (existingExecutionHistory) {
        // Use current runtime environment (allows changing env even for existing executions)
        const workflow = await generateWorkflow(automationId, undefined, effectiveRuntimeEnvironment);
        if (process.env['DISABLE_ENV_CREATION'] === 'true') {
            // Do nothing
            console.log('Skipping env creation');
        } else {
            await runOnEnvironment(String(existingExecutionHistory.executionId));
        }

        await triggerRun(String(existingExecutionHistory.executionId), resume, runTokenId, undefined, runFromStepId, runOne, temporaryRunTokenId);

        return new Response(JSON.stringify({
            executionId: String(existingExecutionHistory.executionId),
            workflow
        }), {
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    if (!automationId) {
        throw new Error('automationId is required')
    }

    if (!dId) {
        throw new Error('dId is required')
    }

    // Get current user for execution history
    const currentUser = await authenticationBackend.getCurrentUser(req);

    // Check user code execution capability
    if (currentUser?.email) {
        const capabilities = await emailValidator.getUserCapabilities(currentUser.email);
        if (!capabilities.canRunCode) {
            return new Response(JSON.stringify({ error: 'Code execution capability is disabled for your account' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 403
            });
        }
    }

    // Subscription limits removed for open source

    // Log runtime environment calculation (automation already fetched earlier)
    console.log('[POST Executions] Runtime environment:', {
        manualOverride: runtimeEnvironment,
        scheduleOverride: scheduleRuntimeEnvironment,
        automationDefault: automation?.runtimeEnvironment,
        effective: effectiveRuntimeEnvironment
    });

    // Generate workflow with effective runtime environment
    const workflow = await generateWorkflow(automationId, undefined, effectiveRuntimeEnvironment);

    // For scheduled executions, get user info from automation's workspace
    let scheduledUserInfo = null;
    if (isScheduled && !currentUser && automation) {
        try {
            const workspace = await getDb().collection('workspaces').findOne({
                _id: ObjectId.createFromHexString(automation.workspaceId)
            });

            if (workspace) {
                const user = await getDb().collection('users').findOne({
                    _id: ObjectId.createFromHexString(workspace.ownerUserId)
                });

                if (user) {
                    scheduledUserInfo = {
                        _id: user._id,
                        email: user.email,
                        name: user.name || user.email
                    };
                    console.log('[POST Executions] Scheduled execution user info:', scheduledUserInfo);
                }
            }
        } catch (error) {
            console.error('[POST Executions] Error fetching scheduled user info:', error);
        }
    }

    let execution: any = await getDb().collection('executions').findOne({
        deviceId: dId,
        automationId
    });

    if (!execution) {
        const res = await getDb().collection('executions').insertOne({
            deviceId: dId,
            automationId
        });

        execution = await getDb().collection('executions').findOne({
            _id: res.insertedId
        });
    } else {
        await getDb().collection('executions').updateOne({
            _id: execution._id
        }, {
            $set: {
                screenshots: []
            }
        });
    }

    // Create execution history
    console.log('[POST Executions] Creating execution history for executionId:', String(execution._id));
    
    // Use scheduled user info if available, otherwise fall back to current user or defaults
    const effectiveUser = scheduledUserInfo || currentUser;
    const historyResult = await createExecutionHistory({
        executionId: String(execution._id),
        automationId,
        deviceId: String(dId),
        status: 'queued',
        createdAt: new Date(),
        startedAt: new Date(), // Set startedAt to current time when execution is triggered
        endedAt: null,
        durationInMs:null,
        duration: null,
        userId: effectiveUser?._id || null,
        userEmail: effectiveUser?.email || null,
        userName: effectiveUser?.name || effectiveUser?.email || (isScheduled ? 'Scheduled Execution' : 'Unknown User'),
        cancelRequested: false,
        isScheduled: isScheduled,
        runtimeEnvironment: effectiveRuntimeEnvironment // Store runtime environment
    });
    console.log('[POST Executions] Execution history created:', historyResult.executionHistoryId);

    // Delete all old logs
    await getDb().collection('execution_logs').deleteMany({
        executionId: String(execution._id)
    });

    if (process.env['DISABLE_ENV_CREATION'] === 'true') {
        // Do nothing
        console.log('Skipping env creation');
    } else {
        await runOnEnvironment(String(execution._id));
    }

    const payload: any = {
        executionId: String(execution._id),
        logs: [
            'clear',
            'Triggered execution'
        ],
        createdAt: new Date()
    }

    const op = await getDb().collection('execution_logs').insertOne(payload);

    // No execution tracking needed - notifications sent directly on completion
    if (isScheduled) {
        console.log(`[POST Executions] Scheduled execution ${String(execution._id)} - notifications will be sent on completion`);
    } else {
        console.log(`[POST Executions] Non-scheduled execution ${String(execution._id)} - no notifications needed`);
    }

    await triggerRun(String(execution._id), resume, runTokenId, undefined, runFromStepId, runOne, temporaryRunTokenId);

    // Subscription tracking removed for open source

    return new Response(JSON.stringify({
        executionId: String(execution._id),
        workflow
    }), {
        headers: {
            'Content-Type': 'application/json'
        }
    });
}

// --- New: PATCH handler for execution_history ---
export async function PATCH(req: NextRequest) {
    console.log('🔧 [PATCH Executions] PATCH endpoint called');
    
    const body = await req.json();
    console.log('PATCH request body:', body);
    
    const { historyId, status, exitCode, errorMessage } = body;

    if (!historyId) {
        console.log('No historyId provided');
        return new Response("historyId is required", {
            status: 400
        });
    }

    console.log('Updating execution_history with:', { historyId, status, exitCode, errorMessage });

    const updateData: any = {};
    if (status) {
        updateData.status = status;
    }
    if (exitCode !== undefined) {
        updateData.exitCode = exitCode;
    }
    if (errorMessage !== undefined) {
        updateData.errorMessage = errorMessage;
    }
    if (status === 'completed' || status === 'failed') {
        updateData.endedAt = new Date();
        // Calculate duration if we have start time
        const history = await getDb().collection('execution_history').findOne({
            _id: ObjectId.createFromHexString(historyId)
        });
        if (history?.startedAt) {
            try {
                const startTime = history.startedAt instanceof Date ? history.startedAt : new Date(history.startedAt);
                if (!isNaN(startTime.getTime())) {
                    const endTime = new Date();
                    const durationMs = endTime.getTime() - startTime.getTime();
                    updateData.duration = durationMs;
                }
            } catch (error) {
                console.warn('Failed to calculate duration:', error);
            }
        }
        
        // Notifications are handled in execution-history PUT endpoint
        console.log(`[Run Executions] Execution ${history?.executionId} completed with status ${status} - notifications handled by execution-history endpoint`);
        
        // Note: isEnvActive should remain true as long as the runner (pod) is still running
        // It will be set to false only when the pod is terminated or the runner is cleaned up
        // This allows for proper reuse of active runners
        console.log(`🔚 [Run Executions] Execution ${history?.executionId} completed/failed, but runner may still be active for reuse`);
    }
    
    console.log('Update data:', updateData);
    
    // Update execution_history
    await getDb().collection('execution_history').updateOne(
        { _id: ObjectId.createFromHexString(historyId) },
        { $set: updateData }
    );
    
    console.log('Execution history updated successfully');
    
    // Update schedule_executions lastScriptUpdate timestamp (script status is fetched from execution_history)
    try {
        const history = await getDb().collection('execution_history').findOne({
            _id: ObjectId.createFromHexString(historyId)
        });
        
        if (history && history.scheduleId && history.executionId) {
            // Check if we recently updated this schedule execution to prevent duplicate updates
            const existingSchedule = await getDb().collection('schedule_executions').findOne({
                executionId: history.executionId
            });
            
            const now = new Date();
            const recentlyUpdated = existingSchedule?.lastScriptUpdate && 
                (now.getTime() - existingSchedule.lastScriptUpdate.getTime()) < 5000; // 5 seconds
            
            if (!recentlyUpdated) {
                console.log('Updating schedule_executions lastScriptUpdate timestamp');
            
            await getDb().collection('schedule_executions').updateOne(
                { executionId: history.executionId },
                    { $set: { lastScriptUpdate: now } }
            );
            
            console.log('Schedule execution timestamp updated successfully');
            } else {
                console.log('Skipping schedule_executions update - recently updated');
            }
        }
    } catch (error) {
        console.error('Error updating schedule_executions timestamp:', error);
        // Don't fail the main update if schedule update fails
    }
    
    return new Response(JSON.stringify({ success: true }), {
        headers: {
            'Content-Type': 'application/json'
        }
    });
}

export async function DELETE(req: NextRequest) {
    try {
        const { historyId } = await req.json();
        if (!historyId) {
            return new Response(JSON.stringify({ error: 'Missing historyId' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        const db = getDb();
        // Find the execution history record
        const history = await db.collection('execution_history').findOne({ _id: ObjectId.createFromHexString(historyId) });
        if (!history) {
            return new Response(JSON.stringify({ error: 'Execution history not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }
        // Mark the execution as stopped
        await db.collection('execution_history').updateOne(
            { _id: ObjectId.createFromHexString(historyId) },
            { $set: { status: 'stopped', endedAt: new Date() } }
        );
        // Optionally, send a stop message to the runner queue
        if (history.executionId) {
            // const { sendStopMessage } = require('@/lib/queue.cjs');
            // await sendStopMessage(history.executionId);
        }
        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error in DELETE /api/run/executions:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

export async function GET(req: NextRequest) {
    const currentUser = await authenticationBackend.getCurrentUser(req);
    const limit = parseInt(req.nextUrl.searchParams.get('limit') || '10');
    const offset = parseInt(req.nextUrl.searchParams.get('offset') || '0');
    const automationId = req.nextUrl.searchParams.get('automationId');
    const automationIds = req.nextUrl.searchParams.get('automationIds'); // New: support multiple automation IDs
    const deviceId = req.nextUrl.searchParams.get('deviceId');
    const status = req.nextUrl.searchParams.get('status');
    const startDate = req.nextUrl.searchParams.get('startDate');
    const endDate = req.nextUrl.searchParams.get('endDate');
    const countOnly = req.nextUrl.searchParams.get('countOnly') === 'true';
    const search = req.nextUrl.searchParams.get('search');

    // Helper function to escape regex special characters
    const escapeRegex = (str: string) => {
        return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    };

    // Helper function to build search conditions - search for text that contains the search query (case-insensitive)
    const buildSearchConditions = (searchText: string) => {
        const trimmed = searchText.trim();
        if (!trimmed) return null;

        // Normalize spaces: replace multiple spaces with \s+ to match any whitespace
        const normalized = trimmed.replace(/\s+/g, ' ');

        // Escape the search text for regex to handle special characters
        const escaped = escapeRegex(normalized);

        // Replace single spaces with \s+ to match multiple spaces/whitespace in the database
        const flexiblePattern = escaped.replace(/ /g, '\\s+');

        // Map common status search terms to database values
        const mapStatusTerm = (term: string): string[] | null => {
            const lower = term.toLowerCase();
            if (lower === 'success' || lower === 'completed') {
                return ['completed', 'success'];
            } else if (lower === 'failed' || lower === 'error' || lower === 'errored') {
                return ['failed', 'errored', 'error'];
            } else if (lower === 'running' || lower === 'queued') {
                return ['running', 'queued'];
            } else if (lower === 'stopped' || lower === 'cancelled') {
                return ['stopped', 'cancelled'];
            }
            // Return null for non-status terms - don't search in status field
            return null;
        };

        const statusTerms = mapStatusTerm(trimmed);

        // Search for the text anywhere in each field (case-insensitive)
        // This will match if the search query is contained within the field text
        // Using flexible pattern that matches multiple spaces/whitespace
        const searchFields = [
            { automationTitle: { $regex: flexiblePattern, $options: 'i' } },
            { userName: { $regex: flexiblePattern, $options: 'i' } },
            { errorMessage: { $regex: flexiblePattern, $options: 'i' } },
            { executionId: { $regex: flexiblePattern, $options: 'i' } },
            { automationId: { $regex: flexiblePattern, $options: 'i' } }
        ] as any[];

        // Only add status field search if it's a status-related term
        if (statusTerms) {
            searchFields.push({ status: { $in: statusTerms } });
        }

        return { $or: searchFields };
    };

    const query: any = {};
    
    // If specific automationId is requested, validate it belongs to the user's workspace or is shared with them
    if (automationId) {
        // First check if the automation belongs to the user's workspace or is shared with them
        let automation = null;
        try {
            if (ObjectId.isValid(automationId)) {
                automation = await getDb().collection('automations').findOne({
                    _id: ObjectId.createFromHexString(automationId)
                }, { projection: { _id: 1, workspaceId: 1 } });
            } else {
                automation = await getDb().collection('automations').findOne({
                    _id: automationId as any
                }, { projection: { _id: 1, workspaceId: 1 } });
            }
        } catch (e) {
            console.error('Error finding automation:', e);
        }
        
        if (!automation) {
            return new Response(JSON.stringify({ error: 'Automation not found' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 404
            });
        }
        
        // Check if user has access to this automation (owner only)
        if (currentUser?.workspace) {
            const isOwner = automation.workspaceId === String(currentUser.workspace._id);

            if (!isOwner) {
                return new Response(JSON.stringify({ error: 'Access denied' }), {
                    headers: { 'Content-Type': 'application/json' },
                    status: 403
                });
            }
        }
        
        query.automationId = automationId;
    } else if (automationIds) {
        // Handle multiple automation IDs (comma-separated)
        const idArray = automationIds.split(',').map(id => id.trim()).filter(id => id);

        // Validate that user has access to all requested automations
        if (currentUser?.workspace) {
            // Get user's own automations
            const ownAutomations = await getDb().collection('automations').find({
                workspaceId: String(currentUser.workspace._id),
                _id: { $in: idArray.map(id => ObjectId.isValid(id) ? ObjectId.createFromHexString(id) : id as any) }
            }, { projection: { _id: 1 } }).toArray();

            // Use only owned automations
            const accessibleIds = ownAutomations.map(a => String(a._id));

            if (accessibleIds.length > 0) {
                query.automationId = { $in: accessibleIds };
            } else {
                // User has no access to any of the requested automations
                return new Response(JSON.stringify([]), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        } else {
            // No workspace - filter by requested IDs but ensure they're accessible
            query.automationId = { $in: idArray };
        }
    } else {
        // If no specific automationId or automationIds, filter by user's accessible automations
        if (currentUser?.workspace) {
            // Get user's own automations with projection
            const ownAutomations = await getDb().collection('automations').find({
                workspaceId: String(currentUser.workspace._id)
            }, { projection: { _id: 1 } }).toArray();

            // Use only owned automations
            const allAutomationIds = ownAutomations.map(a => String(a._id));

            if (allAutomationIds.length > 0) {
                query.automationId = { $in: allAutomationIds };
            } else {
                // User has no automations, return empty result
                return new Response(JSON.stringify([]), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        } else {
            // User has no workspace, show executions for automations without workspaceId
            // This allows access to global/public automations
            const globalAutomations = await getDb().collection('automations').find({
                $or: [
                    { workspaceId: { $exists: false } },
                    { workspaceId: null }
                ]
            }, { projection: { _id: 1 } }).toArray();
            
            const globalAutomationIds = globalAutomations.map(a => String(a._id));
            
            if (globalAutomationIds.length > 0) {
                query.automationId = { $in: globalAutomationIds };
            }
            // If no global automations exist, query will be empty and return all executions
        }
    }
    
    if (deviceId) {
        query.deviceId = deviceId;
    }

    // Add status filtering - handle multiple statuses (comma-separated)
    if (status) {
        // Split comma-separated statuses
        const statusArray = status.split(',').map(s => s.trim()).filter(s => s.length > 0);
        
        if (statusArray.length > 0) {
            // Map frontend status values to database status values
            const mappedStatuses: string[] = [];
            
            for (const statusValue of statusArray) {
                if (statusValue === 'success') {
                    mappedStatuses.push('completed');
                } else if (statusValue === 'failed') {
                    mappedStatuses.push('failed', 'errored', 'error');
                } else if (statusValue === 'running') {
                    mappedStatuses.push('running', 'queued');
                } else if (statusValue === 'stopped') {
                    mappedStatuses.push('stopped', 'cancelled');
                } else {
                    // For unknown statuses, use as-is
                    mappedStatuses.push(statusValue);
                }
            }
            
            // Remove duplicates
            const uniqueStatuses = [...new Set(mappedStatuses)];
            
            if (uniqueStatuses.length === 1) {
                query.status = uniqueStatuses[0];
            } else {
                query.status = { $in: uniqueStatuses };
            }
        }
    }

    // Add date filtering
    if (startDate && endDate) {
        const startDateTime = new Date(startDate + 'T00:00:00.000Z');
        const endDateTime = new Date(endDate + 'T23:59:59.999Z');
        query.createdAt = {
            $gte: startDateTime,
            $lte: endDateTime
        };
    }

    // Filter to only show executions run by the current user
    if (currentUser?._id) {
        query.userId = ObjectId.createFromHexString(String(currentUser._id));
    }

    // If only count is requested, return the count
    if (countOnly) {
        // If search is provided, we need to use aggregation to search in joined fields
        if (search && search.trim()) {
            const searchConditions = buildSearchConditions(search);
            if (!searchConditions) {
                const count = await getDb().collection('execution_history').countDocuments(query);
                return new Response(JSON.stringify({ count }), {
                    headers: {
                        'Content-Type': 'application/json'
                    }
                });
            }
            
            const countPipeline = [
                { $match: query },
                {
                    $lookup: {
                        from: 'automations',
                        let: { automationId: '$automationId' },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $eq: ['$_id', { $toObjectId: '$$automationId' }]
                                    }
                                }
                            },
                            { $project: { title: 1 } }
                        ],
                        as: 'automation'
                    }
                },
                {
                    $lookup: {
                        from: 'users',
                        localField: 'userId',
                        foreignField: '_id',
                        as: 'user',
                        pipeline: [
                            { $project: { name: 1, email: 1 } }
                        ]
                    }
                },
                {
                    $addFields: {
                        automationTitle: { $arrayElemAt: ['$automation.title', 0] },
                        userName: {
                            $cond: {
                                if: { $gt: [{ $size: '$user' }, 0] },
                                then: {
                                    $ifNull: [
                                        { $arrayElemAt: ['$user.name', 0] },
                                        { $arrayElemAt: ['$user.email', 0] }
                                    ]
                                },
                                else: 'Unknown User'
                            }
                        }
                    }
                },
                {
                    $match: searchConditions
                },
                { $count: 'count' }
            ];
            const countResult = await getDb().collection('execution_history').aggregate(countPipeline).toArray();
            const count = countResult.length > 0 ? countResult[0].count : 0;
            return new Response(JSON.stringify({ count }), {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        } else {
            const count = await getDb().collection('execution_history').countDocuments(query);
            return new Response(JSON.stringify({ count }), {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
        }
    }


    // Use aggregation pipeline to join with automations and users in a single query
    const pipeline = [
        { $match: query },
        {
            $lookup: {
                from: 'automations',
                let: { automationId: '$automationId' },
                pipeline: [
                    {
                        $match: {
                            $expr: {
                                $eq: ['$_id', { $toObjectId: '$$automationId' }]
                            }
                        }
                    },
                    { $project: { title: 1 } }
                ],
                as: 'automation'
            }
        },
        {
            $lookup: {
                from: 'users',
                localField: 'userId',
                foreignField: '_id',
                as: 'user',
                pipeline: [
                    { $project: { name: 1, email: 1 } }
                ]
            }
        },
        {
            $addFields: {
                automationTitle: { $arrayElemAt: ['$automation.title', 0] },
                userName: {
                    $cond: {
                        if: { $gt: [{ $size: '$user' }, 0] },
                        then: {
                            $ifNull: [
                                { $arrayElemAt: ['$user.name', 0] },
                                { $arrayElemAt: ['$user.email', 0] }
                            ]
                        },
                        else: 'Unknown User'
                    }
                }
            }
        },
        // Apply search filter after lookup to search in joined fields
        ...(search && search.trim() ? (() => {
            const searchConditions = buildSearchConditions(search);
            return searchConditions ? [{ $match: searchConditions }] : [];
        })() : []),
        { $sort: { createdAt: -1, _id: -1 } },
        { $skip: offset },
        { $limit: limit },
        {
            $project: {
                _id: 1,
                automationId: 1,
                automationTitle: 1,
                userId: 1,
                userName: 1,
                status: 1,
                startedAt: 1,
                endedAt: 1,
                duration: 1,
                exitCode: 1,
                errorMessage: 1,
                executionId: 1
            }
        }
    ];

    const executions = await getDb().collection('execution_history').aggregate(pipeline).toArray();

    // Transform the results to match the expected format
    const executionsWithDetails = executions.map(execution => {
        // Map status values to new terminology
        let mappedStatus = execution.status || 'unknown';
        if (mappedStatus === 'completed') {
            mappedStatus = 'success';
        } else if (['errored', 'error'].includes(mappedStatus)) {
            mappedStatus = 'failed';
        }

        return {
            id: execution._id,
            automationId: execution.automationId,
            automationTitle: execution.automationTitle || 'Untitled Automation',
            userId: execution.userId || null,
            userName: execution.userName || 'Unknown User',
            status: mappedStatus,
            startedAt: execution.startedAt || null,
            endedAt: execution.endedAt || null,
            duration: execution.duration || null,
            exitCode: execution.exitCode || null,
            errorMessage: execution.errorMessage || null,
            executionId: execution.executionId || null
        };
    });

    return new Response(JSON.stringify(executionsWithDetails), {
        headers: {
            'Content-Type': 'application/json'
        }
    });
}


