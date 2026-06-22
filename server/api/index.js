const app = require('../src/app');
const { connectDatabase } = require('../src/config/database');

// Ensure database connection is established for serverless environment
connectDatabase().catch(console.error);

// Export the Express app for Vercel Serverless Functions
module.exports = app;
