const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const env = require('./config/env');
const errorHandler = require('./middleware/error-handler');
const licenseRoutes = require('./routes/license.routes');
// const adminRoutes = require('./routes/admin.routes'); // Unused currently, using CLI

const app = express();

// Security headers
app.use(helmet());

// Enable trust proxy if running behind a reverse proxy (like Render)
app.set('trust proxy', 1);

// CORS Configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow if no origin (e.g., server-to-server or curl) OR if it matches our allowed list
    if (!origin || env.ALLOWED_EXTENSION_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['POST', 'OPTIONS'], // Only POST is needed for our API
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key']
};

// In development, we might want to allow any chrome-extension:// origin 
// since the ID changes when loading unpacked without a key.
// But in production, we strictly enforce it.
if (env.NODE_ENV === 'development') {
  app.use(cors()); // Allow all in dev
} else {
  app.use(cors(corsOptions));
}

// Body parsing with strict limits to prevent large payloads
app.use(express.json({ limit: '10kb' }));

// Routes
app.use('/api/licenses', licenseRoutes);
// app.use('/api/admin', adminRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ ok: true, timestamp: new Date() });
});

// Catch-all for unhandled routes
app.use((req, res) => {
  res.status(404).json({ allowed: false, code: 'NOT_FOUND', message: 'Endpoint not found' });
});

// Centralized Error Handler (MUST be the last middleware)
app.use(errorHandler);

module.exports = app;
