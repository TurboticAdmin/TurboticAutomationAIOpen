import amqp from 'amqplib';

let channel: amqp.Channel | null;
let connection: amqp.ChannelModel | null;

async function establishConnection(force: boolean = false) {
    const RABBIT_MQ_ENDPOINT = process.env['RABBIT_MQ_ENDPOINT'];

    if (!RABBIT_MQ_ENDPOINT) {
        throw new Error('RABBIT_MQ_ENDPOINT is required');
    }

    if (force === true) {
        if (channel) {
            await channel.close();
            channel = null;
        }

        if (connection) {
            connection.close();
            connection = null;
        }
    }

    if (!connection) {
        connection = await amqp.connect(RABBIT_MQ_ENDPOINT);
        console.log('Connected to queue');
    } else {
        console.log('Using existing queue connection');
    }

    if (!channel) {
        channel = await connection.createChannel();
        console.log('Connected to channel');    
    } else {
        console.log('Using existing channel');
    }
}

const SCHEDULE_QUEUE = process.env.SCHEDULE_QUEUE || 'scheduler-queue';

export async function pushToSchedulerQueue(payload: any, attempt: number = 1, force: boolean = false) {
    try {
        await establishConnection(force);
    } catch (e) {
        console.error(e);
        throw new Error('Job could not be processed. Could not establish connection to queue manager.')
    }

    if (!channel) {
        throw new Error('channel not found');
    }

    try {
        await channel.assertQueue(SCHEDULE_QUEUE, {
            durable: true
        });

        const success = channel.sendToQueue(SCHEDULE_QUEUE, Buffer.from(JSON.stringify(payload)), {
            persistent: true
        });

        if (success === false) {
            throw new Error('Send to queue not success');
        }

        return true;
    } catch (e) {
        if (attempt < 2) {
            await pushToSchedulerQueue(payload, attempt + 1, true);
        }
    }

    return false;
}

export async function pushToQueue(queueName: string, payload: any, attempt: number = 1, force: boolean = false) {
    try {
        await establishConnection(force);
    } catch (e) {
        console.error(e);
        throw new Error('Job could not be processed. Could not establish connection to queue manager.')
    }

    if (!channel) {
        throw new Error('channel not found');
    }

    try {
        await channel.assertQueue(queueName, {
            durable: true,
            expires: 60000,
            maxLength: 1,
            arguments: {
                'x-overflow': 'drop-head'
            }
        });

        const success = channel.sendToQueue(queueName, Buffer.from(JSON.stringify(payload)), {
            persistent: true
        });

        if (success === false) {
            throw new Error('Send to queue not success');
        }

        return true;
    } catch (e) {
        if (attempt < 2) {
            await pushToQueue(queueName, payload, attempt + 1, true);
        }
    }

    return false;
}

export async function triggerRun(executionId: string, resume: boolean = false, runTokenId: string | undefined = undefined, environmentVariables: any[] | undefined = undefined, runFromStepId: string | undefined = undefined, runOne: boolean = false, temporaryRunTokenId: string | undefined = undefined, runFrom?: string) {
    console.log('Triggering run for executionId:', executionId);
    return pushToQueue(`executionq-${executionId}`, {
        time: (new Date()).valueOf(),
        resume,
        runTokenId,
        environmentVariables,
        runFromStepId,
        runOne,
        temporaryRunTokenId,
        runFrom
    });
}