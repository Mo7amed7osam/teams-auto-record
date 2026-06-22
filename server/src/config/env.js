require('dotenv').config();

const requiredEnvVars = [
  'MONGODB_URI',
  'MONGODB_DB_NAME',
  'LICENSE_HASH_SECRET',
  'DEVICE_HASH_SECRET',
  'JWT_SECRET',
  'ADMIN_API_KEY'
];

function validateEnv() {
  if (process.env.NODE_ENV === 'test') return;

  const missing = requiredEnvVars.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.error(`FATAL ERROR: Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }
}

validateEnv();

module.exports = {
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '10000', 10),
  MONGODB_URI: process.env.MONGODB_URI,
  MONGODB_DB_NAME: process.env.MONGODB_DB_NAME,
  LICENSE_HASH_SECRET: process.env.LICENSE_HASH_SECRET,
  DEVICE_HASH_SECRET: process.env.DEVICE_HASH_SECRET,
  JWT_SECRET: process.env.JWT_SECRET,
  ADMIN_API_KEY: process.env.ADMIN_API_KEY,
  ALLOWED_EXTENSION_ORIGINS: (process.env.ALLOWED_EXTENSION_ORIGINS || '').split(',').filter(Boolean),
  TOKEN_TTL_MINUTES: parseInt(process.env.TOKEN_TTL_MINUTES || '15', 10),
  OFFLINE_GRACE_HOURS: parseInt(process.env.OFFLINE_GRACE_HOURS || '12', 10)
};
