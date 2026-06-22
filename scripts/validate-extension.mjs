import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  access,
  readFile,
  readdir,
  stat
} from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import {
  criticalStrings,
  distDirectory,
  javascriptFiles,
  sourceDirectory
} from "./build-config.mjs";

const require = createRequire(import.meta.url);

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nestedFiles = await Promise.all(
    entries.map(async entry => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory()
        ? listFiles(entryPath)
        : [entryPath];
    })
  );
  return nestedFiles.flat();
}

function collectManifestReferences(manifest) {
  const references = new Set();

  if (manifest.action?.default_popup) {
    references.add(manifest.action.default_popup);
  }
  if (manifest.background?.service_worker) {
    references.add(manifest.background.service_worker);
  }

  for (const contentScript of manifest.content_scripts || []) {
    for (const filePath of [
      ...(contentScript.js || []),
      ...(contentScript.css || [])
    ]) {
      references.add(filePath);
    }
  }

  for (const iconCollection of [manifest.icons, manifest.action?.default_icon]) {
    if (!iconCollection) {
      continue;
    }
    for (const filePath of Object.values(iconCollection)) {
      references.add(filePath);
    }
  }

  return [...references];
}

async function assertFileExists(relativePath) {
  const filePath = path.join(distDirectory, relativePath);
  await access(filePath);
  assert.equal(
    (await stat(filePath)).isFile(),
    true,
    `${relativePath} is not a file`
  );
}

function assertValidJavaScript(filePath) {
  execFileSync(process.execPath, ["--check", filePath], {
    stdio: "pipe"
  });
}

