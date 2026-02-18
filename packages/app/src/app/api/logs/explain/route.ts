import { NextRequest, NextResponse } from 'next/server';
import { AzureChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import authenticationBackend from '../../authentication/authentication-backend';

async function getModelConfig() {
  return {
    azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
    azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
    azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
    temperature: 0.3,
  };
}

export async function POST(request: NextRequest) {
    // Check authentication
    const currentUser = await authenticationBackend.getCurrentUser(request);
    if (!currentUser) {
        return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
  try {
    const body = await request.json();
    const { logs, executionStatus, errorMessage } = body;

    if (!logs || !Array.isArray(logs)) {
      return NextResponse.json(
        { error: 'Logs array is required' },
        { status: 400 }
      );
    }

    // Initialize Azure OpenAI model
    const model = new AzureChatOpenAI(await getModelConfig());

    // Prepare context for analysis
    const logsContent = logs.join('\n');
    const statusContext = executionStatus ? `Execution Status: ${executionStatus}` : '';
    const errorContext = errorMessage ? `Error Message: ${errorMessage}` : '';

    // Create the analysis prompt
    const systemPrompt = new SystemMessage({
      content: `You are an expert automation log analyzer. Your task is to analyze execution logs and produce the output in clean, well-structured Markdown format.

✅ Status Rules
✅ Green if successful
❌ Red if failed or partially failed

📋 What to Do
Summarize briefly what happened during execution.
Highlight key findings → include only important events, warnings, and errors.

🚫 Exclude anything related to dependencies, vulnerabilities, or installation success.
List issues directly (no classification here).

In Next Steps, classify issues:
🔧 Code errors → tell the user to click “Fix with AI”
🔑 User errors (API keys, permissions, invalid inputs) → provide clear, step-by-step instructions
If successful, suggest optimizations.

📝 Required Output Format (Markdown)
**Status:** ✅ Success / ❌ Failure / ❌ Partial Success  

**Summary:**  
<short overview of the run>  

**Key Findings:**  
- <event/warning/error #1>  
- <event/warning/error #2>  

**Issues Identified:**  
- <problem #1>  
- <problem #2>  

**Next Steps:**  
- 🔧 For code errors → Click “Fix with AI”  
- 🔑 For user errors → Step-by-step instructions  
- 🚀 For successful runs → Suggest optimizations  `
    });

    const humanPrompt = new HumanMessage({
      content: `Please analyze these automation execution logs:

${statusContext}
${errorContext}

**Logs:**
${logsContent}

Please provide a detailed analysis and recommendations.`
    });

    // Get AI analysis
    const response = await model.invoke([systemPrompt, humanPrompt]);
    
    const explanation = response.content as string;

    return NextResponse.json({
      success: true,
      explanation,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error analyzing logs:', error);
    return NextResponse.json(
      { error: 'Failed to analyze logs. Please try again.' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}