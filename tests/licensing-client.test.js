const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { readFileSync } = require("node:fs");

const extensionRoot = path.resolve(
  __dirname,
  "../teams-auto-record-extension"
);

// Load licensing modules
require(path.join(extensionRoot, "shared/constants.js"));
require(path.join(extensionRoot, "shared/utils.js"));
require(path.join(extensionRoot, "shared/lobby-utils.js"));
require(path.join(extensionRoot, "shared/licensing-config.js"));

const licensingConfig = globalThis.TeamsAutoRecordLicensingConfig;

// Mock chrome APIs before loading the client
const mockStorage = {};
globalThis.chrome = {
  storage: {
    local: {
      get: async keys => {
        const result = {};
        const keyList = Array.isArray(keys) ? keys : [keys];
        keyList.forEach(key => {
          if (mockStorage[key] !== undefined) {
            result[key] = mockStorage[key];
          }
        });
        return result;
      },
      set: async data => {
        Object.assign(mockStorage, data);
      },
      remove: async keys => {
        const keyList = Array.isArray(keys) ? keys : [keys];
        keyList.forEach(key => {
          delete mockStorage[key];
        });
      }
    }
  },
  runtime: {
    getManifest: () => ({ version: "0.1.3" }),
    sendMessage: async () => ({ ok: true }),
    onMessage: { addListener: () => {} }
  }
};

// Provide crypto.randomUUID in Node
if (!globalThis.crypto?.randomUUID) {
  const nodeCrypto = require("node:crypto");
  globalThis.crypto = Object.assign({}, globalThis.crypto || {}, {
    randomUUID: () => nodeCrypto.randomUUID()
  });
}

require(path.join(extensionRoot, "shared/licensing-client.js"));
const licensing = globalThis.TeamsAutoRecordLicensing;

function clearMockStorage() {
  Object.keys(mockStorage).forEach(key => {
    delete mockStorage[key];
  });
}

test("normalizeLicenseKey accepts valid key format", () => {
  const result = licensing.normalizeLicenseKey("TAR-8F4K-29QD-X7PM");
  assert.equal(result.valid, true);
  assert.equal(result.normalized, "TAR-8F4K-29QD-X7PM");
  assert.equal(result.error, "");
});

test("normalizeLicenseKey trims and uppercases", () => {
  const result = licensing.normalizeLicenseKey("  tar-8f4k-29qd-x7pm  ");
  assert.equal(result.valid, true);
  assert.equal(result.normalized, "TAR-8F4K-29QD-X7PM");
});

test("normalizeLicenseKey rejects empty input", () => {
  const result = licensing.normalizeLicenseKey("");
  assert.equal(result.valid, false);
  assert.ok(result.error);
});

test("normalizeLicenseKey rejects null input", () => {
  const result = licensing.normalizeLicenseKey(null);
  assert.equal(result.valid, false);
});

test("normalizeLicenseKey rejects wrong format", () => {
  const result = licensing.normalizeLicenseKey("INVALID-KEY");
  assert.equal(result.valid, false);
  assert.match(result.error, /format/i);
});

test("normalizeLicenseKey rejects too short segments", () => {
  const result = licensing.normalizeLicenseKey("TAR-8F4-29Q-X7P");
  assert.equal(result.valid, false);
});

test("normalizeLicenseKey rejects too many segments", () => {
  const result = licensing.normalizeLicenseKey(
    "TAR-8F4K-29QD-X7PM-EXTRA"
  );
  assert.equal(result.valid, false);
});

test("maskInstallationId returns masked format", () => {
  const masked = licensing.maskInstallationId(
    "12345678-1234-1234-1234-123456789abc"
  );
  assert.match(masked, /^\*{4}-[A-Z0-9]{4}$/);
});

test("maskInstallationId handles short input", () => {
  const masked = licensing.maskInstallationId("ab");
  assert.equal(masked, "****");
});

test("maskInstallationId handles null", () => {
  const masked = licensing.maskInstallationId(null);
  assert.equal(masked, "****");
});

test("getOrCreateInstallationId generates UUID on first call", async () => {
  clearMockStorage();

  const id = await licensing.getOrCreateInstallationId();
  assert.match(
    id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
  );
});

test("getOrCreateInstallationId returns same ID on second call", async () => {
  clearMockStorage();

  const first = await licensing.getOrCreateInstallationId();
  const second = await licensing.getOrCreateInstallationId();
  assert.equal(first, second);
});

test("isLicenseActive returns false when no status saved", async () => {
  clearMockStorage();

  const active = await licensing.isLicenseActive();
  assert.equal(active, false);
});

test("isLicenseActive returns true after activation", async () => {
  clearMockStorage();
  mockStorage[licensingConfig.LICENSING_STORAGE_KEYS.LICENSE_KEY] =
    "TAR-1234-5678-ABCD";
  mockStorage[licensingConfig.LICENSING_STORAGE_KEYS.LICENSE_STATUS] =
    "activated";

  const active = await licensing.isLicenseActive();
  assert.equal(active, true);
});

test("isLicenseActive returns true for already_activated", async () => {
  clearMockStorage();
  mockStorage[licensingConfig.LICENSING_STORAGE_KEYS.LICENSE_KEY] =
    "TAR-1234-5678-ABCD";
  mockStorage[licensingConfig.LICENSING_STORAGE_KEYS.LICENSE_STATUS] =
    "already_activated";

  const active = await licensing.isLicenseActive();
  assert.equal(active, true);
});

