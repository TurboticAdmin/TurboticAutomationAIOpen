import { Queue } from "../core/create-queue";

const TestQueue = new Queue('test-queue');

TestQueue.onItem = async (item) => {
    const { countUpto, intervalInMs } = item.content.payload;
    return new Promise((resolve, reject) => {
        let counter = 0;
        setInterval(async () => {
            if (counter === countUpto) {
                await item.acknowledge();
                resolve();
            } else {
                counter++;
                await item.updateProgress((counter / countUpto) * 100);
            }
        }, intervalInMs);
    })
}

export default TestQueue;