import { NextRequest } from "next/server";
import moment from 'moment';
import { getDb } from "@/lib/db";
import { Db, ObjectId } from "mongodb";
import { pushToSchedulerQueue } from "@/lib/queue";
import authenticationBackend from "../authentication/authentication-backend";

export const runtime = 'nodejs';

async function createJob(db: Db, queueName: string, payload: string, maxRetry?: number) {
    const jobs = db.collection('jobs');
    const op = await jobs.insertOne({
        queueName,
        payload,
        maxRetry,
        progress: 0,
        progressLabel: '',
        err: null,
        createdAt: (new Date())
    });

    return await jobs.findOne({ _id: op.insertedId });
}

export async function POST(req: NextRequest) {
    const url = new URL(req.url);
    const timestamp = url.searchParams.get('timestamp');
    console.log('Received report');

    const db = getDb();

    try {
        if (timestamp) {
            // const now = moment.utc(Number(timestamp) * 1000);
            const now = moment.utc(Number(timestamp));
            if (!now.isValid()) {
                throw new Error('Invalid timestamp');
            }
            const schedules = await db.collection('schedules-v2').estimatedDocumentCount();
            const batchSize = 50;
            const totalBatches = Math.ceil(schedules / batchSize);
            console.log('totalBatches', totalBatches);
            for (let batchNumber = 0; batchNumber < totalBatches; batchNumber++) {
                const job = await createJob(db, process.env.SCHEDULE_QUEUE || 'scheduler-queue', JSON.stringify({
                    skip: batchNumber * batchSize,
                    limit: batchSize,
                    timestampInUtc: now.valueOf()
                }));
                await pushToSchedulerQueue(job);
                console.log(`Pushed batch ${batchNumber + 1} to queue`);
            }

            return new Response('ACK', {
                status: 200
            });
        } else {
            throw new Error('Timestamp is required');
        }
    } catch (error) {
        console.error(error);
        return new Response(JSON.stringify({ error }), {
            headers: { 'Content-Type': 'application/json' },
            status: 500
        });
    }
}

export async function GET(req: NextRequest) {
    try {
        const currentUser = await authenticationBackend.getCurrentUser(req);
        if (!currentUser) {
            return new Response(JSON.stringify({ error: 'Authentication required' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 401
            });
        }

        const db = getDb();
        const url = new URL(req.url);
        const automationId = url.searchParams.get('automationId');
        const search = url.searchParams.get('search');

        // Get user's accessible automations
        const ownAutomations = await db.collection('automations').find({
            workspaceId: String(currentUser.workspace?._id)
        }).toArray();

        const allAutomationIds = ownAutomations.map(a => String(a._id));

        if (allAutomationIds.length === 0) {
            // User has no automations, return empty result
            return new Response(JSON.stringify([]), {
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // Build query based on user's access
        const query: any = {};

        if (automationId) {
            // Filter by specific automation if provided, but only if user has access to it
            if (allAutomationIds.includes(automationId)) {
                query.automationId = automationId;
            } else {
                // User doesn't have access to this automation
                return new Response(JSON.stringify([]), {
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        } else {
            // No specific automation requested, return all user's schedules
            query.automationId = { $in: allAutomationIds };
        }

        const schedules = await db.collection('schedules-v2')
            .find(query)
            .sort({ createdAt: -1 })
            .toArray();

        // Add automation titles to schedules
        const schedulesWithTitles = await Promise.all(
            schedules.map(async (schedule) => {
                let automation = null;
                
                try {
                    // Try to find automation by ObjectId first
                    if (ObjectId.isValid(schedule.automationId)) {
                        automation = await db.collection('automations').findOne({
                            _id: new ObjectId(schedule.automationId)
                        });
                    }
                    
                    // If not found, try as string
                    if (!automation) {
                        automation = await db.collection('automations').findOne({
                            _id: schedule.automationId
                        });
                    }
                } catch (error) {
                    console.error(`Error finding automation for schedule ${schedule._id}:`, error);
                }
                
                return {
                    _id: schedule._id,
                    automationId: schedule.automationId,
                    automationTitle: automation?.title || automation?.name || 'Unknown Automation',
                    cronExpression: schedule.cronExpression,
                    cronExpressionFriendly: schedule.cronExpressionFriendly,
                    mode: schedule.mode,
                    timezone: schedule.timezone,
                    triggerEnabled: automation?.triggerEnabled || false,
                    runtimeEnvironment: schedule.runtimeEnvironment,
                    scheduleDescription: schedule.scheduleDescription,
                    emailNotificationsEnabled: schedule.emailNotificationsEnabled,
                    emailOnCompleted: schedule.emailOnCompleted,
                    emailOnFailed: schedule.emailOnFailed,
                    createdAt: schedule.createdAt,
                    updatedAt: schedule.updatedAt
                };
            })
        );

        // Apply search filter on automation titles and cron expressions if search param exists
        let filteredSchedules = schedulesWithTitles;
        if (search && search.trim()) {
            // Normalize spaces and create flexible pattern to match multiple spaces
            const normalizedSearch = search.trim().replace(/\s+/g, ' ');
            const escapeRegex = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const escapedSearch = escapeRegex(normalizedSearch);
            const flexiblePattern = escapedSearch.replace(/ /g, '\\s+');
            const searchRegex = new RegExp(flexiblePattern, 'i');

            filteredSchedules = schedulesWithTitles.filter(schedule =>
                searchRegex.test(schedule.automationTitle) ||
                searchRegex.test(schedule.cronExpressionFriendly || '')
            );
        }

        return new Response(JSON.stringify(filteredSchedules), {
            headers: { 
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
                'Pragma': 'no-cache',
                'Expires': '0'
            }
        });

    } catch (error) {
        console.error('[Schedules-v2 API] Error fetching schedules:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 500
        });
    }
}