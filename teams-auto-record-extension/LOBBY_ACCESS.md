# Lobby Access Automation

## Purpose

The Lobby Access tab changes exactly one Microsoft Teams meeting option:

`Who can bypass the lobby?` to `Everyone`.

It shares the existing Calendar meeting discovery, date/time/title filtering,
limits, duplicate occurrence planning, navigation, retries, and safe return
logic used by Auto Recording. Its configuration, runtime state, Stop command,
results, and CSV are independent.

## Safety boundaries

Lobby Access never changes recording, roles, presenters, Copilot, participant
audio/video, title, date, time, attendees, organizer, recurrence, meeting link,
announcements, or any other Meeting access value. It never joins, deletes,
cancels, reschedules, or chats in a meeting.

Preview makes no changes and does not open meetings. A live run is blocked while
Auto Recording is running, and Auto Recording is blocked while Lobby Access is
running.

## Confirmed selector strategy

The live Teams DOM was inspected on June 22, 2026. The lobby combobox exposed:

```text
role="combobox"
aria-label="Who can bypass the lobby?"
data-tid="AutoAdmittedUsers"
id="AutoAdmittedUsers"
```

The target option exposed:

```text
role="option"
data-tid="Everyone"
text="Everyone"
```

Discovery follows these constraints:

1. Find a visible `role="dialog"` containing `Meeting options` and the lobby
   combobox.
2. Find the `Meeting access` tab inside that dialog and activate it if needed.
3. Prefer `[data-tid="AutoAdmittedUsers"][role="combobox"]`; fall back to the
   exact accessible label.
4. Read and normalize the current displayed value.
5. If it is exactly `Everyone`, close the Meeting options dialog without Apply
   and report `Already Everyone`.
6. Otherwise open that combobox and find a visible `role="option"` whose
   normalized text is exactly `Everyone`, scoped to the same dialog.
7. Confirm the combobox displays `Everyone` before continuing.
8. Find the exact visible Apply button inside that same dialog, wait until it is
   enabled, click once, and wait for the dialog to close.

Unrelated `Everyone` text, such as presenter or annotation settings, cannot be
selected because option discovery is scoped to the active Meeting options
dialog and exact option text.

## Statuses and local data

Statuses are `Updated`, `Already Everyone`, `Failed`, and `Stopped`. Stored rows
contain only number, visible meeting title/date/time, feature, previous value,
new value, status, and error. They do not contain attendees, bodies, organizers,
or meeting links.

## Selector maintenance

If Teams changes the UI, inspect the live Meeting options DOM before editing
selectors. Maintain the label relationship and dialog scoping even if the
`data-tid` changes. Never replace these selectors with coordinates or a global
search for `Everyone`.

## Manual validation checklist

1. Load the development `dist/` extension.
2. Open Teams Calendar and the Lobby Access tab.
3. Preview three meetings and confirm no dialog opens and no setting changes.
4. Run live with limit one and confirm the lobby value becomes Everyone.
5. Confirm Apply succeeds and no neighboring setting changes.
6. Test a meeting already set to Everyone.
7. Run three meetings, including duplicate titles.
8. Stop during a run and confirm dialogs close and remaining rows are Stopped.
9. Force one meeting failure and confirm later meetings continue.
10. Re-test Auto Recording and both CSV exports.
11. Build with `npm run build:protected`, load protected `dist/`, and repeat.

## Known limitations

Availability of Everyone depends on Microsoft tenant policy. Teams can change
labels, roles, or `data-tid` values. Dynamic loading can temporarily hide the
dialog or leave Apply disabled; the run records a clear failure and continues.
