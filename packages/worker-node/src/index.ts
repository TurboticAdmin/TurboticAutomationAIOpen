require('dotenv').config();

import path from 'path';
import fs from 'fs';
import amqplib from 'amqplib/callback_api';
import { getAllQueues } from './core/create-queue';
import { MongoClient } from 'mongodb';
import { setDb } from './core/db';
import { createAppClient } from './core/app-client';

function loadAllQueues() {
    let enabledQueues: string[] = [];
    if (process.env['ENABLED_QUEUE_JS_FILENAMES']) {
        enabledQueues = String(process.env['ENABLED_QUEUE_JS_FILENAMES']).replace(' ', '').split(',');
    }
    const dirPath = path.join(__dirname, 'queues');
    const files = fs.readdirSync(dirPath);
    const arrayOfFiles: string[] = [];

    files.forEach((file) => {
        if (file.endsWith('.js') && (enabledQueues.length === 0 || enabledQueues.includes(file))) {
            const filePath = file;
            require(`./queues/${file}`);
            arrayOfFiles.push(filePath);
        }
    });

    return arrayOfFiles;
}

console.log('Loading queues...');
loadAllQueues();

const RABBIT_MQ_ENDPOINT = process.env['RABBIT_MQ_ENDPOINT'];

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

        const DB_CONN_STR = process.env['DB_CONN_STR'];

        setDb(await MongoClient.connect(DB_CONN_STR));

        createAppClient(process.env['APP_SERVER_URL'])

        const allQueues = getAllQueues();
        for (const queue of allQueues) {
            await queue.listen(channel as any);
        }
    });
});