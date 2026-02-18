import { SystemMessage } from "@langchain/core/messages";
import { AzureChatOpenAI } from "@langchain/openai";

// Get model configuration (same pattern as game.ts)
export async function getModelConfig() {
    return {
        azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
        azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
        azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
        azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
        temperature: 0.3,
    }
}

// Generate AI summary using AzureChatOpenAI (same pattern as summariseMessages)
export async function generateAISummaryFromContent(query: string, results: any[]) {
    try {
        // Prepare content for summarization (optimized for speed)
        const contentToSummarize = results
            .filter(result => result.pageContent && result.pageContent.length > 0)
            .map(result => ({
                title: result.title || 'Untitled',
                url: result.links,
                snippet: result.snippet || '',
                content: result.pageContent.substring(0, 5000) // Reduced content length for speed
            }));

        if (contentToSummarize.length === 0) {
            return {
                summary: 'No content available for summarization.',
                sources: 0,
                error: false,
                generatedAt: new Date().toISOString()
            };
        }

        // Create context for AI analysis
        const formattedSources = contentToSummarize.map((item, index) => {
            return [
                `Source ${index + 1}: ${item.title}`,
                `URL: ${item.url}`,
                `Snippet: ${item.snippet}`,
                `Content: ${item.content}`
            ].join('\n');
        });

        // Initialize AzureChatOpenAI model (same pattern as summariseMessages)
        const summarizerModel = new AzureChatOpenAI(await getModelConfig());

        // Generate summary using LangChain pattern
        const summary = await summarizerModel.invoke([
            new SystemMessage({
                content: [
                    'You are an expert research assistant that provides comprehensive summaries of web search results.',
                    'Your primary goal is to synthesize information from multiple sources to directly answer the user\'s query.',
                    'Focus on:',
                    '1. Directly answering the user\'s query',
                    '2. Synthesizing information from multiple sources',
                    '3. Highlighting key insights and findings',
                    '4. Mentioning specific sources when relevant',
                    '5. Being concise but comprehensive (max 500 words)',
                    '---',
                    `User Query: ${query}`,
                    'Search Results:',
                    ...formattedSources
                ].join('\n')
            })
        ]);

        const summaryContent = summary?.content || 'No summary generated';

        return {
            summary: summaryContent,
            sources: contentToSummarize.length,
            query: query,
            generatedAt: new Date().toISOString(),
            error: false
        };

    } catch (error: any) {
        console.error('Azure OpenAI summary generation error:', error);
        return {
            summary: `Failed to generate AI summary: ${error.message}`,
            sources: 0,
            error: true,
            generatedAt: new Date().toISOString()
        };
    }
}