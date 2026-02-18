# Turbotic Playground - Main Application

This is the main Next.js application for Turbotic Playground, providing a comprehensive automation platform with real-time monitoring, scheduling, and API integration.

## 🚀 Features

- **AI-Powered Automation Creation** - Generate automations using natural language prompts
- **Real-Time Execution Monitoring** - Live logs and status updates via WebSocket
- **Automation Scheduling** - Cron-based scheduling with accurate next run time calculation
- **API Integration** - Secure automation triggers with API key authentication
- **Multi-User Support** - Workspace-based user management and sharing
- **Dashboard Analytics** - Real-time metrics and execution history
- **Development Mode** - Enhanced local development experience

## 🛠️ Development Setup

### Prerequisites

- **Node.js** (v18 or higher)
- **MongoDB** (local or cloud instance)
- **RabbitMQ** (for message queue processing)

### Quick Start

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Set up environment variables**:
   Create a `.env.local` file:
   ```env
   # Database
   MONGO_URI=mongodb://localhost:27017/turbotic-playground
   
   # JWT Secret
   JWT_SECRET=your-secret-key
   
   # RabbitMQ
   RABBIT_MQ_ENDPOINT=amqp://user:password@localhost:5672
   
   # Playground Endpoint
   AUTOMATIONAI_ENDPOINT=http://localhost:3000
   
   # SendGrid (for email notifications)
   SENDGRID_API_KEY=your-sendgrid-key
   
   # Local Testing (optional)
   EXECUTION_ID=test-execution-123
   AUTOMATION_ID=test-automation-456
   
   # Kubernetes (Production only)
   AUTOMATION_RUNNER_IMAGE=your-registry.azurecr.io/automationai-script-runner:latest
   ```

3. **Start the development server**:
   ```bash
   npm run dev
   ```

4. **Open your browser**:
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📁 Project Structure

```
src/
├── app/                    # Next.js app router
│   ├── api/               # API routes
│   │   ├── automations/   # Automation management
│   │   ├── schedules/     # Scheduling system
│   │   ├── run/          # Execution management
│   │   └── authentication/ # User authentication
│   ├── dashboard/        # Main dashboard
│   ├── canvas/           # Automation editor
│   └── layout.tsx        # Root layout
├── components/           # React components
│   ├── ui/              # Reusable UI components
│   ├── AutomationStatusBadge.tsx
│   ├── CodeExplanationButton.tsx
│   └── ...
└── lib/                 # Utilities and services
    ├── db.ts           # Database connection
    ├── scheduler.ts    # Scheduling service
    └── queue.ts        # RabbitMQ integration
```

## 🔧 Recent Fixes & Improvements

### Scheduling System (Latest)

#### Dashboard Count Display
- **Fixed**: Scheduled automations count now shows correct "Total/Active Schedules" format
- **Issue**: Dashboard was trying to access `data.schedules` but API returns array directly
- **Solution**: Updated `fetchSchedules` to handle both array and object responses

#### Next Run Time Calculation
- **Fixed**: Schedules now show accurate next run times based on cron expressions
- **Issue**: `calculateNextRun` was returning fixed 24-hour offset
- **Solution**: Integrated `cron-parser@4.7.0` for proper cron expression parsing

#### TypeScript Compilation
- **Fixed**: Resolved implicit 'any' type errors in AutomationScheduler component
- **Issue**: Map function parameters lacked explicit typing
- **Solution**: Added explicit type annotations: `(e: ScheduleExecution) => ...`

#### Database Consistency
- **Fixed**: Proper ObjectId handling for schedule_executions records
- **Issue**: Records stored with string `_id` instead of ObjectId
- **Solution**: Updated scheduler to use ObjectId consistently

#### Script Status API
- **Fixed**: Script execution status now properly fetched from execution_history
- **Issue**: Frontend was using incorrect API endpoint parameters
- **Solution**: Created dedicated API endpoint and updated frontend usage

