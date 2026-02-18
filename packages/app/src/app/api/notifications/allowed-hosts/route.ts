import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import authenticationBackend from '../../authentication/authentication-backend';

// Initialize default allowed hosts if none exist
async function initializeDefaultHosts() {
  const db = getDb();
  const existingHosts = await db.collection('notificationAllowedHosts').find({}).toArray();
  
  if (existingHosts.length === 0) {
    // Get default hosts from environment variable or use generic defaults
    const defaultHostsEnv = process.env.NOTIFICATION_ALLOWED_HOSTS;
    let defaultHosts: Array<{ host: string; active: boolean; public: boolean }> = [];
    
    if (defaultHostsEnv) {
      // Parse comma-separated list: "host1:public,host2:private"
      defaultHosts = defaultHostsEnv.split(',').map(hostConfig => {
        const [host, visibility] = hostConfig.trim().split(':');
        return {
          host: host.trim(),
          active: true,
          public: visibility?.trim().toLowerCase() === 'public' || false
        };
      });
    } else {
      // Generic defaults that work for any deployment
      defaultHosts = [
        // Public hosts (accessible without login) - limit to 3
        { host: 'linkedin.com', active: true, public: true },
        { host: 'github.com', active: true, public: true },
        { host: 'stackoverflow.com', active: true, public: true },
        // Authenticated hosts (require login)
        { host: 'www.linkedin.com', active: true, public: false },
        { host: 'www.reddit.com', active: true, public: false },
        { host: 'discord.gg', active: true, public: false },
      ];
    }
    
    await db.collection('notificationAllowedHosts').insertMany(defaultHosts);
  } else {
    // Ensure at least one public host exists (for Home button)
    const publicHosts = existingHosts.filter(h => h.public === true);
    if (publicHosts.length === 0) {
      // Use first host from environment or a generic default
      const defaultPublicHost = process.env.NOTIFICATION_DEFAULT_PUBLIC_HOST || 'linkedin.com';
      await db.collection('notificationAllowedHosts').insertOne({
        host: defaultPublicHost,
        active: true,
        public: true
      });
    }
  }
}

export async function GET(request: NextRequest) {
  try {
    // Initialize default hosts
    await initializeDefaultHosts();
    
    const db = getDb();
    
    // Check if user is authenticated
    const currentUser = await authenticationBackend.getCurrentUser(request);
    
    if (currentUser) {
      // Authenticated users get all active hosts
      const hosts = await db
        .collection('notificationAllowedHosts')
        .find({ active: true })
        .project({ _id: 0, host: 1 })
        .toArray();
      
      const allowedHosts = hosts.map(h => h.host).filter(Boolean);
      return NextResponse.json({ success: true, allowedHosts });
    } else {
      // Unauthenticated users only get public hosts (limit to 3)
      const hosts = await db
        .collection('notificationAllowedHosts')
        .find({ active: true, public: true })
        .project({ _id: 0, host: 1 })
        .limit(3)
        .toArray();
      
      const allowedHosts = hosts.map(h => h.host).filter(Boolean);
      return NextResponse.json({ success: true, allowedHosts });
    }
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error?.message || 'Failed to load allowed hosts' },
      { status: 500 }
    );
  }
}


