const jwt = require('jsonwebtoken');
const env = require('../config/env');

/**
 * Signs a JWT token for an active license session.
 * @param {Object} claims 
 * @param {string} claims.licenseRef An opaque reference to the license (NOT the MongoDB _id)
 * @param {string} claims.installationHash The hashed installation ID
 * @param {string} claims.extensionVersion The extension version used during generation
 * @param {string} claims.scope The allowed scope (e.g., 'active_session')
 * @returns {string} The signed JWT token
 */
function signToken(claims) {
  // We use token expiration from env, default 15 minutes
  const expiresIn = `${env.TOKEN_TTL_MINUTES}m`;
  
  return jwt.sign(
    {
      licenseRef: claims.licenseRef,
      installationHash: claims.installationHash,
      version: claims.extensionVersion,
      scope: claims.scope || 'active_session'
    },
    env.JWT_SECRET,
    { expiresIn }
  );
}

/**
 * Verifies and decodes a JWT token.
 * @param {string} token 
 * @returns {Object|null} The decoded token payload or null if invalid/expired
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, env.JWT_SECRET);
  } catch (error) {
    // Return null for any JWT error (expired, invalid signature, malformed)
    return null;
  }
}

module.exports = {
  signToken,
  verifyToken
};
