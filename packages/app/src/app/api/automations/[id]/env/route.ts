import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { ObjectId } from 'mongodb';
import authenticationBackend from '../../../authentication/authentication-backend';
import { decrypt } from '@/lib/encryption';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await authenticationBackend.getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const db = getDb();
    const automation = await db.collection('automations').findOne({ _id: ObjectId.createFromHexString(id) });
    if (!automation) {
      return NextResponse.json({ error: 'Automation not found' }, { status: 404 });
    }
    const runtimeEnv = automation.runtimeEnvironment || 'dev';
    const environmentVariables :any = await db.collection('environment_variables_values').findOne({ workspaceId: String(automation.workspaceId) });
    const response :any = [];
    for (const envName of body.environmentVariables || []) {
      let environmentVariable :any = automation.environmentVariables.find((e: any) => e.name === envName);
      if (environmentVariable?.value) {
        response.push({
          name: envName,
          value: decrypt(environmentVariable.value)
        });
      }
      else if (environmentVariable?.value && typeof environmentVariable.value === 'object') {
        if (runtimeEnv === 'dev' && environmentVariable?.value?.dev) {
          response.push({
            name: envName,
            value: decrypt(environmentVariable.value.dev)
          });
        } else if (runtimeEnv === 'test' && environmentVariable?.value?.test) {
          response.push({
            name: envName,
            value: decrypt(environmentVariable.value.test)
          });
        } else if (runtimeEnv === 'production' && environmentVariable?.value?.production) {
          response.push({
            name: envName,
            value: decrypt(environmentVariable.value.production)
          });
        }
      }
      else {
        // Not in automation - check workspace
        environmentVariable = environmentVariables.environmentVariables.find((e: any) => e.name === envName);
        // Check if workspace env has multi-env structure (value.dev/test/production)
        if (environmentVariable && environmentVariable.value && typeof environmentVariable.value === 'object' && !Array.isArray(environmentVariable.value) &&
            (environmentVariable.value.dev !== undefined || environmentVariable.value.test !== undefined || environmentVariable.value.production !== undefined)) {
          // Workspace has multi-env values - return full structure
          response.push({
            name: envName,
            value: {
              dev: environmentVariable.value.dev ? decrypt(environmentVariable.value.dev) : '',
              test: environmentVariable.value.test ? decrypt(environmentVariable.value.test) : '',
              production: environmentVariable.value.production ? decrypt(environmentVariable.value.production) : ''
            }
          });
        } else if (environmentVariable && environmentVariable.value && typeof environmentVariable.value === 'string') {
          // Workspace has single "Any" value
          response.push({
            name: envName,
            value: decrypt(environmentVariable.value)
          });
        } else {
          // Not found anywhere
          response.push({
            name: envName,
            value: null
          });
        }
      }
    }
    return NextResponse.json(response);
    
  } catch (error: any) {
    console.error('Error fetching env variable:', error);
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
 
