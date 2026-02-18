import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import authenticationBackend from "../../authentication/authentication-backend";
import { Buffer } from 'buffer';
import { decrypt, encrypt } from "@/lib/encryption";
import { versionControl } from "@/lib/mongodb-version-control";

export function isValidObjectId(id: string) {
  return typeof id === 'string' && id.length === 24 && /^[a-fA-F0-9]+$/.test(id);
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        // Validate ObjectId format before proceeding
        if (!isValidObjectId(id)) {
            return new Response(JSON.stringify({ error: 'Invalid automation ID format' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 400
            });
        }

        // Check if this request is from a script runner (internal service)
        // Script runners can be identified by the X-Script-Runner header or by checking if the request
        // comes from the same host as the AUTOMATIONAI_ENDPOINT
        const scriptRunnerHeader = req.headers.get('X-Script-Runner');
        const isScriptRunner = scriptRunnerHeader === 'true';

        // Get runtime environment override from script runner (for schedule/execution-specific env)
        const runtimeEnvironmentOverride = req.headers.get('X-Runtime-Environment') as 'dev' | 'test' | 'production' | null;

        let automation;
        let currentUser: any;
        const db = getDb();

        if (isScriptRunner) {
            // Allow script runners to access any automation by ID
            automation = await db.collection('automations').findOne({
                _id: ObjectId.createFromHexString(id)
            });
            let currentUserId = String(req.headers.get('X-Current-User-Id') || '');
            if (!currentUserId) {
                return new Response(JSON.stringify({ error: 'Current user ID is required' }), {
                    headers: { 'Content-Type': 'application/json' },
                    status: 400
                });
            }
            currentUser = await db.collection('users').findOne({
                _id: ObjectId.createFromHexString(currentUserId)
            });
            const workspace = await db.collection('workspaces').findOne({
                ownerUserId: String(currentUser?._id)
            });
            currentUser.workspace = workspace;

        } else {
            // Regular users need authentication and workspace access
            currentUser = await authenticationBackend.getCurrentUser(req);
            if (!currentUser) {
                return new Response(JSON.stringify({ error: 'Authentication required' }), {
                    headers: { 'Content-Type': 'application/json' },
                    status: 401
                });
            }

            // Check if user owns the automation
            automation = await db.collection('automations').findOne({
                _id: ObjectId.createFromHexString(id),
                workspaceId: String(currentUser?.workspace?._id)
            });
        }

        if (!automation) {
            return new Response(JSON.stringify({ error: 'Automation not found' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 404
            });
        }

        let sharedUserEnvironmentVariables: any[];

        if (isScriptRunner) {
            // Script runner - clear env var values for security
            sharedUserEnvironmentVariables = automation?.environmentVariables || [];
            for (const env of sharedUserEnvironmentVariables || []) {
                // Handle new multi-environment structure
                if (env.value && typeof env.value === 'object') {
                    env.value.dev = '';
                    env.value.test = '';
                    env.value.production = '';
                } else {
                    // Handle Any single value structure (applies to all environments)
                    env.value = '';
                }
            }
            automation.environmentVariables = sharedUserEnvironmentVariables;
        } else {
            // Owner user - only fetch from workspace for env vars without values (first time)
            const workspaceId = automation.workspaceId;
            let workspaceEnvVars: any[] = [];

            if (workspaceId) {
                const workspaceConfig = await db.collection('environment_variables_values').findOne({
                    workspaceId: workspaceId
                });
                workspaceEnvVars = workspaceConfig?.environmentVariables || [];
            } else {
                console.log('No workspaceId found on automation');
            }

            // Process each env var: use local if exists, fetch from workspace if empty (first time)
            const processedEnvVars = (automation?.environmentVariables || []).map((autoEnv: any) => {
                // Check if automation has a value for this env var (null and undefined are treated as no value)
                const hasValue = autoEnv.value !== null && autoEnv.value !== undefined && (
                    (typeof autoEnv.value === 'string' && autoEnv.value !== '') ||
                    (typeof autoEnv.value === 'object' && !Array.isArray(autoEnv.value) &&
                     (autoEnv.value.dev || autoEnv.value.test || autoEnv.value.production))
                );

                if (hasValue) {
                    // Automation has value - use local (decrypt automation's own values)
                    if (typeof autoEnv.value === 'object' && !Array.isArray(autoEnv.value)) {
                        try {
                            if (autoEnv?.value?.dev) autoEnv.value.dev = decrypt(autoEnv.value.dev);
                            if (autoEnv?.value?.test) autoEnv.value.test = decrypt(autoEnv.value.test);
                            if (autoEnv?.value?.production) autoEnv.value.production = decrypt(autoEnv.value.production);
                        } catch (error) {
                            console.error('Error decrypting automation multi-env values:', autoEnv.name, error);
                        }
                    } else if (typeof autoEnv.value === 'string') {
                        try {
                            autoEnv.value = decrypt(autoEnv.value);
                        } catch (error) {
                            console.error('Error decrypting automation env value:', autoEnv.name, error);
                        }
                    }
                    return autoEnv;
                } else {
                    // No value in automation - fetch from workspace (first time for this var)
                    const workspaceEnv = workspaceEnvVars.find((wEnv: any) => wEnv.name === autoEnv.name);

                    if (workspaceEnv) {
                        // Check if workspace env has multi-env structure (value.dev/test/production)
                        if (workspaceEnv.value && typeof workspaceEnv.value === 'object' && !Array.isArray(workspaceEnv.value) &&
                            (workspaceEnv.value.dev !== undefined || workspaceEnv.value.test !== undefined || workspaceEnv.value.production !== undefined)) {
                            // Workspace has multi-env values
                            try {
                                return {
                                    ...autoEnv,
                                    value: {
                                        dev: workspaceEnv.value.dev ? decrypt(workspaceEnv.value.dev) : '',
                                        test: workspaceEnv.value.test ? decrypt(workspaceEnv.value.test) : '',
                                        production: workspaceEnv.value.production ? decrypt(workspaceEnv.value.production) : ''
                                    }
                                };
                            } catch (error) {
                                console.error('Error decrypting workspace multi-env values:', autoEnv.name, error);
                            }
                        } else if (workspaceEnv.value && typeof workspaceEnv.value === 'string') {
                            // Workspace has single "Any" value
                            try {
                                return {
                                    ...autoEnv,
                                    value: decrypt(workspaceEnv.value)
                                };
                            } catch (error) {
                                console.error('Error decrypting workspace single value:', autoEnv.name, error);
                            }
                        }
                    }

                    // No workspace value either - return empty
                    return autoEnv;
                }
            });

            automation.environmentVariables = processedEnvVars;
        }

        // If script runner provides a runtime environment override, convert multi-env to single values
        if (isScriptRunner && runtimeEnvironmentOverride) {
            const effectiveRuntimeEnvironment = runtimeEnvironmentOverride;

            automation.environmentVariables = (automation.environmentVariables || []).map((env: any) => {
                if (env?.value && typeof env?.value === 'object' && !Array.isArray(env?.value)) {
                    // Multi-environment structure - return only the value for the requested environment
                    const specificValue = env?.value[effectiveRuntimeEnvironment] || '';
                    return {
                        ...env,
                        value: specificValue
                    };
                }
                // Single value or already processed - return as is
                return env;
            });
        }

        const workflow = await db.collection('automation_workflows').findOne({ automationId: id });

        return new Response(JSON.stringify({ ...automation, workflow: workflow?.workflow || null }), { headers: { 'Content-Type': 'application/json' } });
    } catch (error) {
        console.error('Error fetching automation:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 500
        });
    }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        if (!isValidObjectId(id)) {
            return new Response(JSON.stringify({ error: 'Invalid automationId' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 400
            });
        }
        const currentUser = await authenticationBackend.getCurrentUser(req);
        if (!currentUser) {
            return new Response(JSON.stringify({ error: 'Authentication required' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 401
            });
        }
        const db = getDb();
        const update = await req.json();

        // Check if user is owner
        const automation = await db.collection('automations').findOne({
            _id: ObjectId.createFromHexString(id),
            workspaceId: String(currentUser?.workspace?._id)
        });

        if (!automation) {
            return new Response(JSON.stringify({ error: 'Automation not found or access denied' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 404
            });
        }


        // Perform the update
        await db.collection('automations').updateOne(
            { _id: ObjectId.createFromHexString(id) },
            { $set: update }
        );

        // If user is re-enabling triggerEnabled, dismiss the schedule_disabled notification
        if (update.triggerEnabled === true && automation) {
            const workspaceId = automation.workspaceId;
            if (workspaceId) {
                await db.collection('execution_limit_notifications').updateMany(
                    {
                        workspaceId: workspaceId,
                        limitType: 'schedule_disabled',
                        dismissed: false
                    },
                    {
                        $set: {
                            dismissed: true,
                            dismissedAt: new Date()
                        }
                    }
                );
            }
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        console.error('Error updating automation:', error);
        return new Response(JSON.stringify({ error: 'Failed to update automation' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 500
        });
    }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // Regenerate API key endpoint: /api/automations/[id]/regenerate-api-key
  const url = req.nextUrl.pathname;
  if (!url.endsWith('/regenerate-api-key')) return NextResponse.next();

  const { id } = await params;
  if (!isValidObjectId(id)) {
    return new Response(JSON.stringify({ error: 'Invalid automationId' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 400
    });
  }
  const currentUser = await authenticationBackend.getCurrentUser(req);
  if (!currentUser) {
    return new Response(JSON.stringify({ error: 'Authentication required' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 401
    });
  }
  const db = getDb();
  const automation = await db.collection('automations').findOne({ _id: ObjectId.createFromHexString(id) });
  if (!automation) {
    return new Response(JSON.stringify({ error: 'Automation not found' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 404
    });
  }
  const isAdmin = Array.isArray(automation.adminUserIds) && automation.adminUserIds.includes(String(currentUser._id));
  if (!isAdmin) {
    return new Response(JSON.stringify({ error: 'Only admins can regenerate the API key' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 403
    });
  }
  const newApiKey = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
  await db.collection('automations').updateOne(
    { _id: ObjectId.createFromHexString(id) },
    { $set: { apiKey: newApiKey } }
  );
  return new Response(JSON.stringify({ apiKey: newApiKey }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        if (!isValidObjectId(id)) {
            return new Response(JSON.stringify({ error: 'Invalid automationId' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 400
            });
        }
        
        const currentUser = await authenticationBackend.getCurrentUser(req);
        if (!currentUser) {
            return new Response(JSON.stringify({ error: 'Authentication required' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 401
            });
        }
        
        const db = getDb();
        
        // Check if user is owner or has admin access
        const automation = await db.collection('automations').findOne({
            _id: ObjectId.createFromHexString(id),
            $or: [
                { workspaceId: String(currentUser?.workspace?._id) },
                { workspaceId: { $exists: false } }
            ]
        });
        
        // Check if user is owner or admin
        const isAdmin = Array.isArray(automation?.adminUserIds) && automation?.adminUserIds.includes(String(currentUser._id));
        
        if (!isAdmin) {
            return new Response(JSON.stringify({ error: 'You do not have permission to delete this automation' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 403
            });
        }
        
        // Create backup of automation before deletion
        const automationBackup = {
            ...automation,
            originalAutomationId: id,
            deletedBy: String(currentUser._id),
            deletedAt: new Date(),
            deletedByEmail: currentUser.email,
            deletedByWorkspace: currentUser.workspace ? String(currentUser.workspace._id) : undefined
        };
        
        // Remove the original _id to avoid conflicts
        delete (automationBackup as any)._id;
        
        // Insert backup into automationsDeleted collection
        await db.collection('automationsDeleted').insertOne(automationBackup);
        
        // Delete the automation
        const result = await db.collection('automations').deleteOne({
            _id: ObjectId.createFromHexString(id)
        });
        
        if (result.deletedCount === 0) {
            return new Response(JSON.stringify({ error: 'Automation not found' }), {
                headers: { 'Content-Type': 'application/json' },
                status: 404
            });
        }
        
        
        // Clean up related schedules
        const scheduleDeleteResult = await db.collection('schedules-v2').deleteMany({
            automationId: id
        });
        // Clean up related chat context
        const chatContextDeleteResult = await db.collection('chatContext').deleteMany({
            automationId: id
        });
        // Clean up related execution history
        const executionHistoryDeleteResult = await db.collection('execution_history').deleteMany({
            automationId: id
        });
        // Clean up related current executions
        const executionsDeleteResult = await db.collection('executions').deleteMany({
            automationId: id
        });
        // Clean up code versions
        try {
            await versionControl.deleteAutomationVersions(id);
        } catch (error) {
            console.error('🗑️ [DELETE /api/automations/[id]] Error deleting code versions:', error);
            // Don't fail the entire deletion if version cleanup fails
        }

        return new Response(JSON.stringify({ success: true, message: 'Automation deleted successfully' }), {
            headers: { 'Content-Type': 'application/json' }
        });
    } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to delete automation' }), {
            headers: { 'Content-Type': 'application/json' },
            status: 500
        });
    }
} 