test("isTokenFresh returns false for expired token", () => {
  const past = new Date(Date.now() - 60000).toISOString();
  assert.equal(licensing.isTokenFresh(past), false);
});

test("isTokenFresh returns true for future token", () => {
  const future = new Date(Date.now() + 60000).toISOString();
  assert.equal(licensing.isTokenFresh(future), true);
});

test("isTokenFresh returns false for null", () => {
  assert.equal(licensing.isTokenFresh(null), false);
});

test("isWithinGracePeriod returns true for recent verification", () => {
  const recent = new Date(Date.now() - 60000).toISOString();
  assert.equal(licensing.isWithinGracePeriod(recent), true);
});

test("isWithinGracePeriod returns false for old verification", () => {
  const old = new Date(
    Date.now() - 13 * 60 * 60 * 1000
  ).toISOString();
  assert.equal(licensing.isWithinGracePeriod(old), false);
});

test("isWithinGracePeriod returns false for null", () => {
  assert.equal(licensing.isWithinGracePeriod(null), false);
});

test("mapErrorCodeToMessage maps known codes", () => {
  const message = licensing.mapErrorCodeToMessage("LICENSE_ALREADY_BOUND");
  assert.match(message, /already linked/i);
});

test("mapErrorCodeToMessage returns fallback for unknown codes", () => {
  const message = licensing.mapErrorCodeToMessage("UNKNOWN_CODE");
  assert.match(message, /unexpected/i);
});

test("clearLicenseData removes license keys but keeps installation ID", async () => {
  clearMockStorage();
  mockStorage[licensingConfig.LICENSING_STORAGE_KEYS.INSTALLATION_ID] =
    "test-id";
  mockStorage[licensingConfig.LICENSING_STORAGE_KEYS.LICENSE_KEY] =
    "TAR-1234-5678-ABCD";
  mockStorage[licensingConfig.LICENSING_STORAGE_KEYS.LICENSE_STATUS] =
    "activated";

  await licensing.clearLicenseData();

  assert.equal(
    mockStorage[licensingConfig.LICENSING_STORAGE_KEYS.INSTALLATION_ID],
    "test-id"
  );
  assert.equal(
    mockStorage[licensingConfig.LICENSING_STORAGE_KEYS.LICENSE_KEY],
    undefined
  );
  assert.equal(
    mockStorage[licensingConfig.LICENSING_STORAGE_KEYS.LICENSE_STATUS],
    undefined
  );
});

test("all storage keys are namespaced with teamsAutoRecord", () => {
  const keys = Object.values(
    licensingConfig.LICENSING_STORAGE_KEYS
  );
  keys.forEach(key => {
    assert.match(key, /^teamsAutoRecord/, `Key ${key} is not namespaced`);
  });
});

test("licensing config exposes required constants", () => {
  assert.ok(licensingConfig.LICENSING_API_BASE_URL);
  assert.ok(licensingConfig.LICENSE_KEY_REGEX);
  assert.ok(licensingConfig.LICENSING_OPERATIONS);
  assert.ok(licensingConfig.LICENSE_ERROR_CODES);
  assert.equal(typeof licensingConfig.OFFLINE_GRACE_HOURS, "number");
  assert.equal(typeof licensingConfig.TOKEN_REFRESH_MINUTES, "number");
});

test("licensing operations include all required types", () => {
  const ops = licensingConfig.LICENSING_OPERATIONS;
  assert.ok(ops.POPUP_OPEN);
  assert.ok(ops.PREVIEW_AUTO_RECORD);
  assert.ok(ops.START_AUTO_RECORD);
  assert.ok(ops.PREVIEW_LOBBY);
  assert.ok(ops.START_LOBBY);
});

test("no backend secrets in extension source files", () => {
  const files = [
    "shared/licensing-config.js",
    "shared/licensing-client.js",
    "popup/popup.js",
    "background/service-worker.js",
    "shared/constants.js"
  ];

  const secretPatterns = [
    /MONGODB_URI/i,
    /mongodb\+srv:\/\//i,
    /JWT_SECRET/i,
    /ADMIN_API_KEY/i,
    /LICENSE_HASH_SECRET/i,
    /DEVICE_HASH_SECRET/i
  ];

  files.forEach(filePath => {
    const fullPath = path.join(extensionRoot, filePath);
    const content = readFileSync(fullPath, "utf8");
    secretPatterns.forEach(pattern => {
      assert.doesNotMatch(
        content,
        pattern,
        `${filePath} contains a backend secret pattern`
      );
    });
  });
});

test("getExtensionVersion returns manifest version", () => {
  const version = licensing.getExtensionVersion();
  assert.equal(version, "0.1.3");
});

test("getCachedLicenseStatus returns all fields", async () => {
  clearMockStorage();
  mockStorage[licensingConfig.LICENSING_STORAGE_KEYS.INSTALLATION_ID] =
    "test-id";
  mockStorage[licensingConfig.LICENSING_STORAGE_KEYS.LICENSE_KEY] =
    "TAR-1234-5678-ABCD";
  mockStorage[licensingConfig.LICENSING_STORAGE_KEYS.LICENSE_STATUS] =
    "activated";

  const status = await licensing.getCachedLicenseStatus();
  assert.equal(status.installationId, "test-id");
  assert.equal(status.licenseKey, "TAR-1234-5678-ABCD");
  assert.equal(status.status, "activated");
});
