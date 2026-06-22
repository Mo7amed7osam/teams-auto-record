const { z } = require('zod');
const { LICENSE_KEY_REGEX } = require('./crypto');

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const activationSchema = z.object({
  licenseKey: z.string()
    .trim()
    .toUpperCase()
    .regex(LICENSE_KEY_REGEX, 'Invalid license key format')
    .max(100),
  installationId: z.string()
    .trim()
    .regex(uuidRegex, 'Invalid installation ID format')
    .max(100),
  extensionVersion: z.string()
    .trim()
    .max(50)
    .default('unknown')
}).strict(); // Strip unknown properties

const verificationSchema = z.object({
  licenseKey: z.string()
    .trim()
    .toUpperCase()
    .regex(LICENSE_KEY_REGEX, 'Invalid license key format')
    .max(100),
  installationId: z.string()
    .trim()
    .regex(uuidRegex, 'Invalid installation ID format')
    .max(100),
  extensionVersion: z.string()
    .trim()
    .max(50)
    .default('unknown'),
  operation: z.enum([
    'popup_open',
    'preview_auto_record',
    'start_auto_record',
    'preview_lobby',
    'start_lobby'
  ]),
  operationId: z.string()
    .trim()
    .max(100)
    .optional()
}).strict().refine(data => {
  // If it's a start operation, operationId is required
  if (data.operation.startsWith('start_') && !data.operationId) {
    return false;
  }
  return true;
}, {
  message: "operationId is required for start operations",
  path: ["operationId"]
});

module.exports = {
  activationSchema,
  verificationSchema
};
