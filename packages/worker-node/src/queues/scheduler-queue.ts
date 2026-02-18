import moment from "moment";
import { Queue } from "../core/create-queue";
import { useDb } from "../core/db";
import { stringToArray, getSchedule } from 'cron-converter';
import { ObjectId } from "mongodb";

const SchedulerQueue = new Queue(process.env.SCHEDULE_QUEUE || 'scheduler-queue');

const triggerRun = async (automationId: string, deviceId: string, runtimeEnvironment?: string) => {
    const res = await fetch(`${process.env.APP_URL}/api/run/executions`, {
        method: 'post',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            dId: deviceId,
            automationId,
            isScheduled: true,
            scheduleRuntimeEnvironment: runtimeEnvironment // Pass schedule's runtime environment override
        })
    });

    if (!res.ok) {
        throw new Error('Failed to trigger run');
    }

    const data = await res.json();

    return data;
}

SchedulerQueue.onItem = async (item) => {
    const payload = JSON.parse(item.content.payload);

    const db = useDb();
    const schedules = await db.collection('schedules-v2').find({}).skip(payload.skip).limit(payload.limit).toArray();

    const n = moment.utc(payload.timestampInUtc).add(-1, 'minute');

    console.log('Current time', n.format());

    const deviceId = process.env.TEST_DEVICE_ID || String(new ObjectId());

    for (const schedule of schedules) {
        
        const automation = await db.collection('automations').findOne({ _id: ObjectId.createFromHexString(schedule.automationId) });
        if (automation?.triggerEnabled !== true) {
            console.log('Skipping disabled automation', automation?._id);
            continue;
        }
        
        try {
            const runFrequency = stringToArray(schedule.cronExpression);
            const cronSchedule = getSchedule(runFrequency, n.toDate(), schedule.timezone);
            const shouldRun = moment(cronSchedule.now.ts).isSame(moment(cronSchedule.next().ts), 'minute');

            if (shouldRun === true) {
                console.log('shouldRun');
                // Pass schedule's runtimeEnvironment if specified, otherwise undefined (will use automation's default)
                await triggerRun(schedule.automationId, String(deviceId), schedule.runtimeEnvironment);
            } else {
                console.log('should not run');
            }
        } catch (e) {
            console.error(e);
            item.recordActivity('error', e.message);
        }
    }
}

export default SchedulerQueue;