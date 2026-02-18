import authenticationBackend from "@/app/api/authentication/authentication-backend";
import { getDb } from "@/lib/db";
import { ObjectId } from "mongodb";
import { NextRequest } from "next/server";
import { deleteEnvironment } from "../run-on-environment";

export async function POST(req: NextRequest) {
  const { dId, automationId } = await req.json();

  if (!automationId) {
    throw new Error("automationId is required");
  }

  if (!dId) {
    throw new Error("dId is required");
  }

  // Get current user for execution history
  const currentUser = await authenticationBackend.getCurrentUser(req);

  const executionHistory = await getDb().collection('execution_history').findOne({
    deviceId: dId,
    automationId: automationId,
    status: { $in: ["running", "queued"] },
  });

  if (executionHistory) {
    if (executionHistory.status === "running") {
      let cancelAttempts = 0;

      if (!isNaN(executionHistory.cancelAttempts)) {
        cancelAttempts = executionHistory.cancelAttempts;
      }

      if (cancelAttempts > 0) {
        if (executionHistory.executionId) {
          if (process.env['DISABLE_ENV_CREATION'] === 'true') {
            // Do nothing
            console.log('Skipping env deletion');
          } else {
            await deleteEnvironment(String(executionHistory.executionId));
          }
        }

        await getDb().collection('execution_history').updateOne({
          _id: ObjectId.createFromHexString(String(executionHistory._id)),
        }, {
          $set: {
            status: "cancelled",
          },
        });
  
        return new Response(
          JSON.stringify({
            ack: true,
            stopped: true
          }),
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
      } else {
        const op = await getDb().collection('execution_history').updateOne({
          _id: ObjectId.createFromHexString(String(executionHistory._id)),
        }, {
          $set: {
            cancelRequested: true,
            cancelledAt: new Date(),
            cancelledBy: String(currentUser._id),
            cancelAttempts: cancelAttempts + 1
          },
        });

        return new Response(
          JSON.stringify({
            result: op,
          }),
          {
            headers: {
              "Content-Type": "application/json",
            },
          }
        );
      }
    } else if (executionHistory.status === "queued") {
      if (executionHistory.executionId) {
        if (process.env['DISABLE_ENV_CREATION'] === 'true') {
          // Do nothing
          console.log('Skipping env deletion');
        } else {
          await deleteEnvironment(String(executionHistory.executionId));
        }
      }

      await getDb().collection('execution_history').updateOne({
        _id: ObjectId.createFromHexString(String(executionHistory._id)),
      }, {
        $set: {
          status: "cancelled",
        },
      });

      return new Response(
        JSON.stringify({
          ack: true,
          stopped: true
        }),
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    }
  }

  return new Response(
    JSON.stringify({
      ack: true
    }),
    {
      headers: {
        "Content-Type": "application/json",
      },
    }
  );
}
