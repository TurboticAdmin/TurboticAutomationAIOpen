import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const db = getDb();
    
    // Get all Microsoft integrations
    const integrations = await db.collection('integrations').find({ app: 'microsoft' }).toArray();
    
    // Get recent executions (last 24 hours)
    const recentExecutions = await db.collection('execution_history').find({
      startedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    }).sort({ startedAt: -1 }).limit(10).toArray();
    
    // Get all executions for the last 7 days to check for duplicates
    const allRecentExecutions = await db.collection('execution_history').find({
      startedAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }).sort({ startedAt: -1 }).toArray();
    
    // Group by executionId to find duplicates
    const executionIdGroups: { [key: string]: any[] } = {};
    allRecentExecutions.forEach((exec: any) => {
      const execId = exec.executionId;
      if (!executionIdGroups[execId]) {
        executionIdGroups[execId] = [];
      }
      executionIdGroups[execId].push(exec);
    });
    
    // Find duplicates
    const duplicates = Object.entries(executionIdGroups)
      .filter(([execId, records]) => records.length > 1)
      .map(([execId, records]) => ({
        executionId: execId,
        count: records.length,
        records: records.map((r: any) => ({
          _id: r._id,
          userEmail: r.userEmail,
          status: r.status,
          startedAt: r.startedAt,
          triggerType: r.triggerType
        }))
      }));
    
    // Get the current EXECUTION_ID from query params if provided
    const url = new URL(request.url);
    const currentExecutionId = url.searchParams.get('executionId');
    
    let currentExecutionDetails = null;
    if (currentExecutionId) {
      // Find all records with this executionId
      const matchingRecords = await db.collection('execution_history').find({
        executionId: currentExecutionId
      }).toArray();
      
      currentExecutionDetails = {
        executionId: currentExecutionId,
        totalRecords: matchingRecords.length,
        records: matchingRecords.map((r: any) => ({
          _id: r._id,
          userEmail: r.userEmail,
          status: r.status,
          startedAt: r.startedAt,
          triggerType: r.triggerType,
          triggerSource: r.triggerSource
        }))
      };
    }
    
    return NextResponse.json({ 
      integrations, 
      recentExecutions, 
      totalIntegrations: integrations.length, 
      totalRecentExecutions: recentExecutions.length,
      duplicates,
      totalDuplicates: duplicates.length,
      currentExecutionDetails,
      summary: {
        totalExecutionsLast7Days: allRecentExecutions.length,
        uniqueExecutionIds: Object.keys(executionIdGroups).length,
        duplicateExecutionIds: duplicates.length
      }
    });
  } catch (error) {
    console.error('[Debug API] Error:', error);
    return NextResponse.json({ 
      error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}` 
    }, { status: 500 });
  }
} 