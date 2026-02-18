import authenticationBackend from "../../authentication/authentication-backend";
import { NextRequest, NextResponse } from "next/server";
import { generateWorkflow } from "@/lib/game";

export async function POST(req: NextRequest) {
  const currentUser = await authenticationBackend.getCurrentUser(req);
  if (!currentUser) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      headers: { "Content-Type": "application/json" },
      status: 401,
    });
  }

  const body = await req.json();
  const { automationId, code } = body;

  const workflow = await generateWorkflow(automationId, code);

  return new Response(
    JSON.stringify({
      workflow,
    }),
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}
