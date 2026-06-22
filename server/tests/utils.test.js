const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { hmacHash, generateLicenseKey, normalizeLicenseKey, constantTimeEqual } = require('../src/utils/crypto');
const { activationSchema, verificationSchema } = require('../src/utils/validation');

test('Crypto: normalizeLicenseKey', () => {
  const valid = normalizeLicenseKey('tar-1234-abcd-5678');
  assert.equal(valid.valid, true);
  assert.equal(valid.normalized, 'TAR-1234-ABCD-5678');

  const invalid = normalizeLicenseKey('invalid-key');
  assert.equal(invalid.valid, false);
});

test('Crypto: generateLicenseKey format', () => {
  const key = generateLicenseKey();
  assert.match(key, /^TAR-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
});

test('Crypto: hmacHash consistency', () => {
  const hash1 = hmacHash('test-value', 'secret');
  const hash2 = hmacHash('test-value', 'secret');
  const hash3 = hmacHash('test-value', 'different-secret');
  
  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hash3);
});

test('Crypto: constantTimeEqual', () => {
  assert.equal(constantTimeEqual('same', 'same'), true);
  assert.equal(constantTimeEqual('same', 'diff'), false);
  assert.equal(constantTimeEqual('long', 'short'), false);
});

test('Validation: activationSchema', () => {
  const validData = {
    licenseKey: 'TAR-1234-5678-ABCD',
    installationId: crypto.randomUUID(),
    extensionVersion: '1.0.0'
  };
  
  const parsed = activationSchema.parse(validData);
  assert.equal(parsed.licenseKey, validData.licenseKey);
  
  assert.throws(() => {
    activationSchema.parse({ ...validData, licenseKey: 'invalid' });
  });
});

test('Validation: verificationSchema', () => {
  const validData = {
    licenseKey: 'TAR-1234-5678-ABCD',
    installationId: crypto.randomUUID(),
    extensionVersion: '1.0.0',
    operation: 'start_auto_record',
    operationId: crypto.randomUUID()
  };
  
  const parsed = verificationSchema.parse(validData);
  assert.equal(parsed.operation, 'start_auto_record');
  
  // start operation requires operationId
  assert.throws(() => {
    verificationSchema.parse({ ...validData, operationId: undefined });
  });

  // preview operation does not require operationId
  const previewData = { ...validData, operation: 'preview_auto_record', operationId: undefined };
  assert.doesNotThrow(() => {
    verificationSchema.parse(previewData);
  });
});
