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
    console.error('Usage: node inspect-license.js --license TAR-XXXX-XXXX-XXXX');
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

    console.log('\n--- LICENSE DETAILS ---');
    console.log(`Label:          ${license.displayLabel || 'None'}`);
    console.log(`Status:         ${license.status}`);
    console.log(`Device Bound:   ${license.boundDeviceIdHash ? 'Yes' : 'No'}`);
    console.log(`Activated At:   ${license.activatedAt ? license.activatedAt.toISOString() : 'N/A'}`);
    console.log(`Last Verified:  ${license.lastVerifiedAt ? license.lastVerifiedAt.toISOString() : 'N/A'}`);
    console.log(`Expires At:     ${license.expiresAt ? license.expiresAt.toISOString() : 'Never'}`);
    console.log(`Run Count:      ${license.runCount} / ${license.maxRuns === null ? 'Unlimited' : license.maxRuns}`);
    console.log(`Allowed Ver:    ${license.allowedVersions.length > 0 ? license.allowedVersions.join(', ') : 'All'}`);
    console.log('-----------------------\n');

  } catch (error) {
    console.error('Error inspecting license:', error);
  } finally {
    await disconnectDatabase();
    process.exit(0);
  }
}

main();
