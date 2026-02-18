const { config } = require('dotenv');
const { resolve } = require('path');

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') });

// Import and run the email restrictions initialization
require('./scripts/init-email-restrictions.js'); 