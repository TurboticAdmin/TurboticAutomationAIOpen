# Email Restrictions System

This document describes the email restrictions (whitelist/blacklist) system implemented for the Turbotic AI platform.

## Overview

The email restrictions system allows administrators to control which email addresses can sign up and access the platform. It supports both whitelist and blacklist rules with wildcard pattern matching.

## Features

- **Whitelist Rules**: Allow specific email addresses or domains
- **Blacklist Rules**: Block specific email addresses or domains
- **Wildcard Support**: Use `*` for any characters and `?` for single character
- **Pattern Testing**: Test patterns against sample emails before applying
- **Admin Interface**: Web-based management interface
- **Real-time Validation**: Both frontend and backend validation
- **Caching**: Performance optimization with 5-minute cache

## Pattern Examples

| Pattern | Description | Matches | Doesn't Match |
|---------|-------------|---------|---------------|
| `user@example.com` | Exact email | `user@example.com` | `admin@example.com` |
| `@example.com` | All emails from domain | `user@example.com`, `admin@example.com` | `user@other.com` |
| `*.example.com` | All emails from domain (wildcard) | `user@example.com`, `admin@example.com` | `user@other.com` |
| `test*.com` | All emails starting with "test" from .com domains | `test@example.com`, `testuser@company.com` | `user@example.com` |
| `admin@*.com` | All admin emails from .com domains | `admin@example.com`, `admin@company.com` | `user@example.com` |

## How It Works

1. **Priority**: Blacklist rules take precedence over whitelist rules
2. **Whitelist Logic**: If whitelist rules exist, only matching emails are allowed
3. **No Whitelist**: If no whitelist rules exist, all emails are allowed (unless blacklisted)
4. **Validation**: Both frontend and backend validate emails before allowing access

## API Endpoints

### GET /api/email-restrictions
Get all email restrictions

### POST /api/email-restrictions
Add a new email restriction

**Body:**
```json
{
  "pattern": "*.example.com",
  "type": "whitelist",
  "description": "Allow all emails from example.com domain",
  "createdBy": "admin@company.com"
}
```

### DELETE /api/email-restrictions/[id]
Delete an email restriction by ID

### POST /api/email-restrictions/test
Test a pattern against sample emails

**Body:**
```json
{
  "pattern": "*.example.com",
  "testEmails": ["user@example.com", "admin@other.com"]
}
```

## Database Schema

The system uses a MongoDB collection called `email_restrictions` with the following schema:

```typescript
interface EmailRestriction {
  _id: string;
  pattern: string;           // The pattern to match
  type: 'whitelist' | 'blacklist';
  description?: string;      // Optional description
  createdAt: Date;          // When the rule was created
  createdBy?: string;       // Who created the rule
}
```

## Usage

### Setting Up Admin Users

Before accessing the admin panel, you need to set up admin users:

1. **Run the admin initialization script:**
   ```bash
   cd packages/app
   node init-admin.js
   ```

2. **Update admin emails** in `scripts/init-admin-users.js` with your actual admin emails:
   ```javascript
   const adminUsers = [
     {
       email: 'your-email@domain.com',
       role: 'admin',
       permissions: ['email_restrictions', 'user_management'],
       createdAt: new Date(),
       createdBy: 'system'
     }
   ];
   ```

3. **Run the script again** to add your admin users

### Accessing the Admin Panel

1. Sign in to the platform with an admin email
2. Click "Admin Panel" in the header navigation (only visible to admins)
3. Navigate to the Email Restrictions section

### Adding Restrictions

1. Click "Add Restriction"
2. Select the type (Whitelist or Blacklist)
3. Enter the pattern (supports wildcards)
4. Add an optional description
5. Click "Add Restriction"

### Testing Patterns

1. Click "Test Pattern"
2. Enter the pattern to test
3. Enter sample emails (one per line)
4. Click "Test Pattern" to see results

### Managing Restrictions

- View all current restrictions in the "Current Restrictions" section
- Delete restrictions by clicking the trash icon
- See when each restriction was added

## Initialization

To initialize sample email restrictions for testing:

```bash
cd packages/app
node init-email-restrictions.js
```

This will create sample rules including:
- Whitelist: `*.example.com`
- Blacklist: `test@*.com`
- Whitelist: `admin@company.com`
- Blacklist: `*.temp.com`

**Note:** The admin users have already been initialized. If you need to add more admin users, edit `scripts/init-admin-users.js` and run `node init-admin.js` again.

## Security Considerations

1. **Backend Validation**: Always validate on the backend - frontend validation is for UX only
2. **Admin Access**: Restrict admin panel access to authorized users in the `automation_ai_admins` collection
3. **Pattern Validation**: Validate patterns to prevent regex injection
4. **Rate Limiting**: Consider implementing rate limiting on the API endpoints
5. **Audit Logging**: Log all changes to email restrictions for audit purposes
6. **Admin Authentication**: Admin status is checked against the database on each request
7. **Email Case Sensitivity**: Admin emails are stored and compared in lowercase for consistency

## Troubleshooting

### Common Issues

1. **Pattern not working**: Check the pattern syntax and test it first
2. **Email still blocked/allowed**: Check the order of rules (blacklist takes precedence)
3. **Cache issues**: The system caches results for 5 minutes - wait or restart the server

### Debug Mode

To enable debug logging, set the environment variable:
```bash
DEBUG_EMAIL_RESTRICTIONS=true
```

## Future Enhancements

- Role-based access control for admin functions
- Bulk import/export of restrictions
- Scheduled restrictions (time-based rules)
- Integration with external email validation services
- Advanced pattern matching (regex support)
- Email restriction analytics and reporting 