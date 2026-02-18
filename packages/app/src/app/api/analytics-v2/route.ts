import { NextRequest } from "next/server";
import authenticationBackend from "../authentication/authentication-backend";
import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";

export async function GET(req: NextRequest) {
  const startTime = Date.now();
  let currentUser: any = null;

  try {
    currentUser = await authenticationBackend.getCurrentUser(req);
    if (!currentUser) {
      return new Response(
        JSON.stringify({ error: "Authentication required" }),
        {
          headers: { "Content-Type": "application/json" },
          status: 401,
        }
      );
    }

    // If no workspace, return empty analytics for testing
    if (!currentUser.workspace) {
      return new Response(
        JSON.stringify({
          totalAutomations: 0,
          liveAutomations: 0,
          totalRuns: 0,
          successfulRuns: 0,
          failedRuns: 0,
          successRate: 0,
          failureRate: 0,
          runningAutomations: 0,
        }),
        {
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Build filter for user's automations (owned + shared)
    const ownedFilter = {
      $or: [
        { workspaceId: String(currentUser.workspace._id) },
        { createdBy: String(currentUser._id) },
      ],
    };

    // Find automations shared with the user (using sharedWith array model)
    const sharedAutomations = await getDb().collection('automations').find({
        'sharedWith.userId': String(currentUser._id)
    }, { projection: { _id: 1 } }).toArray();
    const sharedAutomationIds = sharedAutomations.map(a => a._id);

    // Combine owned and shared automations filter
    const automationFilter = {
      $or: [
        ...ownedFilter.$or,
        { _id: { $in: sharedAutomationIds } }
      ],
    };

    // Get automation counts and status
    const automationStats = await getDb()
      .collection("automations")
      .aggregate([
        { $match: automationFilter },
        {
          $group: {
            _id: null,
            totalAutomations: { $sum: 1 },
            liveAutomations: {
              $sum: {
                $cond: [{ $eq: ["$status", "live"] }, 1, 0],
              },
            },
          },
        },
      ])
      .toArray();

    // Get all automation IDs for the user (owned + shared)
    const userAutomationIds = await getDb()
      .collection("automations")
      .find(automationFilter, { projection: { _id: 1 } })
      .toArray();
    const automationIdStrings = userAutomationIds.map((automation) =>
      automation._id.toString()
    );
    // Get execution statistics for user's automations (only runs by the current user)
    const executionStats = await getDb()
      .collection("execution_history")
      .aggregate([
        { 
          $match: { 
            automationId: { $in: automationIdStrings },
            userId: ObjectId.createFromHexString(String(currentUser._id))
          } 
        },
        {
          $group: {
            _id: null,
            totalRuns: {
              $sum: {
                $cond: [{ $ne: ["$status", "running"] }, 1, 0],
              },
            },
            successfulRuns: {
              $sum: {
                $cond: [{ $eq: ["$status", "completed"] }, 1, 0],
              },
            },
            failedRuns: {
              $sum: {
                $cond: [
                  { $in: ["$status", ["errored", "cancelled", "stopped"]] },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ])
      .toArray();

    // Debug: Get detailed status breakdown
    const statusBreakdown = await getDb()
      .collection("execution_history")
      .aggregate([
        { 
          $match: { 
            automationId: { $in: automationIdStrings },
            userId: ObjectId.createFromHexString(String(currentUser._id))
          } 
        },
        { $group: { _id: "$status", count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ])
      .toArray();

    // Extract results
    const automationData = automationStats[0] || {
      totalAutomations: 0,
      liveAutomations: 0,
      runningAutomations: 0,
    };

    const executionData = executionStats[0] || {
      totalRuns: 0,
      successfulRuns: 0,
      failedRuns: 0,
    };

    // Calculate rates
    const successRate =
      executionData.totalRuns > 0
        ? Math.round(
            (executionData.successfulRuns / executionData.totalRuns) * 100
          )
        : 0;

    const failureRate =
      executionData.totalRuns > 0
        ? Math.round((executionData.failedRuns / executionData.totalRuns) * 100)
        : 0;

    const analytics = {
      totalAutomations: automationData.totalAutomations,
      liveAutomations: automationData.liveAutomations,
      runningAutomations: automationData.runningAutomations,
      totalRuns: executionData.totalRuns,
      successfulRuns: executionData.successfulRuns,
      failedRuns: executionData.failedRuns,
      successRate,
      failureRate,
    };

    return new Response(JSON.stringify(analytics), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
