(function attachLicensingConfig(root) {
  /**
   * Centralized licensing configuration.
   *
   * SECURITY NOTE:
   * This file contains only the backend URL and client-side constants.
   * No database credentials, HMAC secrets, JWT secrets, or admin keys
   * may ever be placed in this file or any other extension file.
   *
   * chrome.storage.local is not secret storage. Cached license status
   * is a UX convenience, not a security boundary. All real licensing
   * decisions happen server-side.
   */

  // Development URL (Local Backend)
  // const LICENSING_API_BASE_URL = "http://localhost:10000/api";
  
  // Production URL (Deployed on Vercel)
  const LICENSING_API_BASE_URL = "https://server-one-flax-95.vercel.app/api";

  const LICENSING_STORAGE_KEYS = {
    INSTALLATION_ID: "teamsAutoRecordInstallationId",
    LICENSE_KEY: "teamsAutoRecordLicenseKey",
    LICENSE_STATUS: "teamsAutoRecordLicenseStatus",
    LICENSE_TOKEN: "teamsAutoRecordLicenseToken",
    LICENSE_TOKEN_EXPIRES_AT: "teamsAutoRecordLicenseTokenExpiresAt",
    LAST_VERIFIED_AT: "teamsAutoRecordLastVerifiedAt",
    LICENSE_EXPIRES_AT: "teamsAutoRecordLicenseExpiresAt",
    REMAINING_RUNS: "teamsAutoRecordRemainingRuns"
  };

  const LICENSING_OPERATIONS = {
    POPUP_OPEN: "popup_open",
    PREVIEW_AUTO_RECORD: "preview_auto_record",
    START_AUTO_RECORD: "start_auto_record",
    PREVIEW_LOBBY: "preview_lobby",
    START_LOBBY: "start_lobby"
  };

  const LICENSE_ERROR_CODES = {
    INVALID_REQUEST: {
      code: "INVALID_REQUEST",
      message: "Invalid activation request."
    },
    LICENSE_NOT_FOUND: {
      code: "LICENSE_NOT_FOUND",
      message: "Activation code not recognized."
    },
    LICENSE_DISABLED: {
      code: "LICENSE_DISABLED",
      message: "This activation code has been disabled."
    },
    LICENSE_EXPIRED: {
      code: "LICENSE_EXPIRED",
      message: "This activation code has expired."
    },
    LICENSE_ALREADY_BOUND: {
      code: "LICENSE_ALREADY_BOUND",
      message:
        "This activation code is already linked to another installation. Contact the administrator to reset it."
    },
    DEVICE_MISMATCH: {
      code: "DEVICE_MISMATCH",
      message:
        "This activation code is not linked to this installation. Contact the administrator to reset it."
    },
    VERSION_NOT_ALLOWED: {
      code: "VERSION_NOT_ALLOWED",
      message:
        "This extension version is not allowed by your license."
    },
    RUN_LIMIT_REACHED: {
      code: "RUN_LIMIT_REACHED",
      message: "Run limit reached. Contact the administrator."
    },
    RATE_LIMITED: {
      code: "RATE_LIMITED",
      message: "Too many requests. Please wait and try again."
    },
    SERVER_UNAVAILABLE: {
      code: "SERVER_UNAVAILABLE",
      message:
        "Licensing server is unavailable. Please check your connection."
    },
    INVALID_TOKEN: {
      code: "INVALID_TOKEN",
      message: "Session expired. Please verify again."
    },
    ADMIN_UNAUTHORIZED: {
      code: "ADMIN_UNAUTHORIZED",
      message: "Unauthorized."
    }
  };

  const LICENSE_KEY_REGEX = /^TAR-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

  const OFFLINE_GRACE_HOURS = 12;
  const TOKEN_REFRESH_MINUTES = 15;

  const api = {
    LICENSING_API_BASE_URL,
    LICENSING_STORAGE_KEYS,
    LICENSING_OPERATIONS,
    LICENSE_ERROR_CODES,
    LICENSE_KEY_REGEX,
    OFFLINE_GRACE_HOURS,
    TOKEN_REFRESH_MINUTES
  };

  root.TeamsAutoRecordLicensingConfig = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
