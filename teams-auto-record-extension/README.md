# Teams Meeting Automation Chrome Extension

This Manifest V3 extension automates two independent Microsoft Teams Web
meeting settings for meetings visible in the current Calendar view:

- **Auto Recording** enables `Record and transcribe automatically`.
- **Lobby Access** sets both `Who can bypass the lobby?` and
  `Show meeting info on join screen` to `Everyone`.

Both features preview matching meetings before live changes, preserve duplicate
meeting titles as separate events, support Stop and retries, store independent
local reports, and export CSV files.

## Safety scope

Auto Recording changes only recording and transcription. Lobby Access changes
only the two documented Meeting access dropdowns. The extension never joins, deletes, cancels, or
reschedules meetings and never changes attendees, titles, dates, roles,
presenter settings, Copilot, microphones, cameras, chat, links, or recurrence.

Preview-only mode is enabled by default. Live runs require disabling it and
confirming the exact action after preview.

## Supported pages

The top-level Teams app uses:

- `https://teams.microsoft.com/*`
- `https://teams.cloud.microsoft/*`

The current Teams Calendar is embedded from:

- `https://outlook.office.com/hosted/calendar/`

No additional host permissions were introduced for Lobby Access.

## Install and use

1. Run `npm install` and `npm run build:dev` from the repository root.
2. Open `chrome://extensions`, enable Developer mode, and choose Load unpacked.
3. Select the repository-level `dist/` directory.
4. Open Teams Calendar and keep the target meetings visible.
5. Open the popup and select **Auto Recording** or **Lobby Access**.
6. Configure date, time, title, limit, retry, and timing filters.
7. Preview first, review the count, then start a live run if required.
8. Use Stop to recover safely and Export CSV for the active feature's report.

The original Console fallback remains unchanged at
`/Users/mohamedhosam/Documents/New project/teams-auto-record.js`.

## Architecture

- `background/service-worker.js` routes feature-specific messages, persists
  independent state, locates the embedded Calendar frame, and prevents both
  automations from running simultaneously.
- `content/content.js` owns shared calendar discovery, filtering, duplicate
  occurrence planning, meeting navigation, retries, Stop, and both batch loops.
- `content/lobby-access.js` contains scoped setting-group, dialog, controlled
  listbox, Apply, and Close discovery for Lobby Access.
- `shared/constants.js` defines stable messages, storage keys, defaults, and
  state factories for both features.
- `shared/utils.js` contains shared meeting filters and plan construction.
- `shared/lobby-utils.js` contains lobby normalization, summaries, stopped-row
  generation, and feature-labelled CSV output.
- `popup/` provides the two-tab UI over independent configurations and reports.

## Verified selectors

Auto Recording retains:

- `[data-tid="AutoRecordAndTranscribeMode"]`
- `[data-tid="AutoRecordingAndTranscription"]`

Lobby Access was verified against the live Teams DOM on June 22, 2026:

- `[data-tid="AutoAdmittedUsers"][role="combobox"]`
- fallback: `[role="combobox"][aria-label="Who can bypass the lobby?"]`
- `[data-tid="AllowedUsersForMeetingDetails"][role="combobox"]`
- fallback: `[role="combobox"][aria-label="Show meeting info on join screen"]`
- each combobox is validated against its exact label and nearest logical group
- after a dropdown opens, its `aria-controls` ID identifies the only accepted
  visible listbox, even though Teams portals that listbox outside the dialog
- the selected option must have `role="option"` and exact normalized text
  `Everyone`
- the Meeting access tab uses `role="tab"` and exact text `Meeting access`
- Apply is selected by exact text inside the same visible Meeting options dialog

Selectors never use coordinates. See `LOBBY_ACCESS.md` for maintenance details.

## Local data and privacy

Configurations, progress, and result rows are stored only in
`chrome.storage.local`. Lobby results may contain meeting title, visible date,
visible time, both previous values, both new values, status, and error reason. The
extension does not store attendees, organizers, meeting links, bodies,
credentials, cookies, or tokens and does not send meeting data externally.

No licensing implementation exists in this repository version. Lobby Access
does not add a second licensing path or expose any backend secret.

## Tests and protected release

```sh
npm test
npm run build:protected
npm run package:zip
```

Readable source remains under `teams-auto-record-extension/`. Protected output
is generated in `dist/`, and the release ZIP is generated in `release/` without
source maps or readable JavaScript source.

## Known limitations

- Only meetings currently rendered in the visible Calendar view are processed.
- Teams is a dynamic application; loading delays and portaled listboxes may
  require retries when Microsoft changes rendering behavior.
- Microsoft can change accessible labels, `data-tid` values, or dialog layout.
- Tenant policy can limit whether a lobby value is available or accepted.
- A protected build still requires manual Chrome and live Teams validation.
