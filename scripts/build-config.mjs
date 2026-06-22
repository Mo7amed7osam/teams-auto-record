import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));

export const projectRoot = path.resolve(scriptsDirectory, "..");
export const sourceDirectory = path.join(
  projectRoot,
  "teams-auto-record-extension"
);
export const distDirectory = path.join(projectRoot, "dist");
export const releaseDirectory = path.join(projectRoot, "release");

export const javascriptFiles = [
  "popup/popup.js",
  "content/content.js",
  "background/service-worker.js",
  "shared/constants.js",
  "shared/utils.js",
  "shared/lobby-utils.js",
  "content/lobby-access.js",
  "shared/licensing-config.js",
  "shared/licensing-client.js"
];

export const staticFiles = [
  "manifest.json",
  "popup/popup.html",
  "popup/popup.css",
  "PRIVACY.md"
];

export const criticalStrings = [
  "PREVIEW_MEETINGS",
  "START_AUTOMATION",
  "STOP_AUTOMATION",
  "GET_STATUS",
  "GET_STATE",
  "CLEAR_RESULTS",
  "PROGRESS_UPDATE",
  "AUTOMATION_COMPLETE",
  "AUTOMATION_ERROR",
  "STATE_UPDATED",
  "PREVIEW_LOBBY_MEETINGS",
  "START_LOBBY_AUTOMATION",
  "STOP_LOBBY_AUTOMATION",
  "CLEAR_LOBBY_RESULTS",
  "LOBBY_PROGRESS_UPDATE",
  "LOBBY_AUTOMATION_COMPLETE",
  "LOBBY_AUTOMATION_ERROR",
  "LOBBY_STATE_UPDATED",
  "AutoRecordAndTranscribeMode",
  "AutoRecordingAndTranscription",
  "[data-tid=\"AutoRecordAndTranscribeMode\"]",
  "[data-tid=\"AutoRecordingAndTranscription\"]",
  "[data-tid=\"AutoAdmittedUsers\"][role=\"combobox\"]",
  "#AutoAdmittedUsers[role=\"combobox\"]",
  "[role=\"combobox\"][aria-label=\"Who can bypass the lobby?\"]",
  "[role=\"option\"][data-tid=\"Everyone\"]",
  "Who can bypass the lobby?",
  "Everyone",
  "Meeting access",
  "button[aria-label*=\"online meeting options\"], button[title*=\"online meeting options\"]",
  "Edit",
  "Apply",
  "Calendar",
  "teams.microsoft.com",
  "teams.cloud.microsoft",
  "outlook.office.com",
  "teamsAutoRecordConfig",
  "teamsAutoRecordState",
  "teamsLobbyAccessConfig",
  "teamsLobbyAccessState",
  "shared/constants.js",
  "shared/utils.js",
  "shared/lobby-utils.js",
  "content/lobby-access.js",
  "content/content.js",
  "shared/licensing-config.js",
  "shared/licensing-client.js",
  "teamsAutoRecordInstallationId",
  "teamsAutoRecordLicenseKey",
  "teamsAutoRecordLicenseStatus",
  "teamsAutoRecordLicenseToken",
  "teamsAutoRecordLicenseTokenExpiresAt",
  "teamsAutoRecordLastVerifiedAt",
  "TAR-",
  "/licenses/activate",
  "/licenses/verify",
  "LICENSE_ALREADY_BOUND",
  "DEVICE_MISMATCH",
  "SERVER_UNAVAILABLE"
];

export const obfuscatorOptions = {
  compact: true,
  simplify: true,
  identifierNamesGenerator: "hexadecimal",
  renameGlobals: false,
  stringArray: true,
  stringArrayEncoding: ["base64"],
  stringArrayThreshold: 0.75,
  rotateStringArray: true,
  shuffleStringArray: true,
  splitStrings: true,
  splitStringsChunkLength: 8,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
  selfDefending: false,
  debugProtection: false,
  debugProtectionInterval: 0,
  disableConsoleOutput: false,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  numbersToExpressions: false,
  reservedStrings: criticalStrings.map(value =>
    `^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`
  )
};
