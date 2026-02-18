# Automation Sharing Feature

## Overview

The automation sharing feature allows users to share their automations with other users via email. When an automation is shared, the recipient gets a copy of the automation in their workspace and can run it independently.

## Features

### 1. Share Automation
- Users can share any automation they own with one or more users by entering multiple email addresses (comma-separated or as chips)
- Option to include or exclude environment variables for security (standard checkbox)
- Optionally allow recipients to edit the shared automation ("Can Edit" toggle, if enabled)
- Shared automations are clearly marked with a "Shared" badge and a share count badge (e.g., "Shared (3)")
- Tooltip shows who shared the automation and when

### 2. Environment Variable Control
- **Include Environment Variables**: When checked, the recipient gets the automation with all environment variables and their values
- **Exclude Environment Variables**: When unchecked, the recipient gets the automation with environment variable names but empty values (they need to fill them in)
- Security warning is shown when including environment variables

### 3. Sharing History & Management
- Track all automations shared by the current user
- Shows sharing history with timestamps, recipient emails, and reshare counts
- Indicates whether environment variables were included and if recipients can edit
- Allows editing or removing existing shares
- Resharing is tracked and visible, with details and counts

### 4. Access Control
- Shared automations appear in the recipient's dashboard
- Recipients can view, run, and clone shared automations
- Shared automations are included in analytics and metrics
- Recipients cannot edit the original automation (they get their own copy unless "Can Edit" is enabled)

## Database Schema

### New Collections

#### `automation_shares`
Tracks sharing history and relationships:
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
  status: String // 'active', 'revoked', etc.
}
```

#### Updated `automations` Collection
Shared automations have additional fields:
```javascript
{
  // ... existing fields ...
  isShared: Boolean,
  sharedFrom: {
    automationId: String,
    userId: String,
    userEmail: String,
    sharedAt: Date
  }
}
```

### New Indexes
- `automation_shares.originalAutomationId_sharedAt`
- `automation_shares.sharedByUserId_sharedAt`
- `automation_shares.sharedWithUserId_sharedAt`
- `automation_shares.sharedWithEmail_sharedAt`

## API Endpoints

### POST `/api/automations/share`
Share an automation with one or more users:
```javascript
{
  automationId: String,
  sharedWithEmail: String, // comma-separated emails
  includeEnvironmentVariables: Boolean,
  canEdit: Boolean
}
```

### PUT `/api/automations/share`
Update sharing settings for an existing share:
```javascript
{
  shareId: String,
  includeEnvironmentVariables: Boolean,
  canEdit: Boolean
}
```

### GET `/api/automations/share?automationId=<id>`
Get sharing history for an automation.

## UI Components

### ShareAutomationDialog
- Email input field (supports multiple emails)
- Checkbox for including environment variables (standard browser style)
- Optional "Can Edit" toggle
- Security warning when including env vars
- Sharing history display with reshare details
- Loading states and error handling
- Responsive design: input and icons are always aligned, mail icon only appears when input is empty

### Updated AutomationCard
- Share button with dialog trigger
- "Shared" badge for shared automations
- Share count badge (shows number of users shared with)
- Tooltip showing sharing information

### Updated SearchAndFilter
- New "Ownership" filter category
- "My Automations" and "Shared With Me" options

## Security Considerations

1. **Environment Variables**: Users can choose whether to share sensitive environment variables
2. **Access Control**: Recipients get their own copy, cannot modify the original unless "Can Edit" is enabled
3. **User Creation**: If the recipient doesn't have an account, one is created automatically
4. **Workspace Isolation**: Shared automations are placed in the recipient's workspace

## Usage Flow

1. User clicks "Share" button on an automation card
2. Dialog opens with email input (multiple emails supported) and environment variable/can edit options
3. User enters recipient email(s) and chooses options
4. System creates a copy of the automation in each recipient's workspace
5. Sharing record is created for tracking
6. Recipient sees the shared automation in their dashboard
7. Recipient can run, view, or clone the shared automation

## Future Enhancements

- Revoke sharing functionality
- Bulk sharing
- Sharing permissions (view-only, edit, etc.)
- Sharing notifications via email
- Team workspace sharing
- Public automation marketplace 