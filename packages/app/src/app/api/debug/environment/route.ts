import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
    const environmentInfo = {
        APP_ENV: process.env.APP_ENV,
        NAMESPACE: process.env.NAMESPACE,
        AUTOMATIONAI_ENDPOINT: process.env.AUTOMATIONAI_ENDPOINT,
        RABBIT_MQ_ENDPOINT: process.env.RABBIT_MQ_ENDPOINT,
        MONGO_URI: process.env.MONGO_URI ? '***SET***' : 'NOT SET',
        isDevelopment: process.env.APP_ENV === 'development',
isTest: process.env.APP_ENV === 'test',
isProduction: process.env.APP_ENV === 'production',
detectedEnvironment: process.env.APP_ENV === 'development' ? 'development' :
process.env.APP_ENV === 'test' ? 'test' :
process.env.APP_ENV === 'production' ? 'production' : 'unknown',
        allEnvVars: Object.keys(process.env).filter(key => key.includes('NODE') || key.includes('ENV') || key.includes('NAMESPACE'))
    };

    return new Response(JSON.stringify(environmentInfo, null, 2), {
        headers: { "Content-Type": "application/json" },
        status: 200
    });
} 