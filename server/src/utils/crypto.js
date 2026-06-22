const crypto = require('node:crypto');

/**
 * Creates an HMAC-SHA-256 hash of the input value using the provided secret.
 * @param {string} value The value to hash
 * @param {string} secret The secret key
 * @returns {string} The hex-encoded hash
 */
function hmacHash(value, secret) {
  if (!value || typeof value !== 'string') {
    throw new Error('Value to hash must be a non-empty string');
  }
  if (!secret || typeof secret !== 'string') {
    throw new Error('Hash secret must be a non-empty string');
  }
  return crypto.createHmac('sha256', secret).update(value).digest('hex');
}

/**
 * Generates a random license key in the format TAR-XXXX-XXXX-XXXX.
 * @returns {string} The generated license key
 */
function generateLicenseKey() {
  const bytes = crypto.randomBytes(6);
  const hex = bytes.toString('hex').toUpperCase();
  // We have 12 hex chars, split them into chunks of 4
  const part1 = hex.slice(0, 4);
  const part2 = hex.slice(4, 8);
  const part3 = hex.slice(8, 12);
  return `TAR-${part1}-${part2}-${part3}`;
}

const LICENSE_KEY_REGEX = /^TAR-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

/**
 * Normalizes a license key by trimming whitespace and converting to uppercase.
 * Also validates the format.
 * @param {string} raw The raw license key
 * @returns {{valid: boolean, normalized: string, error: string}}
 */
function normalizeLicenseKey(raw) {
  if (!raw || typeof raw !== 'string') {
    return { valid: false, normalized: '', error: 'Enter an activation code.' };
  }

  const normalized = raw.trim().toUpperCase().replace(/\s+/g, '');

  if (!LICENSE_KEY_REGEX.test(normalized)) {
    return {
      valid: false,
      normalized,
      error: 'Invalid format. Expected TAR-XXXX-XXXX-XXXX.'
    };
  }

  return { valid: true, normalized, error: '' };
}

/**
 * Compares two strings in constant time to prevent timing attacks.
 * @param {string} a 
 * @param {string} b 
 * @returns {boolean} True if the strings are equal
 */
function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  
  // They must be the same length for timingSafeEqual, 
  // so we check length first (which technically leaks length, but that's standard for API keys)
  if (a.length !== b.length) {
    return false;
  }
  
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

module.exports = {
  hmacHash,
  generateLicenseKey,
  normalizeLicenseKey,
  constantTimeEqual,
  LICENSE_KEY_REGEX
};
