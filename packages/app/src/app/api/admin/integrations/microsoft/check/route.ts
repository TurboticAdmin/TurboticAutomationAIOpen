import { NextRequest, NextResponse } from 'next/server';
import { hasValidMicrosoftIntegrationForExecution } from '@/lib/microsoft-auth';
import { getDb } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { executionId } = body;

    if (!executionId) {
      return NextResponse.json({ error: 'executionId is required' }, { status: 400 });
    }

    // Try to find execution history by executionId first, then by _id (historyId)
    const db = getDb();
    let executionHistory = await db.collection('execution_history').findOne({ 
      executionId: executionId 
    }, { sort: { startedAt: -1 } }); // Get the most recent record if multiple exist

    if (!executionHistory) {
      // Try to find by _id (historyId) as fallback
      try {
        const { ObjectId } = require('mongodb');
        const historyId = new ObjectId(executionId);
        executionHistory = await db.collection('execution_history').findOne({ 
          _id: historyId 
        });
      } catch (error) {
        console.log(`[Microsoft Check API] Invalid ObjectId format for historyId lookup: ${executionId}`);
      }
    }

    if (!executionHistory || !executionHistory.userEmail) {
      
      // Log additional debug info
      const allMatchingRecords = await db.collection('execution_history').find({ 
        executionId: executionId 
      }).toArray();
      
      return NextResponse.json({ 
        hasIntegration: false,
        error: 'No user email found in execution history'
      });
    }

    const hasIntegration = await hasValidMicrosoftIntegrationForExecution(executionId);

    return NextResponse.json({ 
      hasIntegration: hasIntegration,
      userId: executionHistory.userEmail
    });

  } catch (error) {
    console.error(`[Microsoft Check API] Error:`, error);
    return NextResponse.json({ 
      hasIntegration: false,
      error: `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}` 
    }, { status: 500 });
  }
} 