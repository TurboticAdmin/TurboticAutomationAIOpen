import { NextRequest, NextResponse } from 'next/server';
import { generateAISummaryFromContent } from './util';

export async function POST(request: NextRequest) {
    try {
        const { query, results } = await request.json();

        // Validate input
        if (!query) {
            return NextResponse.json(
                { error: 'Query is required' },
                { status: 400 }
            );
        }

        if (!results || !Array.isArray(results) || results.length === 0) {
            return NextResponse.json(
                { error: 'Results array is required and must not be empty' },
                { status: 400 }
            );
        }

        // Validate results format
        const validResults = results.filter(result => 
            result && 
            typeof result === 'object' && 
            result.links && 
            result.pageContent
        );

        if (validResults.length === 0) {
            return NextResponse.json(
                { error: 'No valid results found. Results must have "links" and "pageContent" properties' },
                { status: 400 }
            );
        }

        console.log('🤖 Generating AI summary for query: ' + query + ' with ' + validResults.length + ' sources');

        // Generate AI summary
        const aiSummaryResponse = await generateAISummaryFromContent(query, validResults);

        return NextResponse.json({
            query,
            summary: aiSummaryResponse.summary,
            sources: aiSummaryResponse.sources,
            generatedAt: aiSummaryResponse.generatedAt,
            error: aiSummaryResponse.error
        });

    } catch (error: any) {
        console.error('Web summary error:', error);
        return NextResponse.json(
            { error: 'Web summary failed: ' + error.message },
            { status: 500 }
        );
    }
}


