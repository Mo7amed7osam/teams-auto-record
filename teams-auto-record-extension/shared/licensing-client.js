(function attachLicensingClient(root) {
  /**
   * Extension-side licensing client.
   *
   * Handles installation ID generation, license key normalization,
   * activation, verification, and cached status management.
   *
   * SECURITY NOTES:
   * - This code runs on the user's machine and can be inspected.
   * - Obfuscation makes reverse engineering harder, not impossible.
   * - All real licensing decisions happen server-side.
   * - No database credentials or backend secrets exist in this file.
   * - chrome.storage.local is not secret storage.
   * - Server verification is required before every Start operation.
   */

  const config = root.TeamsAutoRecordLicensingConfig;
  const {
    LICENSING_API_BASE_URL,
    LICENSING_STORAGE_KEYS,
    LICENSING_OPERATIONS,
    LICENSE_ERROR_CODES,
    LICENSE_KEY_REGEX,
    OFFLINE_GRACE_HOURS,
    TOKEN_REFRESH_MINUTES
  } = config;

  function normalizeLicenseKey(raw) {
    if (!raw || typeof raw !== "string") {
      return { valid: false, normalized: "", error: "Enter an activation code." };
    }

    const normalized = raw.trim().toUpperCase().replace(/\s+/g, "");

    if (!LICENSE_KEY_REGEX.test(normalized)) {
      return {
        valid: false,
        normalized,
        error: "Invalid format. Expected TAR-XXXX-XXXX-XXXX."
      };
    }

    return { valid: true, normalized, error: "" };
  }

  function maskInstallationId(id) {
    if (!id || typeof id !== "string" || id.length < 4) {
      return "****";
    }

    return "****-" + id.slice(-4).toUpperCase();
  }

  function getExtensionVersion() {
    try {
      return chrome.runtime.getManifest().version;
    } catch (error) {
      void error;
      return "0.0.0";
    }
  }

  async function getOrCreateInstallationId() {
    const stored = await chrome.storage.local.get(
      LICENSING_STORAGE_KEYS.INSTALLATION_ID
    );
    const existing = stored[LICENSING_STORAGE_KEYS.INSTALLATION_ID];

    if (existing && typeof existing === "string" && existing.length > 0) {
      return existing;
    }

    const id = crypto.randomUUID();
    await chrome.storage.local.set({
      [LICENSING_STORAGE_KEYS.INSTALLATION_ID]: id
    });

    return id;
  }

  async function getSavedLicenseKey() {
    const stored = await chrome.storage.local.get(
      LICENSING_STORAGE_KEYS.LICENSE_KEY
    );

    return stored[LICENSING_STORAGE_KEYS.LICENSE_KEY] || "";
  }

  async function saveLicenseKey(normalizedKey) {
    await chrome.storage.local.set({
      [LICENSING_STORAGE_KEYS.LICENSE_KEY]: normalizedKey
    });
  }

  async function saveLicenseStatus(status) {
    const data = {
      [LICENSING_STORAGE_KEYS.LICENSE_STATUS]: status.status || "",
      [LICENSING_STORAGE_KEYS.LAST_VERIFIED_AT]:
        new Date().toISOString()
    };

    if (status.token) {
      data[LICENSING_STORAGE_KEYS.LICENSE_TOKEN] = status.token;
    }
    if (status.tokenExpiresAt) {
      data[LICENSING_STORAGE_KEYS.LICENSE_TOKEN_EXPIRES_AT] =
        status.tokenExpiresAt;
    }
    if (status.expiresAt !== undefined) {
      data[LICENSING_STORAGE_KEYS.LICENSE_EXPIRES_AT] =
        status.expiresAt;
    }
    if (status.remainingRuns !== undefined) {
      data[LICENSING_STORAGE_KEYS.REMAINING_RUNS] =
        status.remainingRuns;
    }

    await chrome.storage.local.set(data);
  }

  async function getCachedLicenseStatus() {
    const keys = Object.values(LICENSING_STORAGE_KEYS);
    const stored = await chrome.storage.local.get(keys);

    return {
      installationId:
        stored[LICENSING_STORAGE_KEYS.INSTALLATION_ID] || "",
      licenseKey:
        stored[LICENSING_STORAGE_KEYS.LICENSE_KEY] || "",
      status:
        stored[LICENSING_STORAGE_KEYS.LICENSE_STATUS] || "",
      token:
        stored[LICENSING_STORAGE_KEYS.LICENSE_TOKEN] || "",
      tokenExpiresAt:
        stored[LICENSING_STORAGE_KEYS.LICENSE_TOKEN_EXPIRES_AT] || "",
      lastVerifiedAt:
        stored[LICENSING_STORAGE_KEYS.LAST_VERIFIED_AT] || "",
      expiresAt:
        stored[LICENSING_STORAGE_KEYS.LICENSE_EXPIRES_AT] || null,
      remainingRuns:
        stored[LICENSING_STORAGE_KEYS.REMAINING_RUNS] ?? null
    };
  }

  function isTokenFresh(tokenExpiresAt) {
    if (!tokenExpiresAt) {
      return false;
    }

    const expiryTime = new Date(tokenExpiresAt).getTime();
    return Date.now() < expiryTime;
  }

  function isWithinGracePeriod(lastVerifiedAt) {
    if (!lastVerifiedAt) {
      return false;
    }

    const verifiedTime = new Date(lastVerifiedAt).getTime();
    const graceMs = OFFLINE_GRACE_HOURS * 60 * 60 * 1000;

    return Date.now() - verifiedTime < graceMs;
  }

  async function isLicenseActive() {
    const cached = await getCachedLicenseStatus();

    if (!cached.licenseKey || !cached.status) {
      return false;
    }

    if (
      cached.status === "activated" ||
      cached.status === "already_activated"
    ) {
      return true;
    }

    return false;
  }

  function mapErrorCodeToMessage(code) {
    const entry = LICENSE_ERROR_CODES[code];
    if (entry) {
      return entry.message;
    }

    return "An unexpected error occurred. Please try again.";
  }

  async function apiRequest(endpoint, body) {
    const url = `${LICENSING_API_BASE_URL}${endpoint}`;

    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
    } catch (error) {
      void error;
      return {
        ok: false,
        allowed: false,
        code: "SERVER_UNAVAILABLE",
        message: mapErrorCodeToMessage("SERVER_UNAVAILABLE")
      };
    }

    let data;
    try {
      data = await response.json();
    } catch (error) {
      void error;
      return {
        ok: false,
        allowed: false,
        code: "SERVER_UNAVAILABLE",
        message: "Invalid response from licensing server."
      };
    }

    if (response.status === 429) {
      return {
        ok: false,
        allowed: false,
        code: "RATE_LIMITED",
        message: mapErrorCodeToMessage("RATE_LIMITED")
      };
    }

    data.ok = response.ok;
    return data;
  }

  async function activateLicense(rawLicenseKey) {
    const keyResult = normalizeLicenseKey(rawLicenseKey);
    if (!keyResult.valid) {
      return {
        ok: false,
        allowed: false,
        code: "INVALID_REQUEST",
        message: keyResult.error
      };
    }

    const installationId = await getOrCreateInstallationId();
    const extensionVersion = getExtensionVersion();

    const result = await apiRequest("/licenses/activate", {
      licenseKey: keyResult.normalized,
      installationId,
      extensionVersion
    });

    if (result.allowed) {
      await saveLicenseKey(keyResult.normalized);
      await saveLicenseStatus({
        status: result.status || "activated",
        token: result.token || "",
        tokenExpiresAt: result.tokenExpiresAt || "",
        expiresAt: result.expiresAt,
        remainingRuns: result.remainingRuns
      });
    }

    return result;
  }

  async function verifyLicense(operation, operationId) {
    const licenseKey = await getSavedLicenseKey();
    if (!licenseKey) {
      return {
        ok: false,
        allowed: false,
        code: "INVALID_REQUEST",
        message: "No activation code found. Please activate first."
      };
    }

    const isStartOp =
      operation === LICENSING_OPERATIONS.START_AUTO_RECORD ||
      operation === LICENSING_OPERATIONS.START_LOBBY;

    if (!isStartOp) {
      const cached = await getCachedLicenseStatus();
      if (isTokenFresh(cached.tokenExpiresAt)) {
        return {
          ok: true,
          allowed: true,
          status: cached.status,
          cached: true
        };
      }

      if (isWithinGracePeriod(cached.lastVerifiedAt)) {
        return {
          ok: true,
          allowed: true,
          status: cached.status,
          cached: true,
          grace: true
        };
      }
    }

    const installationId = await getOrCreateInstallationId();
    const extensionVersion = getExtensionVersion();

    const body = {
      licenseKey,
      installationId,
      extensionVersion,
      operation
    };

    if (operationId) {
      body.operationId = operationId;
    }

    const result = await apiRequest("/licenses/verify", body);

    if (result.allowed) {
      await saveLicenseStatus({
        status: "activated",
        token: result.token || "",
        tokenExpiresAt: result.tokenExpiresAt || "",
        expiresAt: result.expiresAt,
        remainingRuns: result.remainingRuns
      });
    }

    return result;
  }

  async function clearLicenseData() {
    const keysToRemove = [
      LICENSING_STORAGE_KEYS.LICENSE_KEY,
      LICENSING_STORAGE_KEYS.LICENSE_STATUS,
      LICENSING_STORAGE_KEYS.LICENSE_TOKEN,
      LICENSING_STORAGE_KEYS.LICENSE_TOKEN_EXPIRES_AT,
      LICENSING_STORAGE_KEYS.LAST_VERIFIED_AT,
      LICENSING_STORAGE_KEYS.LICENSE_EXPIRES_AT,
      LICENSING_STORAGE_KEYS.REMAINING_RUNS
    ];

    await chrome.storage.local.remove(keysToRemove);
  }

  const api = {
    normalizeLicenseKey,
    maskInstallationId,
    getExtensionVersion,
    getOrCreateInstallationId,
    getSavedLicenseKey,
    saveLicenseKey,
    saveLicenseStatus,
    getCachedLicenseStatus,
    isTokenFresh,
    isWithinGracePeriod,
    isLicenseActive,
    mapErrorCodeToMessage,
    activateLicense,
    verifyLicense,
    clearLicenseData,
    LICENSING_OPERATIONS
  };

  root.TeamsAutoRecordLicensing = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
