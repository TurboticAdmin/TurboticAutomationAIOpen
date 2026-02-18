import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET /api/config/promotion
 * Returns the promotion code and description from the config collection
 * 
 * Security: Public endpoint - promotion codes are meant to be shared publicly.
 * However, we validate and sanitize the output to prevent any injection attacks.
 */
export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const config = await db.collection('config').findOne(
      {},
      { projection: { promotion: 1, promotionDescription: 1 } }
    );
    
    if (!config) {
      return NextResponse.json({ promotionCode: null, promotionDescription: null });
    }
    
    const promotionCode = (config as any).promotion;
    const promotionDescription = (config as any).promotionDescription;
    
    // Return null if promotion is not set, null, or empty string
    if (!promotionCode || typeof promotionCode !== 'string' || promotionCode.trim() === '') {
      return NextResponse.json({ promotionCode: null, promotionDescription: null });
    }
    
    // Sanitize: trim whitespace and ensure it's a valid string
    // Limit length to prevent abuse (Stripe promo codes are typically max 50 chars)
    const sanitized = promotionCode.trim().substring(0, 100);
    
    // Basic validation: only allow alphanumeric, hyphens, underscores
    // This prevents potential injection attacks
    if (!/^[A-Za-z0-9_-]+$/.test(sanitized)) {
      console.warn('Invalid promotion code format detected, returning null');
      return NextResponse.json({ promotionCode: null, promotionDescription: null });
    }
    
    // Sanitize description if present (limit length and escape HTML)
    let sanitizedDescription = null;
    if (promotionDescription && typeof promotionDescription === 'string' && promotionDescription.trim() !== '') {
      // Limit description length to prevent abuse
      sanitizedDescription = promotionDescription.trim().substring(0, 500);
    }
    
    return NextResponse.json({ 
      promotionCode: sanitized,
      promotionDescription: sanitizedDescription 
    });
  } catch (error) {
    console.error('Error fetching promotion code:', error);
    return NextResponse.json(
      { error: 'Failed to fetch promotion code', promotionCode: null, promotionDescription: null },
      { status: 500 }
    );
  }
}

