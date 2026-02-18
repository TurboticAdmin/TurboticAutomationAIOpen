import { getDb } from '@/lib/db';
import authenticationBackend from '../authentication/authentication-backend';
import { ObjectId } from 'mongodb';

export async function getPerplexityResponse(request: any, query: string, scriptRunnerHeader: string, executionId: string) {
    try {
    let options = request.options || {};

    const {
        model = 'sonar', // Default Perplexity model
        maxTokens = 1000,
        temperature = 0.2,
        includeImages = false,
        includeDomains = [], // Optional: specific domains to include
        excludeDomains = [], // Optional: specific domains to exclude
    } = options;

    // Rate limiting: Check if workspace has exceeded daily search limit
    const db = getDb();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check if this request is from a script runner (internal service)
    const isScriptRunner = scriptRunnerHeader === 'true';

    let currentUser = null;
    let workspaceId = null;
    let userId = null;

    if (isScriptRunner && executionId) {
        // For script runners, get user info from the execution
        const execution = await db.collection('executions').findOne({
            _id: ObjectId.createFromHexString(executionId)
        });

        if (!execution) {
            const errorResponse = {
                error: 'Execution not found',
                status: 404,
                timestamp: new Date().toISOString()
            };
            return errorResponse;
        }

        const automation = await db.collection('automations').findOne({
            _id: ObjectId.createFromHexString(execution.automationId)
        });

        if (!automation) {
            const errorResponse = {
                error: 'Automation not found',
                status: 404,
                timestamp: new Date().toISOString()
            };
            return errorResponse;
        }

        const workspace = await db.collection('workspaces').findOne({
            _id: ObjectId.createFromHexString(automation.workspaceId)
        });

        if (!workspace) {
            const errorResponse = {
                error: 'Workspace not found',
                status: 404,
                timestamp: new Date().toISOString()
            };
            return errorResponse;
        }

        const user = await db.collection('users').findOne({
            _id: ObjectId.createFromHexString(workspace.ownerUserId)
        });

        if (!user) {
            const errorResponse = {
                error: 'User not found',
                status: 404,
                timestamp: new Date().toISOString()
            };
            return errorResponse;
        }

        workspaceId = workspace._id.toString();
        userId = user._id.toString();
        currentUser = { ...user, workspace };

    } else if (!isScriptRunner) {
        // Get current user from authentication for regular requests
        currentUser = await authenticationBackend.getCurrentUser(request);
        if (!currentUser) {
            const errorResponse = {
                error: 'Authentication required',
                status: 401,
                timestamp: new Date().toISOString()
            };
            return errorResponse;
        }

        if (!currentUser.workspace?._id || !currentUser._id) {
            const errorResponse = {
                error: 'Invalid user context - missing workspace or user ID',
                status: 400,
                timestamp: new Date().toISOString()
            };
            return errorResponse;
        }

        workspaceId = currentUser.workspace._id.toString();
        userId = currentUser._id.toString();
    } else {
        const errorResponse = {
            error: 'Script runner requests require execution ID',
            status: 400,
            timestamp: new Date().toISOString()
        };
        return errorResponse;
    }

    // Check usage for web-search-v2 specifically (aggregated daily usage)
    const usageRecord = await db.collection('webSearchV2Usage').findOne({
        userId,
        date: new Date(today.getFullYear(), today.getMonth(), today.getDate())
    });
    
    const searchCount = usageRecord?.totalSearches || 0;

    const DAILY_SEARCH_LIMIT = 20;
    if (searchCount >= DAILY_SEARCH_LIMIT) {
        const errorResponse = {
            error: 'Daily Perplexity search limit exceeded',
            limit: DAILY_SEARCH_LIMIT,
            used: searchCount,
            resetTime: new Date(today.getTime() + 24 * 60 * 60 * 1000).toISOString()
        };
        return errorResponse;
    }

    console.log('🔍 Searching Web with Perplexity for: ' + query);

    // Check if Perplexity API key is available
    const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
    if (!perplexityApiKey) {
        const errorResponse = {
            error: 'Perplexity API key not configured',
            status: 500,
            timestamp: new Date().toISOString()
        };
        return errorResponse;
    }

    // Prepare messages for the chat completion
    const messages = [
        {
            role: 'system',
            content: 'You are a helpful AI assistant that provides accurate, comprehensive answers with citations. When searching, provide detailed information with relevant links and sources.'
        },
        {
            role: 'user',
            content: query
        }
    ];

    // Call Perplexity API using direct fetch with retry mechanism
    let perplexityResponse: Response;
    let lastError: any = null;
    const maxRetries = 3;
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            perplexityResponse = await fetch('https://api.perplexity.ai/chat/completions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${perplexityApiKey}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'application/json',
                    'Connection': 'keep-alive'
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    max_tokens: maxTokens,
                    temperature: temperature,
                    top_p: 0.9,
                    return_citations: true,
                    search_domain_filter: includeDomains.length > 0 ? includeDomains : undefined,
                    return_images: includeImages,
                    return_related_questions: true,
                    search_recency_filter: 'month',
                    top_k: 0,
                    stream: false,
                    presence_penalty: 0,
                    frequency_penalty: 1
                }),
                signal: AbortSignal.timeout(30000) // 30 second timeout
            });
            
            // If we get here, the request was successful
            break;
            
        } catch (error: any) {
            lastError = error;
            
            // Check if it's an SSL error or network error that might be retryable
            const isRetryableError = error.message.includes('SSL') || 
                                   error.message.includes('packet length') ||
                                   error.message.includes('ECONNRESET') ||
                                   error.message.includes('ETIMEDOUT') ||
                                   error.message.includes('fetch failed');
            
            if (!isRetryableError || attempt === maxRetries - 1) {
                break;
            }
            
            // Wait before retry with exponential backoff
            const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
            console.log(`Retrying Perplexity API call in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    // If we get here and perplexityResponse is undefined, all retries failed
    if (!perplexityResponse!) {
        throw lastError;
    }

    if (!perplexityResponse.ok) {
        const errorText = await perplexityResponse.text();
        console.error('Perplexity API Error:', perplexityResponse.status, errorText);
        throw new Error(`Perplexity API failed: ${perplexityResponse.statusText} - ${errorText}`);
    }

    const perplexityResult = await perplexityResponse.json();

    if (!perplexityResult.choices || perplexityResult.choices.length === 0) {
        const response = {
            error: 'No results found',
            status: 404,
            timestamp: new Date().toISOString()
        };
        return response;
    }

    const choice = perplexityResult.choices[0];
    const content = choice.message.content;
    const citations = choice.citations || [];
    const relatedQuestions = perplexityResult.related_questions || [];

    // Format results to match the expected structure similar to web-search
    const formattedResults = citations.map((citation: string, index: number) => ({
        links: citation,
        pageContent: `Citation ${index + 1}: Referenced in the AI response`,
        title: `Source ${index + 1}`,
        snippet: `This source was cited in the Perplexity AI response`,
        citationIndex: index + 1
    }));

    // Add the AI response as the main content
    const mainResult = {
        links: 'https://perplexity.ai',
        pageContent: content,
        title: `Perplexity AI Response: ${query}`,
        snippet: 'AI-generated comprehensive answer with citations',
        aiResponse: true,
        citations: citations,
        relatedQuestions: relatedQuestions,
        model: model,
        tokensUsed: perplexityResult.usage?.total_tokens || 0

    };

    // Combine AI response with citations
    const allResults = [mainResult, ...formattedResults];

    // Track successful search usage
    // Track successful search usage (aggregate daily usage)
    await db.collection('webSearchV2Usage').findOneAndUpdate(
        {
            userId,
            date: new Date(today.getFullYear(), today.getMonth(), today.getDate())
        },
        {
            $set: {
                workspaceId,
                workspaceName: currentUser.workspace.name,
                userEmail: currentUser.email,
                lastQuery: query,
                lastModel: model,
                lastTokensUsed: perplexityResult.usage?.total_tokens || 0,
                lastCitationsCount: citations.length,
                lastResultsCount: allResults.length,
                lastTimestamp: Date.now()
            },
            $inc: { 
                totalSearches: 1,
                totalTokensUsed: perplexityResult.usage?.total_tokens || 0,
                totalCitationsCount: citations.length,
                totalResultsCount: allResults.length
            },
            $setOnInsert: {
                userId,
                date: new Date(today.getFullYear(), today.getMonth(), today.getDate()),
                firstSearchAt: Date.now(),
                createdAt: new Date()
            }
        },
        {
            upsert: true,
            returnDocument: 'after'
        }
    );

    // Clean up old usage records (older than 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    await db.collection('webSearchV2Usage').deleteMany({
        date: { $lt: thirtyDaysAgo }
    });

    console.log(`🔍 Perplexity search completed: ${allResults.length} results, ${citations.length} citations`);

    return {
        query,
        data: allResults,
        totalResults: allResults.length,
        citations: citations,
        relatedQuestions: relatedQuestions,
        model: model,
        tokensUsed: perplexityResult.usage?.total_tokens || 0,
        usage: {
            dailyLimit: DAILY_SEARCH_LIMIT,
            used: searchCount + 1,
            remaining: DAILY_SEARCH_LIMIT - (searchCount + 1)
        },
        content: content
    };

} catch (error: any) {
    console.error('Perplexity search error:', {
        error: error.message,
        stack: error.stack,
        query: query,
        timestamp: new Date().toISOString(),
        errorType: error.name
    });
    const errorResponse = {
        error: 'Perplexity search failed: ' + error.message,
        errorType: error.name,
        timestamp: new Date().toISOString(),
        status: 500
    };
    return errorResponse;
}
}
