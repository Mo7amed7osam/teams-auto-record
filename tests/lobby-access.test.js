const test = require("node:test");
const assert = require("node:assert/strict");
const { JSDOM } = require("jsdom");

require("../teams-auto-record-extension/shared/constants.js");
require("../teams-auto-record-extension/shared/utils.js");
const shared = require(
  "../teams-auto-record-extension/shared/lobby-utils.js"
);
const lobbyAccess = require(
  "../teams-auto-record-extension/content/lobby-access.js"
);

const visible = () => true;

function createFixture(options = {}) {
  const currentValue =
    options.currentValue || "People in my org and guests";
  const everyoneOption =
    options.includeEveryone === false
      ? ""
      : '<div role="option" data-tid="Everyone">Everyone</div>';
  const disabled = options.applyEnabled ? "" : "disabled";
  const dom = new JSDOM(`
    <div role="option">Everyone</div>
    <p>Everyone can read this unrelated help text.</p>
    <div role="dialog">
      <span>Meeting options</span>
      <button role="tab" aria-selected="true">Meeting access</button>
      <div
        id="AutoAdmittedUsers"
        data-tid="AutoAdmittedUsers"
        role="combobox"
        aria-label="Who can bypass the lobby?"
      >${currentValue}</div>
      <div role="listbox">
        ${everyoneOption}
        <div role="option" aria-selected="true">${currentValue}</div>
      </div>
      <button ${disabled}>Apply</button>
      <button aria-label="Close">Close</button>
    </div>
  `);

  return dom.window.document;
}

test("normalizes Teams lobby option text", () => {
  assert.equal(
    shared.normalizeLobbyOptionText("  Everyone \uE000 "),
    "Everyone"
  );
});

test("matches Everyone exactly", () => {
  assert.equal(shared.isEveryoneLobbyOption("Everyone"), true);
  assert.equal(
    shared.isEveryoneLobbyOption("Everyone in my org"),
    false
  );
});

test("reads the current lobby value", () => {
  const document = createFixture();
  const dialog = lobbyAccess.findMeetingOptionsDialog(
    document,
    visible
  );
  const control = lobbyAccess.findLobbyControl(dialog, visible);

  assert.equal(
    lobbyAccess.readLobbyValue(control),
    "People in my org and guests"
  );
});

test("detects a lobby already set to Everyone", () => {
  const document = createFixture({ currentValue: "Everyone" });
  const dialog = lobbyAccess.findMeetingOptionsDialog(
    document,
    visible
  );
  const control = lobbyAccess.findLobbyControl(dialog, visible);

  assert.equal(
    shared.isEveryoneLobbyOption(
      lobbyAccess.readLobbyValue(control)
    ),
    true
  );
});

test("finds Everyone only inside the scoped Meeting options dialog", () => {
  const document = createFixture();
  const dialog = lobbyAccess.findMeetingOptionsDialog(
    document,
    visible
  );
  const option = lobbyAccess.findEveryoneOption(dialog, visible);

  assert.equal(option.getAttribute("data-tid"), "Everyone");
  assert.equal(dialog.contains(option), true);
});

test("returns null when the scoped Everyone option is missing", () => {
  const document = createFixture({ includeEveryone: false });
  const dialog = lobbyAccess.findMeetingOptionsDialog(
    document,
    visible
  );

  assert.equal(
    lobbyAccess.findEveryoneOption(dialog, visible),
    null
  );
});

test("distinguishes enabled and disabled scoped Apply buttons", () => {
  const enabledDocument = createFixture({ applyEnabled: true });
  const enabledDialog = lobbyAccess.findMeetingOptionsDialog(
    enabledDocument,
    visible
  );
  const disabledDocument = createFixture();
  const disabledDialog = lobbyAccess.findMeetingOptionsDialog(
    disabledDocument,
    visible
  );

  assert.equal(
    lobbyAccess.isEnabledControl(
      lobbyAccess.findApplyButton(enabledDialog, visible)
    ),
    true
  );
  assert.equal(
    lobbyAccess.isEnabledControl(
      lobbyAccess.findApplyButton(disabledDialog, visible)
    ),
    false
  );
});

test("summarizes Lobby Access statuses", () => {
  assert.deepEqual(
    shared.summarizeLobbyResults(
      [
        { status: "Updated" },
        { status: "Already Everyone" },
        { status: "Failed" },
        { status: "Stopped" }
      ],
      4
    ),
    {
      found: 4,
      processed: 4,
      updated: 1,
      alreadyEveryone: 1,
      failed: 1,
      stopped: 1,
      progressPercentage: 100
    }
  );
});

test("uses feature-specific storage keys and message types", () => {
  assert.equal(
    shared.STORAGE_KEYS.LOBBY_CONFIG,
    "teamsLobbyAccessConfig"
  );
  assert.equal(
    shared.STORAGE_KEYS.LOBBY_STATE,
    "teamsLobbyAccessState"
  );
  assert.equal(
    shared.MESSAGE_TYPES.START_LOBBY_AUTOMATION,
    "START_LOBBY_AUTOMATION"
  );
});

test("builds a feature-labelled Lobby Access CSV", () => {
  const csv = shared.buildLobbyCsv([
    {
      number: 1,
      title: "L2_0157",
      date: "Tuesday, June 23, 2026",
      time: "2:00 PM to 5:00 PM",
      previousValue: "People in my org and guests",
      newValue: "Everyone",
      status: "Updated",
      error: ""
    }
  ]);

  assert.match(csv, /^feature,number,title,/);
  assert.match(csv, /Lobby Access,1,L2_0157/);
});

test("Lobby Access reuses shared date, time, and title filters", () => {
  const config = shared.normalizeConfig({
    targetDate: "2026-06-23",
    startTime: "2:00 PM",
    endTime: "5:00 PM",
    titleIncludes: "L2_",
    titleExcludes: "cancelled"
  });

  assert.equal(
    shared.matchesMeetingLabel(
      "L2_0157, 14:00 to 17:00, Tuesday, June 23, 2026, Busy",
      config
    ),
    true
  );
});

test("preserves duplicate-title meetings as separate occurrences", () => {
  const plan = shared.buildMeetingPlanFromDescriptors([
    { key: "same", title: "L2_0157", date: "date", time: "time" },
    { key: "same", title: "L2_0157", date: "date", time: "time" }
  ]);

  assert.deepEqual(
    plan.map(item => item.occurrence),
    [0, 1]
  );
});

test("marks unprocessed Lobby Access meetings as stopped", () => {
  const plan = [
    { title: "A", date: "date", time: "time" },
    { title: "B", date: "date", time: "time" }
  ];
  const results = shared.appendStoppedLobbyResults(plan, [], 0);

  assert.deepEqual(
    results.map(item => item.status),
    ["Stopped", "Stopped"]
  );
});
