import { AzureOpenAIEmbeddings } from "@langchain/openai";
import { getVectorDb } from "../../../lib/vector-db";
import { AzureChatOpenAI } from "@langchain/openai";
import { SystemMessage } from "@langchain/core/messages";

interface VectorSearchEntry {
    _id?: any;
    query: string;
    embedding: number[];
    results: any[];
    createdAt: Date;
    lastAccessed: Date;
    accessCount: number;
    workspaceId?: string;
    automationId?: string;
}

interface AutomationComponent {
    name?: string;
    script: string;
    environmentVariables: string[];
    dependencies: string[];
}

const collectionName = 'internal_automation_code_patterns';


/**
 * Generate embeddings for text using azure openai
 */
async function generateEmbedding(text: string): Promise<number[]> {
    try {
        let embeddingConfig: any = {};
        embeddingConfig = {
            azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
            azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
            azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME_EMBEDDING,
            azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION_EMBEDDING,
        }
        const embeddings = new AzureOpenAIEmbeddings({
            ...embeddingConfig
        });
        const vector = await embeddings.embedQuery(text);
        return vector;
    } catch (error: any) {
        console.error('Failed to generate embedding:', error);
        throw error;
    }
}

/**
 * Find similar searches using vector similarity
 */
async function findSimilarSearches(queryEmbedding: number[], workspaceId?: string): Promise<VectorSearchEntry[]> {
    const db = getVectorDb();
    const collection = db.collection(collectionName);
    let query: any = [
        {
            $vectorSearch: {
                index: "vector_index",          // name of your Atlas vector index
                path: "embedding",              // vector field
                queryVector: queryEmbedding,    // the vector from text-embedding-3-small
                numCandidates: 100,             // number of candidates to consider
                limit: 1                       // top results to return
            }
        },
        {
            $addFields: {
                score: { $meta: "vectorSearchScore" }
            }
        },
        {
            $match: {
                score: { $gt: 0.78 }            // ✅ threshold tuned for text-embedding-3-small
            }
        },
        {
            $sort: { score: -1 }              // highest similarity first
        }
    ];
    ;

    // console.log(`🔍 Finding similar searches for: "${queryEmbedding}"`);

    const cacheEntries = await collection.aggregate(query).toArray();

    return cacheEntries as VectorSearchEntry[];
}


/**
 * Store automation components after successful execution
 */
export async function storeAutomationComponents(
    automationId: string,
    script: string,
    workspaceId?: string
): Promise<void> {
    try {
        const components = await analyzeScriptComponents(script, automationId);

        if (components.length === 0) {
            console.log(`No components found in script for automation: ${automationId}`);
            return;
        }

        console.log(`Found ${components.length} components in script for automation: ${automationId}`);

        for (const component of components) {
            // don't store component if it already exists
            // Generate embedding for the query
            if (component.name) {
                const queryEmbedding = await generateEmbedding(component.name);
                const existingComponent = await findSimilarSearches(queryEmbedding, workspaceId);
                if (existingComponent.length > 0) {
                    console.log(`Component already exists: ${component.name}`);
                    continue;
                }
                else {
                    await storeComponent(component, workspaceId, automationId);
                }
            }
        }

    } catch (error: any) {
        console.error('Failed to store automation components:', error);
        throw error;
    }
}

/**
 * Analyze script to extract integration components using search queries from chat context
 */
async function analyzeScriptComponents(script: string, automationId: string): Promise<AutomationComponent[]> {
    const components: AutomationComponent[] = [];

    // Remove built-in functions from script to get clean script
    const cleanScript = await removeBuiltInFunctions(script);

    // Extract custom functions (excluding built-in Turbotic functions)
    const customFunctions = await extractCustomFunctions(cleanScript);

    console.log(`Found ${customFunctions.length} custom functions:`);

    // Map each function to the best matching query
    for (const func of customFunctions) {
        const functionDescription = await generateSuggestedQuery(func);
        const component = await mapFunctionToComponent(functionDescription, func, cleanScript);
        if (component) {
            components.push(component);
        }
    }

    return components;
}

/**
 * Generate a suggested query based on function logic using Azure OpenAI
 */
