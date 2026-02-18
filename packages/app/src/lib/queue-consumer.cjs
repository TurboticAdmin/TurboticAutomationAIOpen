const amqp = require('amqplib');
const { runOnEnvironment } = require('./run-on-environment.cjs');
const { ObjectId } = require('mongodb');

// Import fetch for Node.js (if not available globally)
let fetch;
if (typeof globalThis.fetch === 'undefined') {
  fetch = require('node-fetch');
} else {
  fetch = globalThis.fetch;
}

class QueueConsumer {
  constructor() {
    const appEnv = process.env.APP_ENV || 'development';
    console.log('🔄 [Queue Consumer Constructor] APP_ENV:', appEnv);
    console.log('🔄 [Queue Consumer Constructor] Process ID:', process.pid);
    console.log('🔄 [Queue Consumer Constructor] Timestamp:', new Date().toISOString());
    
    this.connection = null;
    this.channel = null;
    this.isRunning = false;
    this.isReady = false;
    this.isDevelopment = false;
    this.isTest = false;
    this.isProduction = false;

    // Environment detection
    this.isTest = appEnv === 'test';
    this.isProduction = appEnv === 'production';
    this.isDevelopment = !this.isTest && !this.isProduction;
    
    console.log('🔄 [Queue Consumer Constructor] Environment detection:', {
      appEnv: appEnv,
      isTest: this.isTest,
      isProduction: this.isProduction,
      isDevelopment: this.isDevelopment
    });
  }

  async start() {
    if (this.isRunning) {
      console.log('[Queue Consumer] Already running');
      return;
    }

    console.log('[Queue Consumer] Starting queue consumer...');
    this.isRunning = true;

    try {
      // Connect to RabbitMQ
      this.connection = await amqp.connect(process.env.RABBIT_MQ_ENDPOINT || 'amqp://localhost:5672');
      console.log('[Queue Consumer] Connected to RabbitMQ');

      this.channel = await this.connection.createChannel();
      console.log('[Queue Consumer] Channel created');

      // Set up consumer for all execution queues
      await this.setupConsumer();

      // Handle graceful shutdown
      process.on('SIGINT', () => this.stop());
      process.on('SIGTERM', () => this.stop());

      console.log('[Queue Consumer] Queue consumer started successfully');
    } catch (error) {
      console.error('[Queue Consumer] Error starting:', error);
      this.isRunning = false;
      throw error;
    }
  }

  async stop() {
    console.log('[Queue Consumer] Stopping queue consumer...');
    this.isRunning = false;
    this.isReady = false;

    if (this.channel) {
      await this.channel.close();
      this.channel = null;
    }

    if (this.connection) {
      await this.connection.close();
      this.connection = null;
    }

    console.log('[Queue Consumer] Queue consumer stopped');
  }

  isConsumerReady() {
    return this.isReady && this.isRunning && this.channel && this.connection;
  }

  async setupConsumer() {
    if (!this.channel) {
      throw new Error('Channel not available');
    }

    // Set up consumer for execution queues
    const exchangeName = 'execution_exchange';
    const queueName = 'execution_consumer_queue';
    const routingKey = 'execution.*';

    // Declare exchange
    await this.channel.assertExchange(exchangeName, 'topic', { durable: true });

    // Declare queue
    await this.channel.assertQueue(queueName, { durable: true });

    // Bind queue to exchange
    await this.channel.bindQueue(queueName, exchangeName, routingKey);

    // Set up consumer
    await this.channel.consume(queueName, async (msg) => {
      if (!msg) return;

      try {
        const content = JSON.parse(msg.content.toString());
        console.log('[Queue Consumer] Received message:', {
          executionId: content.env?.EXECUTION_ID,
          automationId: content.env?.AUTOMATION_ID,
          historyId: content.historyId
        });

        await this.processMessage(content);

        // Forward the message to the script-runner's queue
        const { pushToQueue } = require('./queue.js');
        const executionId = content.env?.EXECUTION_ID || content.executionId;
        if (!executionId) {
          throw new Error('No executionId found in message for forwarding');
        }
        const runnerQueueName = `executionq-${executionId}`;
        console.log(`[Queue Consumer] Forwarding message to script-runner queue: ${runnerQueueName}`);
        const forwardResult = await pushToQueue(runnerQueueName, content);
        if (!forwardResult) {
          throw new Error('Failed to forward message to script-runner queue');
        }
        console.log('[Queue Consumer] Message forwarded to script-runner queue successfully');

        // Acknowledge the message
        this.channel?.ack(msg);
      } catch (error) {
        console.error('[Queue Consumer] Error processing message:', error);
        
        // Check if this is a retryable error or a permanent failure
        const isRetryable = this.isRetryableError(error);
        
        if (isRetryable) {
          // Reject the message and requeue it (with delay)
          this.channel?.nack(msg, false, true);
        } else {
          // Acknowledge the message to remove it from the queue (permanent failure)
          console.log('[Queue Consumer] Permanent failure, acknowledging message to remove from queue');
          this.channel?.ack(msg);
        }
      }
    });

    console.log('[Queue Consumer] Consumer set up for queue:', queueName);
    
    // Mark as ready after consumer is set up
    this.isReady = true;
    console.log('[Queue Consumer] Queue consumer is now READY to process messages');
  }

