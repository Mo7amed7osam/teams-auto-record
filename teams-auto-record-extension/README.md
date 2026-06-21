# Teams Auto Record Chrome Extension

## What It Does

This extension previews matching Microsoft Teams Web calendar meetings and can enable the Teams setting:

- `Record and transcribe automatically`

It only works on:

- `https://teams.microsoft.com/*`

It processes meetings visible in the Teams Calendar UI by reusing the same selector-driven automation approach from the original Console script.

## What It Does Not Do

- It does not join meetings.
- It does not delete meetings.
- It does not edit titles, dates, times, attendees, organizers, recurrence, or meeting URLs.
- It does not read passwords, cookies, access tokens, or Teams chat content.
- It does not transmit meeting data to any external server.

## Folder To Load In Chrome

Load this folder as an unpacked extension:

- `/Users/mohamedhosam/Documents/New project/teams-auto-record-extension`

## Installation Steps

1. Open `chrome://extensions`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the `teams-auto-record-extension` folder.
5. Pin the extension if you want quick access.

## How To Use

1. Open Microsoft Teams Web.
2. Navigate to Calendar.
3. Keep the target meetings visible in the current calendar view.
4. Open the extension popup.
5. Set the target date, time range, and optional title filters.
6. Click `Preview meetings`.
7. Review the meeting count and report.
8. If you want live changes, disable `Preview-only mode`.
9. Click `Start automation`.
10. Confirm the warning prompt before live updates begin.
11. Use `Stop automation` to stop safely after the current step.
12. Use `Export CSV` to download the final report.

## Default Safety Behavior

The popup defaults to `previewOnly: true`, so it will not change meetings unless you explicitly turn preview-only off and confirm the run.

## Stored Data

The extension stores only local browser data in `chrome.storage.local`:

- saved configuration
- current progress
- final result rows
- running state

It does not store Microsoft credentials or authentication artifacts.

## Permissions

The extension requests only:

- `activeTab`
- `storage`
- `scripting`
- host access for `https://teams.microsoft.com/*`

## Architecture Summary

- `manifest.json`
  Defines the MV3 extension, popup, service worker, host permissions, and Teams content script.
- `background/service-worker.js`
  Coordinates popup requests, injects the content script when needed, persists state, and relays progress updates.
- `content/content.js`
  Runs the Teams UI automation on the page using selectors, polling, retries, cancellation, and detailed result tracking.
- `shared/constants.js`
  Shared message names, defaults, storage keys, and state constants.
- `shared/utils.js`
  Shared pure utilities for config normalization, Teams label parsing, filtering, summaries, and CSV export.
- `popup/popup.html`, `popup/popup.css`, `popup/popup.js`
  Compact operator UI for filters, preview, automation control, progress, and results.
- `/Users/mohamedhosam/Documents/New project/teams-auto-record.js`
  The original Console fallback script remains unchanged outside the extension folder.

## Manual Test Checklist

1. Load the unpacked extension from `chrome://extensions`.
2. Open Teams Web.
3. Open Calendar Day view.
4. Preview a date and time range.
5. Verify the number of meetings found.
6. Run on one meeting.
7. Run on three meetings.
8. Verify already-enabled meetings are skipped.
9. Verify duplicate-title meetings are processed independently.
10. Verify `Stop automation` works.
11. Verify the final report appears in the popup.
12. Verify no meetings were joined or otherwise modified.
13. Refresh Teams and verify the extension still works.

## Automated Tests

Pure utility tests are included for:

- meeting label parsing
- date formatting
- include/exclude title filtering
- limit handling
- result summaries
- CSV generation

Run them from the repository root:

```bash
npm test
```

## Known Limitations

- The extension depends on Teams Web selectors and accessible labels that may change over time.
- It only processes meetings visible in the current Teams calendar view.
- Teams is a dynamic single-page application, so temporary loading states can still cause retries or failures.
- The Calendar page detection is heuristic-based because Teams routing can vary across deployments.
- If Microsoft changes the `data-tid` values for the recording controls, the selectors must be updated.

## Troubleshooting

- If preview finds zero meetings, make sure the meetings are visible in Calendar and the filters match the aria-label values.
- If `Edit` or `Meeting options` fails, wait for Teams to finish rendering and try again.
- If the popup shows `Not on the Teams Calendar page`, navigate explicitly to Calendar before retrying.
- If `Apply` never becomes enabled, inspect whether the meeting type supports automatic recording in your tenant.
- If the extension was loaded before a Teams tab existed, refresh the Teams tab once after loading the extension.

## Selector Maintenance Notes

The current implementation is based on selectors already verified in Teams Web:

- `[data-tid="AutoRecordAndTranscribeMode"]`
- `[data-tid="AutoRecordingAndTranscription"]`
- meeting buttons with `[role="button"]` and `aria-label` containing `Microsoft Teams Meeting`

The Meeting Options trigger is matched by:

- `button[aria-label*="online meeting options"]`
- a fallback text matcher that looks for `online meeting options`

If Teams changes any of these selectors, update `content/content.js` first and verify preview mode before live changes.

## Packaging As ZIP

To create a ZIP for local sharing or store preparation:

1. Open the `teams-auto-record-extension` folder.
2. Zip the contents of that folder, not the repository root.
3. Verify the ZIP includes `manifest.json` at the top level.

## Chrome Web Store Preparation

Before submission:

1. Add production PNG icons to the `icons/` folder.
2. Recheck permissions and keep them minimal.
3. Validate the privacy copy in `PRIVACY.md`.
4. Re-test against the current Teams UI.
5. Package the extension folder contents with `manifest.json` at the root of the archive.
