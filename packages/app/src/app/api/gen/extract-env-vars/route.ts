import { NextRequest, NextResponse } from 'next/server';

function extractEnvVarsFromCode(code: string): string[] {
  const found = new Set<string>();
  
  // ONLY extract variables that are actually used in process.env statements
  // This is the most reliable and accurate method
  // Allow uppercase letters, numbers, and underscores
  const processEnvRegex = /process\.env\.([A-Z0-9_]+)/gi;
  let match;
  while ((match = processEnvRegex.exec(code)) !== null) {
    found.add(match[1].toUpperCase());
  }
  
  // Filter out common system environment variables that shouldn't be user-configured
  const systemVars = new Set([
    'NODE_ENV', 'APP_ENV', 'PATH', 'HOME', 'USER', 'PWD', 'SHELL', 'TERM',
    'LANG', 'LC_ALL', 'TZ', 'TMP', 'TEMP', 'HOSTNAME', 'HOST', 'PORT',
    'USERNAME', 'USERPROFILE', 'WINDIR', 'SYSTEMROOT', 'SYSTEMDRIVE',
    'COMPUTERNAME', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS',
    'NPM_CONFIG_PREFIX', 'NPM_CONFIG_CACHE', 'NPM_CONFIG_USERCONFIG',
    'NPM_EXECPATH', 'NPM_LIFECYCLE_EVENT', 'NPM_LIFECYCLE_SCRIPT',
    'NPM_PACKAGE_JSON', 'NPM_PACKAGE_NAME', 'NPM_PACKAGE_VERSION'
  ]);
  
  const filteredVars = Array.from(found).filter(varName => !systemVars.has(varName));
  
  // Convert to sorted array
  return filteredVars.sort();
}

export async function POST(request: NextRequest) {
  try {
    const { code } = await request.json();
    
    if (!code) {
      return NextResponse.json({ 
        error: 'Code is required',
        envVars: [] 
      }, { status: 400 });
    }

    const envVars = extractEnvVarsFromCode(code);
    
    return NextResponse.json({ envVars });
  } catch (error) {
    console.error('[extract-env-vars] Error:', error);
    return NextResponse.json({ 
      error: 'Failed to extract environment variables',
      envVars: [] 
    }, { status: 500 });
  }
} 