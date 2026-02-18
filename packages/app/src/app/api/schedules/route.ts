import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import authenticationBackend from "../authentication/authentication-backend";

export async function PUT(req: NextRequest) {
  try {
    const currentUser = await authenticationBackend.getCurrentUser(req);
    if (!currentUser) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const body = await req.json();
    const { scheduleId, runtimeEnvironment, scheduleDescription, emailNotificationsEnabled, emailOnCompleted, emailOnFailed } = body;

    if (!scheduleId) {
      return NextResponse.json({ error: "Schedule ID is required" }, { status: 400 });
    }

    const db = getDb();

    // Find the schedule
    let schedule;
    try {
      if (ObjectId.isValid(scheduleId)) {
        schedule = await db.collection('schedules-v2').findOne({
          _id: new ObjectId(scheduleId)
        });
      }

      if (!schedule) {
        schedule = await db.collection('schedules-v2').findOne({
          _id: scheduleId
        });
      }
    } catch (error) {
      console.error('Error finding schedule:', error);
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    if (!schedule) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    // Verify user has access to this schedule's automation
    let automation;
    try {
      if (ObjectId.isValid(schedule.automationId)) {
        automation = await db.collection('automations').findOne({
          _id: new ObjectId(schedule.automationId)
        });
      }

      if (!automation) {
        automation = await db.collection('automations').findOne({
          _id: schedule.automationId
        });
      }
    } catch (error) {
      console.error('Error finding automation:', error);
      return NextResponse.json({ error: "Automation not found" }, { status: 404 });
    }

    if (!automation) {
      return NextResponse.json({ error: "Automation not found" }, { status: 404 });
    }

    // Check if user has access to this automation
    const hasAccess = automation.workspaceId === String(currentUser.workspace?._id);

    if (!hasAccess) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    // Build update object
    const updateFields: any = {
      updatedAt: new Date()
    };

    const unsetFields: any = {};

    // Handle runtimeEnvironment: unset if empty (revert to default), otherwise set to specific value
    if (runtimeEnvironment !== undefined) {
      if (!runtimeEnvironment || runtimeEnvironment === '') {
        // Remove the field to use automation's default
        unsetFields.runtimeEnvironment = '';
      } else {
        updateFields.runtimeEnvironment = runtimeEnvironment;
      }
    }

    if (scheduleDescription !== undefined) {
      updateFields.scheduleDescription = scheduleDescription;
    }

    if (emailNotificationsEnabled !== undefined) {
      updateFields.emailNotificationsEnabled = emailNotificationsEnabled;
    }

    if (emailOnCompleted !== undefined) {
      updateFields.emailOnCompleted = emailOnCompleted;
    }

    if (emailOnFailed !== undefined) {
      updateFields.emailOnFailed = emailOnFailed;
    }

    // Build update operation
    const updateOperation: any = {};
    if (Object.keys(updateFields).length > 0) {
      updateOperation.$set = updateFields;
    }
    if (Object.keys(unsetFields).length > 0) {
      updateOperation.$unset = unsetFields;
    }

    // Update the schedule
    let result;
    try {
      if (ObjectId.isValid(scheduleId)) {
        result = await db.collection('schedules-v2').updateOne(
          { _id: new ObjectId(scheduleId) },
          updateOperation
        );
      } else {
        result = await db.collection('schedules-v2').updateOne(
          { _id: scheduleId },
          updateOperation
        );
      }
    } catch (error) {
      console.error('Error updating schedule:', error);
      return NextResponse.json({ error: "Failed to update schedule" }, { status: 500 });
    }

    if (result.matchedCount === 0) {
      return NextResponse.json({ error: "Schedule not found" }, { status: 404 });
    }

    // Note: Email notification preferences are now managed only in schedules-v2 collection
    // No need to sync to automations collection anymore (single source of truth)

    return NextResponse.json({
      message: "Schedule updated successfully",
      schedule: { ...schedule, ...updateFields }
    });
  } catch (error) {
    console.error("Error updating schedule:", error);
    return NextResponse.json({ error: "Failed to update schedule" }, { status: 500 });
  }
}
