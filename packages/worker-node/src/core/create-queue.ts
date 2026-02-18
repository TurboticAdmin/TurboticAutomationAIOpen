import amqplib from 'amqplib';
import { useDb } from './db';
import { ObjectId } from 'mongodb';
import path from 'path';
import fse from 'fs-extra'
import moment from 'moment';

class QueueItem {
    queue: Queue
    channel: amqplib.Channel;
    rawMsg: any;
    content: {
        _id?: any,
        attempt?: number,
        maxRetry?: number
        queueName: string,
        workspaceId: string
        payload: any
        meta?: any
        progress?: number,
        progressLabel?: string
        err?: any
        createdAt: Date
    }
    
    constructor(content: any, channel: amqplib.Channel, rawMsg: any, q: Queue) {
        this.content = content;
        this.channel = channel;
        this.rawMsg = rawMsg;
        this.queue = q;
    }

    acknowledged: boolean = false;
    async acknowledge() {
        if (this.acknowledged === true) {
            return;
        }

        this.channel.ack(this.rawMsg);
        this.acknowledged = true;
        console.log("Acknowledged");

        await this.recordActivity(`Queue item acknowledged`, 'success');
    }

    async updateProgress(rate: number, label?: string) {
        rate = Number(Math.min(rate, 100).toFixed(2));
        
        const setter: any = {
            progress: rate
        };

        if (typeof label === 'string') {
            setter.progressLabel = label;
        }

        const db = useDb();
        await db.collection('jobs').updateOne({
            _id: ObjectId.createFromHexString(String(this.content._id))
        }, {
            $set: setter
        });

        await this.recordActivity(`Progress changed to ${rate}%${label ? ` (${label})` : ''}`);

        return true;
    }

    canRetry() {
        let maxRetry = this.content.maxRetry;
        if (isNaN(maxRetry)) {
            maxRetry = 0;
        }

        return this.content.attempt < maxRetry;
    }

    async recordAttempt() {
        const db = useDb();
        let currentAttempt = this.content.attempt;
        if (isNaN(currentAttempt)) {
            currentAttempt = 0;
        }

        currentAttempt = currentAttempt + 1;

        await db.collection('jobs').updateOne({
            _id: ObjectId.createFromHexString(String(this.content._id))
        }, {
            $set: {
                attempt: currentAttempt
            }
        });

        this.content.attempt = currentAttempt;
    }

    async recordActivity(message: string, type: 'success' | 'error' | 'warn' | 'info' = 'info') {
        const db = useDb();
        await db.collection('jobs').updateOne({
            _id: ObjectId.createFromHexString(String(this.content._id))
        }, {
            $push: {
                log: {
                    message,
                    type,
                    timeInUtc: (moment.utc().toDate()),
                    onAttempt: this.content.attempt
                }
            } as any
        });

        return true;
    }

    hasCleanedTempDir = false;
    getTempDir() {
        const dir = path.join(__dirname, '../../temp-working-dir', this.queue.name);

        if (this.hasCleanedTempDir === false) {
            fse.emptyDirSync(dir);
            this.hasCleanedTempDir = true;
        }
        
        return dir;
    }
}

const queueMap: any = {};

export function getQueueByName(name: string): Queue | null {
    return queueMap[name] || null
}

export function getAllQueues(): Queue[] {
    return Object.keys(queueMap).map((k) => queueMap[k]);
}

export class Queue {
    name: string;

    constructor(name: string) {
        this.name = name;
        queueMap[name] = this;
        console.log(`Registered queue: ${name}`);
        
        this.listen = this.listen.bind(this);
    }

    async onItem(item: QueueItem) {
        // Do nothing
    }

    async listen(channel: amqplib.Channel) {
        await channel.assertQueue(this.name, {
            durable: true
        });

        channel.prefetch(1);

        console.log(`Queue '${this.name}' asserted`);

        console.log(" [*] Waiting for messages in %s. To exit press CTRL+C", this.name);

        await channel.consume(this.name, async (msg) => {
            console.log(" [x] Received %s", msg.content);
            
            try {
                const content = JSON.parse(String(msg.content));
                const item = new QueueItem(content, channel, msg, this);

                try {
                    await item.recordAttempt();
                    await item.recordActivity('Process starting');
                    await this.onItem(item);
                    await item.updateProgress(100);

                    await item.acknowledge();
                    await item.recordActivity('Process finished', 'success');
                } catch (e) {
                    console.error(e);
                    console.log('Item failed to process');
                    
                    await item.recordActivity(`Process failed: ${e?.message}`, 'error');
                    
                    const canRetry = item.canRetry();
                    if (canRetry === true) {
                        await item.recordActivity(`Retrying...`);
                        channel.nack(msg);
                    } else {
                        await item.recordActivity(`Max attempt reached, removing from the queue`);
                        channel.ack(msg);
                    }
                }
            } catch (e) {
                console.error(e);

                await useDb().collection('errored_jobs').insertOne({
                    payload: String(msg.content),
                    error: e,
                    createdAt: (new Date())
                });

                channel.ack(msg);
            }
        }, {
            noAck: false
        });
    }
}
