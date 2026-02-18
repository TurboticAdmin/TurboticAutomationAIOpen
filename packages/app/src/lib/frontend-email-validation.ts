/**
 * Frontend email validation utilities
 * Note: This is for UI feedback only. Backend validation is the source of truth.
 */

/**
 * Basic email format validation
 */
export function isValidEmailFormat(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Check if a pattern is valid (basic frontend validation)
 */
export function isValidPattern(pattern: string): boolean {
  if (!pattern || typeof pattern !== 'string') {
    return false;
  }
  
  // Check for invalid characters in pattern (excluding wildcards * and ?)
  const invalidChars = /[<>:"\\|]/;
  if (invalidChars.test(pattern)) {
    return false;
  }
  
  return true;
}

/**
 * Get pattern examples for UI help
 */
export function getPatternExamples(): Array<{ pattern: string; description: string; examples: string[] }> {
  return [
    {
      pattern: 'user@example.com',
      description: 'Exact email address',
      examples: ['user@example.com']
    },
    {
      pattern: '@example.com',
      description: 'All emails from domain',
      examples: ['user@example.com', 'admin@example.com', 'test@example.com']
    },
    {
      pattern: '*.example.com',
      description: 'All emails from domain (wildcard)',
      examples: ['user@example.com', 'admin@example.com', 'test@example.com']
    },
    {
      pattern: 'test*.com',
      description: 'All emails starting with "test" from any .com domain',
      examples: ['test@example.com', 'testuser@company.com', 'test123@site.com']
    },
    {
      pattern: 'admin@*.com',
      description: 'All admin emails from .com domains',
      examples: ['admin@example.com', 'admin@company.com', 'admin@site.com']
    }
  ];
}

/**
 * Validate email in real-time for UI feedback
 */
export function validateEmailForUI(email: string): { isValid: boolean; error?: string } {
  if (!email) {
    return { isValid: false, error: 'Email is required' };
  }
  
  if (!isValidEmailFormat(email)) {
    return { isValid: false, error: 'Please enter a valid email address' };
  }
  
  return { isValid: true };
}

/**
 * Check if email is allowed (frontend validation against restrictions)
 * This provides immediate feedback but backend validation is still the source of truth
 */
export async function checkEmailAllowed(email: string): Promise<{ allowed: boolean; error?: string }> {
  try {
    const response = await fetch('/api/email-restrictions/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email }),
    });

    
    if (!response.ok) {
      return { allowed: true }; // If validation fails, allow (backend will handle)
    }

    const data = await response.json();
    
    if (!data.allowed) {
      return {
        allowed: false,
        error: data.reason || 'Your request to access this application has been sent and is being reviewed. Once approved, you will receive an email notification.'
      };
    }
    
    return { allowed: true };
  } catch (error) {
    return { allowed: true }; // If validation fails, allow (backend will handle)
  }
} 