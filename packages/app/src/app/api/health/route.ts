import { NextRequest, NextResponse } from "next/server";
import { getConnectionHealth } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const startTime = Date.now();
    
    // Get MongoDB connection health (internal check only)
    const mongoHealth = await getConnectionHealth();
    
    // Get overall response time
    const responseTime = Date.now() - startTime;
    
    // Determine overall health status
    const isHealthy = mongoHealth.status === 'healthy';
    
    // Minimal health response - remove sensitive information
    const healthData = {
      status: isHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString()
    };
    
    return NextResponse.json(healthData, {
      status: isHealthy ? 200 : 503
    });
  } catch (error) {
    console.error('Health check failed:', error);
    
    // Minimal error response - remove sensitive information
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString()
    }, {
      status: 503
    });
  }
} 