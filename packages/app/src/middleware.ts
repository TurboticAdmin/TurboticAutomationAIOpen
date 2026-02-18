import { NextRequest, NextResponse } from 'next/server';
import Joi from 'joi';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for Stripe webhook (needs raw body for signature verification)
  if (pathname === '/api/subscriptions/webhook') {
    return NextResponse.next();
  }

  if (pathname.includes('/explain-code')) {
    return NextResponse.next();
  }

  // Global input validation for POST requests - validates request body against security rules
  // and pagination parameters to prevent injection and overflow attacks
  if (request.method === 'POST') {
    try {

      let body = {};
      if (request.headers.get('content-type')?.includes('application/json')) {
        try {
          body = await request.json();
        } catch (jsonError) {
          // Handle empty body or malformed JSON - treat as empty object
          body = {};
        }
      }

      const forbiddenFieldsInRequestBodySchema = Joi.object({
        is_admin: Joi.forbidden(),
        is_sso: Joi.forbidden(),
        isadmin: Joi.forbidden(),
        issso: Joi.forbidden(),
        limit: Joi.number().optional().integer().min(1).max(5000).default(10),
        page: Joi.number().optional().integer().min(1).max(5000).default(1),
        skip: Joi.number().optional().integer().min(0).max(5000).default(0),
      }).unknown(true);

      // Validate with Joi
      const { error, value } = forbiddenFieldsInRequestBodySchema.validate(body, {
        allowUnknown: true,
        stripUnknown: false,
        abortEarly: false
      });

      if (error) {
        // Log validation errors (only in development)
        if (process.env.NODE_ENV === 'development') {
          console.warn('Joi validation failed:', error.details.map((detail: any) => detail.message));
        }

        // Send error response to client
        return new NextResponse(
          JSON.stringify({
            error: 'Validation failed',
            details: error.details.map((detail: any) => ({
              field: detail.path.join('.'),
              message: detail.message
            }))
          }),
          {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
            }
          }
        );
      }
    } catch (error) {
      // If JSON parsing fails, continue with the request
      if (process.env.NODE_ENV === 'development') {
        console.warn('Middleware: Failed to parse request body:', error);
      }

      return new NextResponse(
        JSON.stringify({
          error: 'Malformed request body',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          }
        }
      );
    }
  } else if (request.method === 'GET') {
    try {
      let query = {};
      const queryParams = request.nextUrl.searchParams;
      query = Object.fromEntries(queryParams);

      const queryParamsValidationSchema = Joi.object({
        limit: Joi.number().optional().integer().min(1).max(5000).default(10),
        offset: Joi.number().optional().integer().min(0).max(5000).default(0),
      });

      const { error, value } = queryParamsValidationSchema.validate(query, {
        allowUnknown: true,
        stripUnknown: false,
        abortEarly: false
      });

      if (error) {
        console.warn('Joi validation failed:', error.details.map((detail: any) => detail.message));
        return new NextResponse(
          JSON.stringify({ error: 'Validation failed', details: error.details.map((detail: any) => ({ field: detail.path.join('.'), message: detail.message })) }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }
    } catch (error) {
      console.warn('Middleware: Failed to parse request query:', error);
      return new NextResponse(
        JSON.stringify({ error: 'Malformed request query' }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          }
        }
      );
    }
  }

  // Define public routes that don't require authentication
  const publicRoutes = [
    '/',
    '/images', // Allow static images
    '/api/authentication/login',
    '/api/authentication/signup',
    '/api/authentication/logout',
    '/api/authentication/me',
    '/api/email-restrictions/check', // Allow email validation for login    
    '/api/runtime-config', // Allow unauthenticated access to runtime config
    '/api/gen/test',
    '/api/gen/find-selectors',
    '/api/gen/extract-text',
    '/api/gen/extract-env-vars', // Allow environment variable extraction
    '/api/automations',
    '/api/run',
    '/api/download-from-env',
    '/api/upload-artifacts',
    '/api/notifications', // Allow authenticated users to fetch notifications
    '/api/notifications/dismiss', // Allow authenticated users to dismiss notifications
    '/api/notifications/dismissed', // Allow authenticated users to check dismissed notifications
    // '/api/gen/chat',
    '/api/analytics-config', // Public endpoint for analytics config (needed for consent banner)
  ];

  // Define API routes that should be protected
  const protectedApiRoutes = [
    '/api/get-all-automations',
    '/api/metrics',
    '/api/analytics',
    '/api/devices',
    '/api/notify',
    '/api/email-restrictions',
    // '/api/gen',
    '/api/executions',
    '/api/user-configurations',
    '/api/files',
  ];
  
  // Allow public routes
  if (publicRoutes.some(route => pathname === route || pathname.startsWith(route + '/'))) {
    return NextResponse.next();
  }

  // Check for script-runner access (special case for automation execution)
  const isScriptRunner = request.headers.get('x-script-runner') === 'true';
  
  // Allow script-runner access to automation, execution, and run endpoints
  if (isScriptRunner && (pathname.startsWith('/api/automations/') || pathname.startsWith('/api/executions/') || pathname.startsWith('/api/run/') || pathname.startsWith('/api/download-from-env') || pathname.startsWith('/api/upload-artifacts'))) {
    return NextResponse.next();
  }

  // Allow API key access to trigger endpoint (for external API calls)
  if (pathname.includes('/trigger') && request.method === 'POST') {
    return NextResponse.next();
  }

  // Check if it's a protected API route
  const isProtectedApiRoute = protectedApiRoutes.some(route => 
    pathname.startsWith(route)
  );

  // Check if it's a protected page route (dashboard, canvas, etc.)
  const isProtectedPageRoute = pathname.startsWith('/automations') ||
                              pathname.startsWith('/dashboard') ||
                              pathname.startsWith('/canvas') ||
                              pathname.startsWith('/control');

  // If it's not a protected route, allow access
  if (!isProtectedApiRoute && !isProtectedPageRoute) {
    return NextResponse.next();
  }

  // Check for authentication cookie (using the correct cookie name from auth backend)
  const authCookie = request.cookies.get('token');

  // Check for authorization header (for API calls)
  const authHeader = request.headers.get('authorization');

  // If no authentication found, block access
  if (!authCookie && !authHeader) {
    // For API routes, return 401 Unauthorized
    if (isProtectedApiRoute) {
      return new NextResponse(
        JSON.stringify({ error: 'Authentication required' }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // For page routes, redirect to landing page
    const landingUrl = new URL('/', request.url);
    return NextResponse.redirect(landingUrl);
  }


  // If authentication is present, allow the request
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
}; 