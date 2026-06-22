const { constantTimeEqual } = require('../utils/crypto');
const env = require('../config/env');

function adminAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['x-api-key'] || '';
  
  // Extract token if using "Bearer <token>" format
  let apiKey = authHeader;
  if (apiKey.startsWith('Bearer ')) {
    apiKey = apiKey.slice(7);
  }

  if (!apiKey) {
    return res.status(401).json({
      allowed: false,
      code: 'ADMIN_UNAUTHORIZED',
      message: 'Admin authorization required'
    });
  }

  if (constantTimeEqual(apiKey, env.ADMIN_API_KEY)) {
    return next();
  }

  return res.status(403).json({
    allowed: false,
    code: 'ADMIN_UNAUTHORIZED',
    message: 'Invalid admin credentials'
  });
}

module.exports = adminAuth;
