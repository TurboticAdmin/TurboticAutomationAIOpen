import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import path from "path";
import fs from 'fs';

const fileUploadsDir = path.join(process.cwd(), 'file-uploads');

// Ensure the file-uploads directory exists
if (!fs.existsSync(fileUploadsDir)) {
    fs.mkdirSync(fileUploadsDir, { recursive: true });
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);
        const executionId = searchParams.get('executionId');

        if (!executionId) {
            return new Response(JSON.stringify({ error: 'ID is required' }), { 
                headers: { 'Content-Type': 'application/json' }, 
                status: 400 
            });
        }

        const execution: any = await getDb().collection('executions').findOne({
            _id: ObjectId.createFromHexString(executionId)
        });

        let screenshot: any = null;

        if (execution?.screenshots?.length > 0) {
            const screenshotFileName = execution.screenshots[execution.screenshots.length - 1];
            const screenshotPath = path.join(fileUploadsDir, screenshotFileName);
            
            // Check if file exists before reading
            if (fs.existsSync(screenshotPath)) {
                try {
                    screenshot = fs.readFileSync(screenshotPath, 'base64');
                } catch (error) {
                    console.error('Error reading screenshot file:', error);
                    // Continue with null screenshot if file read fails
                }
            } else {
                console.warn(`Screenshot file not found: ${screenshotPath}`);
            }
        }

        return new Response(JSON.stringify([screenshot].filter(Boolean)), { 
            headers: { 'Content-Type': 'application/json' } 
        });
    } catch (error) {
        console.error('Error fetching screenshot:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), { 
            headers: { 'Content-Type': 'application/json' }, 
            status: 500 
        });
    }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { base64Screenshot, executionId } = await req.json();

        // Ensure the file-uploads directory exists before writing
        if (!fs.existsSync(fileUploadsDir)) {
            fs.mkdirSync(fileUploadsDir, { recursive: true });
        }

        const screenshotFileName = `${executionId}-${ObjectId.createFromTime(Date.now()).toHexString()}.png`;

        fs.writeFileSync(path.join(fileUploadsDir, screenshotFileName), base64Screenshot, 'base64');

        await getDb().collection('executions').updateOne({
            _id: ObjectId.createFromHexString(executionId)
        }, {
            $push: {
                screenshots: screenshotFileName as any
            }
        });

        return new Response(JSON.stringify({}), { 
            headers: { 'Content-Type': 'application/json' } 
        });
    } catch (error) {
        console.error('Error fetching execution:', error);
        return new Response(JSON.stringify({ error: 'Internal server error' }), { 
            headers: { 'Content-Type': 'application/json' }, 
            status: 500 
        });
    }
} 