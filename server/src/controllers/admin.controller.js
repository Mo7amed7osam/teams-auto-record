'use strict';

const License = require('../models/License');
const env = require('../config/env');
const { hmacHash, normalizeLicenseKey } = require('../utils/crypto');
const { adminLicenseKeySchema, adminResetDeviceSchema } = require('../utils/validation');

/**
 * Resolve a license by key — returns the document or sends 404.
 */
async function resolveLicense(licenseKey) {
  const normalized = normalizeLicenseKey(licenseKey);
  if (!normalized) return null;

  const hash = hmacHash(normalized, env.LICENSE_HASH_SECRET);
  return License.findOne({ licenseKeyHash: hash });
}

/**
 * POST /api/admin/licenses/reset-device
 */
async function handleResetDevice(req, res, next) {
  try {
    const parseResult = adminResetDeviceSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        code: 'INVALID_REQUEST',
        message: parseResult.error.errors[0]?.message || 'Invalid request',
      });
    }

    const { licenseKey, resetRuns } = parseResult.data;
    const license = await resolveLicense(licenseKey);

    if (!license) {
      return res.status(404).json({
        code: 'LICENSE_NOT_FOUND',
        message: 'License not found',
      });
    }

    const updateFields = {
      boundDeviceIdHash: null,
      activatedAt: null,
      lastVerifiedAt: null,
    };

    if (resetRuns) {
      updateFields.runCount = 0;
    }

    await License.updateOne({ _id: license._id }, { $set: updateFields });

    return res.status(200).json({
      success: true,
      message: `Device binding reset${resetRuns ? ' and run count cleared' : ''} for license`,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/licenses/disable
 */
async function handleDisable(req, res, next) {
  try {
    const parseResult = adminLicenseKeySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        code: 'INVALID_REQUEST',
        message: parseResult.error.errors[0]?.message || 'Invalid request',
      });
    }

    const license = await resolveLicense(parseResult.data.licenseKey);
    if (!license) {
      return res.status(404).json({
        code: 'LICENSE_NOT_FOUND',
        message: 'License not found',
      });
    }

    await License.updateOne({ _id: license._id }, { $set: { status: 'disabled' } });

    return res.status(200).json({
      success: true,
      message: 'License disabled',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/admin/licenses/enable
 */
async function handleEnable(req, res, next) {
  try {
    const parseResult = adminLicenseKeySchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        code: 'INVALID_REQUEST',
        message: parseResult.error.errors[0]?.message || 'Invalid request',
      });
    }

    const license = await resolveLicense(parseResult.data.licenseKey);
    if (!license) {
      return res.status(404).json({
        code: 'LICENSE_NOT_FOUND',
        message: 'License not found',
      });
    }

    await License.updateOne({ _id: license._id }, { $set: { status: 'active' } });

    return res.status(200).json({
      success: true,
      message: 'License enabled',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/admin/licenses/inspect?licenseKey=...
 * or POST /api/admin/licenses/inspect with body { licenseKey }
 */
async function handleInspect(req, res, next) {
  try {
    const licenseKey = req.body?.licenseKey || req.query?.licenseKey;

    if (!licenseKey) {
      return res.status(400).json({
        code: 'INVALID_REQUEST',
        message: 'licenseKey is required',
      });
    }

    const license = await resolveLicense(licenseKey);
    if (!license) {
      return res.status(404).json({
        code: 'LICENSE_NOT_FOUND',
        message: 'License not found',
      });
    }

    // Return safe representation (toJSON removes _id/__v)
    const safeDoc = license.toJSON();
    // Also add some computed fields
    safeDoc.isBound = !!license.boundDeviceIdHash;
    safeDoc.remainingRuns =
      license.maxRuns === 0
        ? null
        : Math.max(0, license.maxRuns - license.runCount);

    return res.status(200).json({
      success: true,
      license: safeDoc,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  handleResetDevice,
  handleDisable,
  handleEnable,
  handleInspect,
};
