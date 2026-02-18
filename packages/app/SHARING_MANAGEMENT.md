# Automation Sharing Management

This document describes the sharing management features for automations in Turbotic.

## Overview

Users can share automations with other users by email (supporting multiple emails at once), and manage those shares through edit and delete operations. The system also provides visibility into sharing statistics and reshare tracking.

## Features

### 1. Share Automation
- Share automations with one or more users by entering multiple email addresses (comma-separated or as chips)
- Option to include or exclude environment variables (standard checkbox)
- Optionally allow recipients to edit the shared automation ("Can Edit" toggle, if enabled)
- Recipients receive a copy of the automation in their workspace
- Shared automations are marked with a "Shared" badge and a share count badge (e.g., "Shared (3)")

### 2. Edit Sharing Settings
- Modify whether environment variables are included in shared automations
- Toggle "Can Edit" permission for recipients (if enabled)
- Update sharing settings without re-sharing the automation
- Changes are applied immediately to the recipient's copy

### 3. Delete/Remove Sharing
- Remove access to shared automations
- Deletes the shared automation from the recipient's workspace
- Removes the sharing record from the database
- Requires confirmation to prevent accidental deletion

### 4. Sharing Statistics & Visibility
- **Sharing Count Badge**: Shows "Shared (X)" for automations shared with multiple users
- **Dashboard Stats**: Displays count of shared automations and total shares
- **Filter Options**: Filter automations by "Shared By Me" to see what you've shared
- **Tooltip Information**: Hover over sharing badges for detailed information
- **Resharing Visibility**: See when and with whom your shared automations have been reshared (with reshare counts and details)
- **Duplicate Prevention**: Prevents sharing the same automation with the same user multiple times

## User Interface

### Share Dialog
- **Share Button**: Available on all automation cards
- **Manage Sharing Button**: Appears for already shared automations
- **Sharing History**: Shows all current shares with edit/delete options, reshare counts, and details
- **Email Input**: Supports multiple emails, with mail icon only when input is empty
- **Checkbox**: Standard browser style for environment variables
- **Can Edit Toggle**: Allows giving edit permission to recipients (if enabled)
- **Responsive Design**: Dialog and inputs are fully responsive and accessible

### Edit Mode
- Inline editing interface within the share dialog
- Toggle for environment variables inclusion and canEdit
- Update and Cancel buttons
- Security warnings for sensitive data

### Delete Confirmation
- Modal dialog with clear warning message
- Confirms the action will remove access permanently
- Shows the recipient's email address

### Dashboard Statistics
- **Shared Automations Card**: Shows count of automations you've shared
- **Total Shares**: Displays the sum of all individual shares
- **Visual Indicators**: Color-coded badges and icons for easy identification

### Resharing Management
- **Reshare Tracking**: Automatically tracks when shared automations are reshared
- **Reshare Counts**: Shows number of reshares for each shared automation
- **Reshare Details**: Displays who reshared and when in the sharing history
- **Visual Indicators**: Purple badges show reshare counts in sharing history

## API Endpoints

### POST `/api/automations/share`
Creates a new share for an automation.

**Request Body:**
```json
{
  "automationId": "string",
  "sharedWithEmail": "string", // comma-separated emails
  "includeEnvironmentVariables": boolean,
  "canEdit": boolean
}
```

**Response:**
- Success: `{ success: true, message: "Automation shared successfully with email(s)" }`
- Error (duplicate): `{ error: "Automation is already shared with email" }`

### PUT `/api/automations/share`
Updates sharing settings for an existing share.

**Request Body:**
```json
{
  "shareId": "string",
  "includeEnvironmentVariables": boolean,
  "canEdit": boolean
}
```

### DELETE `/api/automations/share`
Removes sharing and deletes the shared automation.

**Request Body:**
```json
{
  "shareId": "string",
  "sharedAutomationId": "string"
}
```

### GET `/api/automations/share?automationId=string`
Retrieves sharing history for an automation.

