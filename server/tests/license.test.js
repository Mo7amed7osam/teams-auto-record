const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');
const app = require('../src/app');
const License = require('../src/models/License');
const Operation = require('../src/models/Operation');
const { hmacHash, generateLicenseKey } = require('../src/utils/crypto');
const env = require('../src/config/env');

let mongoServer;

describe('Licensing Service API (Integration)', () => {
  let validLicenseKey;
  let validLicenseHash;

  before(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    
    // Override MONGODB_URI for testing
    env.MONGODB_URI = uri;
    env.MONGODB_DB_NAME = 'test';
    
    // Disable logging in tests for cleaner output
    console.error = () => {};

    await mongoose.connect(uri, { dbName: 'test' });
  });

  after(async () => {
    await mongoose.disconnect();
    if (mongoServer) {
      await mongoServer.stop();
    }
  });

  beforeEach(async () => {
    await License.deleteMany({});
    await Operation.deleteMany({});

    validLicenseKey = generateLicenseKey();
    validLicenseHash = hmacHash(validLicenseKey, env.LICENSE_HASH_SECRET);

    await License.create({
      licenseKeyHash: validLicenseHash,
      status: 'active',
      maxRuns: 5
    });
  });

  it('1. First activation succeeds', async () => {
    const installationId = crypto.randomUUID();
    const res = await request(app)
      .post('/api/licenses/activate')
      .send({
        licenseKey: validLicenseKey,
        installationId,
        extensionVersion: '0.1.3'
      });

    assert.equal(res.status, 200);
    assert.equal(res.body.allowed, true);
    assert.equal(res.body.status, 'activated');
    assert.ok(res.body.token);

    // Verify stored data
    const license = await License.findOne({ licenseKeyHash: validLicenseHash });
    assert.ok(license.boundDeviceIdHash);
    assert.ok(license.activatedAt);
  });

  it('2. Same installation can activate or verify again', async () => {
    const installationId = crypto.randomUUID();
    
    // First activation
    await request(app).post('/api/licenses/activate').send({
      licenseKey: validLicenseKey,
      installationId,
      extensionVersion: '0.1.3'
    });

    // Artificially age the activation so the 5000ms heuristic detects it as a reactivation
    await License.updateOne({ licenseKeyHash: validLicenseHash }, { activatedAt: new Date(Date.now() - 6000) });

    // Second activation (re-activation)
    const actRes = await request(app).post('/api/licenses/activate').send({
      licenseKey: validLicenseKey,
      installationId,
      extensionVersion: '0.1.3'
    });
    assert.equal(actRes.status, 200);
    assert.equal(actRes.body.allowed, true);
    assert.equal(actRes.body.status, 'already_activated'); // Should recognize as already activated

    // Verification
    const verRes = await request(app).post('/api/licenses/verify').send({
      licenseKey: validLicenseKey,
      installationId,
      extensionVersion: '0.1.3',
      operation: 'popup_open'
    });
    assert.equal(verRes.status, 200);
    assert.equal(verRes.body.allowed, true);
  });

  it('3. Second installation using the same license is rejected', async () => {
    const install1 = crypto.randomUUID();
    const install2 = crypto.randomUUID();

    await request(app).post('/api/licenses/activate').send({
      licenseKey: validLicenseKey,
      installationId: install1
    });

    const res = await request(app).post('/api/licenses/activate').send({
      licenseKey: validLicenseKey,
      installationId: install2
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.allowed, false);
    assert.equal(res.body.code, 'LICENSE_ALREADY_BOUND');
  });

  it('4. Two installations racing to activate the same unbound license cannot both succeed', async () => {
    // We send two requests concurrently
    const install1 = crypto.randomUUID();
    const install2 = crypto.randomUUID();

    const [res1, res2] = await Promise.all([
      request(app).post('/api/licenses/activate').send({
        licenseKey: validLicenseKey,
        installationId: install1
      }),
      request(app).post('/api/licenses/activate').send({
        licenseKey: validLicenseKey,
        installationId: install2
      })
    ]);

    // One must succeed, one must fail
    const successes = [res1, res2].filter(r => r.status === 200 && r.body.status === 'activated');
    const failures = [res1, res2].filter(r => r.status === 403 && r.body.code === 'LICENSE_ALREADY_BOUND');

    assert.equal(successes.length, 1, 'Exactly one activation should succeed');
    assert.equal(failures.length, 1, 'Exactly one activation should fail');
  });

  it('5. Disabled licenses are rejected', async () => {
    await License.updateOne({ licenseKeyHash: validLicenseHash }, { status: 'disabled' });

    const res = await request(app).post('/api/licenses/activate').send({
      licenseKey: validLicenseKey,
      installationId: crypto.randomUUID()
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'LICENSE_DISABLED');
  });

  it('6. Expired licenses are rejected', async () => {
    await License.updateOne({ licenseKeyHash: validLicenseHash }, { expiresAt: new Date(Date.now() - 10000) });

    const res = await request(app).post('/api/licenses/activate').send({
      licenseKey: validLicenseKey,
      installationId: crypto.randomUUID()
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'LICENSE_EXPIRED');
  });

  it('7. Disallowed extension versions are rejected', async () => {
    await License.updateOne({ licenseKeyHash: validLicenseHash }, { allowedVersions: ['1.0.0', '1.0.1'] });

    const installationId = crypto.randomUUID();
    // First bind it with a valid version (to test verification) or test activation directly
    const res = await request(app).post('/api/licenses/activate').send({
      licenseKey: validLicenseKey,
      installationId,
      extensionVersion: '0.1.3' // Not in allowedVersions
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'VERSION_NOT_ALLOWED');
  });

  it('8. Preview does not increment run count', async () => {
    const installationId = crypto.randomUUID();
    await request(app).post('/api/licenses/activate').send({
      licenseKey: validLicenseKey,
      installationId
    });

    await request(app).post('/api/licenses/verify').send({
      licenseKey: validLicenseKey,
      installationId,
      operation: 'preview_auto_record'
    });

    const license = await License.findOne({ licenseKeyHash: validLicenseHash });
    assert.equal(license.runCount, 0);
  });

  it('9. Start increments run count', async () => {
    const installationId = crypto.randomUUID();
    await request(app).post('/api/licenses/activate').send({
      licenseKey: validLicenseKey,
      installationId
    });

    await request(app).post('/api/licenses/verify').send({
      licenseKey: validLicenseKey,
      installationId,
      operation: 'start_auto_record',
      operationId: crypto.randomUUID()
    });

    const license = await License.findOne({ licenseKeyHash: validLicenseHash });
    assert.equal(license.runCount, 1);
  });

  it('10. Repeated Start with the same operationId does not increment twice', async () => {
    const installationId = crypto.randomUUID();
    const operationId = crypto.randomUUID();
    
    await request(app).post('/api/licenses/activate').send({
      licenseKey: validLicenseKey,
      installationId
    });

    // Send two concurrent start operations with same operationId
    await Promise.all([
      request(app).post('/api/licenses/verify').send({
        licenseKey: validLicenseKey,
        installationId,
        operation: 'start_auto_record',
        operationId
      }),
      request(app).post('/api/licenses/verify').send({
        licenseKey: validLicenseKey,
        installationId,
        operation: 'start_auto_record',
        operationId
      })
    ]);

    const license = await License.findOne({ licenseKeyHash: validLicenseHash });
    // Due to compound unique index on Operation collection, only 1 should succeed
    assert.equal(license.runCount, 1);
  });

  it('11. Run limits are enforced', async () => {
    const installationId = crypto.randomUUID();
    
    // License has maxRuns: 5
    await License.updateOne({ licenseKeyHash: validLicenseHash }, { runCount: 5 });

    await request(app).post('/api/licenses/activate').send({
      licenseKey: validLicenseKey,
      installationId
    });

    const res = await request(app).post('/api/licenses/verify').send({
      licenseKey: validLicenseKey,
      installationId,
      operation: 'start_auto_record',
      operationId: crypto.randomUUID()
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'RUN_LIMIT_REACHED');
  });

  it('12. Device reset permits a new installation', async () => {
    const install1 = crypto.randomUUID();
    const install2 = crypto.randomUUID();

    await request(app).post('/api/licenses/activate').send({
      licenseKey: validLicenseKey,
      installationId: install1
    });

    // Reset device binding directly in DB (simulating the admin script)
    await License.updateOne({ licenseKeyHash: validLicenseHash }, { boundDeviceIdHash: null, activatedAt: null });

    const res = await request(app).post('/api/licenses/activate').send({
      licenseKey: validLicenseKey,
      installationId: install2
    });

    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'activated');
  });

  it('13. Old installation is rejected after reset and activation on another installation', async () => {
    const install1 = crypto.randomUUID();
    const install2 = crypto.randomUUID();

    await request(app).post('/api/licenses/activate').send({
      licenseKey: validLicenseKey,
      installationId: install1
    });

    await License.updateOne({ licenseKeyHash: validLicenseHash }, { boundDeviceIdHash: null, activatedAt: null });

    await request(app).post('/api/licenses/activate').send({
      licenseKey: validLicenseKey,
      installationId: install2
    });

    const res = await request(app).post('/api/licenses/verify').send({
      licenseKey: validLicenseKey,
      installationId: install1,
      operation: 'popup_open'
    });

    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'DEVICE_MISMATCH');
  });

  it('14. Invalid request bodies are rejected', async () => {
    const res = await request(app).post('/api/licenses/activate').send({
      licenseKey: 'INVALID',
      installationId: 'not-a-uuid'
    });

    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'INVALID_REQUEST');
  });

  it('15. Rate limiting is enforced', async () => {
    // Assuming limit is 5 per 15 minutes for activation
    const install = crypto.randomUUID();
    
    // Make 5 requests
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/licenses/activate').send({
        licenseKey: validLicenseKey,
        installationId: install
      });
    }

    // 6th should fail
    const res = await request(app).post('/api/licenses/activate').send({
      licenseKey: validLicenseKey,
      installationId: install
    });

    assert.equal(res.status, 429);
    assert.equal(res.body.code, 'RATE_LIMITED');
  });

  it('17. Plain license keys and raw installation IDs are not stored', async () => {
    const installationId = crypto.randomUUID();
    await request(app).post('/api/licenses/activate').send({
      licenseKey: validLicenseKey,
      installationId
    });

    const license = await License.findOne({ licenseKeyHash: validLicenseHash });
    
    // The keys are not in the DB
    assert.equal(license.licenseKey, undefined);
    assert.equal(license.installationId, undefined);

    // Only hashes exist
    assert.ok(license.licenseKeyHash);
    assert.ok(license.boundDeviceIdHash);
  });

  it('18. Production error responses do not expose stack traces or DB internals', async () => {
    // Cause a DB error by sending bad data directly to mongoose model (bypassing validation via a stub)
    // To simulate a MongoServerError, we can temporarily rename the collection to something invalid, or throw directly
    
    const originalFind = License.findOne;
    License.findOne = () => { throw new mongoose.Error('Internal DB failure'); };

    const res = await request(app).post('/api/licenses/verify').send({
      licenseKey: validLicenseKey,
      installationId: crypto.randomUUID(),
      operation: 'popup_open'
    });

    // Restore
    License.findOne = originalFind;

    assert.equal(res.status, 503);
    assert.equal(res.body.code, 'SERVER_UNAVAILABLE');
    assert.equal(res.body.message, 'Service is temporarily unavailable.');
    assert.equal(res.body.stack, undefined);
  });
});
