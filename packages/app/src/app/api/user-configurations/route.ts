import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import authenticationBackend from "../authentication/authentication-backend";
import { encrypt, decrypt } from "@/lib/encryption";

export async function GET(req: NextRequest) {
  try {
    const currentUser = await authenticationBackend.getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const db = getDb();
    const workspace = await db.collection('workspaces').findOne({ ownerUserId: String(currentUser._id) });
    if(!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }
    const configurations: any = await db.collection('environment_variables_values').findOne({ workspaceId: String(workspace._id) });

    // Decrypt values for display
    const decryptedConfigurations = configurations?.environmentVariables?.map((config: any) => {
      try {
        // Handle new multi-environment structure
        if (config.value && typeof config.value === 'object') {
          // Always include all three properties, even if undefined, so frontend can detect them
          // Use null instead of undefined so JSON.stringify includes them
          const decryptedValues: any = {
            dev: (config.value.dev !== undefined && config.value.dev !== null) ? decrypt(config.value.dev) : null,
            test: (config.value.test !== undefined && config.value.test !== null) ? decrypt(config.value.test) : null,
            production: (config.value.production !== undefined && config.value.production !== null) ? decrypt(config.value.production) : null
          };
          
          return {
            ...config,
            value: decryptedValues
          };
        } else {
          // Handle Any single value structure (applies to all environments)
          return {
            ...config,
            value: decrypt(config.value)
          };
        }
      } catch (error) {
        console.error('Decryption error for config:', config._id, error);
        // Handle new multi-environment structure error
        if (config.value && typeof config.value === 'object') {
          return {
            ...config,
            value: {
              dev: '[Decryption Error]',
              test: '[Decryption Error]',
              production: '[Decryption Error]'
            }
          };
        } else {
          // Handle Any single value structure error
          return {
            ...config,
            value: '[Decryption Error]'
          };
        }
      }
    });

    return NextResponse.json({ configurations: decryptedConfigurations || [] });
  } catch (error) {
    console.error("Error fetching user configurations:", error);
    return NextResponse.json({ error: "Failed to fetch configurations" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const currentUser = await authenticationBackend.getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await req.json();
    const { name, value } = body;

    if (!name || value === undefined) {
      return NextResponse.json({ error: "Name and value (or value) are required" }, { status: 400 });
    }

    const db = getDb();
    const workspace = await db.collection('workspaces').findOne({ ownerUserId: String(currentUser._id) });
    if(!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }
    
    // Check if configuration with same name already exists for this user
    const existingConfig = await db.collection('environment_variables_values').findOne({
      workspaceId: String(workspace._id)
    });

    const isKeyExists = existingConfig?.environmentVariables?.find((env: any) => env.name === name.trim());

    if (isKeyExists) {
      return NextResponse.json({ error: "Configuration with this name already exists" }, { status: 409 });
    }

    // Handle new multi-environment structure
    let configuration: any;
    if (value && typeof value === 'object') {
      configuration = {
        name: name.trim(),
        value: {
          dev: value.dev ? encrypt(value.dev) : undefined,
          test: value.test ? encrypt(value.test) : undefined,
          production: value.production ? encrypt(value.production) : undefined
        },
        id: `env-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        source: "user"
      };
    } else {
      // Handle Any single value structure (applies to all environments)
      configuration = {
        name: name.trim(),
        value: encrypt(value), // Encrypt the value before storing
        id: `env-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        source: "user"
      };
    }

    const existingEnvVars = existingConfig?.environmentVariables || [];
    const updatedEnvVars = [...existingEnvVars, configuration];

    const result = await db.collection('environment_variables_values').updateOne({
      workspaceId: String(workspace._id)
    }, {
      $set: {
        environmentVariables: updatedEnvVars,
        updatedAt: new Date()
      }
    }, {
      upsert: true
    });
    
    return NextResponse.json({ 
      configuration: { ...configuration, _id: result.upsertedId },
      message: "Configuration created successfully" 
    }, { status: 201 });
  } catch (error) {
    console.error("Error creating user configuration:", error);
    return NextResponse.json({ error: "Failed to create configuration" }, { status: 500 });
  }
}
