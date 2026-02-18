import { MongoClient } from "mongodb";
import { getDb } from "./db";

let vectorClient: MongoClient;

export const getVectorClient = () => {
  const VECTOR_DB_CONN_STR = process.env.VECTOR_DB_CONN_STR as string;
  
  if (!VECTOR_DB_CONN_STR) {
    // Fallback to main MongoDB connection if no vector DB specified
    console.log('🔗 No VECTOR_DB_CONN_STR found, using main MongoDB connection');
    return null; // Will use main DB connection
  }

  if (!vectorClient) {
    // Enhanced connection options for better reliability and network resilience
    const options = {
      serverSelectionTimeoutMS: 60000, // 60 seconds
      socketTimeoutMS: 90000, // 90 seconds
      connectTimeoutMS: 60000, // 60 seconds
      maxPoolSize: 20,
      minPoolSize: 2,
      maxIdleTimeMS: 60000,
      retryWrites: true,
      retryReads: true,
      heartbeatFrequencyMS: 10000,
      serverApi: {
        version: '1' as const,
        strict: false,
        deprecationErrors: false,
      },
      maxConnecting: 5,
    };
    
    console.log('🔗 Connecting to Vector MongoDB with enhanced options...');
    vectorClient = new MongoClient(VECTOR_DB_CONN_STR, options);
  }

  return vectorClient;
};

export const getVectorDb = () => {
  const client = getVectorClient();
  
  // If no vector client, fallback to main DB
  if (!client) {
    console.log('🔄 Using main MongoDB for vector operations');
    return getDb();
  }
  
  // Extract database name from VECTOR_DB_CONN_STR or use default
  const dbName = process.env.VECTOR_DB_CONN_STR?.split('/').pop()?.split('?')[0] || 'turbotic-vector-db';
  return client.db(dbName);
};

