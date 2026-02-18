import { NextRequest, NextResponse } from 'next/server';
import { AzureChatOpenAI } from "@langchain/openai";

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: 'Code is required' }, { status: 400 });
    }

    // Create a specific prompt for description generation
    const prompt = `Generate a concise, professional description for this automation script. 

Requirements:
- Maximum 300 characters
- Focus on the main functionality and purpose
- Be specific about what the automation does
- Use clear, professional language
- Return only the description text, no formatting or explanations

Script to analyze:
${code.substring(0, 2000)}${code.length > 2000 ? '...' : ''}`;

    // Use the same AI model as the chat functionality
    const model = new AzureChatOpenAI({
      azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
      azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
      azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
      azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
      temperature: 0
    });

    const response = await model.invoke(prompt);
    const description = response.content as string;

    // Clean up the response
    let cleanDescription = description
      .replace(/^```.*?\n?/g, '') // Remove markdown code blocks
      .replace(/```$/g, '')
      .replace(/^["']|["']$/g, '') // Remove quotes
      .trim();
    
    // Limit to 300 characters
    if (cleanDescription.length > 300) {
      cleanDescription = cleanDescription.substring(0, 297) + '...';
    }

    return NextResponse.json({ description: cleanDescription });
  } catch (error) {
    console.error('Error generating description:', error);
    return NextResponse.json(
      { error: 'Failed to generate description' },
      { status: 500 }
    );
  }
} 