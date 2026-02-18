import { getDb } from '@/lib/db';
import * as k8s from '@kubernetes/client-node';
import { ObjectId } from 'mongodb';

const kc = new k8s.KubeConfig();

if (process.env.USE_K8S_CONFIG_PATH) {
    kc.loadFromFile(process.env.USE_K8S_CONFIG_PATH);
} else {
    kc.loadFromCluster();
}

const k8sApi = kc.makeApiClient(k8s.CoreV1Api);
const k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);
const k8sBatchApi = kc.makeApiClient(k8s.BatchV1Api);

const PLAYGROUND_ENVS_NS = process.env.NAMESPACE || process.env.KUBERNETES_NAMESPACE || 'turbotic-automationai-test';

async function isEnvironmentActive(exec: any) {
    if (!exec) {
        throw new Error('Execution id is invalid');
    }
    
    if (exec.isEnvActive === false || !exec?.deploymentName) {
        return false;
    }

    try {
        const res = await k8sBatchApi.readNamespacedJob({
            name: exec.deploymentName,
            namespace: PLAYGROUND_ENVS_NS
        });

        if (res) {
            return true;
        }
    } catch (e) {
        console.error(e);
    }

    return false;
}

export async function deleteEnvironment(executionId: string) {
    console.log('Deleting environment for executionId:', executionId);
    const exec: any = await getDb().collection('executions').findOne({ _id: ObjectId.createFromHexString(executionId) });
    if (!exec) {
        throw new Error('exec not found');
    }
    
    const DEPLOYMENT_NAME = exec.deploymentName || `depl-${executionId}`;

    try {
        await k8sBatchApi.deleteNamespacedJob({
            name: DEPLOYMENT_NAME,
            namespace: PLAYGROUND_ENVS_NS
        })
    } catch (e) {
        console.error(e);
    }

    await getDb().collection('executions').updateOne({
        _id: ObjectId.createFromHexString(executionId)
    }, {
        $set: {
            isEnvActive: false
        }
    });
}

