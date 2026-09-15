# Teams Auto Record

Automates enabling **Record and Transcribe** for Microsoft Teams meetings in your calendar using a single browser-console script.

This project is designed for repetitive scheduling workflows where you need to apply the same recording setting across many meetings quickly and consistently.

## Recruiter snapshot

- **Problem solved:** repetitive manual Teams meeting configuration
- **Approach:** resilient browser automation with configurable filters
- **Tech used:** JavaScript, DOM querying, async control flow, retry logic
- **Outcome:** faster bulk setup with safer dry-run and transparent reporting

---

## What this does

- Finds Teams meetings visible in your calendar view
- Filters meetings by date, time range, and title rules
- Opens each meeting and enables **Record and transcribe**
- Supports preview mode (dry run) before making any changes
- Produces a clear summary table of updated, skipped, and failed meetings

---

## Repository contents

- `teams-auto-record.js`  
  Main automation script (run in browser DevTools Console on Teams web calendar).

---

## Requirements

- Microsoft Teams web app access
- Browser with DevTools (Chrome or Edge recommended)
- Permission to edit the target meetings

---

## Quick start

1. Open Teams on the web and go to **Calendar**.
2. Open DevTools Console (`F12` or `Ctrl+Shift+I` / `Cmd+Option+I`).
3. Copy all content from `teams-auto-record.js`.
4. Update the `CONFIG` section at the top of the file.
5. Paste into Console and run.
6. Review the output table and execution summary.

---

## Configuration

Edit only the `CONFIG` object:

- `targetDates`: specific dates to process (empty array = current visible day)
- `timeRanges`: allowed meeting time windows (empty array = all)
- `titleIncludes`: include meetings containing any of these terms
- `titleExcludes`: skip meetings containing any of these terms
- `limit`: cap number of meetings processed (for safe testing)
- `previewOnly`: when `true`, lists matching meetings without editing
- `retriesPerMeeting`: retries when an operation fails
- `delayBetweenMeetingsMs`: delay between meeting operations
- `pauseEvery` / `pauseDurationMs`: optional periodic throttling
- `timeoutMs`: max wait time for Teams UI elements

---

## Recommended safe workflow

1. Set `previewOnly: true` and confirm the match list is correct.
2. Set `limit: 2` or `3` for a small real run.
3. If results are correct, set `limit: null` and run full batch.

---

## Stop and monitoring

- To stop during execution:
  - Run `window.__stopTeamsAutoRecord = true` in Console.
- Results are available in:
  - `window.__teamsAutoRecordResults`
- Planned targets in preview mode:
  - `window.__teamsAutoRecordPlan`

---

## Notes

- UI labels in Teams can change over time; selectors may require updates.
- Best run while Teams is stable and not being actively edited in another tab.
- Use responsibly and validate results when running on large calendars.

---

## Why this project matters

This script demonstrates practical workflow automation:

- DOM-driven UI automation for a real SaaS product
- defensive execution (timeouts, retries, throttling, dry-run)
- configurable filtering logic for production-like batch operations
- clear runtime reporting for auditability

Ideal as an example of applied JavaScript automation and operational tooling.
