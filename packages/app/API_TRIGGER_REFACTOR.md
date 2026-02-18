## [Run Executions Fallback] Logic Explained

When an automation run is triggered, the system creates both an `execution_history` record and an `execution` record, linked by IDs (`executionId`, `historyId`). For log streaming and traceability, it is critical that the **same execution ID** is used everywhere (frontend, backend, script-runner, and queue).

### Why is there a 'Fallback'?

Sometimes, due to system architecture (e.g., for test/prod isolation or to support retries), the backend may need to **re-use or enforce a specific execution ID** for the queue and script-runner, rather than generating a new one. The fallback logic ensures that, in test/production, the **queueExecutionId** is set to the same value as the main execution ID, so all components refer to the same run.

### What the Logs Mean
- `Using same execution ID for queue: <id>`: The system is explicitly setting the queue execution ID to match the main execution ID.
- `This ensures consistent ID flow between frontend and script-runner`: Guarantees that when you stream logs or check status, all parts of the system are referencing the same execution.
- `About to call triggerRun with queueExecutionId: ...`: The backend is about to send a message to the queue (RabbitMQ) with this consistent ID.

### Why is this needed?
- **Consistency:** Ensures that logs, status, and results are always tied to the same execution, regardless of which part of the system is handling them.
- **Frontend/Backend Sync:** The frontend can reliably stream logs for the correct execution.
- **Avoids Orphaned Runs:** Prevents situations where the script-runner or logs are associated with a different or new execution ID.

**In short:**
The fallback logic is a safety mechanism to make sure all parts of your system use the same execution ID for a given automation run, especially in test/production, so you don't get mismatched logs or orphaned executions. 