const rateLimit = require('express-rate-limit');
const { hmacHash } = require('../utils/crypto');
const env = require('../config/env');

// Helper to extract the installation ID hash for rate limiting keys
// This prevents one bad installation from locking out an entire IP address
// but falls back to IP if the installation ID isn't provided or valid
const getInstallationIdKey = (req) => {
  if (req.body && typeof req.body.installationId === 'string' && req.body.installationId.length > 10) {
    return hmacHash(req.body.installationId, env.DEVICE_HASH_SECRET);
  }
  // Trust X-Forwarded-For if behind a proxy (like Render)
  return req.headers['x-forwarded-for'] || req.socket.remoteAddress;
};

// Custom handler to return our standardized error format
const handler = (req, res, next, options) => {
  res.status(options.statusCode).json({
    allowed: false,
    code: 'RATE_LIMITED',
    message: options.message
  });
};

const activationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each installation/IP to 5 activation attempts per `window`
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getInstallationIdKey,
  handler,
  message: 'Too many activation attempts. Please wait 15 minutes and try again.'
});

const verificationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 60, // Limit each installation/IP to 60 verification attempts per `window`
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: getInstallationIdKey,
  handler,
  message: 'Too many requests. Please wait and try again.'
});

const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit admin ops to 30 per window
  standardHeaders: true,
  legacyHeaders: false,
  // For admin, we primarily rely on IP since they don't send installation IDs
  keyGenerator: (req) => req.headers['x-forwarded-for'] || req.socket.remoteAddress,
  handler,
  message: 'Too many admin requests.'
});

module.exports = {
  activationLimiter,
  verificationLimiter,
  adminLimiter
};
