const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const adminAuth = require('../src/middleware/admin-auth');
const env = require('../src/config/env');

describe('Admin Auth Middleware', () => {
  before(() => {
    env.ADMIN_API_KEY = 'test-admin-key-123';
  });

  it('rejects missing credentials', () => {
    const req = { headers: {} };
    let status, json;
    const res = {
      status: (s) => { status = s; return res; },
      json: (j) => { json = j; return res; }
    };

    adminAuth(req, res, () => {
      assert.fail('Should not have called next');
    });

    assert.equal(status, 401);
    assert.equal(json.code, 'ADMIN_UNAUTHORIZED');
  });

  it('rejects invalid credentials', () => {
    const req = { headers: { authorization: 'Bearer bad-key' } };
    let status, json;
    const res = {
      status: (s) => { status = s; return res; },
      json: (j) => { json = j; return res; }
    };

    adminAuth(req, res, () => {
      assert.fail('Should not have called next');
    });

    assert.equal(status, 403);
    assert.equal(json.code, 'ADMIN_UNAUTHORIZED');
  });

  it('accepts valid credentials in authorization header', () => {
    const req = { headers: { authorization: 'Bearer test-admin-key-123' } };
    const res = {};
    let called = false;

    adminAuth(req, res, () => {
      called = true;
    });

    assert.equal(called, true);
  });

  it('accepts valid credentials in x-api-key header', () => {
    const req = { headers: { 'x-api-key': 'test-admin-key-123' } };
    const res = {};
    let called = false;

    adminAuth(req, res, () => {
      called = true;
    });

    assert.equal(called, true);
  });
});