### GET `/api/get-all-automations`
Returns automations with `sharedWithCount` field for owned automations.

## Security Features

- **Authentication Required**: All sharing operations require user authentication
- **Ownership Verification**: Users can only manage shares they created
- **Environment Variable Protection**: Sensitive data can be excluded from sharing
- **Access Control**: Recipients only see automations shared with them

## Database Schema

### automation_shares Collection
```javascript
{
  _id: ObjectId,
  originalAutomationId: String,
  sharedAutomationId: String,
  sharedByUserId: String,
  sharedByEmail: String,
  sharedWithUserId: String,
  sharedWithEmail: String,
  includeEnvironmentVariables: Boolean,
  canEdit: Boolean,
  sharedAt: Date,
  updatedAt: Date,
  status: String
}
```

### automations Collection (Shared)
```javascript
{
  _id: ObjectId,
  title: String,
  code: String,
  environmentVariables: Array,
  workspaceId: String,
  isShared: Boolean,
  sharedFrom: {
    automationId: String,
    userId: String,
    userEmail: String,
    sharedAt: Date
  }
}
```

### automations Collection (Owned with sharing count)
```javascript
{
  _id: ObjectId,
  title: String,
  code: String,
  workspaceId: String,
  isPublished: Boolean,
  sharedWithCount: Number // Calculated field
}
```

## Usage Examples

### Sharing an Automation
1. Click the "Share" button on an automation card
2. Enter one or more recipient email addresses
3. Choose whether to include environment variables and/or allow editing
4. Click "Share Automation"

### Editing Sharing Settings
1. Click "Manage Sharing" on a shared automation
2. Find the share in the sharing history
3. Click the dropdown menu (⋮) and select "Edit sharing"
4. Modify the environment variables and/or canEdit setting
5. Click "Update Settings"

### Removing Sharing
1. Click "Manage Sharing" on a shared automation
2. Find the share in the sharing history
3. Click the dropdown menu (⋮) and select "Remove sharing"
4. Confirm the deletion in the dialog

### Viewing Sharing Statistics
1. **Dashboard Overview**: Check the "Shared Automations" stat card
2. **Individual Automation**: Look for "Shared (X)" badge on automation cards
3. **Filter View**: Use "Shared By Me" filter to see all your shared automations
4. **Detailed View**: Hover over sharing badges for tooltip information
5. **Resharing Info**: Check sharing history for purple reshare badges and details

### Managing Resharing
1. **View Reshares**: Open "Manage Sharing" to see reshare counts and details
2. **Reshare Tracking**: Purple badges show how many times each share has been reshared
3. **Reshare Details**: Expand sharing history to see who reshared and when

## Best Practices

1. **Environment Variables**: Only share environment variables with trusted users
2. **Regular Review**: Periodically review and clean up old shares
3. **Clear Communication**: Inform recipients when sharing automations
4. **Security**: Be cautious when sharing automations with sensitive data
5. **Monitor Sharing**: Use the dashboard stats to track your sharing activity

## Troubleshooting

### Shared Automation Not Visible
- Ensure the automation was shared with `isPublished: true`
- Check that the recipient is logged in with the correct email
- Verify the sharing record exists in the database

### Edit/Delete Not Working
- Confirm you are the original sharer of the automation
- Check that the share record exists and is active
- Ensure proper authentication and permissions

### Environment Variables Not Updated
- The update only affects future shares, not existing ones
- Use the edit functionality to update existing shares
- Recipients may need to refresh their workspace

### Sharing Count Not Accurate
- The count is calculated in real-time from the database
- Refresh the dashboard to get the latest counts
- Check that the automation is owned by the current user

### Duplicate Sharing Error
- The system prevents sharing the same automation with the same user twice
- Check if the user already has access to the automation
- Use the sharing history to verify existing shares

### Resharing Information Missing
- Resharing data is only available for automations you originally shared
- Check that you are the original sharer of the automation
- Refresh the sharing history to get the latest resharing data 