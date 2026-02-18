import { NextRequest, NextResponse } from "next/server";
import AccessRequestNotificationService from "@/lib/access-request-notifications";
import Joi from "joi";

export async function POST(req: NextRequest) {
    try {
        const { email } = await req.json();

        const schema = Joi.object({
            email: Joi.string().email().trim().lowercase().required(),
        });

        const { error, value } = schema.validate({ email });
        if (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                headers: { 'Content-Type': 'application/json' },
                status: 400
            });
        }

        console.log('value', value);
        const normalizedEmail = value.email.toLowerCase().trim();

        const blockStatus = await AccessRequestNotificationService.checkIfBlocked(normalizedEmail);

        return new Response(
            JSON.stringify({
                blocked: blockStatus.blocked,
                attemptCount: blockStatus.attemptCount,
                reason: blockStatus.reason
            }),
            {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            }
        );

    } catch (error) {
        console.error('Error checking block status:', error);
        return new Response(
            JSON.stringify({
                error: 'Internal server error',
                blocked: false,
                attemptCount: 0
            }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            }
        );
    }
}