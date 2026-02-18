import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import authenticationBackend from "../../authentication/authentication-backend";
import { encrypt, decrypt } from "@/lib/encryption";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await authenticationBackend.getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { id } = await params;
    const db = getDb();
    const workspace = await db.collection('workspaces').findOne({ ownerUserId: String(currentUser._id) });
    if(!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const envVarsDoc = await db.collection('environment_variables_values').findOne({
      workspaceId: String(workspace._id)
    });

    if (!envVarsDoc) {
      return NextResponse.json({ error: "Configuration not found" }, { status: 404 });
    }

    const configuration = envVarsDoc.environmentVariables?.find((env: any) => env.id === id);

    if (!configuration) {
      return NextResponse.json({ error: "Configuration not found" }, { status: 404 });
    }

    // Decrypt the value for display
    try {
      // Handle new multi-environment structure
      if (configuration.value && typeof configuration.value === 'object') {
        const decryptedConfiguration = {
          ...configuration,
          value: {
            dev: configuration.value.dev ? decrypt(configuration.value.dev) : undefined,
            test: configuration.value.test ? decrypt(configuration.value.test) : undefined,
            production: configuration.value.production ? decrypt(configuration.value.production) : undefined
          }
        };
        return NextResponse.json({ configuration: decryptedConfiguration });
      } else {
        // Handle Any single value structure (applies to all environments)
        const decryptedConfiguration = {
          ...configuration,
          value: decrypt(configuration.value)
        };
        return NextResponse.json({ configuration: decryptedConfiguration });
      }
    } catch (error) {
      console.error('Decryption error for config:', configuration.id, error);
      // Handle new multi-environment structure error
      if (configuration.value && typeof configuration.value === 'object') {
        const errorConfiguration = {
          ...configuration,
          value: {
            dev: '[Decryption Error]',
            test: '[Decryption Error]',
            production: '[Decryption Error]'
          }
        };
        return NextResponse.json({ configuration: errorConfiguration });
      } else {
        // Handle Any single value structure error
        const errorConfiguration = {
          ...configuration,
          value: '[Decryption Error]'
        };
        return NextResponse.json({ configuration: errorConfiguration });
      }
    }
  } catch (error) {
    console.error("Error fetching user configuration:", error);
    return NextResponse.json({ error: "Failed to fetch configuration" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await authenticationBackend.getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { id } = await params;
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

    const envVarsDoc = await db.collection('environment_variables_values').findOne({
      workspaceId: String(workspace._id)
    });

    if (!envVarsDoc) {
      return NextResponse.json({ error: "Configuration not found" }, { status: 404 });
    }

    const existingEnvVars = envVarsDoc.environmentVariables || [];
    const configIndex = existingEnvVars.findIndex((env: any) => env.id === id);

    if (configIndex === -1) {
      return NextResponse.json({ error: "Configuration not found" }, { status: 404 });
    }

    // Check if another configuration with same name exists (excluding current one)
    const duplicateConfig = existingEnvVars.find((env: any) => env.id !== id && env.name === name.trim());

    if (duplicateConfig) {
      return NextResponse.json({ error: "Configuration with this name already exists" }, { status: 409 });
    }

    // Update the configuration
    const updatedEnvVars = [...existingEnvVars];
    
    // Handle new multi-environment structure
    if (value && typeof value === 'object') {
      updatedEnvVars[configIndex] = {
        ...updatedEnvVars[configIndex],
        name: name.trim(),
        value: {
          dev: value.dev ? encrypt(value.dev) : undefined,
          test: value.test ? encrypt(value.test) : undefined,
          production: value.production ? encrypt(value.production) : undefined
        },
        id: id, // Keep the same ID
        source: "user"
      };
    } else {
      // Handle Any single value structure (applies to all environments)
      updatedEnvVars[configIndex] = {
        ...updatedEnvVars[configIndex],
        name: name.trim(),
        value: encrypt(value), // Encrypt the value before storing
        id: id, // Keep the same ID
        source: "user"
      };
    }
    const result = await db.collection('environment_variables_values').updateOne(
      { workspaceId: String(workspace._id) },
      { 
        $set: { 
          environmentVariables: updatedEnvVars,
          updatedAt: new Date()
        } 
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Configuration not found" }, { status: 404 });
    }

    return NextResponse.json({ 
      message: "Configuration updated successfully",
      configuration: updatedEnvVars[configIndex]
    });
  } catch (error) {
    console.error("Error updating user configuration:", error);
    return NextResponse.json({ error: "Failed to update configuration" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const currentUser = await authenticationBackend.getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { id } = await params;
    const db = getDb();
    const workspace = await db.collection('workspaces').findOne({ ownerUserId: String(currentUser._id) });
    if(!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const envVarsDoc = await db.collection('environment_variables_values').findOne({
      workspaceId: String(workspace._id)
    });

    if (!envVarsDoc) {
      return NextResponse.json({ error: "Configuration not found" }, { status: 404 });
    }

    const existingEnvVars = envVarsDoc.environmentVariables || [];
    const configIndex = existingEnvVars.findIndex((env: any) => env.id === id);

    if (configIndex === -1) {
      return NextResponse.json({ error: "Configuration not found" }, { status: 404 });
    }

    // Remove the configuration from the array
    const updatedEnvVars = existingEnvVars.filter((env: any) => env.id !== id);

    const result = await db.collection('environment_variables_values').updateOne(
      { workspaceId: String(workspace._id) },
      { 
        $set: { 
          environmentVariables: updatedEnvVars,
          updatedAt: new Date()
        } 
      }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Configuration not found" }, { status: 404 });
    }

    return NextResponse.json({ message: "Configuration deleted successfully" });
  } catch (error) {
    console.error("Error deleting user configuration:", error);
    return NextResponse.json({ error: "Failed to delete configuration" }, { status: 500 });
  }
}
