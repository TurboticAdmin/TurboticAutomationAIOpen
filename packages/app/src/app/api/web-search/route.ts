import { NextRequest, NextResponse } from 'next/server';
import { getPerplexityResponse } from '../web-search-v2/util';

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        const { query, options = {} } = await request.json();

        // Call internal Perplexity API with retry mechanism for SSL errors
        let perplexityResponse: any;
        let perplexityLastError: any = null;
        const perplexityMaxRetries = 3;
        
        for (let attempt = 0; attempt < perplexityMaxRetries; attempt++) {
            try {
                const scriptRunnerHeader = request.headers.get('X-Script-Runner') || '';
                const executionId = request.headers.get('X-Execution-Id') || '';
                perplexityResponse = await getPerplexityResponse({ options }, query, scriptRunnerHeader, executionId);
                // If we get here, the request was successful
                break;
                
            } catch (error: any) {
                perplexityLastError = error;
                
                // Check if it's an SSL error or network error that might be retryable
                const isRetryableError = error.message.includes('SSL') || 
                                       error.message.includes('packet length') ||
                                       error.message.includes('ECONNRESET') ||
                                       error.message.includes('ETIMEDOUT') ||
                                       error.message.includes('fetch failed');
                
                if (!isRetryableError || attempt === perplexityMaxRetries - 1) {
                    break;
                }
                
                // Wait before retry with exponential backoff
                const delay = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
                console.log(`Retrying internal Perplexity API call in ${delay}ms (attempt ${attempt + 1}/${perplexityMaxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
        
        // If we get here and perplexityResponse is undefined, all retries failed
        if (!perplexityResponse) {
            console.error('Internal Perplexity API failed after retries:', perplexityLastError);
            return NextResponse.json({
                error: 'Perplexity API failed: ' + perplexityLastError.message,
                errorType: perplexityLastError.name,
                timestamp: new Date().toISOString()
            }, { status: 500 });
        }
        
        // perplexityResponse is already a parsed object from getPerplexityResponse
        // No need to call .json() or check .ok property
        return NextResponse.json({
            query,
            content: perplexityResponse?.content,
            totalResults: perplexityResponse?.totalResults,
            usage: perplexityResponse?.usage
        });

    } catch (error: any) {
        console.error('Web search error:', error);
        return NextResponse.json(
            { error: 'Web search failed: ' + error.message },
            { status: 500 }
        );
    }
}
