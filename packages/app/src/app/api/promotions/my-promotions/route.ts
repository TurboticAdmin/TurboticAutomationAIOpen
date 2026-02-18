import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import authenticationBackend from '../../authentication/authentication-backend';

export async function GET(req: NextRequest) {
  try {
    // Authenticate the requesting user
    const currentUser = await authenticationBackend.getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const db = getDb();

    // Get promotions assigned to this user
    const assignments = await db.collection('promotion_assignments')
      .find({
        userId: currentUser._id,
        status: 'assigned', // Only get unused promotions
      })
      .sort({ assignedAt: -1 })
      .toArray();

    // Get promotion details
    const promotions = await Promise.all(
      assignments.map(async (assignment) => {
        const promotion = await db.collection('promotions').findOne({
          _id: assignment.promotionId
        });

        if (!promotion || !promotion.active) {
          return null;
        }

        // Check if expired
        if (promotion.expiresAt && new Date(promotion.expiresAt) < new Date()) {
          return null;
        }

        return {
          _id: assignment._id,
          promotionCode: assignment.promotionCode,
          assignedAt: assignment.assignedAt,
          expiresAt: promotion.expiresAt,
          maxRedemptions: promotion.maxRedemptions,
          timesRedeemed: promotion.timesRedeemed,
        };
      })
    );

    // Filter out null values (expired or inactive promotions)
    const activePromotions = promotions.filter(p => p !== null);

    return NextResponse.json({
      promotions: activePromotions,
    });

  } catch (error) {
    console.error('Error fetching user promotions:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch promotions' },
      { status: 500 }
    );
  }
}
