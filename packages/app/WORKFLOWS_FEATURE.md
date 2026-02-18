# Workflows Feature Documentation

## Overview

The Workflows feature allows admin users to visually design, manage, and execute complex automation workflows using a drag-and-drop interface. Workflows can chain multiple automations, add conditional logic, and define triggers (manual or scheduled) for advanced orchestration.

## Access & Permissions

- **Admin Only:** Only users listed in the `automation_ai_admins` MongoDB collection can access and use the workflow builder and management features.
- **UI Location:** The workflow builder is available as the "Workflows Build" tab in the dashboard. This tab is only visible to admin users.

## Key Features

### Core Functionality
- **Drag-and-Drop Builder:** Create workflows visually by dragging automation, trigger, and condition nodes onto the canvas.
- **Node Types:**
  - **Trigger Node:** Start point for workflows. Supports Webhook, Schedule, Email, Manual, API, and File Upload triggers.
  - **Automation Node:** Represents an automation from your available automations with support for Custom, Email, API, Database, AI, Webhook, and Notification types.
  - **Condition Node:** Allows branching logic with Simple, Advanced, and Expression-based conditions.
- **Connect Nodes:** Link nodes to define execution order and logic.
- **Persistence:** Save, edit, and delete workflows. Workflows are stored in the backend and persist across sessions.

### Advanced Features
- **Workflow Editing:** Edit existing workflows with full drag-and-drop support.
- **Execution History:** View detailed execution history with timeline, results, and statistics.
- **Advanced Condition Logic:** Support for complex conditional expressions and helper functions.
- **Enhanced Node Configuration:** Rich node editing dialogs with type-specific options.
- **Real-time Validation:** Immediate feedback on workflow configuration.

## How to Use

### Creating Workflows
1. **Open the Dashboard** and select the "Workflows Build" tab (admin only).
2. **Create a New Workflow:** Click the "New Workflow" button.
3. **Design the Workflow:**
   - Drag trigger, automation, and condition nodes onto the canvas.
   - Connect nodes to define the flow.
   - Configure each node using the settings dialog.
4. **Save the Workflow:** Click the save button to persist your workflow.

### Managing Workflows
- **View:** Click the "View" button to see a read-only version of the workflow.
- **Edit:** Click the "Edit" button to modify the workflow with full editing capabilities.
- **History:** Click the "History" button to view execution history and statistics.
- **Trigger:** Click the "Trigger" button to manually execute the workflow.

### Advanced Condition Logic

#### Simple Conditions
- `hasSuccess` - Check if any previous step succeeded
- `hasError` - Check if any previous step failed
- `automation.success` - Check if automation steps succeeded
- `automation.failed` - Check if automation steps failed
- `data.status === 'success'` - Check specific data conditions

#### Advanced Conditions
- `countSuccess() > 2` - Count successful steps
- `countErrors() < 3` - Count error steps
- `hasError() && countErrors() < 3` - Complex boolean logic

#### Expression Conditions
- `context.lastResult.success` - Access execution context
- `context.results.length > 0` - Check result array
- Full JavaScript expressions with context object

### Trigger Types
- **Webhook:** HTTP endpoint trigger
- **Schedule:** Cron-based scheduling
- **Email:** Email-based triggers
- **Manual:** User-initiated execution
- **API:** API call triggers
- **File Upload:** File-based triggers

### Automation Types
- **Custom:** Custom automation scripts
- **Email:** Email automation
- **API:** API integration
- **Database:** Database operations
- **AI:** AI-powered automations
- **Webhook:** Webhook integrations
- **Notification:** Notification systems

## API Endpoints

### Workflow Management
- `GET /api/workflows` - Fetch all workflows for the current user
- `POST /api/workflows` - Create a new workflow
- `PUT /api/workflows` - Update an existing workflow
- `DELETE /api/workflows` - Delete a workflow

### Workflow Execution
- `POST /api/workflows/[id]/trigger` - Trigger workflow execution
- `GET /api/workflows/[id]/executions` - Get execution history

## Security & Permissions

- All workflow operations require admin authentication
- Workflows are scoped to the user's workspace
- Execution history is private to the workflow owner
- Advanced condition evaluation is sandboxed for security

## Technical Details

### Condition Evaluation
The system supports three levels of condition complexity:
1. **Simple:** Predefined condition patterns for common use cases
2. **Advanced:** Helper functions with mathematical and logical operations
3. **Expression:** Full JavaScript expressions with access to execution context

### Execution Engine
- Graph traversal algorithm for workflow execution
- Parallel execution support for independent nodes
- Error handling and recovery mechanisms
- Real-time execution status updates

### Data Persistence
- Workflows stored in MongoDB with full versioning
- Execution history with detailed logs and metrics
- Performance statistics and analytics
- Only users in the `automation_ai_admins` collection can access or modify workflows.
- Non-admin users cannot see or interact with the workflow builder or workflow management features.
- API endpoints are protected and will return 403 for non-admin users.

## Future Improvements
- More advanced condition logic
- Parallel execution support
- Workflow versioning
- Audit logs for workflow runs

---

For questions or issues, contact the development team or refer to the admin setup documentation. 