require('dotenv').config();
const { connectDatabase, disconnectDatabase } = require('../src/config/database');
const License = require('../src/models/License');
const { generateLicenseKey, hmacHash } = require('../src/utils/crypto');
const env = require('../src/config/env');

async function main() {
  const args = process.argv.slice(2);
  let label = '';
  let maxRuns = null;
  let expiresAt = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--label' && args[i + 1]) {
      label = args[i + 1];
      i++;
    } else if (args[i] === '--max-runs' && args[i + 1]) {
      maxRuns = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--expires' && args[i + 1]) {
      expiresAt = new Date(args[i + 1]);
      i++;
    }
  }

  try {
    await connectDatabase();

    const plainKey = generateLicenseKey();
    const hash = hmacHash(plainKey, env.LICENSE_HASH_SECRET);

    const license = await License.create({
      licenseKeyHash: hash,
      displayLabel: label,
      maxRuns,
      expiresAt
    });

    console.log('\n--- LICENSE GENERATED SUCCESSFULLY ---');
    console.log(`Key (give this to the user):  ${plainKey}`);
    console.log(`Label:                        ${license.displayLabel || 'None'}`);
    console.log(`Max Runs:                     ${license.maxRuns === null ? 'Unlimited' : license.maxRuns}`);
    console.log(`Expires At:                   ${license.expiresAt ? license.expiresAt.toISOString() : 'Never'}`);
    console.log('\nSAVE THIS KEY NOW. IT CANNOT BE RECOVERED FROM THE DATABASE.');
    
  } catch (error) {
    console.error('Error generating license:', error);
  } finally {
    await disconnectDatabase();
    process.exit(0);
  }
}

main();
