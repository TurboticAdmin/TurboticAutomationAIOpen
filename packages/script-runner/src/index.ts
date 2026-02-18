require('dotenv').config();

import { Runner } from "./run";
import amqplib from 'amqplib/callback_api';

const automationId = process.env.AUTOMATION_ID;
const RABBIT_MQ_ENDPOINT = process.env.RABBIT_MQ_ENDPOINT;
const EXECUTION_ID = process.env.EXECUTION_ID;

if (!RABBIT_MQ_ENDPOINT) {
    console.error(new Error('RABBIT_MQ_ENDPOINT is required in env'));
    process.exit(1);
}

if (!EXECUTION_ID) {
    console.error(new Error('EXECUTION_ID is required in env'));
    process.exit(1);
}

if (!automationId) {
    console.error(new Error('AUTOMATION_ID is required in env'));
    process.exit(1);
}

console.log('Starting script runner...');

const runner = new Runner(automationId);

let shutdownTimer: NodeJS.Timeout;
const shutdownAfter5Minutes = () => {
    if (process.env['DISABLE_AUTOSHUTDOWN'] === 'true') {
        console.log('Auto shutdown is disabled');
        return;
    }

    clearTimeout(shutdownTimer);
    shutdownTimer = setTimeout(() => {
        if (runner.running === true) {
            shutdownAfter5Minutes();
            return;
        }

        console.log('Auto shutting down...');
        process.exit(0);
    }, 1000 * 60 * 2);
}

try {
    amqplib.connect(RABBIT_MQ_ENDPOINT, (error0, connection) => {
        if (error0) {
            throw error0;
        }
    
        connection.on('error', (err) => {
            console.error('RabbitMQ connection error:', err);
            process.exit(1);
        });
    
        connection.createChannel(async function (error1, channel) {
            channel.on('error', (err) => {
                console.error('RabbitMQ connection error:', err);
                process.exit(1);
            });
    
            console.log('Channel created');
    
            if (error1) {
                throw error1;
            }
    
            const QUEUE_NAME = `executionq-${process.env.EXECUTION_ID}`
    
            channel.assertQueue(QUEUE_NAME, {
                durable: true,
                expires: 60000,
                maxLength: 1,
                arguments: {
                    'x-overflow': 'drop-head'
                }
            });
    
            channel.prefetch(1);
    
            console.log(`Queue '${QUEUE_NAME}' asserted`);
            console.log(" [*] Waiting for messages in %s. To exit press CTRL+C");
    
            shutdownAfter5Minutes();

            channel.consume(QUEUE_NAME, async (msg) => {
                console.log(" [x] Received %s", msg.content);
                
                const ack = () => {
                    channel.ack(msg);
                }

                try {
                    await runner.run(ack, JSON.parse(msg.content.toString()));
                    shutdownAfter5Minutes();
                } catch (e) {
                    console.error(e);
                }

                ack();
            }, {
                noAck: false
            });
        });
    });
} catch (e) {
    console.error(e);
    process.exit(1);
}
