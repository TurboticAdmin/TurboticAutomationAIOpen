import { NextRequest, NextResponse } from 'next/server';
import { AzureChatOpenAI } from '@langchain/openai';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';
import { ObjectId } from 'mongodb';
import { getDb } from '@/lib/db';
import authenticationBackend from '../../../authentication/authentication-backend';

async function getModelConfig() {
  return {
    azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
    azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
    azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
    azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
    temperature: 0.3,
  };
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    
    // Check authentication
    const currentUser = await authenticationBackend.getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Get automation from database
    const db = getDb();
    const automation = await db.collection('automations').findOne({
      _id: ObjectId.createFromHexString(id),
      $or: [
        { workspaceId: String(currentUser?.workspace?._id) },
        { 'sharedWith.userId': String(currentUser._id) }
      ]
    });

    if (!automation) {
      return NextResponse.json({ error: 'Automation not found or access denied' }, { status: 404 });
    }

    // Support v3 automations (multi-step) and legacy single-file code
    const v3Steps: Array<{ id?: string; name?: string; code?: string }> = Array.isArray((automation as any)?.v3Steps)
      ? (automation as any).v3Steps
      : [];

    let codeForExplanation = '';
    if (v3Steps.length > 0) {
      codeForExplanation = v3Steps
        .map((step: any, idx: number) => `// Step ${idx + 1}: ${step?.name || step?.id || 'unnamed'}\n${step?.code || ''}`)
        .join('\n\n');
    } else {
      codeForExplanation = String(automation.code || '');
    }

    if (!codeForExplanation || codeForExplanation.trim() === '') {
      return NextResponse.json({
        error: 'No code available to explain. Please ensure the automation has code saved.'
      }, { status: 400 });
    }

    // Generate explanation using AI
    const model = new AzureChatOpenAI(await getModelConfig());

    const systemPrompt = `You are an expert automation code analyst.

Goal: Produce a friendly yet technical explanation that matches the following STYLE and SECTION HEADERS exactly. Preserve markdown, bullets, emoji markers, and include short code blocks where shown.

STYLE RULES
- Use concise sentences and bullet points.
- Keep the order and headings EXACTLY as specified below.
- Where appropriate, infer real values from the provided code (env var names, function names, packages).
- Include small code blocks for package imports and function definitions (or signatures) so readers can correlate quickly.

OUTPUT FORMAT (use these exact headings/emojis and structure):

Overall Purpose

This script:
- <bullet 1 describing the high-level step>
- <bullet 2>
- <bullet 3>
- <bullet 4>

📦 Used Packages
\`\`\`js
// one line per import/require you detect in the code
<package import 1>
<package import 2>
\`\`\`

🔹 <package-name-1>
→ One-sentence purpose of this package in this script.
List key fields/objects if relevant (e.g., title, link, etc.).

🔹 <package-name-2>
→ One-sentence purpose of this package in this script.

📰 Function 1: <first function name>
\`\`\`js
<function (or signature) as it appears>
\`\`\`

🔍 What it does:
- Bullet 1
- Bullet 2
- Bullet 3
- Bullet 4 (as needed)

📧 Function 2: <second function name>
\`\`\`js
<function (or signature) as it appears>
\`\`\`

🔍 What it does:
- Bullet 1
- Bullet 2
- Bullet 3
- Bullet 4 (as needed)

🧩 Main Execution Block
\`\`\`js
<IIFE or main runner code>
\`\`\`

🔍 What it does:
- Describe the orchestration and decision points.

⚙️ Environment Variables Needed
You must set these before running:
\`\`\`bash
export <ENV_NAME_1>="..."
export <ENV_NAME_2>="..."
export <ENV_NAME_3>="..."
\`\`\`

🧭 Flow Summary
Start script
   ↓
<Step 1>
   ↓
<Step 2>
   ↓
<Step 3>
   ↓
Log success / handle errors

💡 In short
One or two bullets describing the use cases/benefits in plain language.`;

    const humanPrompt = `Generate the explanation STRICTLY following the required structure and style above (including emojis and headings). Fill each section using the code below:

**Automation Title:** ${automation.title || 'Untitled'}
**Description:** ${automation.description || 'No description provided'}

**Code:**
\`\`\`javascript
${codeForExplanation}
\`\`\`

Important:
- Detect and use the actual package names, function names, and environment variable names from the code.
- Include concise code blocks for imports and functions so readers can map text to code.
- Keep bullets short and concrete.`;

    const response = await model.invoke([
      new SystemMessage({ content: systemPrompt }),
      new HumanMessage({ content: humanPrompt })
    ]);

    const explanation = response.content as string;

    return NextResponse.json({
      success: true,
      explanation,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error explaining code:', error);
    return NextResponse.json(
      { error: 'Failed to explain code. Please try again.' },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. Use POST to explain code.' },
    { status: 405 }
  );
}
