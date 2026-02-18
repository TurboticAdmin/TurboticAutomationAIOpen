import { MongoClient } from "mongodb";

let client: MongoClient;
let connectionPromise: Promise<MongoClient> | null = null;

export const getClient = () => {
  const MONGO_URI = process.env.MONGO_URI as string;
  if (!MONGO_URI) throw new Error("Please define the MONGO_URI environment variable");

  if (!client) {
    // Enhanced connection options for better reliability and network resilience
    const options = {
      serverSelectionTimeoutMS: 60000, // 60 seconds - increased from 30
      socketTimeoutMS: 90000, // 90 seconds - increased from 45
      connectTimeoutMS: 60000, // 60 seconds - increased from 30
      maxPoolSize: 20, // Increased from 10
      minPoolSize: 2, // Increased from 1
      maxIdleTimeMS: 60000, // 60 seconds - increased from 30
      retryWrites: true,
      retryReads: true,
      // Additional options for better network resilience
      heartbeatFrequencyMS: 10000, // 10 seconds
      serverApi: {
        version: '1' as const,
        strict: false,
        deprecationErrors: false,
      },
      // Timeout settings
      maxConnecting: 5, // Limit concurrent connection attempts
    };
    
    console.log('🔗 Connecting to MongoDB with enhanced options...');
    client = new MongoClient(MONGO_URI, options);
  }

  return client;
};

// Enhanced connection management with retry logic
export const getConnectedClient = async (): Promise<MongoClient> => {
  const client = getClient();
  
  // If we already have a connection promise, return it
  if (connectionPromise) {
    return connectionPromise;
  }
  
  // Create a new connection promise with retry logic
  connectionPromise = connectWithRetry(client);
  return connectionPromise;
};

const connectWithRetry = async (client: MongoClient, maxRetries = 3): Promise<MongoClient> => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔗 [MongoDB] Connection attempt ${attempt}/${maxRetries}...`);
      await client.connect();
      console.log('✅ [MongoDB] Connection successful');
      
      // Set up connection event handlers
      client.on('error', (error) => {
        console.error('❌ [MongoDB] Connection error:', error);
        connectionPromise = null; // Reset connection promise on error
      });
      
      client.on('close', () => {
        console.warn('🔌 [MongoDB] Connection closed');
        connectionPromise = null; // Reset connection promise on close
      });
      
      client.on('reconnect', () => {
        console.log('🔄 [MongoDB] Connection reconnected');
      });
      
      return client;
    } catch (error) {
      console.error(`❌ [MongoDB] Connection attempt ${attempt} failed:`, error);
      
      if (attempt === maxRetries) {
        console.error('❌ [MongoDB] All connection attempts failed');
        connectionPromise = null;
        throw error;
      }
      
      // Exponential backoff: 2s, 4s, 8s
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`⏳ [MongoDB] Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw new Error('Failed to connect to MongoDB after all retry attempts');
};

export const getDb = () => {
  const client = getClient();
  // Extract database name from MONGO_URI or use environment variable or default
  const dbName = process.env.MONGO_URI?.split('/').pop()?.split('?')[0] || 
                 process.env.MONGODB_DATABASE_NAME || 
                 'turbotic-playground';
  return client.db(dbName);
};

// Enhanced synchronous version with better connection management
export const getDbSync = () => {
  const client = getClient();
  // Extract database name from MONGO_URI or use environment variable or default
  const dbName = process.env.MONGO_URI?.split('/').pop()?.split('?')[0] || 
                 process.env.MONGODB_DATABASE_NAME || 
                 'turbotic-playground';
  return client.db(dbName);
};

// Add connection test function
export const testConnection = async () => {
  try {
    const client = getClient();
    await client.connect();
    // Test the connection with a simple ping
    await client.db('admin').command({ ping: 1 });
    console.log('✅ MongoDB connection test successful');
    return true;
  } catch (error) {
    console.error('❌ MongoDB connection test failed:', error instanceof Error ? error.message : 'Unknown error');
    return false;
  }
};

// Health check function
export const getConnectionHealth = async () => {
  try {
    const client = getClient();
    await client.connect();
    const startTime = Date.now();
    await client.db('admin').command({ ping: 1 });
    const responseTime = Date.now() - startTime;

    return {
      status: 'healthy',
      responseTime,
      timestamp: new Date().toISOString()
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    };
  }
};

// Database selection function for test environment
export const getDbWithSelection = (databaseType?: 'prod' | 'test') => {
  const client = getClient();

  // Use environment variables for database names, with sensible defaults
  const prodDbName = process.env.MONGODB_DATABASE_NAME_PROD || 'turbotic-automationai';
  const testDbName = process.env.MONGODB_DATABASE_NAME_TEST || 'turbotic-playground';
  
  if (databaseType === 'prod') {
    return client.db(prodDbName);
  } else if (databaseType === 'test') {
    return client.db(testDbName);
  } else {
    // Default behavior - extract from MONGO_URI or use environment variable
    const dbName = process.env.MONGO_URI?.split('/').pop()?.split('?')[0] || 
                   process.env.MONGODB_DATABASE_NAME || 
                   testDbName;
    return client.db(dbName);
  }
};
