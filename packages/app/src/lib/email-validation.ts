import { getDb } from "./db";

export interface EmailRestriction {
  _id?: string;
  pattern: string; // Can be exact email, domain, or wildcard pattern
  type: 'whitelist' | 'blacklist';
  priority: number; // Higher number = higher priority (1-10, default 5)
  description?: string;
  createdAt: Date;
  createdBy?: string;
  // Capability flags
  canChat?: boolean; // Allow/deny chat functionality (default: true)
  canRunCode?: boolean; // Allow/deny code execution (default: true)
}

export class EmailValidator {
  private static instance: EmailValidator;
  private cache: Map<string, { allowed: boolean; timestamp: number }> = new Map();
  private cacheExpiry: number = 5 * 60 * 1000; // 5 minutes - API changes clear cache immediately, so this helps with rapid repeated checks
  private lastCacheUpdate: number = 0;

  private constructor() {}

  public static getInstance(): EmailValidator {
    if (!EmailValidator.instance) {
      EmailValidator.instance = new EmailValidator();
    }
    return EmailValidator.instance;
  }

  /**
   * Check if an email matches a pattern (supports wildcards)
   */
  private matchesPattern(email: string, pattern: string): boolean {
    // Normalize pattern (trim whitespace)
    pattern = pattern.trim();
    
    // Special case: "*.*" matches all emails (common pattern for blocking all)
    if (pattern === '*.*' || pattern === '*@*' || pattern === '*') {
      return this.isValidEmailFormat(email);
    }
    
    // Handle domain-only patterns (e.g., *.turbotic.com, @turbotic.com)
    // Only treat as domain pattern if it's *.domain.com format (has a dot after the prefix)
    if (pattern.startsWith('*.')) {
      const domain = pattern.substring(2); // Remove "*."
      // If domain contains a dot, it's a domain pattern like *.turbotic.com
      // If domain is just "*" or doesn't contain a dot, treat as wildcard pattern
      if (domain.includes('.') && domain !== '*') {
        const domainPattern = `@${domain}`;
        return this.matchesPattern(email, domainPattern);
      }
      // Otherwise, fall through to wildcard pattern matching
    }
    
    if (pattern.startsWith('@')) {
      // Pattern like @turbotic.com - check if email ends with this domain
      const domain = pattern.substring(1); // Remove "@"
      // Don't treat @* as a domain pattern - it's a wildcard
      if (domain === '*' || !domain.includes('.')) {
        // Fall through to wildcard pattern matching
      } else {
        return email.toLowerCase().endsWith(`@${domain.toLowerCase()}`);
      }
    }
    
    // Handle patterns like *@domain.com (any user @ specific domain)
    if (pattern.startsWith('*@') && pattern.includes('.')) {
      const domain = pattern.substring(2); // Remove "*@"
      if (domain && domain.includes('.')) {
        return email.toLowerCase().endsWith(`@${domain.toLowerCase()}`);
      }
    }
    
    // Convert pattern to regex for wildcard patterns (e.g., *.*, user@*.com, etc.)
    // For email patterns, convert *.* to match email format (user@domain.com)
    let regexPattern = pattern;
    
    // If pattern contains *.* and looks like it's meant for emails, convert appropriately
    if (pattern.includes('*.*') && !pattern.includes('@')) {
      // Convert *.* to match email format: *@*.* (user@domain.com)
      regexPattern = pattern.replace(/\*\.\*/g, '.*@.*\\..*');
    } else {
      // Standard regex conversion
      regexPattern = pattern
        .replace(/\./g, '\\.') // Escape dots
        .replace(/\*/g, '.*') // Convert * to .*
        .replace(/\?/g, '.'); // Convert ? to .
    }
    
    const regex = new RegExp(`^${regexPattern}$`, 'i');
    return regex.test(email);
  }

  /**
   * Validate email format
   */
  private isValidEmailFormat(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Check user capabilities (chat and run code)
   */
  public async getUserCapabilities(email: string): Promise<{ canChat: boolean; canRunCode: boolean; matchedRule?: EmailRestriction }> {
    const db = getDb();
    const restrictions = await db.collection('email_restrictions').find({}).toArray();

    // Sort restrictions by priority (lower number = higher priority)
    const sortedRestrictions = restrictions.sort((a, b) => {
      // Ensure priorities are numbers for proper comparison
      const aPriority = Number(a.priority);
      const bPriority = Number(b.priority);
      if (aPriority !== bPriority) {
        return aPriority - bPriority;
      }
      const bDate = b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt);
      const aDate = a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt);
      return bDate.getTime() - aDate.getTime();
    });

    // Find first matching whitelist rule to determine capabilities
    for (const restriction of sortedRestrictions) {
      // Ensure pattern is a string (handle MongoDB ObjectId or other types)
      const pattern = String(restriction.pattern || '').trim();
      if (!pattern) continue; // Skip restrictions with empty patterns
      
      if (restriction.type === 'whitelist' && this.matchesPattern(email, pattern)) {
        return {
          canChat: restriction.canChat !== false, // Default to true if not specified
          canRunCode: restriction.canRunCode !== false, // Default to true if not specified
          matchedRule: {
            ...restriction,
            _id: restriction._id.toString()
          } as EmailRestriction
        };
      }
    }