  async processMessage(message) {
    console.log('[Queue Consumer] Processing message:', {
      historyId: message.historyId,
      executionId: message.env.EXECUTION_ID,
      automationId: message.env.AUTOMATION_ID,
      appEnv: message.env.APP_ENV
    });

    try {
      // Check if pod already exists (created by API route)
      const { getDb } = require('./db.cjs');
      const db = getDb();
      
      const executionRecord = await db.collection('executions').findOne({
        _id: require('mongodb').ObjectId.createFromHexString(message.env.EXECUTION_ID)
      });
      
      if (executionRecord && executionRecord.isEnvActive) {
        console.log('[Queue Consumer] Pod already exists and is active, skipping pod creation');
        console.log('[Queue Consumer] Just forwarding message to script-runner queue');
      } else {
        // Create a script-runner pod with the execution details (fallback for scheduler)
        console.log('[Queue Consumer] Pod does not exist, creating script-runner pod');
        await this.createScriptRunnerPod(
          message.env.EXECUTION_ID,
          message.historyId,
          message.env.AUTOMATION_ID,
          message.env
        );
        console.log('[Queue Consumer] Script-runner pod created successfully');
      }
    } catch (error) {
      console.error('[Queue Consumer] Error processing message:', error);
      throw error;
    }
  }

  isRetryableError(error) {
    // Define which errors should be retried vs which should be acknowledged and removed
    const retryableErrors = [
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'ECONNRESET',
      'ENETUNREACH'
    ];
    
    const nonRetryableErrors = [
      'No schedule_executions record found',
      'No executions record found',
      'Invalid executionId format',
      'Invalid historyId format',
      'Execution not found'
    ];
    
    const errorMessage = error.message || error.toString();
    
    // Check for non-retryable errors first
    for (const nonRetryable of nonRetryableErrors) {
      if (errorMessage.includes(nonRetryable)) {
        return false;
      }
    }
    
    // Check for retryable errors
    for (const retryable of retryableErrors) {
      if (errorMessage.includes(retryable)) {
        return true;
      }
    }
    
    // Default to non-retryable for unknown errors
    return false;
  }

  async createScriptRunnerPod(executionId, historyId, automationId, messageEnv = null) {
    console.log('[Queue Consumer] Creating script-runner pod with:', {
      executionId,
      historyId,
      automationId
    });

    const { getDb } = require('./db.cjs');
    const db = getDb();
    
    // Get device ID from message environment or use a default
    const deviceId = messageEnv?.DEVICE_ID || messageEnv?.deviceId || 'queue-triggered';
    
    // Find or create execution record
    let executionRecord = await this.findOrCreateExecutionRecord(db, executionId, automationId, deviceId);
    
    // Note: isEnvActive will remain true as long as the runner (pod) is active
    // It will be set to false only when the runner is terminated or cleaned up
    console.log(`[Queue Consumer] Execution ${executionRecord._id} is active and ready for reuse`);
    
    console.log('[Queue Consumer] Using execution record:', executionRecord._id);
    
    // Use the existing runOnEnvironment function to create the pod
    await runOnEnvironment(
      executionRecord._id.toString(), 
      historyId, 
      automationId, 
      executionId, 
      executionRecord, 
      messageEnv
    );
  }

  async findOrCreateExecutionRecord(db, executionId, automationId, deviceId) {
    // First, try to find existing execution record by executionId variants
    let executionRecord = await db.collection('executions').findOne({
      automationId: automationId,
      $or: [
        { executionId: executionId },
        { scheduleExecutionId: executionId },
        { queueExecutionId: executionId }
      ]
    });
    
    // If not found, check schedule_executions collection
    if (!executionRecord) {
      const scheduleExecution = await db.collection('schedule_executions').findOne({
        executionId: executionId
      });
      
      if (scheduleExecution) {
        executionRecord = await db.collection('executions').findOne({
          automationId: automationId,
          scheduleExecutionId: executionId
        });
      }
    }
    
    // If still not found, create a new execution record
    if (!executionRecord) {
      console.log('[Queue Consumer] Creating new execution record for automationId:', automationId);
      const insertResult = await db.collection('executions').insertOne({
        automationId: automationId,
        deviceId: deviceId,
        startedAt: new Date(),
        queueExecutionId: executionId,
        isEnvActive: true
      });
      
      executionRecord = await db.collection('executions').findOne({ _id: insertResult.insertedId });
      console.log('[Queue Consumer] Created new execution record:', executionRecord._id);
    } else {
      // Update existing record to mark as active
      await db.collection('executions').updateOne(
        { _id: executionRecord._id },
        { $set: { isEnvActive: true } }
      );
      console.log('[Queue Consumer] Updated existing execution record:', executionRecord._id);
    }
    
    return executionRecord;
  }
}

// Create singleton instance
const queueConsumer = new QueueConsumer();

module.exports = { queueConsumer }; 