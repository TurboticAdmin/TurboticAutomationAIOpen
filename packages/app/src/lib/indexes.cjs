const getDb = require('./db.cjs').getDb;

const INDEXES = [
  // Execution History Collection
  {
    collection: 'execution_history',
    name: 'automationId_startedAt',
    keys: { automationId: 1, startedAt: -1 },
    options: { background: true }
  },
  {
    collection: 'execution_history',
    name: 'status_startedAt',
    keys: { status: 1, startedAt: -1 },
    options: { background: true }
  },
  {
    collection: 'execution_history',
    name: 'deviceId_startedAt',
    keys: { deviceId: 1, startedAt: -1 },
    options: { background: true }
  },
  {
    collection: 'execution_history',
    name: 'startedAt_status_automationId',
    keys: { startedAt: -1, status: 1, automationId: 1 },
    options: { background: true }
  },
  {
    collection: 'execution_history',
    name: 'automationId_status_startedAt',
    keys: { automationId: 1, status: 1, startedAt: -1 },
    options: { background: true }
  },

  // Automations Collection
  {
    collection: 'automations',
    name: 'workspaceId_createdAt',
    keys: { workspaceId: 1, createdAt: -1 },
    options: { background: true }
  },
  {
    collection: 'automations',
    name: 'isPublished_createdAt',
    keys: { isPublished: 1, createdAt: -1 },
    options: { background: true }
  },

  // Users Collection
  {
    collection: 'users',
    name: 'email_1',
    keys: { email: 1 },
    options: { unique: true, background: true }
  },

  // Workspaces Collection
  {
    collection: 'workspaces',
    name: 'ownerUserId_1',
    keys: { ownerUserId: 1 },
    options: { background: true }
  },

  // Execution Logs Collection
  {
    collection: 'execution_logs',
    name: 'executionId_createdAt',
    keys: { executionId: 1, createdAt: 1 },
    options: { background: true }
  },

  // Chat Context Collection (for AI chat functionality)
  {
    collection: 'chatContext',
    name: 'automationId_createdAt',
    keys: { automationId: 1, createdAt: -1 },
    options: { background: true }
  },

  // Executions Collection (for active executions)
  {
    collection: 'executions',
    name: 'deviceId_automationId',
    keys: { deviceId: 1, automationId: 1 },
    options: { background: true }
  },

  // Automation Shares Collection (for sharing functionality)
  {
    collection: 'automation_shares',
    name: 'originalAutomationId_sharedAt',
    keys: { originalAutomationId: 1, sharedAt: -1 },
    options: { background: true }
  },
  {
    collection: 'automation_shares',
    name: 'sharedByUserId_sharedAt',
    keys: { sharedByUserId: 1, sharedAt: -1 },
    options: { background: true }
  },
  {
    collection: 'automation_shares',
    name: 'sharedWithUserId_sharedAt',
    keys: { sharedWithUserId: 1, sharedAt: -1 },
    options: { background: true }
  },
  {
    collection: 'automation_shares',
    name: 'sharedWithEmail_sharedAt',
    keys: { sharedWithEmail: 1, sharedAt: -1 },
    options: { background: true }
  },

  // Email Restrictions Collection (for whitelist/blacklist functionality)
  {
    collection: 'email_restrictions',
    name: 'type_pattern',
    keys: { type: 1, pattern: 1 },
    options: { background: true }
  },
  {
    collection: 'email_restrictions',
    name: 'createdAt',
    keys: { createdAt: -1 },
    options: { background: true }
  },

  // Automation Schedules Collection (for scheduling functionality)
  {
    collection: 'automation_schedules',
    name: 'automationId_isActive',
    keys: { automationId: 1, isActive: 1 },
    options: { background: true }
  },
  {
    collection: 'automation_schedules',
    name: 'nextRun_isActive',
    keys: { nextRun: 1, isActive: 1 },
    options: { background: true }
  },
  {
    collection: 'automation_schedules',
    name: 'createdBy_createdAt',
    keys: { createdBy: 1, createdAt: -1 },
    options: { background: true }
  },
  {
    collection: 'automation_schedules',
    name: 'isActive_createdAt',
    keys: { isActive: 1, createdAt: -1 },
    options: { background: true }
  },
  {
    collection: 'automation_schedules',
    name: 'automationId_createdBy',
    keys: { automationId: 1, createdBy: 1 },
    options: { background: true }
  },

  // Schedule Executions Collection (for tracking scheduled runs)
  {
    collection: 'schedule_executions',
    name: 'scheduleId_startedAt',
    keys: { scheduleId: 1, startedAt: -1 },
    options: { background: true }
  },
  {
    collection: 'schedule_executions',
    name: 'automationId_startedAt',
    keys: { automationId: 1, startedAt: -1 },
    options: { background: true }
  },
  {
    collection: 'schedule_executions',
    name: 'status_startedAt',
    keys: { status: 1, startedAt: -1 },
    options: { background: true }
  },
  {
    collection: 'schedule_executions',
    name: 'scheduleId_status',
    keys: { scheduleId: 1, status: 1 },
    options: { background: true }
  },

  // Additional indexes for better performance
  // Automations Collection - for API key lookups
  {
    collection: 'automations',
    name: 'apiKey_1',
    keys: { apiKey: 1 },
    options: { background: true }
  },
  {
    collection: 'automations',
    name: 'workspaceId_isPublished',
    keys: { workspaceId: 1, isPublished: 1 },
    options: { background: true }
  },
  {
    collection: 'automations',
    name: 'sharedFrom_userEmail_isShared',
    keys: { 'sharedFrom.userEmail': 1, isShared: 1 },
    options: { background: true }
  },

  // NEW INDEXES FOR DASHBOARD PERFORMANCE OPTIMIZATION
  
  // Automations Collection - Dashboard Performance
  {
    collection: 'automations',
    name: 'workspaceId_createdBy_createdAt',
    keys: { workspaceId: 1, createdBy: 1, createdAt: -1 },
    options: { background: true }
  },
  {
    collection: 'automations',
    name: 'workspaceId_isPublished_createdAt',
    keys: { workspaceId: 1, isPublished: 1, createdAt: -1 },
    options: { background: true }
  },
  {
    collection: 'automations',
    name: 'sharedFrom_userEmail_isShared_createdAt',
    keys: { 'sharedFrom.userEmail': 1, isShared: 1, createdAt: -1 },
    options: { background: true }
  },

  // Execution History Collection - Dashboard Performance
  {
    collection: 'execution_history',
    name: 'automationId_status_createdAt',
    keys: { automationId: 1, status: 1, createdAt: -1 },
    options: { background: true }
  },
  {
    collection: 'execution_history',
    name: 'automationId_createdAt_status',
    keys: { automationId: 1, createdAt: -1, status: 1 },
    options: { background: true }
  },

  // Automation Shares Collection - Dashboard Performance
  {
    collection: 'automation_shares',
    name: 'originalAutomationId_status_sharedAt',
    keys: { originalAutomationId: 1, status: 1, sharedAt: -1 },
    options: { background: true }
  },
  {
    collection: 'automation_shares',
    name: 'sharedWithUserId_status_sharedAt',
    keys: { sharedWithUserId: 1, status: 1, sharedAt: -1 },
    options: { background: true }
  },

  // Workflows Collection - Dashboard Performance
  {
    collection: 'workflows',
    name: 'createdBy_workspaceId_createdAt',
    keys: { createdBy: 1, workspaceId: 1, createdAt: -1 },
    options: { background: true }
  },

  // Schedule Executions Collection - Dashboard Performance
  {
    collection: 'schedule_executions',
    name: 'automationId_status_startedAt',
    keys: { automationId: 1, status: 1, startedAt: -1 },
    options: { background: true }
  },
  {
    collection: 'schedule_executions',
    name: 'scheduleId_status_startedAt',
    keys: { scheduleId: 1, status: 1, startedAt: -1 },
    options: { background: true }
  },

  // Analytics Collection - Dashboard Performance (Optional - collection may not exist yet)
  {
    collection: 'analytics',
    name: 'automationId_date_metric',
    keys: { automationId: 1, date: -1, metric: 1 },
    options: { background: true }
  },
  {
    collection: 'analytics',
    name: 'workspaceId_date_metric',
    keys: { workspaceId: 1, date: -1, metric: 1 },
    options: { background: true }
  },

  // NEW INDEXES FOR CANVAS SAVE PERFORMANCE OPTIMIZATION
  
  // Automations Collection - Canvas Save Performance
  {
    collection: 'automations',
    name: '_id_workspaceId_createdBy',
    keys: { _id: 1, workspaceId: 1, createdBy: 1 },
    options: { background: true }
  },
  {
    collection: 'automations',
    name: '_id_workspaceId',
    keys: { _id: 1, workspaceId: 1 },
    options: { background: true }
  },
  {
    collection: 'automations',
    name: 'createdBy_workspaceId',
    keys: { createdBy: 1, workspaceId: 1 },
    options: { background: true }
  },

  // Automation Shares Collection - Canvas Save Performance
  {
    collection: 'automation_shares',
    name: 'sharedWithUserId_originalAutomationId_status_canEdit',
    keys: { sharedWithUserId: 1, originalAutomationId: 1, status: 1, canEdit: 1 },
    options: { background: true }
  },
  {
    collection: 'automation_shares',
    name: 'originalAutomationId_sharedWithUserId_status',
    keys: { originalAutomationId: 1, sharedWithUserId: 1, status: 1 },
    options: { background: true }
  },
  {
    collection: 'automation_shares',
    name: 'sharedWithUserId_status_canEdit',
    keys: { sharedWithUserId: 1, status: 1, canEdit: 1 },
    options: { background: true }
  },

  // NEW INDEXES FOR ANALYTICS PERFORMANCE OPTIMIZATION
  
  // Execution History Collection - Analytics Performance
  {
    collection: 'execution_history',
    name: 'automationId_startedAt_status_duration',
    keys: { automationId: 1, startedAt: -1, status: 1, duration: 1 },
    options: { background: true }
  },
  {
    collection: 'execution_history',
    name: 'startedAt_automationId_status',
    keys: { startedAt: -1, automationId: 1, status: 1 },
    options: { background: true }
  },
  {
    collection: 'execution_history',
    name: 'status_startedAt_automationId',
    keys: { status: 1, startedAt: -1, automationId: 1 },
    options: { background: true }
  },

  // NEW INDEXES FOR GENERAL QUERY OPTIMIZATION
  
  // Automations Collection - General Query Optimization
  {
    collection: 'automations',
    name: 'workspaceId_createdBy_isPublished',
    keys: { workspaceId: 1, createdBy: 1, isPublished: 1 },
    options: { background: true }
  },
  {
    collection: 'automations',
    name: 'createdBy_isPublished_createdAt',
    keys: { createdBy: 1, isPublished: 1, createdAt: -1 },
    options: { background: true }
  },
  {
    collection: 'automations',
    name: 'workspaceId_isPublished_createdBy',
    keys: { workspaceId: 1, isPublished: 1, createdBy: 1 },
    options: { background: true }
  },

  // Performance Logs Collection - Monitoring - COMMENTED OUT
  // {
  //   collection: 'performance_logs',
  //   name: 'timestamp_endpoint',
  //   keys: { timestamp: -1, endpoint: 1 },
  //   options: { background: true }
  // },
  // {
  //   collection: 'performance_logs',
  //   name: 'endpoint_timestamp',
  //   keys: { endpoint: 1, timestamp: -1 },
  //   options: { background: true }
  // },
  // {
  //   collection: 'performance_logs',
  //   name: 'userId_timestamp',
  //   keys: { userId: 1, timestamp: -1 },
  //   options: { background: true }
  // }

  // Automations Deleted Collection - Backup for deleted automations
  {
    collection: 'automationsDeleted',
    name: 'deletedBy_deletedAt',
    keys: { deletedBy: 1, deletedAt: -1 },
    options: { background: true }
  },
  {
    collection: 'automationsDeleted',
    name: 'originalAutomationId',
    keys: { originalAutomationId: 1 },
    options: { background: true }
  },
  {
    collection: 'automationsDeleted',
    name: 'workspaceId_deletedAt',
    keys: { workspaceId: 1, deletedAt: -1 },
    options: { background: true }
  }
];

