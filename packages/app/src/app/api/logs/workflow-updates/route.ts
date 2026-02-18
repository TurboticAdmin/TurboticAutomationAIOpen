import { updateWorkflowStep } from "@/lib/game";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
    const body = await request.json();
    const { automationId, logs, executionStatus, finalWorkflow } = body;

    const result = await updateWorkflowStep(automationId, logs, executionStatus, finalWorkflow);

    return NextResponse.json(result);
}