async function generateSuggestedQuery(func: { name: string, body: string, fullText: string }): Promise<string> {
    try {
     

        // Get model configuration
        const modelConfig = {
            azureOpenAIApiInstanceName: process.env.AZURE_OPENAI_API_INSTANCE_NAME,
            azureOpenAIApiKey: process.env.AZURE_OPENAI_API_KEY,
            azureOpenAIApiDeploymentName: process.env.AZURE_OPENAI_API_DEPLOYMENT_NAME,
            azureOpenAIApiVersion: process.env.AZURE_OPENAI_API_VERSION,
            temperature: 0.1, // Low temperature for consistent results
        };

        const model = new AzureChatOpenAI(modelConfig);

        const prompt = `Analyze this JavaScript function and generate a clear, descriptive query that explains what this function does.

Function Name: ${func.name}

Function Code:
${func.fullText}

Requirements:
1. Generate a concise query (max 8 words) that describes the function's purpose
2. Include the service/API name if applicable (SendGrid, HubSpot, Microsoft, Slack, etc.)
3. Include the main action (Send, Fetch, Create, Update, Delete, Process)
4. Include the data type being handled (email, contacts, users, files, etc.)
5. Use professional, clear language

Examples of good queries:
- "SendGrid Send email notifications"
- "HubSpot Fetch contacts from CRM"
- "Microsoft Graph API Fetch users"
- "Slack Send messages to channel"
- "Process and validate form data"

Generate only the query text, no explanations or additional text.`;

        const response = await model.invoke([
            new SystemMessage({
                content: prompt
            })
        ]);

        const suggestedQuery = response.content as string;

        // Clean up the response
        const cleanQuery = suggestedQuery
            .replace(/^["']|["']$/g, '') // Remove quotes
            .replace(/^Query:\s*/i, '') // Remove "Query:" prefix if present
            .trim();

        console.log(`🤖 AI-generated query for ${func.name}: "${cleanQuery}"`);

        return cleanQuery || `${func.name} function operations`; // Fallback if AI fails

    } catch (error) {
        console.error('Error generating AI query:', error);
        // Fallback to simple function name-based query
        return `${func.name} function operations`;
    }
}

/**
 * Map function to component based on search query
 */
async function mapFunctionToComponent(query: string, func: { name: string, body: string, fullText: string }, script: string): Promise<AutomationComponent | null> {

    return {
        name: query,
        script: func.fullText, // Store the complete function
        environmentVariables: await extractEnvironmentVariables(script, query),
        dependencies: await extractDependencies(script),
    };
}


/**
 * Remove built-in Turbotic functions from script
 */
async function removeBuiltInFunctions(script: string): Promise<string> {
    // Built-in Turbotic functions to remove
    const builtInFunctions = [
        'publishScreenshot', 'simplifyHtml', 'findSelectorsUsingAI',
        'getMicrosoftAccessTokenFromTurbotic', 'hasMicrosoftIntegration',
        'searchWebWithTurboticAI', 'extractWebContentWithTurboticAI', 'pingUrls',
        'chatWithOpenAI'
    ];

    let cleanScript = script;

    // Remove function declarations for built-in functions
    for (const funcName of builtInFunctions) {
        // Remove async function declarations
        const asyncFuncRegex = new RegExp(`async\\s+function\\s+${funcName}\\s*\\([^)]*\\)\\s*\\{[^}]*\\}`, 'g');
        cleanScript = cleanScript.replace(asyncFuncRegex, '');

        // Remove const function declarations
        const constFuncRegex = new RegExp(`const\\s+${funcName}\\s*=\\s*async\\s*\\([^)]*\\)\\s*=>\\s*\\{[^}]*\\}`, 'g');
        cleanScript = cleanScript.replace(constFuncRegex, '');

        // Remove function declarations
        const funcRegex = new RegExp(`function\\s+${funcName}\\s*\\([^)]*\\)\\s*\\{[^}]*\\}`, 'g');
        cleanScript = cleanScript.replace(funcRegex, '');
    }

    // Clean up extra whitespace and empty lines
    cleanScript = cleanScript.replace(/\n\s*\n\s*\n/g, '\n\n');
    cleanScript = cleanScript.trim();

    return cleanScript;
}


/**
 * Extract custom functions from script (excluding Turbotic built-ins)
 */
async function extractCustomFunctions(script: string): Promise<Array<{ name: string, body: string, fullText: string }>> {
    const functions: Array<{ name: string, body: string, fullText: string }> = [];
    // Match function declarations (async function, const func = async, function)
    const functionRegex = /(?:async\s+function\s+(\w+)|const\s+(\w+)\s*=\s*async\s*\(|function\s+(\w+))/g;
    let match;

    while ((match = functionRegex.exec(script)) !== null) {
        const functionName = match[1] || match[2] || match[3];

        // Extract function body
        const functionBody = await extractFunctionBody(script, match.index);
        if (functionBody) {
            functions.push({
                name: functionName,
                body: functionBody.body,
                fullText: functionBody.fullText
            });
        }
    }

    return functions;
}

/**
 * Extract function body from script
 */
async function extractFunctionBody(script: string, startIndex: number): Promise<{ body: string, fullText: string } | null> {
    let braceCount = 0;
    let startBrace = -1;
    let endBrace = -1;
    let inString = false;
    let stringChar = '';

    for (let i = startIndex; i < script.length; i++) {
        const char = script[i];
        const prevChar = i > 0 ? script[i - 1] : '';

        // Handle string literals
        if (!inString && (char === '"' || char === "'" || char === '`')) {
            inString = true;
            stringChar = char;
        } else if (inString && char === stringChar && prevChar !== '\\') {
            inString = false;
            stringChar = '';
        }

        if (!inString) {
            if (char === '{') {
                if (startBrace === -1) startBrace = i;
                braceCount++;
            } else if (char === '}') {
                braceCount--;
                if (braceCount === 0) {
                    endBrace = i;
                    break;
                }
            }
        }
    }

    if (startBrace !== -1 && endBrace !== -1) {
        const fullText = script.substring(startIndex, endBrace + 1);
        const body = script.substring(startBrace + 1, endBrace);
        return { body, fullText };
    }

    return null;
}

/**
 * Extract environment variables from script
 */
async function extractEnvironmentVariables(script: string, query: string): Promise<string[]> {
    const envVars: string[] = [];
    const envRegex = /process\.env\.([A-Z_]+)/g;
    let match;

    while ((match = envRegex.exec(script)) !== null) {
        envVars.push(match[1]);
    }

    return [...new Set(envVars)]; // Remove duplicates
}

/**
 * Extract dependencies from script
 */
async function extractDependencies(script: string): Promise<string[]> {
    const dependencies: string[] = [];
    const requireRegex = /require\(['"]([^'"]+)['"]\)/g;
    let match;

    while ((match = requireRegex.exec(script)) !== null) {
        dependencies.push(match[1]);
    }

    return [...new Set(dependencies)]; // Remove duplicates
}


/**
 * Store individual component
 */
async function storeComponent(component: AutomationComponent, workspaceId?: string, automationId?: string): Promise<void> {
    const now = new Date();
    const db = getVectorDb();
    const collection = db.collection(collectionName);

    // Use the component's description as the search query (it contains the original query)
    const searchQuery = component?.name?.replace(/.*\(from query: "([^"]+)"\).*/, '$1');

    // Generate embedding for the query
    const queryEmbedding = await generateEmbedding(searchQuery || '');

    const componentEntry = {
        query: searchQuery?.trim() || '',
        embedding: queryEmbedding,
        script: component?.script || '',
        environmentVariables: component?.environmentVariables || [],
        dependencies: component?.dependencies || [],
        createdAt: now,
        lastAccessed: now,
        accessCount: 1,
        // workspaceId: workspaceId || undefined,
        // automationId: automationId || undefined,
    };

    // Insert the component entry
    await collection.insertOne(componentEntry);

    console.log(`💾 Stored component: ${component.name} with query: "${searchQuery}"`);
}

/**
 * Search for similar automation components
 */
export async function searchAutomationComponents(query: string, workspaceId?: string): Promise<AutomationComponent[] | null> {
    try {

        const db = getVectorDb();
        const collection = db.collection(collectionName);

        console.log(`🔍 Searching for similar automation components for: "${query}"`);

        // Generate embedding for the query
        const queryEmbedding = await generateEmbedding(query);

        // Find similar components
        const similarSearches: any[] = await findSimilarSearches(queryEmbedding, workspaceId);

        console.log(`🔍 Found ${similarSearches.length} similar automation components for: "${query}"`);

        if (similarSearches.length > 0) {

            if (similarSearches.length > 0) {

                for (const search of similarSearches) {

                    // Update access info for the best match
                    await collection.updateOne(
                        { _id: search._id },
                        {
                            $set: { lastAccessed: new Date() },
                            $inc: { accessCount: 1 }
                        }
                    );
                }

            }
            console.log(`🎯 Found ${similarSearches.length} similar automation components for: "${query}"`);
            return similarSearches;
        }

        return null;
    } catch (error: any) {
        console.error('Automation component search error:', error);
        return null;
    }
}

