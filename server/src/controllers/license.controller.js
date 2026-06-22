const { activationSchema, verificationSchema } = require('../utils/validation');
const licenseService = require('../services/license.service');

async function handleActivation(req, res, next) {
  try {
    const validatedData = activationSchema.parse(req.body);
    
    const result = await licenseService.activateLicense(
      validatedData.licenseKey,
      validatedData.installationId,
      validatedData.extensionVersion
    );

    if (result.allowed) {
      return res.status(200).json(result);
    } else {
      // 403 Forbidden is appropriate for business logic rejections
      // 404 Not Found for missing licenses
      const statusCode = result.code === 'LICENSE_NOT_FOUND' ? 404 : 403;
      return res.status(statusCode).json(result);
    }
  } catch (error) {
    next(error); // Pass to error handler
  }
}

async function handleVerification(req, res, next) {
  try {
    const validatedData = verificationSchema.parse(req.body);
    
    const result = await licenseService.verifyLicense(
      validatedData.licenseKey,
      validatedData.installationId,
      validatedData.extensionVersion,
      validatedData.operation,
      validatedData.operationId
    );

    if (result.allowed) {
      return res.status(200).json(result);
    } else {
      const statusCode = result.code === 'LICENSE_NOT_FOUND' ? 404 : 403;
      return res.status(statusCode).json(result);
    }
  } catch (error) {
    next(error); // Pass to error handler
  }
}

module.exports = {
  handleActivation,
  handleVerification
};