export async function runOnEnvironment(executionId: string) {
    console.log('Running on environment...');
    const exec: any = await getDb().collection('executions').findOne({ _id: ObjectId.createFromHexString(executionId) });

    if (!exec) {
        throw new Error('exec not found');
    }

    const environmentActive = await isEnvironmentActive(exec);

    console.log('environmentActive', environmentActive);

    if (environmentActive === false) {
        console.log('Creating environment...');
        const namespaces = await k8sApi.listNamespace();

        let runtimeNamespace = namespaces.items.find((n) => n.metadata?.name === PLAYGROUND_ENVS_NS);
        if (!runtimeNamespace) {
            const res = await k8sApi.createNamespace({
                body: {
                    metadata: {
                        name: PLAYGROUND_ENVS_NS
                    }
                }
            });
    
            runtimeNamespace = res;
        }

        const DEPLOYMENT_NAME = exec.deploymentName || `depl-${executionId}`;

        await getDb().collection('executions').updateOne({
            _id: ObjectId.createFromHexString(executionId)
        }, {
            $set: {
                isEnvActive: true,
                deploymentName: DEPLOYMENT_NAME
            }
        });

        // Determine AUTOMATIONAI_ENDPOINT for script-runner
        // Priority: APP_SERVICE_URL (internal K8s service) > PUBLIC_HOSTNAME > AUTOMATIONAI_ENDPOINT > NEXT_PUBLIC_APP_URL
        let automationAiEndpoint: string;
        if (process.env.APP_SERVICE_URL) {
            // Use internal Kubernetes service URL (preferred for pod-to-pod communication)
            automationAiEndpoint = process.env.APP_SERVICE_URL;
        } else if (process.env.PUBLIC_HOSTNAME) {
            // Use public hostname with protocol
            const protocol = process.env.NEXT_PUBLIC_APP_PROTOCOL || (process.env.PUBLIC_HOSTNAME?.includes('localhost') ? 'http' : 'https');
            automationAiEndpoint = `${protocol}://${process.env.PUBLIC_HOSTNAME}`;
        } else {
            // Fallback to other env vars or default
            automationAiEndpoint = process.env.AUTOMATIONAI_ENDPOINT || process.env.NEXT_PUBLIC_APP_URL || 'http://turbotic-playground-app:3000';
        }

        // Build image pull secrets (only if ACR_SECRET_NAME is set)
        const imagePullSecrets = process.env.ACR_SECRET_NAME ? [
            {
                name: process.env.ACR_SECRET_NAME
            }
        ] : [];

        console.log('[runOnEnvironment] Creating Kubernetes Job:', {
            namespace: PLAYGROUND_ENVS_NS,
            jobName: DEPLOYMENT_NAME,
            image: process.env.SCRIPT_RUNNER_IMAGE || process.env.AUTOMATION_RUNNER_IMAGE || 'automationai-script-runner:latest',
            automationAiEndpoint,
            hasImagePullSecret: imagePullSecrets.length > 0
        });

        try {
            const res = await k8sBatchApi.createNamespacedJob({
                namespace: PLAYGROUND_ENVS_NS,
                body: {
                    apiVersion: 'batch/v1',
                    kind: 'Job',
                    metadata: {
                        name: DEPLOYMENT_NAME
                    },
                    spec: {
                        ttlSecondsAfterFinished: parseInt(process.env.JOB_TTL_SECONDS || '300'), // Keep for 5 minutes by default for debugging
                        template: {
                            spec: {
                                restartPolicy: 'Never',
                                automountServiceAccountToken: false,
                                enableServiceLinks: false,
                                ...(imagePullSecrets.length > 0 && { imagePullSecrets }),
                                nodeSelector: process.env.RUNNER_NODE_POOL_LABEL_VALUE ? {
                                    nodepool: process.env.RUNNER_NODE_POOL_LABEL_VALUE
                                } : {},
                                tolerations: process.env.RUNNER_NODE_TARGET ? [
                                    {
                                        key: 'target',
                                        operator: 'Equal',
                                        value: process.env.RUNNER_NODE_TARGET,
                                        effect: 'NoSchedule'
                                    }  
                                ] : [],
                                containers: [
                                    {
                                        name: DEPLOYMENT_NAME,
                                        image: process.env.SCRIPT_RUNNER_IMAGE || process.env.AUTOMATION_RUNNER_IMAGE || 'automationai-script-runner:latest',
                                        // For local Docker Desktop, use 'Never' to force local images
                                        // For production with registry, use 'IfNotPresent' or 'Always'
                                        imagePullPolicy: process.env.IMAGE_PULL_POLICY || 'Never',
                                        env: [
                                            {
                                                name: 'AUTOMATIONAI_ENDPOINT',
                                                value: automationAiEndpoint
                                            },
                                            {
                                                name: 'AUTOMATION_ID',
                                                value: exec.automationId
                                            },
                                            {
                                                name: 'EXECUTION_ID',
                                                value: executionId
                                            },
                                            {
                                                name: 'RABBIT_MQ_ENDPOINT',
                                                value: process.env.RABBIT_MQ_ENDPOINT
                                            },
                                            {
                                                name : 'ENABLE_VECTOR_SEARCH',
                                                value : process.env.ENABLE_VECTOR_SEARCH || 'false'
                                            }
                                        ],
                                        resources: {
                                            limits: {
                                                cpu: '500m',
                                                memory: process.env.SCRIPT_RUNNER_MEMORY_LIMIT || '3Gi'
                                            },
                                            requests: {
                                                cpu: '100m',
                                                memory: '0.3Gi'
                                            }
                                        }
                                    }
                                ]
                            }
                        }
                    }
                }
            });

            console.log('[runOnEnvironment] Job created successfully:', {
                jobName: DEPLOYMENT_NAME,
                namespace: PLAYGROUND_ENVS_NS,
                jobUid: res.metadata?.uid
            });
        } catch (error: any) {
            console.error('[runOnEnvironment] Failed to create Job:', {
                error: error.message,
                statusCode: error.statusCode,
                body: error.body,
                jobName: DEPLOYMENT_NAME,
                namespace: PLAYGROUND_ENVS_NS
            });
            throw error;
        }
    }
}