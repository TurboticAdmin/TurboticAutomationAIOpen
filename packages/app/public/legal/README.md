# Terms of Service (ToS) Setup

This directory contains the Terms of Service PDF files for the application.

## Setup Instructions

### 1. Add Your ToS PDF File

Place your Terms of Service PDF file in this directory with the following naming convention:
```
tos-v{version}.pdf
```

For example:
- `tos-v1.0.pdf` for version 1.0
- `tos-v1.1.pdf` for version 1.1
- `tos-v2.0.pdf` for version 2.0

### 2. Configure ToS in Database

You need to manually update the MongoDB `config` collection to enable ToS and set the version.

#### Enable ToS with Version 1.0

```javascript
// Connect to your MongoDB instance
use turbotic-playground  // or your database name (configure via MONGO_URI or MONGODB_DATABASE_NAME)

// Enable ToS and set version
db.config.updateOne(
  {},  // Update the first/only config document
  {
    $set: {
      tosEnabled: true,
      tosVersion: "1.0"
    }
  }
)
```

#### Disable ToS

```javascript
db.config.updateOne(
  {},
  {
    $set: {
      tosEnabled: false
    }
  }
)
```

#### Update ToS Version (when you release a new version)

```javascript
// When you create a new ToS version, users who accepted the old version
// will need to accept the new version when they log in next

db.config.updateOne(
  {},
  {
    $set: {
      tosVersion: "2.0"  // Update to match your new PDF filename
    }
  }
)
```

### 3. User Experience Flow

Once enabled:

1. **New Users**: After successful login, if ToS is enabled, they will see a modal with the PDF viewer
2. **Existing Users**: If they haven't accepted ToS or if the version has changed, they'll see the modal
3. **Modal Behavior**:
   - Non-dismissible (users cannot close it without accepting)
   - Displays the PDF inline via iframe
   - Link to open PDF in new tab
   - Checkbox to confirm acceptance
   - Accept button enabled only after checking the box

4. **After Acceptance**:
   - Acceptance is recorded in the `users` collection with:
     - `hasAcceptedTos: true`
     - `tosAcceptedAt: Date`
     - `acceptedTosVersion: "1.0"` (or current version)
   - User can proceed to use the application

### 4. Database Schema

#### Config Collection
```javascript
{
  mode: "charge" | "free",
  onboardingTourEnabled: false,
  marketplaceEnabled: false,
  tosEnabled: true,           // Toggle ToS requirement
  tosVersion: "1.0",           // Current ToS version
  createdAt: Date,
  updatedAt: Date
}
```

#### Users Collection (auto-updated)
```javascript
{
  email: "user@example.com",
  name: "User Name",
  // ... other user fields
  hasAcceptedTos: true,
  tosAcceptedAt: ISODate("2025-11-03T12:00:00Z"),
  acceptedTosVersion: "1.0"
}
```

### 5. Checking User ToS Status

You can check which users have accepted the ToS:

```javascript
// Find users who haven't accepted ToS
db.users.find({ hasAcceptedTos: { $ne: true } })

// Find users who accepted a specific version
db.users.find({ acceptedTosVersion: "1.0" })

// Count users by ToS acceptance status
db.users.aggregate([
  {
    $group: {
      _id: "$acceptedTosVersion",
      count: { $sum: 1 }
    }
  }
])
```

### 6. Version Updates

When you need to update your Terms of Service:

1. Create a new PDF file with the new version number (e.g., `tos-v2.0.pdf`)
2. Update the config collection with the new version
3. All users (even those who accepted v1.0) will be prompted to accept v2.0 on their next login

### 7. Troubleshooting

**PDF not displaying?**
- Ensure the PDF file exists at `public/legal/tos-v{version}.pdf`
- Check that the version in the config matches the filename
- Check browser console for errors
- Use the "Open PDF in new tab" link as fallback

**ToS modal not showing?**
- Verify `tosEnabled: true` in config collection
- Verify `tosVersion` is set in config collection
- Check user's `tosStatus` in authentication response
- Check browser console for errors

**Need to reset a user's ToS acceptance?**
```javascript
// Force a user to re-accept ToS
db.users.updateOne(
  { email: "user@example.com" },
  {
    $set: {
      hasAcceptedTos: false,
      acceptedTosVersion: null
    }
  }
)
```
