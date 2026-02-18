import { MongoClient } from 'mongodb';

let db: MongoClient;

export function setDb(db_: MongoClient) {
    db = db_;
}

export function useDb() {
    return db.db();
}