async function ensureIndexes() {
  const db = getDb();
  console.log('🔍 Checking and creating database indexes...');

  for (const indexDef of INDEXES) {
    try {
      const collection = db.collection(indexDef.collection);
      const existingIndexes = await collection.indexes();
      const indexExists = existingIndexes.some(
        (index) => index.name === indexDef.name
      );
      if (!indexExists) {
        console.log(`📝 Creating index: ${indexDef.collection}.${indexDef.name}`);
        await collection.createIndex(indexDef.keys, {
          name: indexDef.name,
          ...indexDef.options
        });
        console.log(`✅ Created index: ${indexDef.collection}.${indexDef.name}`);
      } else {
        console.log(`✅ Index already exists: ${indexDef.collection}.${indexDef.name}`);
      }
    } catch (error) {
      // Handle collection not found errors more gracefully
      if (error.code === 26 && error.codeName === 'NamespaceNotFound') {
        console.log(`ℹ️ Collection ${indexDef.collection} doesn't exist yet, skipping index: ${indexDef.name}`);
      } else {
        console.error(`❌ Error creating index ${indexDef.collection}.${indexDef.name}:`, error.message || error);
      }
    }
  }
  console.log('🎉 Database index check completed!');
}

async function listIndexes() {
  const db = getDb();
  console.log('📋 Current database indexes:');
  for (const indexDef of INDEXES) {
    try {
      const collection = db.collection(indexDef.collection);
      const indexes = await collection.indexes();
      console.log(`\n📁 Collection: ${indexDef.collection}`);
      indexes.forEach((index) => {
        console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
      });
    } catch (error) {
      console.error(`❌ Error listing indexes for ${indexDef.collection}:`, error);
    }
  }
}

async function dropIndexes() {
  const db = getDb();
  console.log('🗑️ Dropping all custom indexes...');
  for (const indexDef of INDEXES) {
    try {
      const collection = db.collection(indexDef.collection);
      const existingIndexes = await collection.indexes();
      const indexExists = existingIndexes.some(
        (index) => index.name === indexDef.name
      );
      if (indexExists) {
        console.log(`🗑️ Dropping index: ${indexDef.collection}.${indexDef.name}`);
        await collection.dropIndex(indexDef.name);
        console.log(`✅ Dropped index: ${indexDef.collection}.${indexDef.name}`);
      } else {
        console.log(`ℹ️ Index doesn't exist: ${indexDef.collection}.${indexDef.name}`);
      }
    } catch (error) {
      console.error(`❌ Error dropping index ${indexDef.collection}.${indexDef.name}:`, error);
    }
  }
  console.log('🎉 Index cleanup completed!');
}

module.exports = {
  INDEXES,
  ensureIndexes,
  listIndexes,
  dropIndexes
}; 