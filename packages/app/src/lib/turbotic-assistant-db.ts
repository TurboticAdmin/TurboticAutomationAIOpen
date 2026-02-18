import { MongoClient, Db } from 'mongodb';

let turboticClient: MongoClient | null = null;
let connectionPromise: Promise<MongoClient> | null = null;

/**
 * Get shared Turbotic Assistant MongoDB client with connection pooling
 */
export function getTurboticAssistantClient(): MongoClient {
  const TURBOTIC_MONGO_URI = process.env.TURBOTIC_MONGO_URI;
  
  if (!TURBOTIC_MONGO_URI) {
    throw new Error('TURBOTIC_MONGO_URI environment variable is not set');
  }

  if (!turboticClient) {
    // Enhanced connection options with pooling
    const options = {
      serverSelectionTimeoutMS: 60000,
      socketTimeoutMS: 90000,
      connectTimeoutMS: 60000,
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
    
    turboticClient = new MongoClient(TURBOTIC_MONGO_URI, options);
  }

  return turboticClient;
}

/**
 * Get connected Turbotic Assistant MongoDB client with retry logic
 */
export async function getConnectedTurboticAssistantClient(): Promise<MongoClient> {
  const client = getTurboticAssistantClient();
  
  // If we already have a connection promise, return it
  if (connectionPromise) {
    return connectionPromise;
  }
  
  // Create a new connection promise with retry logic
  connectionPromise = connectWithRetry(client);
  return connectionPromise;
}

const connectWithRetry = async (client: MongoClient, maxRetries = 3): Promise<MongoClient> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {      
      await client.connect();         
      // Set up connection event handlers
      client.on('error', (error) => {        
        connectionPromise = null; // Reset connection promise on error
      });
      
      client.on('close', () => {        
        connectionPromise = null; // Reset connection promise on close
      });
      
      client.on('reconnect', () => {
      });
      
      return client;
    } catch (error) {      
      if (attempt === maxRetries) {        
        connectionPromise = null;
        throw error;
      }
      
      // Exponential backoff: 2s, 4s, 8s
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('Failed to connect to Turbotic Assistant MongoDB after all retry attempts');
};

/**
 * Get Turbotic Assistant database with connection pooling
 */
export async function getTurboticAssistantDb(): Promise<{ db: Db; client: MongoClient }> {
  const client = await getConnectedTurboticAssistantClient();
  
  // Extract database name from URI or use default
  const TURBOTIC_MONGO_URI = process.env.TURBOTIC_MONGO_URI!;
  const dbName = TURBOTIC_MONGO_URI.split('/').pop()?.split('?')[0] || 'turbotic-ai-test';
  
  return {
    db: client.db(dbName),
    client
  };
}

