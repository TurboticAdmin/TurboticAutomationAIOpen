import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const db = getDb();
        
        const execution = await db.collection('executions').findOne({
            _id: ObjectId.createFromHexString(id)
        });
        
        if (!execution) {
            return new Response(JSON.stringify({ error: 'Execution not found' }), { 
                headers: { 'Content-Type': 'application/json' }, 
                status: 404 
            });
        }
        
        return new Response(JSON.stringify(execution), { 
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