### Authentication System
- **Fixed**: Excessive polling of `/api/authentication/me` endpoint
- **Improved**: Memoized functions to prevent unnecessary re-renders
- **Result**: Reduced server load and improved performance

### API Trigger System
- **Enhanced**: Immediate response with execution ID
- **Added**: Separate endpoint for status polling
- **Integrated**: WebSocket support for real-time log streaming

## 🧪 Testing

### Manual Testing

1. **Start the application**:
   ```bash
   npm run dev
   ```

2. **Test scheduling system**:
   - Navigate to dashboard
   - Go to "Schedules" tab
   - Create a new schedule with "Every 5 minutes"
   - Verify dashboard shows correct count (1/1)
   - Check next run time is accurate

3. **Test automation execution**:
   - Create or use existing automation
   - Trigger execution manually
   - Monitor real-time logs
   - Check execution history

### API Testing

```bash
# Get all schedules
curl http://localhost:3000/api/schedules

# Create a schedule
curl -X POST http://localhost:3000/api/schedules \
  -H "Content-Type: application/json" \
  -d '{
    "automationId": "your-automation-id",
    "automationTitle": "Test Automation",
    "cronExpression": "*/5 * * * *"
  }'

# Trigger automation
curl -X POST http://localhost:3000/api/automations/{id}/trigger \
  -H "Content-Type: application/json" \
  -d '{"apiKey": "your-api-key"}'
```

## 🔍 Troubleshooting

### Common Issues

#### Dashboard Shows Wrong Schedule Count
- **Check**: Browser dev tools Network tab for `/api/schedules` response
- **Fix**: Ensure API returns array directly, not wrapped in object
- **Verify**: Frontend handles both response formats

#### Next Run Time Incorrect
- **Check**: `npm list cron-parser` (should be 4.7.0)
- **Fix**: `npm install cron-parser@4.7.0`
- **Verify**: Import uses `parser.parseExpression`

#### TypeScript Compilation Errors
- **Check**: All map function parameters have explicit typing
- **Fix**: Add type annotations: `(e: ScheduleExecution) => ...`
- **Verify**: React imports are correct

#### Script Status Not Showing
- **Check**: Script-runner is running and listening on queues
- **Fix**: Start script-runner: `cd ../script-runner && npm run dev`
- **Verify**: execution_history records exist

### Debug Commands

```bash
# Check dependencies
npm list cron-parser
npm list next

# Test database connection
node test-db-connection.cjs

# Build for production
npm run build

# Start production server
npm start
```

## 📊 Performance

### Before Fixes
- Dashboard count: Incorrect or missing
- Next run time: Fixed 24-hour offset
- Script status: Not displayed
- TypeScript: Multiple compilation errors
- Database: Inconsistent ID formats

### After Fixes
- Dashboard count: Accurate "Total/Active Schedules" display
- Next run time: Precise cron-based calculation
- Script status: Real-time updates from execution_history
- TypeScript: Clean compilation
- Database: Consistent ObjectId handling

## 🚀 Deployment

### Production Build

```bash
# Build the application
npm run build

# Start production server
npm start
```

### Docker Deployment

```bash
# Build Docker image
docker build -t turbotic-automationai .

# Run container
docker run -p 3000:3000 turbotic-automationai
```

### Environment Variables

Ensure all required environment variables are set in production:
- `MONGO_URI` - MongoDB connection string
- `JWT_SECRET` - JWT signing secret
- `RABBIT_MQ_ENDPOINT` - RabbitMQ connection string
- `SENDGRID_API_KEY` - Email service API key

## 📝 Contributing

1. **Fork the repository**
2. **Create a feature branch**
3. **Make your changes**
4. **Test thoroughly**
5. **Submit a pull request**

## 📄 License

This project is licensed under the MIT License.

---

**Last Updated**: July 2024  
**Version**: 2.1.0  
**Status**: Production Ready ✅
