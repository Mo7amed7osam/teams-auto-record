const License = require('../models/License');
const Operation = require('../models/Operation');
const { hmacHash } = require('../utils/crypto');
const { signToken } = require('./token.service');
const env = require('../config/env');

function getLicenseRef(licenseHash) {
  // We use a secondary hash of the license hash as the public opaque reference
  // This avoids exposing the MongoDB _id and the primary lookup hash
  return hmacHash(licenseHash, env.JWT_SECRET).slice(0, 32);
}

function checkLicenseConstraints(license, extensionVersion) {
  if (license.status === 'disabled') {
    return { allowed: false, code: 'LICENSE_DISABLED' };
  }
  
  if (license.status === 'expired' || (license.expiresAt && license.expiresAt < new Date())) {
    return { allowed: false, code: 'LICENSE_EXPIRED' };
  }
  
  if (license.allowedVersions && license.allowedVersions.length > 0 && !license.allowedVersions.includes(extensionVersion)) {
    return { allowed: false, code: 'VERSION_NOT_ALLOWED' };
  }
  
  if (license.maxRuns !== null && license.runCount >= license.maxRuns) {
    return { allowed: false, code: 'RUN_LIMIT_REACHED' };
  }

  return { allowed: true };
}

async function activateLicense(licenseKey, installationId, extensionVersion) {
  const licenseHash = hmacHash(licenseKey, env.LICENSE_HASH_SECRET);
  const deviceHash = hmacHash(installationId, env.DEVICE_HASH_SECRET);

  // 1. Atomic activation with conditional activatedAt
  // We only match if it's unbound OR already bound to this exact device
  const activatedLicense = await License.findOneAndUpdate(
    {
      licenseKeyHash: licenseHash,
      status: 'active',
      $and: [
        {
          $or: [
            { boundDeviceIdHash: null },
            { boundDeviceIdHash: deviceHash }
          ]
        },
        {
          $or: [ // expiresAt constraint
            { expiresAt: null },
            { expiresAt: { $gt: new Date() } }
          ]
        }
      ]
    },
    [ // Aggregation pipeline for conditional update
      {
        $set: {
          boundDeviceIdHash: deviceHash,
          activatedAt: { 
            $cond: [
              { $eq: ['$boundDeviceIdHash', null] }, 
              new Date(), // Set to now if it was previously unbound
              '$activatedAt' // Keep existing if already bound
            ] 
          },
          lastVerifiedAt: new Date(),
          updatedAt: new Date()
        }
      }
    ],
    { new: true } // Return updated document
  );

  // 2. If atomic update succeeded, check remaining constraints
  if (activatedLicense) {
    const constraints = checkLicenseConstraints(activatedLicense, extensionVersion);
    if (!constraints.allowed) {
      return constraints;
    }

    const token = signToken({
      licenseRef: getLicenseRef(licenseHash),
      installationHash: deviceHash,
      extensionVersion,
      scope: 'active_session'
    });

    const isReactivation = activatedLicense.activatedAt.getTime() < (Date.now() - 5000); // Rough check if it wasn't just set

    return {
      allowed: true,
      status: isReactivation ? 'already_activated' : 'activated',
      token,
      expiresAt: activatedLicense.expiresAt,
      remainingRuns: activatedLicense.maxRuns !== null ? Math.max(0, activatedLicense.maxRuns - activatedLicense.runCount) : null
    };
  }

  // 3. If findOneAndUpdate failed, query to determine WHY it failed
  const existingLicense = await License.findOne({ licenseKeyHash: licenseHash });
  
  if (!existingLicense) {
    return { allowed: false, code: 'LICENSE_NOT_FOUND' };
  }

  if (existingLicense.status === 'disabled') {
    return { allowed: false, code: 'LICENSE_DISABLED' };
  }

  if (existingLicense.status === 'expired' || (existingLicense.expiresAt && existingLicense.expiresAt < new Date())) {
    return { allowed: false, code: 'LICENSE_EXPIRED' };
  }

  if (existingLicense.boundDeviceIdHash !== null && existingLicense.boundDeviceIdHash !== deviceHash) {
    return { allowed: false, code: 'LICENSE_ALREADY_BOUND' };
  }

  // Should rarely reach here unless a temporary DB glitch occurred
  return { allowed: false, code: 'INVALID_REQUEST' };
}

async function verifyLicense(licenseKey, installationId, extensionVersion, operation, operationId) {
  const licenseHash = hmacHash(licenseKey, env.LICENSE_HASH_SECRET);
  const deviceHash = hmacHash(installationId, env.DEVICE_HASH_SECRET);

  const license = await License.findOne({ licenseKeyHash: licenseHash });

  if (!license) {
    return { allowed: false, code: 'LICENSE_NOT_FOUND' };
  }

  if (license.boundDeviceIdHash !== deviceHash) {
    return { allowed: false, code: 'DEVICE_MISMATCH' };
  }

  const constraints = checkLicenseConstraints(license, extensionVersion);
  if (!constraints.allowed) {
    return constraints;
  }

  const isStartOp = operation.startsWith('start_');

  // Handle idempotency and run counting for start operations
  if (isStartOp && operationId) {
    try {
      // Try to insert the operation record
      await Operation.create({
        licenseId: license._id,
        operationId,
        operation
      });

      // If successful, it's a new operation, so increment run count
      license.runCount += 1;
      
      // Re-check run limit after incrementing in memory
      if (license.maxRuns !== null && license.runCount > license.maxRuns) {
        // Rollback operation (optional but cleaner)
        await Operation.deleteOne({ licenseId: license._id, operationId });
        return { allowed: false, code: 'RUN_LIMIT_REACHED' };
      }

    } catch (error) {
      // Duplicate key error (code 11000) means we already processed this operationId
      if (error.code === 11000) {
        // Idempotent success - don't increment runCount again
      } else {
        throw error; // Unexpected DB error
      }
    }
  }

  // Update last verified
  license.lastVerifiedAt = new Date();
  await license.save();

  const token = signToken({
    licenseRef: getLicenseRef(licenseHash),
    installationHash: deviceHash,
    extensionVersion,
    scope: 'active_session'
  });

  return {
    allowed: true,
    token,
    expiresAt: license.expiresAt,
    remainingRuns: license.maxRuns !== null ? Math.max(0, license.maxRuns - license.runCount) : null
  };
}

module.exports = {
  activateLicense,
  verifyLicense
};
