# Extension Build and Distribution

The readable extension source remains in `popup/`, `content/`, `background/`,
and `shared/`. Generated files are written only to the repository-level
`dist/` directory. Release archives are written to `release/`.

## Setup and tests

From the repository root:

```sh
npm install
npm test
```

## Build commands

Create a readable development build for local debugging:

```sh
npm run build:dev
```

Create a minified, non-obfuscated build:

```sh
npm run build
```

The pipeline uses `esbuild` with a Chrome 109 target, comment removal, and no
source maps. Protected builds then use `javascript-obfuscator` with compact
output, simplification, hexadecimal local identifiers, base64 string arrays,
string splitting, rotation, and shuffling. Global renaming and object-key
transformation are disabled to preserve the contracts between separately
loaded extension scripts. Self-defending code, debug protection, control-flow
flattening, dead-code injection, and dynamic code generation are disabled for
Manifest V3 stability.

Create the protected distribution and run validation:

```sh
npm run build:protected
```

Run `npm run validate:dist` separately when validating an existing `dist/`
without rebuilding it.

Create a fresh protected build and package it as
`release/teams-auto-record-extension-vX.Y.Z.zip`:

```sh
npm run package:zip
```

The ZIP root directly contains `manifest.json`, `popup/`, `content/`,
`background/`, `shared/`, `icons/`, and `PRIVACY.md`. It does not include an
extra extension directory, source maps, tests, dependencies, or readable
development source files.

## Version updates

The archive version is read from `manifest.json`. To publish a new extension
version, update the source `manifest.json` version using Chrome's one-to-four
integer format, then rebuild. A patch release changes `0.1.0` to `0.1.1`.

## Manual Chrome validation

1. Run `npm run build:protected`.
2. Open `chrome://extensions` and enable Developer mode.
3. Choose **Load unpacked** and select the repository-level `dist/` directory.
4. Open the Teams web calendar and confirm preview filters, duplicate meetings,
   feature tabs, local progress, Stop, and both CSV exports.
5. Run Auto Recording with a limit of one and confirm only automatic recording
   and transcription changes.
6. Run Lobby Access with a limit of one and confirm both `Who can bypass the
   lobby?` and `Show meeting info on join screen` change to `Everyone`.
7. Test a meeting with both values already set to Everyone and confirm
   `Already configured` without an unnecessary Apply.
8. Confirm neither feature joins, deletes, cancels, or reschedules a meeting.
9. Inspect the extension service worker and popup console for CSP or runtime
   errors.

Also validate Stop during each dropdown, duplicate-title meetings, one failed
meeting followed by a successful meeting, both CSV exports, and a three-meeting
Lobby Access run. Teams listboxes are portaled outside the dialog and must remain
associated through the scoped combobox's `aria-controls` value.

## Security limits

Obfuscation makes reverse engineering harder; it does not make browser code
impossible to inspect. Any code running on a user's machine can potentially be
recovered. Never put credentials, tokens, cookies, private keys, or licensing
secrets in the extension. Sensitive licensing or authorization decisions need
to run on a trusted backend.

Manifest V3 forbids remotely hosted executable code and extension-page code
that relies on `eval`, `new Function`, or unsafe CSP exceptions. The protected
build deliberately disables aggressive anti-debugging, self-defending,
control-flow flattening, and dead-code injection features to keep the extension
stable and compliant.