function assertNoUnsafeCode(relativePath, sourceCode) {
  assert.doesNotMatch(
    sourceCode,
    /\beval\s*\(/,
    `${relativePath} contains eval()`
  );
  assert.doesNotMatch(
    sourceCode,
    /\bnew\s+Function\s*\(/,
    `${relativePath} contains new Function()`
  );
  assert.doesNotMatch(
    sourceCode,
    /https?:\/\/[^\s"']+\.js(?:[?"'\s]|$)/i,
    `${relativePath} references external JavaScript`
  );
}

function assertPopupCspSafety(html) {
  assert.doesNotMatch(
    html,
    /<script(?![^>]*\bsrc\s*=)[^>]*>/i,
    "popup.html contains inline JavaScript"
  );

  const scriptSources = [...html.matchAll(
    /<script[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi
  )].map(match => match[1]);

  for (const source of scriptSources) {
    assert.doesNotMatch(
      source,
      /^(?:https?:)?\/\//i,
      `popup.html loads remote JavaScript: ${source}`
    );
  }
}

function assertNoSecrets(filesWithContents) {
  const secretPatterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bgh[pousr]_[A-Za-z0-9]{30,}\b/,
    /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/,
    /\bsk_live_[A-Za-z0-9]{16,}\b/
  ];

  for (const { relativePath, contents } of filesWithContents) {
    for (const pattern of secretPatterns) {
      assert.doesNotMatch(
        contents,
        pattern,
        `${relativePath} appears to contain a secret`
      );
    }
  }
}

function smokeTestProtectedSharedCode() {
  const constantsPath = path.join(
    distDirectory,
    "shared/constants.js"
  );
  const utilsPath = path.join(distDirectory, "shared/utils.js");
  const lobbyUtilsPath = path.join(
    distDirectory,
    "shared/lobby-utils.js"
  );
  const lobbyAccessPath = path.join(
    distDirectory,
    "content/lobby-access.js"
  );

  delete require.cache[require.resolve(constantsPath)];
  delete require.cache[require.resolve(utilsPath)];
  delete require.cache[require.resolve(lobbyUtilsPath)];
  delete require.cache[require.resolve(lobbyAccessPath)];
  delete globalThis.TeamsAutoRecordShared;

  require(constantsPath);
  require(utilsPath);
  const shared = require(lobbyUtilsPath);
  const lobbyAccess = require(lobbyAccessPath);
  const config = shared.normalizeConfig({
    targetDate: "2026-06-23",
    startTime: "2:00 PM",
    endTime: "5:00 PM"
  });

  assert.equal(
    shared.MESSAGE_TYPES.START_AUTOMATION,
    "START_AUTOMATION"
  );
  assert.equal(
    shared.matchesMeetingLabel(
      "L1_0172, 14:00 to 17:00, Tuesday, June 23, 2026, Busy",
      config
    ),
    true
  );
  assert.equal(
    shared.MESSAGE_TYPES.START_LOBBY_AUTOMATION,
    "START_LOBBY_AUTOMATION"
  );
  assert.equal(
    shared.STORAGE_KEYS.LOBBY_STATE,
    "teamsLobbyAccessState"
  );
  assert.match(
    lobbyAccess.SELECTORS.LOBBY_CONTROL,
    /AutoAdmittedUsers/
  );
  assert.equal(
    lobbyAccess.SELECTORS.EVERYONE_OPTION,
    '[role="option"][data-tid="Everyone"]'
  );
}

export async function validateExtension() {
  const sourceManifest = await readJson(
    path.join(sourceDirectory, "manifest.json")
  );
  const distManifest = await readJson(
    path.join(distDirectory, "manifest.json")
  );

  assert.equal(distManifest.manifest_version, 3);
  assert.deepEqual(
    distManifest.permissions || [],
    sourceManifest.permissions || [],
    "Manifest permissions changed during the build"
  );
  assert.deepEqual(
    distManifest.host_permissions || [],
    sourceManifest.host_permissions || [],
    "Manifest host permissions changed during the build"
  );
  assert.doesNotMatch(
    JSON.stringify(distManifest.content_security_policy || {}),
    /unsafe-eval/i,
    "Manifest CSP contains unsafe-eval"
  );

  const manifestReferences = collectManifestReferences(distManifest);
  await Promise.all(manifestReferences.map(assertFileExists));

  const distFiles = await listFiles(distDirectory);
  const relativeDistFiles = distFiles.map(filePath =>
    path.relative(distDirectory, filePath)
  );
  assert.equal(
    relativeDistFiles.some(filePath => filePath.endsWith(".map")),
    false,
    "Source maps were found in dist/"
  );

  const filesWithContents = await Promise.all(
    distFiles
      .filter(filePath => /\.(?:js|json|html|css|md)$/i.test(filePath))
      .map(async filePath => ({
        relativePath: path.relative(distDirectory, filePath),
        contents: await readFile(filePath, "utf8")
      }))
  );

  const sourceFilesWithContents = await Promise.all(
    ["manifest.json", ...javascriptFiles].map(async relativePath => ({
      relativePath,
      contents: await readFile(
        path.join(sourceDirectory, relativePath),
        "utf8"
      )
    }))
  );

  for (const relativePath of javascriptFiles) {
    const filePath = path.join(distDirectory, relativePath);
    const sourceCode = await readFile(filePath, "utf8");
    assertValidJavaScript(filePath);
    assertNoUnsafeCode(relativePath, sourceCode);
  }

  const sourceRuntimeText = sourceFilesWithContents
    .map(file => file.contents)
    .join("\n");
  const distRuntimeText = filesWithContents
    .map(file => file.contents)
    .join("\n");
  for (const criticalString of criticalStrings) {
    if (!sourceRuntimeText.includes(criticalString)) {
      continue;
    }

    assert.equal(
      distRuntimeText.includes(criticalString),
      true,
      `Critical runtime string missing from output: ${criticalString}`
    );
  }

  assertPopupCspSafety(
    await readFile(path.join(distDirectory, "popup/popup.html"), "utf8")
  );
  assertNoSecrets(filesWithContents);
  smokeTestProtectedSharedCode();

  const combinedDistText = filesWithContents
    .map(file => file.contents)
    .join("\n");

  const backendSecretPatterns = [
    { pattern: /MONGODB_URI/i, label: "MongoDB URI reference" },
    { pattern: /mongodb\+srv:\/\//i, label: "MongoDB connection string" },
    { pattern: /JWT_SECRET/i, label: "JWT secret reference" },
    { pattern: /ADMIN_API_KEY/i, label: "Admin API key reference" },
    { pattern: /LICENSE_HASH_SECRET/i, label: "License hash secret reference" },
    { pattern: /DEVICE_HASH_SECRET/i, label: "Device hash secret reference" }
  ];

  for (const { pattern, label } of backendSecretPatterns) {
    assert.doesNotMatch(
      combinedDistText,
      pattern,
      `Distribution contains ${label}`
    );
  }

  const licensingConfigPath = path.join(
    distDirectory,
    "shared/licensing-config.js"
  );
  const licensingClientPath = path.join(
    distDirectory,
    "shared/licensing-client.js"
  );

  delete require.cache[require.resolve(licensingConfigPath)];
  require(licensingConfigPath);
  const licensingConfigModule = globalThis.TeamsAutoRecordLicensingConfig;
  assert.ok(
    licensingConfigModule.LICENSING_API_BASE_URL,
    "Licensing API URL missing from protected build"
  );
  assert.ok(
    licensingConfigModule.LICENSE_KEY_REGEX,
    "License key regex missing from protected build"
  );
  assert.ok(
    licensingConfigModule.LICENSING_STORAGE_KEYS.INSTALLATION_ID,
    "Installation ID storage key missing"
  );

  delete require.cache[require.resolve(licensingClientPath)];
  require(licensingClientPath);
  const licensingClient = globalThis.TeamsAutoRecordLicensing;
  assert.ok(
    typeof licensingClient.normalizeLicenseKey === "function",
    "normalizeLicenseKey not exported from protected build"
  );
  assert.ok(
    typeof licensingClient.maskInstallationId === "function",
    "maskInstallationId not exported from protected build"
  );

  const validKey = licensingClient.normalizeLicenseKey("tar-8f4k-29qd-x7pm");
  assert.equal(validKey.valid, true, "Valid license key rejected");
  assert.equal(validKey.normalized, "TAR-8F4K-29QD-X7PM");

  const invalidKey = licensingClient.normalizeLicenseKey("invalid");
  assert.equal(invalidKey.valid, false, "Invalid license key accepted");

  const masked = licensingClient.maskInstallationId(
    "12345678-1234-1234-1234-123456789abc"
  );
  assert.match(masked, /^\*{4}-/, "Installation ID not properly masked");

  console.log("Manifest V3 JSON and referenced files: valid");
  console.log("Permissions and host permissions: unchanged");
  console.log("JavaScript syntax and distribution shared-code smoke test: valid");
  console.log("CSP, source maps, remote code, unsafe code, and secrets: clean");
  console.log("Backend secrets not present in distribution: verified");
  console.log("Licensing module smoke test: valid");
}

if (pathToFileURL(process.argv[1]).href === import.meta.url) {
  await validateExtension();
}
