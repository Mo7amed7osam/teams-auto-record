require('dotenv').config();
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const License = require('../src/models/License');
const { hmacHash, normalizeLicenseKey } = require('../src/utils/crypto');
const env = require('../src/config/env');

async function main() {
  const args = process.argv.slice(2);
  let rawKey = '';
  let resetRuns = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--license' && args[i + 1]) {
      rawKey = args[i + 1];
      i++;
    } else if (args[i] === '--reset-runs') {
      resetRuns = true;
    }
  }

  if (!rawKey) {
    console.error('Usage: node reset-license-device.js --license TAR-XXXX-XXXX-XXXX [--reset-runs]');
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

    if (license.boundDeviceIdHash === null) {
      console.log('License is already unbound. Nothing to do.');
      process.exit(0);
    }

    license.boundDeviceIdHash = null;
    license.activatedAt = null; // Clear activation date since it's unbound now

    if (resetRuns) {
      license.runCount = 0;
      console.log('Run count reset to 0.');
    }

    await license.save();

    console.log(`\nSuccessfully unbound device from license ${license.displayLabel || '(no label)'}.`);
    console.log('The license can now be activated on a new device.');

  } catch (error) {
    console.error('Error resetting device:', error);
  } finally {
    await disconnectDatabase();
    process.exit(0);
  }
}

main();
