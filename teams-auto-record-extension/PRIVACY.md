# Privacy Policy

## Summary

Teams Meeting Automation runs locally in the user's browser and does not send meeting data to external services.

## Data Handling

- The extension runs entirely on the user's machine.
- It does not collect, sell, or share personal data.
- It does not read passwords, cookies, or authentication tokens.
- It does not intercept Microsoft sign-in flows.
- It only interacts with visible Microsoft Teams meeting UI needed to preview meetings, update automatic recording, or set the two documented Lobby Access options to Everyone.
- It stores configuration, progress, and result rows locally in `chrome.storage.local`.
- It does not transmit meeting information externally.

## Scope Of Interaction

The extension is limited to the current Teams Web application and its embedded Calendar:

- `https://teams.microsoft.com/*`
- `https://teams.cloud.microsoft/*`
- `https://outlook.office.com/*`

It does not request access to unrelated websites or browser history.

## Local Storage

The following may be stored locally in the browser:

- target date and filter settings
- retry and timing configuration
- preview results
- run progress
- final report rows

Lobby Access result rows may include previous and new values for lobby bypass
and join-screen meeting information. They do not include attendees, organizer
details, meeting bodies, or meeting links.

No remote analytics, telemetry, or advertising services are used.
