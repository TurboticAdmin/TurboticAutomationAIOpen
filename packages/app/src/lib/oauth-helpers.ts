import { NextRequest } from 'next/server';

export interface StateParams {
  discountCode: string | null;
  pricingRedirect: string | null;
  utmParams: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
  };
}

/**
 * Resolves the base URL from request headers or environment variables
 */
export function resolveBaseUrl(request: NextRequest): string {
  const headerHost = request.headers.get('x-forwarded-host') || request.headers.get('host');
  const envHost = process.env.PUBLIC_HOSTNAME;
  const host = headerHost || envHost || 'localhost:3000';
  const headerProto = request.headers.get('x-forwarded-proto');
  const isLocalhost = host.startsWith('localhost') || host.startsWith('127.0.0.1');
  const protocol = headerProto || (isLocalhost ? 'http' : 'https');
  const baseUrl = `${protocol}://${host}`;
  // Normalize: remove trailing slash
  return baseUrl.replace(/\/$/, '');
}

/**
 * Parses the OAuth state parameter to extract discount code, pricing redirect, and UTM parameters
 */
export function parseStateParameter(state: string | null): StateParams {
  const result: StateParams = {
    discountCode: null,
    pricingRedirect: null,
    utmParams: {}
  };

  if (!state) {
    return result;
  }

  // Parse state parameter which may contain multiple parts separated by |
  const stateParts = state.split('|');
  for (const part of stateParts) {
    if (part.startsWith('discount_')) {
      result.discountCode = part.replace('discount_', '');
    } else if (part.includes('pricingRedirect_')) {
      result.pricingRedirect = decodeURIComponent(part.split('pricingRedirect_')[1]);
    } else if (part.startsWith('utm_source_')) {
      result.utmParams.utm_source = part.replace('utm_source_', '');
    } else if (part.startsWith('utm_medium_')) {
      result.utmParams.utm_medium = part.replace('utm_medium_', '');
    } else if (part.startsWith('utm_campaign_')) {
      result.utmParams.utm_campaign = part.replace('utm_campaign_', '');
    }
  }

  // Backward compatibility: check if state is just discount code
  if (!result.discountCode && state.startsWith('discount_')) {
    result.discountCode = state.replace('discount_', '');
  }

  return result;
}

/**
 * Adds preserved parameters (discount code and UTM params) to a redirect URL
 */
export function addPreservedParams(
  url: URL,
  utmParams: { utm_source?: string; utm_medium?: string; utm_campaign?: string },
  discountCode: string | null
): void {
  if (discountCode) {
    url.searchParams.set('discount', discountCode);
  }
  if (utmParams.utm_source) {
    url.searchParams.set('utm_source', utmParams.utm_source);
  }
  if (utmParams.utm_medium) {
    url.searchParams.set('utm_medium', utmParams.utm_medium);
  }
  if (utmParams.utm_campaign) {
    url.searchParams.set('utm_campaign', utmParams.utm_campaign);
  }
}

/**
 * Validates a pricing redirect URL to prevent open redirect attacks
 * Only allows relative paths (same-origin)
 */
export function isValidPricingRedirect(pricingRedirect: string): boolean {
  return pricingRedirect.startsWith('/') &&
         !pricingRedirect.startsWith('//') &&
         !pricingRedirect.toLowerCase().includes('javascript:') &&
         !pricingRedirect.toLowerCase().includes('data:');
}
