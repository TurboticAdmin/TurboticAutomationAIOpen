import { NextRequest } from "next/server";
import { searchAutomationComponents } from "@/app/api/vector-search/vector-search";
import authenticationBackend from "../../authentication/authentication-backend";

export async function POST(req: NextRequest) {
    try {
        const currentUser = await authenticationBackend.getCurrentUser(req);
        
        if (!currentUser) {
            return new Response(JSON.stringify({ 
                error: 'Authentication required' 
            }), { 
                headers: { 'Content-Type': 'application/json' }, 
                status: 401 
            });
        }

        const { query } = await req.json();

        if (!query) {
            return new Response(JSON.stringify({ 
                error: 'query is required' 
            }), { 
                headers: { 'Content-Type': 'application/json' }, 
                status: 400 
            });
        }

        const workspaceId = currentUser.workspace ? String(currentUser.workspace._id) : undefined;

        // Search for similar automation components
        const components = await searchAutomationComponents(query, workspaceId);

        return new Response(JSON.stringify({ 
            success: true, 
            components: components || [],
            query: query
        }), { 
            headers: { 'Content-Type': 'application/json' }, 
            status: 200 
        });

    } catch (error: any) {
        console.error('Error searching automation components:', error);
        return new Response(JSON.stringify({ 
            error: 'Failed to search components',
            details: error.message 
        }), { 
            headers: { 'Content-Type': 'application/json' }, 
            status: 500 
        });
    }
}