    // If no matching whitelist found, return default (all capabilities enabled)
    return { canChat: true, canRunCode: true };
  }

  /**
   * Check if email is allowed based on whitelist/blacklist rules with priority
   */
  public async isEmailAllowed(email: string): Promise<{ allowed: boolean; reason?: string; matchedRule?: EmailRestriction }> {
    // First check email format
    if (!this.isValidEmailFormat(email)) {
      return { allowed: false, reason: 'Invalid email format' };
    }

    // Check cache first
    const cacheKey = `validation_${email}`;
    const now = Date.now();
    
    if (this.cache.has(cacheKey)) {
      const cachedEntry = this.cache.get(cacheKey)!;
      // Check if cache entry is still valid (per-entry expiry)
      if ((now - cachedEntry.timestamp) < this.cacheExpiry) {
        return { allowed: cachedEntry.allowed };
      } else {
        // Cache expired, remove it
        this.cache.delete(cacheKey);
      }
    }

    const db = getDb();
    const restrictions = await db.collection('email_restrictions').find({}).toArray();

    // Find all matching rules (both whitelist and blacklist)
    const matchingRules: Array<{ restriction: any; pattern: string }> = [];
    
    for (const restriction of restrictions) {
      // Ensure pattern is a string (handle MongoDB ObjectId or other types)
      const pattern = String(restriction.pattern || '').trim();
      if (!pattern) continue; // Skip restrictions with empty patterns
      
      const isMatch = this.matchesPattern(email, pattern);
      
      if (isMatch) {
        matchingRules.push({ restriction, pattern });
        // Debug logging
      }
    }    
    // If we have matching rules, check if both whitelist and blacklist match
    // Whitelist always takes precedence over blacklist when both match (exception-based approach)
    // This allows whitelist rules to create exceptions to blacklist rules
    if (matchingRules.length > 0) {
      const matchingWhitelist = matchingRules.filter(r => r.restriction.type === 'whitelist');
      const matchingBlacklist = matchingRules.filter(r => r.restriction.type === 'blacklist');
      
      // If both whitelist and blacklist match, compare priorities (lower number = higher priority)
      if (matchingBlacklist.length > 0 && matchingWhitelist.length > 0) {
        // Sort both by priority (lower number = higher priority)
        // Ensure priorities are numbers for proper comparison
        matchingWhitelist.sort((a, b) => {
          const aPriority = Number(a.restriction.priority);
          const bPriority = Number(b.restriction.priority);
          if (aPriority !== bPriority) {
            return aPriority - bPriority;
          }
          const bDate = b.restriction.createdAt instanceof Date ? b.restriction.createdAt : new Date(b.restriction.createdAt);
          const aDate = a.restriction.createdAt instanceof Date ? a.restriction.createdAt : new Date(a.restriction.createdAt);
          return bDate.getTime() - aDate.getTime();
        });
        
        matchingBlacklist.sort((a, b) => {
          const aPriority = Number(a.restriction.priority);
          const bPriority = Number(b.restriction.priority);
          if (aPriority !== bPriority) {
            return aPriority - bPriority;
          }
          const bDate = b.restriction.createdAt instanceof Date ? b.restriction.createdAt : new Date(b.restriction.createdAt);
          const aDate = a.restriction.createdAt instanceof Date ? a.restriction.createdAt : new Date(a.restriction.createdAt);
          return bDate.getTime() - aDate.getTime();
        });
        
        const topWhitelistRule = matchingWhitelist[0].restriction;
        const topBlacklistRule = matchingBlacklist[0].restriction;
        
        // Ensure priorities are numbers (MongoDB might return strings)
        const blacklistPriority = Number(topBlacklistRule.priority);
        const whitelistPriority = Number(topWhitelistRule.priority);
        
        // Compare priorities - lower number = higher priority
        // If priorities are equal, whitelist wins (allows exceptions)
        if (blacklistPriority < whitelistPriority) {
          // Blacklist has higher priority (lower number)
          this.cache.set(cacheKey, { allowed: false, timestamp: now });
          this.lastCacheUpdate = now;
          return {
            allowed: false,
            reason: 'Your request to access this application has been sent and is being reviewed. Once approved, you will receive an email notification.',
            matchedRule: {
              ...topBlacklistRule,
              _id: topBlacklistRule._id.toString()
            } as EmailRestriction
          };
        } else {
          // Whitelist has higher or equal priority
          this.cache.set(cacheKey, { allowed: true, timestamp: now });
          this.lastCacheUpdate = now;
          return {
            allowed: true,
            reason: 'Email is allowed',
            matchedRule: {
              ...topWhitelistRule,
              _id: topWhitelistRule._id.toString()
            } as EmailRestriction
          };
        }
      }
      
      // If only one type matches, sort by priority (lower number = higher priority)
      matchingRules.sort((a, b) => {
        // First sort by priority (lower number = higher priority)
        // Ensure priorities are numbers for proper comparison
        const aPriority = Number(a.restriction.priority);
        const bPriority = Number(b.restriction.priority);
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
        // Finally sort by creation date (newer first)
        const bDate = b.restriction.createdAt instanceof Date ? b.restriction.createdAt : new Date(b.restriction.createdAt);
        const aDate = a.restriction.createdAt instanceof Date ? a.restriction.createdAt : new Date(a.restriction.createdAt);
        return bDate.getTime() - aDate.getTime();
      });

      // Apply the highest priority matching rule
      const topRule = matchingRules[0].restriction;
      const allowed = topRule.type === 'whitelist';
      
      this.cache.set(cacheKey, { allowed, timestamp: now });
      this.lastCacheUpdate = now;
      return {
        allowed,
        reason: allowed ? 'Email is allowed' : 'Your request to access this application has been sent and is being reviewed. Once approved, you will receive an email notification.',
        matchedRule: {
          ...topRule,
          _id: topRule._id.toString()
        } as EmailRestriction
      };
    }

    // If no rules match, check if there are any whitelist rules
    const hasWhitelistRules = restrictions.some(r => r.type === 'whitelist');
    
    if (hasWhitelistRules) {
      this.cache.set(cacheKey, { allowed: false, timestamp: now });
      this.lastCacheUpdate = now;
      return {
        allowed: false,
        reason: 'Your request to access this application has been sent and is being reviewed. Once approved, you will receive an email notification.'
      };
    }

    // If no whitelist rules exist, allow by default
    this.cache.set(cacheKey, { allowed: true, timestamp: now });
    this.lastCacheUpdate = now;
    return { allowed: true };
  }

  /**
   * Clear cache (useful when restrictions are updated)
   */
  public clearCache(): void {
    this.cache.clear();
    this.lastCacheUpdate = 0;
  }

  /**
   * Add a new email restriction
   */
  public async addRestriction(restriction: Omit<EmailRestriction, '_id' | 'createdAt'>): Promise<string> {
    const db = getDb();
    const newRestriction = {
      ...restriction,
      priority: restriction.priority || 5, // Default priority is 5
      canChat: restriction.canChat !== false, // Default to true
      canRunCode: restriction.canRunCode !== false, // Default to true
      createdAt: new Date()
    };
    const result = await db.collection('email_restrictions').insertOne(newRestriction);
    this.clearCache(); // Clear cache when restrictions change
    return result.insertedId.toString();
  }

  /**
   * Remove an email restriction
   */
  public async removeRestriction(id: string): Promise<boolean> {
    const db = getDb();
    const { ObjectId } = require('mongodb');
    const result = await db.collection('email_restrictions').deleteOne({ _id: new ObjectId(id) });
    this.clearCache(); // Clear cache when restrictions change
    return result.deletedCount > 0;
  }

  /**
   * Update an email restriction
   */
  public async updateRestriction(id: string, restriction: Omit<EmailRestriction, '_id' | 'createdAt'>): Promise<boolean> {
    const db = getDb();
    const { ObjectId } = require('mongodb');

    const updateData = {
      pattern: restriction.pattern,
      type: restriction.type,
      priority: restriction.priority || 5,
      description: restriction.description,
      canChat: restriction.canChat !== false, // Default to true
      canRunCode: restriction.canRunCode !== false // Default to true
    };
    const result = await db.collection('email_restrictions').updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );
    this.clearCache(); // Clear cache when restrictions change
    return result.matchedCount > 0;
  }

  /**
   * Get email restrictions with pagination
   */
  public async getRestrictions(page: number = 1, limit: number = 10): Promise<{ data: EmailRestriction[], total: number }> {
    const db = getDb();
    const skip = (page - 1) * limit;
    
    // Get total count
    const total = await db.collection('email_restrictions').countDocuments({});
    
    // Get paginated results
    const restrictions = await db.collection('email_restrictions')
      .find({})
      .sort({ priority: -1, type: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();
      
    return {
      data: restrictions.map(restriction => ({
        ...restriction,
        _id: restriction._id.toString()
      })) as EmailRestriction[],
      total
    };
  }

  /**
   * Test a pattern against sample emails
   */
  public testPattern(pattern: string, testEmails: string[]): { pattern: string; matches: string[]; nonMatches: string[] } {
    const matches: string[] = [];
    const nonMatches: string[] = [];

    for (const email of testEmails) {
      if (this.matchesPattern(email, pattern)) {
        matches.push(email);
      } else {
        nonMatches.push(email);
      }
    }

    return { pattern, matches, nonMatches };
  }
}

// Export singleton instance
export const emailValidator = EmailValidator.getInstance(); 