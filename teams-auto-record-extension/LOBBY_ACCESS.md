# Lobby Access Automation

## Purpose

For every matching meeting, the separate **Lobby Access** tab sets exactly two
Microsoft Teams Meeting access options to `Everyone`:

1. `Who can bypass the lobby?`
2. `Show meeting info on join screen`

It reuses the existing Calendar filters, limits, duplicate-occurrence plan,
retries, progress, Stop, return-to-calendar behavior, local storage, and CSV
export. Auto Recording keeps independent configuration, state, and results;
the two live automations cannot run simultaneously.

## Safety boundaries

Lobby Access does not change recording, roles, presenters, Copilot, attendee
audio/video, chat, announcements, title, date, time, attendees, recurrence, or
meeting links. It never joins, deletes, cancels, or reschedules a meeting.
Preview only reads the currently rendered Calendar meetings and opens no
meeting.

## Selector strategy

The live Teams DOM was inspected on June 22, 2026. The controls expose:

```text
Who can bypass the lobby?
  role="combobox"
  data-tid="AutoAdmittedUsers"
  id="AutoAdmittedUsers"

Show meeting info on join screen
  role="combobox"
  data-tid="AllowedUsersForMeetingDetails"
  id="AllowedUsersForMeetingDetails"
```

Both controls expose exact `aria-label` values and `aria-labelledby` references.
Discovery validates the accessible label, climbs to the nearest visible group
containing that label and exactly one visible combobox, and uses `data-tid`/ID
only as stable fallbacks. Nested label spans and the join-screen description are
supported without selecting neighboring controls.

The visible Meeting options content is a `role="document"` child of a
zero-size `role="dialog"` wrapper. The helper returns the visible content root,
requires Meeting options structure (`tablist`, loading indicator, or a known
setting), and ignores the event editor's unrelated Meeting options link.

Teams portals each open listbox outside the dialog DOM. The automation never
searches globally for the first `Everyone`. It accepts only the visible
`role="listbox"` whose exact ID is supplied by `aria-controls` on the scoped,
expanded combobox. Inside that listbox it selects one visible `role="option"`
whose normalized text is exactly `Everyone`.

Apply and Close are found by exact text/accessibility label inside the same
visible Meeting options content root. Hidden dialogs, hidden listboxes, stale
options, unrelated Everyone strings, and disabled Apply buttons are rejected.

## Workflow and statuses

The Meeting access tab is activated when necessary. Each control is rediscovered
after Teams renders, read before changes, updated independently, and confirmed
again from the same setting group. The automation rereads both final values
before reporting success.

- `Updated`: one or both settings changed, both confirmed as Everyone, and the
  enabled scoped Apply button completed.
- `Already configured`: both settings were already Everyone, or Teams showed
  both as Everyone while Apply remained disabled.
- `Failed`: a required dialog, setting, controlled listbox, exact option,
  confirmation, Apply action, or return step failed.
- `Stopped`: the user requested Stop; completed rows remain and remaining rows
  are marked stopped.

One failed meeting is recorded and the batch returns to Calendar before trying
the next planned occurrence.

## Reporting and privacy

Rows and CSV include meeting number, visible title/date/time, previous and new
lobby-bypass values, previous and new join-screen-info values, status, and error.
They do not include attendees, organizer details, body content, meeting URLs,
credentials, cookies, or tokens. No data is transmitted externally.

## Manual validation

1. Build and load `dist/`, then reload the Teams tab.
2. Preview one meeting and confirm no Meeting options dialog opens.
3. Run live with limit one and confirm both documented values are Everyone.
4. Confirm no unrelated Meeting option changed.
5. Run a meeting where both values are already Everyone and verify
   `Already configured` without Apply.
6. Run three meetings, including duplicate titles.
7. Stop during each dropdown and between the two settings.
8. Force one meeting failure and confirm later meetings continue.
9. Re-test Auto Recording, local state, both CSV exports, and the protected build.

## Known limitations

Microsoft tenant policy can remove or reject Everyone. Teams can change labels,
`data-tid` values, dialog structure, or `aria-controls` behavior. Only meetings
currently rendered in the visible Calendar view are processed. Slow Meeting
options rendering can require retries. A protected build still needs live Chrome
validation after every significant Teams UI change.
