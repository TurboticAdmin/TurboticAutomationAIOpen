# Google Analytics 4 Setup - Quick Start Guide

## ✅ What Has Been Implemented

Your application now has a complete Google Analytics 4 (GA4) integration with the following features:

### 🎯 Automatic Tracking (No Code Required)

1. **Page Views** - Every route change is automatically tracked
2. **UTM Parameters** - Marketing campaign tracking (utm_source, utm_medium, utm_campaign)
3. **User Location Data**:
   - Timezone
   - Browser language
   - Screen resolution
   - Viewport size

### 🛠️ Manual Tracking (Available via Functions/Hooks)

All standard analytics events can be tracked:
- Button clicks
- Form submissions & interactions
- Feature usage
- Search queries
- User engagement
- Errors
- Navigation
- E-commerce/subscriptions
- Performance metrics
- Custom events

---

## 🚀 Getting Started (5 Minutes)

### Step 1: Create Google Analytics Property

1. Go to [Google Analytics](https://analytics.google.com/)
2. Click **Admin** (gear icon in bottom left)
3. Under "Property" column, click **Create Property**
4. Fill in:
   - Property name: `Turbotic Automation AI` (or your preferred name)
   - Reporting time zone: Your timezone
   - Currency: Your currency
5. Click **Next**
6. Fill in business details and click **Create**
7. Accept Terms of Service

### Step 2: Create Data Stream

1. Click **Web** under "Choose a platform"
2. Enter:
   - Website URL: Your production URL (e.g., `https://turbotic.com`)
   - Stream name: `Turbotic Web App`
3. Click **Create stream**
4. **Copy the Measurement ID** (format: `G-XXXXXXXXXX`)

### Step 3: Configure Environment Variable

1. Open `.env.local` in the `packages/app` directory
2. Find the line:
   ```bash
   NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXXXX
   ```
3. Replace `G-XXXXXXXXXX` with your actual Measurement ID
4. Save the file

### Step 4: Restart Your Development Server

```bash
# Stop your current dev server (Ctrl+C)
npm run dev
```

### Step 5: Verify Setup

1. Open your application in a browser
2. Open Browser DevTools (F12)
3. Check the Console tab for:
   ```
   [GA] Google Analytics initialized successfully
   [GA] Page view tracked: /your-page
   ```
4. Go to Google Analytics → **Realtime** → **Overview**
5. Navigate through your app - you should see activity in real-time!

---

## 📚 Implementation Files

The following files have been created:

### Core Library
- **`src/lib/google-analytics.ts`** - Main analytics functions
- **`src/components/AnalyticsProvider.tsx`** - React provider for auto-tracking
- **`src/hooks/useAnalytics.ts`** - React hook for easy component integration

### Documentation & Examples
- **`GOOGLE_ANALYTICS_GUIDE.md`** - Comprehensive usage guide with examples
- **`src/components/examples/AnalyticsExample.tsx`** - Live demo component
- **`ANALYTICS_SETUP.md`** - This file

### Modified Files
- **`src/app/layout.tsx`** - Integrated analytics provider and GA scripts
- **`.env.local`** - Added GA measurement ID variable

---

## 💡 Quick Usage Examples

### Option 1: Using Functions Directly

```typescript
import { trackButtonClick, trackFeatureUsage } from '@/lib/google-analytics';

function MyComponent() {
  const handleClick = () => {
    trackButtonClick('Create Automation', 'Dashboard');
  };

  return <button onClick={handleClick}>Create</button>;
}
```

### Option 2: Using the Hook (Recommended)

```typescript
import { useAnalytics } from '@/hooks/useAnalytics';

function MyComponent() {
  const analytics = useAnalytics();

  const handleClick = () => {
    analytics.trackButton('Create Automation', 'Dashboard');
  };

  return <button onClick={handleClick}>Create</button>;
}
```

### Option 3: View Live Examples

To see all tracking capabilities in action:

1. Import the example component in any page:
   ```typescript
   import { AnalyticsExample } from '@/components/examples/AnalyticsExample';

   export default function DemoPage() {
     return <AnalyticsExample />;
   }
   ```

2. Navigate to that page and interact with the examples
3. Watch the events appear in GA Realtime view

---

## 🎯 Common Tracking Scenarios

### Track User Registration

```typescript
import { useAnalytics } from '@/hooks/useAnalytics';

function SignupForm() {
  const analytics = useAnalytics();

  const handleSubmit = async (data) => {
    try {
      const user = await registerUser(data);

      // Identify user
      analytics.identifyUser(user.id);

      // Set user properties
      analytics.updateUserProperties({
        signup_method: 'email',
        user_tier: 'free',
      });

      // Track form submission
      analytics.trackForm('Signup Form', true);
    } catch (error) {
      analytics.trackForm('Signup Form', false);
      analytics.trackErrorEvent('Registration', error.message, 'high');
    }
  };

  return <form onSubmit={handleSubmit}>...</form>;
}
```

### Track Feature Usage

```typescript
import { useAnalytics } from '@/hooks/useAnalytics';

function WorkflowBuilder() {
  const analytics = useAnalytics();

  const addNode = (nodeType: string) => {
    analytics.trackFeature('Workflow Builder', 'Add Node', nodeType);
    // Your logic...
  };

  return (
    <div>
      <button onClick={() => addNode('API Call')}>Add API Call</button>
      <button onClick={() => addNode('Database Query')}>Add Database Query</button>
    </div>
  );
}
```

### Track Automation Execution

```typescript
import { useAnalytics } from '@/hooks/useAnalytics';

function AutomationRunner() {
  const analytics = useAnalytics();

  const runAutomation = async (name: string) => {
    const startTime = Date.now();

    try {
      await executeAutomation();
      const duration = Date.now() - startTime;

      analytics.trackAutomation(name, true, duration);
    } catch (error) {
      analytics.trackAutomation(name, false);
      analytics.trackErrorEvent('Automation', error.message, 'high');
    }
  };

  return <button onClick={() => runAutomation('Daily Report')}>Run</button>;
}
```

### Track Subscription Purchase

```typescript
import { trackPurchase } from '@/lib/google-analytics';

async function handleUpgrade(plan: string, price: number) {
  const orderId = await processUpgrade(plan, price);

  trackPurchase(orderId, price, 'USD', [
    {
      id: plan,
      name: `${plan} Plan`,
      price: price,
      quantity: 1,
    },
  ]);
}
```

---

## 🔍 Debugging

### Check if GA is Initialized

Open browser console and look for:
```
[GA] Google Analytics initialized successfully
```

If you see:
```
[GA] Google Analytics Measurement ID not configured
```

Your `.env.local` still has the placeholder value. Replace it with your actual Measurement ID.

### View Network Requests

1. Open DevTools → Network tab
2. Filter by "collect"
3. You should see POST requests to `google-analytics.com/g/collect`
4. Click on a request to see the data being sent

### Use GA Realtime View

1. Open Google Analytics
2. Go to **Realtime** → **Overview**
3. Perform actions in your app
4. Events should appear within seconds

### Enable GA Debug Mode

Add to any component temporarily:
```typescript
useEffect(() => {
  window['ga-disable-G-XXXXXXXXXX'] = false; // Enable GA
  console.log('GA Debug Mode Enabled');
}, []);
```

---

## 🔐 Privacy & Compliance

### GDPR Compliance

If you need to comply with GDPR:

1. **Get User Consent** before initializing GA
2. **Add Consent Banner** to your app
3. **Update AnalyticsProvider.tsx**:

```typescript
'use client';

import { useEffect } from 'react';
import { initGA } from '@/lib/google-analytics';

export function AnalyticsProvider({ children }) {
  useEffect(() => {
    // Only initialize if user has consented
    const hasConsent = localStorage.getItem('analytics-consent') === 'true';

    if (hasConsent) {
      initGA();
    }
  }, []);

  return <>{children}</>;
}
```

### Anonymize IP Addresses

Google Analytics 4 anonymizes IP addresses by default, but you can ensure this:

In `src/lib/google-analytics.ts`, update `initGA()`:

```typescript
ReactGA.initialize(measurementId, {
  gaOptions: {
    anonymize_ip: true,
    send_page_view: false,
  },
});
```

---

## 📊 Recommended Custom Reports

Once you have data, create these custom reports in GA:

### 1. Feature Adoption Report
- Dimension: Event name
- Metric: Event count
- Filter: Event category = "Feature Usage"

### 2. User Journey Report
- Dimension: Page path
- Metric: Active users
- Secondary dimension: User type (new/returning)

### 3. Automation Performance Report
- Dimension: Event label
- Metric: Event count
- Filter: Event name = "automation_execution"

### 4. Conversion Funnel Report
Track key actions:
1. Sign up
2. Create first automation
3. First successful execution
4. Upgrade to paid

---

## 🚨 Common Issues

### Issue: Events Not Appearing

**Possible Causes:**
1. Measurement ID not configured correctly
2. Ad blocker blocking GA
3. Browser privacy settings
4. Waiting for standard reports (use Realtime instead)

**Solutions:**
1. Double-check `.env.local` has correct ID
2. Test in incognito mode without extensions
3. Use GA Realtime view for immediate feedback
4. Wait 24-48 hours for standard reports

### Issue: Duplicate Events

**Cause:** React strict mode or multiple GA initializations

**Solution:** Ensure `isInitialized` flag prevents re-initialization (already implemented)

### Issue: Missing User Location

**Cause:** User denied geolocation permission

**Solution:** This is expected - respect user privacy. GA will still capture timezone, language, and IP-based location.

---

## 📈 Next Steps

1. **Set up Conversions**: Mark important events as conversions in GA
2. **Create Audiences**: Segment users based on behavior
3. **Set up Alerts**: Get notified of unusual traffic or errors
4. **Connect to BigQuery**: For advanced analysis (GA360 feature)
5. **Integrate with Google Ads**: For marketing attribution

---

## 📞 Support Resources

- **Google Analytics Help**: https://support.google.com/analytics
- **GA4 Documentation**: https://developers.google.com/analytics/devguides/collection/ga4
- **react-ga4 GitHub**: https://github.com/codler/react-ga4
- **Your Implementation Guide**: See `GOOGLE_ANALYTICS_GUIDE.md`

---

## ✨ Summary

You now have:
- ✅ Automatic page view tracking
- ✅ UTM parameter tracking
- ✅ User location & device tracking
- ✅ Comprehensive event tracking functions
- ✅ React hook for easy integration
- ✅ Example components
- ✅ Full documentation

**Next:** Add your GA Measurement ID and start tracking! 🎉
