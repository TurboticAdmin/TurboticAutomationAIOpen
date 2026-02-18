#!/usr/bin/env node

import commandLineArgs from 'command-line-args';
import path from 'path';
import fs from 'fs';
import { Worker } from 'worker_threads';

type Step = {
    stepId?: string
    title: string
    fileName: string
    icon?: string
    vendorIcon?: string
    status: 'pending' | 'running' | 'completed' | 'errored'
    error?: string
}

export type Metadata = {
    steps: Array<Step>
}

export type RunToken = {
    _id?: any
    executionId?: string
    createdAt: Date
    temporaryRunTokenId?: string
    progress: {
        steps: Array<Step>
    }
    context: any
}

let AUTOMATION_API_BASE_URL = '';
let EXECUTION_ID = '';
let ONE_RUN: boolean = false;
let FROM_STEP: string | undefined = undefined;
let TEMP_TOKEN_ID: string | undefined = undefined;

async function createToken(payload: RunToken) {
    delete payload._id;
    const response = await fetch(`${AUTOMATION_API_BASE_URL}/api/workflows-v3`, {
        method: 'POST',
        body: JSON.stringify({
            action: 'create',
            payload
        }),
        headers: {
            'Content-Type': 'application/json'
        }
    });

    const data = await response.json();

    if (!data.success) {
        throw new Error(data.error);
    }

    return data.result;
}

async function getToken(runId: string) {
    const response = await fetch(`${AUTOMATION_API_BASE_URL}/api/workflows-v3`, {
        method: 'POST',
        body: JSON.stringify({
            action: 'get',
            payload: { runId }
        }),
        headers: {
            'Content-Type': 'application/json'
        }
    });

    const data = await response.json();
    return data.result;
}

async function updateProgress(runId: string, payload: any, status: string) {
    const response = await fetch(`${AUTOMATION_API_BASE_URL}/api/workflows-v3`, {
        method: 'PUT',
        body: JSON.stringify({
            action: 'update',
            payload: { runId, progress: payload.progress, context: payload.context, executionId: EXECUTION_ID, status, temporaryRunTokenId: TEMP_TOKEN_ID }
        }),
        headers: {
            'Content-Type': 'application/json'
        }
    });

    const data = await response.json();

    if (!data.success) {
        throw new Error(data.error);
    }

    return data.result;
}

async function runFile(currentContext: any, scriptPath: string, updateContext: (key: string, value: any) => void) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(scriptPath, {
            env: {
                ...process.env,
                HYDRATED_CONTEXT: JSON.stringify(currentContext)
            }
        });
        worker.on('message', (msg) => {
            switch (msg?.type) {
                case 'setContext': {
                    const { key, value } = msg;
                    updateContext(key, value);
                    break;
                }
            }
        });

        worker.on('error', reject);
        worker.on('exit', (code) => {
            if (code !== 0) {
                reject({
                    message: `File ${path.basename(scriptPath)} exited with code ${code}`,
                    code
                });
            } else {
                resolve(code);
            }
        });
    });
}

export async function run(tokenId?: string, executionId?: string): Promise<RunToken> {
    let token: RunToken = {
        executionId,
        temporaryRunTokenId: TEMP_TOKEN_ID,
        createdAt: new Date(),
        progress: {
            steps: []
        },
        context: {}
    }

    if (tokenId) {
        token = await getToken(tokenId) as RunToken;
    }

    if (!tokenId) {
        token = await createToken(token);
    }

    tokenId = String(token._id);

    const cwd = process.cwd();
    const metadataPath = path.join(cwd, 'metadata.json');

    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8')) as Metadata;
    
    token.progress.steps = metadata.steps.map((step, index: number) => {
        const existingStep = token.progress.steps[index]
        return {
            ...step,
            status: 'pending',
            ...(existingStep || {})
        }
    })

    let finalStatus = 'completed'

    let startedRun = false;
    let runOneCompleted = false;

    for (const step of token.progress.steps) {
        const stepPath = path.join(cwd, step.fileName);

        if (runOneCompleted === true) {
            step.status = 'pending';

            await updateProgress(tokenId, token, 'running');
            continue;
        }

        if (startedRun === false && step.status === 'completed' && FROM_STEP !== step.stepId) {
            if (!FROM_STEP) {
                console.log(`Skipping step ${step.title}: Already completed`);
            }
            continue;
        }

        try {
            startedRun = true;
            step.status = 'running';

            await updateProgress(tokenId, token, 'running');

            await runFile(token.context || {}, stepPath, (key, value) => {
                if (!token.context) {
                    token.context = {};
                }

                token.context[key] = value;
            });

            step.status = 'completed';

            await updateProgress(tokenId, token, 'running');
        } catch (e: any) {
            console.error(new Error(e.message));
            step.status = 'errored';
            step.error = e.message;

            await updateProgress(tokenId, token, 'errored');
            finalStatus = 'errored';

            process.exit(e?.code || 1);
            break;
        } finally {
            if (ONE_RUN === true) {
                if (!FROM_STEP || FROM_STEP === step.stepId) {
                    runOneCompleted = true;
                }
            }
        }
    }

    await updateProgress(tokenId, token, finalStatus);

    return token;
}

const optionDefinitions = [
    { name: 'action', alias: 'a', type: String },
    { name: 'token', alias: 't', type: String, optional: true },
    { name: 'execution', alias: 'e', type: String, optional: true },
    { name: 'url', alias: 'u', type: String, optional: true },
    { name: 'one', alias: 'o', type: Boolean, optional: true },
    { name: 'fromStep', alias: 's', type: String, optional: true },
    { name: 'tempTokenId', alias: 'r', type: String, optional: true }
];

const options = commandLineArgs(optionDefinitions);

if (options.url) {
    AUTOMATION_API_BASE_URL = options.url;
} else {
    throw new Error('URL is required');
}

if (options?.one === true) {
    ONE_RUN = options.one;
}

if (options?.fromStep) {
    FROM_STEP = options.fromStep;
}

if (options?.tempTokenId) {
    TEMP_TOKEN_ID = options.tempTokenId;
}

if (options.execution) {
    EXECUTION_ID = options.execution;
} else {
    throw new Error('Execution ID is required');
}

if (options.action === 'run') {
    run(undefined, options.execution).then((token) => {
        console.log('Done');
    })
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })

} else if (options.action === 'resume') {
    if (!options.token) {
        console.error('Token is required');
        process.exit(1);
    }

    run(options.token, options.execution).then((token) => {
        console.log('Done');
    })
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
}
