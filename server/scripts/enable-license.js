require('dotenv').config();
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const License = require('../src/models/License');
const { hmacHash, normalizeLicenseKey } = require('../src/utils/crypto');
const env = require('../src/config/env');

async function main() {
  const args = process.argv.slice(2);
  let rawKey = '';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--license' && args[i + 1]) {
      rawKey = args[i + 1];
      i++;
    }
  }

  if (!rawKey) {
    console.error('Usage: node enable-license.js --license TAR-XXXX-XXXX-XXXX');
    process.exit(1);
  }

  const normalized = normalizeLicenseKey(rawKey);
  if (!normalized.valid) {
    console.error('Error:', normalized.error);
    process.exit(1);
  }

  try {
    await connectDatabase();

    const hash = hmacHash(normalized.normalized, env.LICENSE_HASH_SECRET);
    const license = await License.findOne({ licenseKeyHash: hash });

    if (!license) {
      console.error('License not found.');
      process.exit(1);
    }

    if (license.status === 'active') {
      console.log('License is already active.');
      process.exit(0);
    }

    license.status = 'active';
    await license.save();

    console.log(`\nSuccessfully enabled license ${license.displayLabel || '(no label)'}.`);

  } catch (error) {
    console.error('Error enabling license:', error);
  } finally {
    await disconnectDatabase();
    process.exit(0);
  }
}

main();
