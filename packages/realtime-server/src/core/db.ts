import { MongoClient } from "mongodb";

let client: MongoClient;

export const getDb = async () => {
    if (!client) {
        client = new MongoClient(process.env.MONGO_URI as string);

        await client.connect();
    }

    return client.db();
}