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

const visible = element =>
  Boolean(element && !element.closest('[data-hidden="true"]'));

function createFixture(options = {}) {
  const lobbyValue =
    options.lobbyValue || "People in my org and guests";
  const joinInfoValue =
    options.joinInfoValue || "Users allowed to bypass the lobby";
  const disabled = options.applyEnabled ? "" : "disabled";
  const lobbySetting = options.includeLobby === false
    ? ""
    : `
      <section data-setting="lobby">
        <span id="label_AutoAdmittedUsers">
          <span>Who can bypass</span> the lobby?
        </span>
        <button
          id="AutoAdmittedUsers"
          data-tid="AutoAdmittedUsers"
          role="combobox"
          aria-label="Who can bypass the lobby?"
          aria-labelledby="label_AutoAdmittedUsers"
          aria-expanded="${options.lobbyExpanded ? "true" : "false"}"
          aria-controls="lobby-listbox"
        >${lobbyValue}</button>
      </section>`;
  const joinInfoSetting = options.includeJoinInfo === false
    ? ""
    : `
      <section data-setting="join-info">
        <span id="label_AllowedUsersForMeetingDetails">
          Show meeting info on join screen
        </span>
        <p>
          Display details about the meeting like title and start time,
          number of others joined, and presence of the organizer.
        </p>
        <button
          id="AllowedUsersForMeetingDetails"
          data-tid="AllowedUsersForMeetingDetails"
          role="combobox"
          aria-label="Show meeting info on join screen"
          aria-labelledby="label_AllowedUsersForMeetingDetails"
          aria-expanded="${options.joinInfoExpanded ? "true" : "false"}"
          aria-controls="join-info-listbox"
        >${joinInfoValue}</button>
      </section>`;
  const dom = new JSDOM(`
    <div data-hidden="true">
      <div role="dialog">
        <div role="document">
          <span>Meeting options</span>
          <div role="tablist"></div>
          <button role="combobox" aria-label="Who can bypass the lobby?">
            Hidden duplicate
          </button>
          <button>Apply</button>
        </div>
      </div>
    </div>
    <div role="dialog">
      <div role="document">
        <span>Meeting options</span>
        <div role="tablist">
          <button role="tab" aria-selected="true">Meeting access</button>
        </div>
        ${lobbySetting}
        ${joinInfoSetting}
        <button ${disabled}>Apply</button>
        <button aria-label="Close">Close</button>
      </div>
    </div>
    <div
      id="lobby-listbox"
      role="listbox"
      ${options.hideLobbyListbox ? 'data-hidden="true"' : ""}
    >
      <div role="option" data-tid="Everyone">Everyone</div>
      <div role="option" aria-selected="true">${lobbyValue}</div>
    </div>
    <div
      id="join-info-listbox"
      role="listbox"
      ${options.hideJoinInfoListbox ? 'data-hidden="true"' : ""}
    >
      <div role="option" data-tid="Everyone">Everyone</div>
      <div role="option" aria-selected="true">${joinInfoValue}</div>
    </div>
    <div data-hidden="true" role="listbox" id="stale-listbox">
      <div role="option" data-tid="Everyone">Everyone</div>
    </div>
  `);

  return dom.window.document;
}

function getSettings(document) {
  const dialog = lobbyAccess.findMeetingOptionsDialog(document, visible);
  return {
    dialog,
    lobby: lobbyAccess.findSetting(
      dialog,
      lobbyAccess.SETTING_DEFINITIONS.LOBBY_BYPASS,
      visible
    ),
    joinInfo: lobbyAccess.findSetting(
      dialog,
      lobbyAccess.SETTING_DEFINITIONS.JOIN_SCREEN_INFO,
      visible
    )
  };
}

test("normalizes and exactly matches Everyone", () => {
  assert.equal(
    shared.normalizeLobbyOptionText("  Everyone \uE000 "),
    "Everyone"
  );
  assert.equal(shared.isEveryoneLobbyOption("Everyone"), true);
  assert.equal(shared.isEveryoneLobbyOption("Everyone in my org"), false);
});

test("discovers both separate settings when neither is Everyone", () => {
  const { lobby, joinInfo } = getSettings(createFixture());

  assert.equal(
    lobbyAccess.readSettingValue(lobby.control),
    "People in my org and guests"
  );
  assert.equal(
    lobbyAccess.readSettingValue(joinInfo.control),
    "Users allowed to bypass the lobby"
  );
  assert.notEqual(lobby.group, joinInfo.group);
});

test("detects lobby bypass already Everyone", () => {
  const { lobby } = getSettings(
    createFixture({ lobbyValue: "Everyone" })
  );
  assert.equal(
    shared.isEveryoneLobbyOption(
      lobbyAccess.readSettingValue(lobby.control)
    ),
    true
  );
});

test("detects join-screen info already Everyone", () => {
  const { joinInfo } = getSettings(
    createFixture({ joinInfoValue: "Everyone" })
  );
  assert.equal(
    shared.isEveryoneLobbyOption(
      lobbyAccess.readSettingValue(joinInfo.control)
    ),
    true
  );
});

test("detects both settings already Everyone", () => {
  const { lobby, joinInfo } = getSettings(
    createFixture({ lobbyValue: "Everyone", joinInfoValue: "Everyone" })
  );
  assert.equal(
    [lobby.control, joinInfo.control].every(control =>
      shared.isEveryoneLobbyOption(
        lobbyAccess.readSettingValue(control)
      )
    ),
    true
  );
});

test("finds labels split across nested spans", () => {
  const { dialog } = getSettings(createFixture());
  const association = lobbyAccess.findSettingGroupByLabel(
    dialog,
    "Who can bypass the lobby?",
    visible
  );

  assert.equal(association.group.dataset.setting, "lobby");
  assert.equal(association.control.id, "AutoAdmittedUsers");
});

test("scopes Everyone to the lobby bypass controlled listbox", () => {
  const document = createFixture({ lobbyExpanded: true });
  const { dialog, lobby } = getSettings(document);
  const option = lobbyAccess.findEveryoneOptionForControl(
    document,
    dialog,
    lobby.control,
    visible
  );

  assert.equal(option.parentElement.id, "lobby-listbox");
});

test("scopes Everyone to the join-screen controlled listbox", () => {
  const document = createFixture({ joinInfoExpanded: true });
  const { dialog, joinInfo } = getSettings(document);
  const option = lobbyAccess.findEveryoneOptionForControl(
    document,
    dialog,
    joinInfo.control,
    visible
  );

  assert.equal(option.parentElement.id, "join-info-listbox");
});

test("does not use another setting's Everyone option", () => {
  const document = createFixture({ lobbyExpanded: true });
  const { dialog, lobby, joinInfo } = getSettings(document);

  assert.equal(
    lobbyAccess.findEveryoneOptionForControl(
      document,
      dialog,
      joinInfo.control,
      visible
    ),
    null
  );
  assert.equal(
    lobbyAccess.findEveryoneOptionForControl(
      document,
      dialog,
      lobby.control,
      visible
    ).parentElement.id,
    "lobby-listbox"
  );
});

test("ignores hidden duplicate dialogs", () => {
  const { dialog } = getSettings(createFixture());
  assert.equal(dialog.closest('[data-hidden="true"]'), null);
});

test("ignores hidden duplicate and stale options", () => {
  const document = createFixture({
    joinInfoExpanded: true,
    hideJoinInfoListbox: true
  });
  const { dialog, joinInfo } = getSettings(document);

  assert.equal(
    lobbyAccess.findEveryoneOptionForControl(
      document,
      dialog,
      joinInfo.control,
      visible
    ),
    null
  );
});

test("detects the loading shell and zero-size dialog wrapper", () => {
  const dom = new JSDOM(`
    <div role="dialog">
      <div role="document">
        <span>Meeting options</span>
        <div role="progressbar"></div>
      </div>
    </div>
  `);
  const contentOnlyVisible = element =>
    element.getAttribute("role") !== "dialog";
  const dialog = lobbyAccess.findMeetingOptionsDialog(
    dom.window.document,
    contentOnlyVisible
  );

  assert.equal(dialog.getAttribute("role"), "document");
  assert.equal(
    lobbyAccess.isMeetingOptionsLoading(dialog, contentOnlyVisible),
    true
  );
});

test("ignores the event editor Meeting options link", () => {
  const dom = new JSDOM(`
    <div role="dialog"><div role="document">
      <a>Meeting options</a>
    </div></div>
  `);
  assert.equal(
    lobbyAccess.findMeetingOptionsDialog(dom.window.document, visible),
    null
  );
});

test("returns a specific missing lobby setting result", () => {
  const { lobby, joinInfo } = getSettings(
    createFixture({ includeLobby: false })
  );
  assert.equal(lobby, null);
  assert.ok(joinInfo);
});

test("returns a specific missing join-screen setting result", () => {
  const { lobby, joinInfo } = getSettings(
    createFixture({ includeJoinInfo: false })
  );
  assert.ok(lobby);
  assert.equal(joinInfo, null);
});

test("confirmation fails while the displayed value stays unchanged", () => {
  const { lobby } = getSettings(createFixture());
  assert.equal(
    shared.isEveryoneLobbyOption(
      lobbyAccess.readSettingValue(lobby.control)
    ),
    false
  );
});

test("finds enabled Apply after one setting changes", () => {
  const { dialog } = getSettings(
    createFixture({ lobbyValue: "Everyone", applyEnabled: true })
  );
  assert.equal(
    lobbyAccess.isEnabledControl(
      lobbyAccess.findApplyButton(dialog, visible)
    ),
    true
  );
});

test("finds enabled Apply after both settings change", () => {
  const { dialog } = getSettings(
    createFixture({
      lobbyValue: "Everyone",
      joinInfoValue: "Everyone",
      applyEnabled: true
    })
  );
  assert.equal(
    lobbyAccess.isEnabledControl(
      lobbyAccess.findApplyButton(dialog, visible)
    ),
    true
  );
});

test("keeps Apply disabled when nothing changed", () => {
  const { dialog } = getSettings(
    createFixture({ lobbyValue: "Everyone", joinInfoValue: "Everyone" })
  );
  assert.equal(
    lobbyAccess.isEnabledControl(
      lobbyAccess.findApplyButton(dialog, visible)
    ),
    false
  );
});

test("summarizes Updated, Already configured, Failed, and Stopped", () => {
  assert.deepEqual(
    shared.summarizeLobbyResults(
      [
        { status: "Updated" },
        { status: "Already configured" },
        { status: "Failed" },
        { status: "Stopped" }
      ],
      4
    ),
    {
      found: 4,
      processed: 4,
      updated: 1,
      alreadyConfigured: 1,
      failed: 1,
      stopped: 1,
      progressPercentage: 100
    }
  );
});

test("a failed row does not prevent a later updated row from reporting", () => {
  const summary = shared.summarizeLobbyResults(
    [{ status: "Failed" }, { status: "Updated" }],
    2
  );
  assert.equal(summary.processed, 2);
  assert.equal(summary.failed, 1);
  assert.equal(summary.updated, 1);
});

test("builds CSV with previous and new values for both settings", () => {
  const csv = shared.buildLobbyCsv([
    {
      number: 1,
      title: "L2_0157",
      date: "Tuesday, June 23, 2026",
      time: "2:00 PM to 5:00 PM",
      previousLobbyBypassValue: "People in my org and guests",
      newLobbyBypassValue: "Everyone",
      previousJoinScreenInfoValue: "Users allowed to bypass the lobby",
      newJoinScreenInfoValue: "Everyone",
      status: "Updated",
      error: ""
    }
  ]);

  assert.match(csv, /previousLobbyBypassValue,newLobbyBypassValue/);
  assert.match(csv, /previousJoinScreenInfoValue,newJoinScreenInfoValue/);
  assert.match(csv, /Lobby Access,1,L2_0157/);
});

test("Lobby Access reuses shared filters", () => {
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

test("duplicate-title meetings remain independent", () => {
  const plan = shared.buildMeetingPlanFromDescriptors([
    { key: "same", title: "L2_0157", date: "date", time: "time" },
    { key: "same", title: "L2_0157", date: "date", time: "time" }
  ]);
  assert.deepEqual(plan.map(item => item.occurrence), [0, 1]);
});

test("stop preserves completed rows and marks remaining meetings", () => {
  const plan = [
    { title: "A", date: "date", time: "time" },
    { title: "B", date: "date", time: "time" },
    { title: "C", date: "date", time: "time" }
  ];
  const results = shared.appendStoppedLobbyResults(
    plan,
    [{ title: "A", status: "Updated" }],
    1
  );

  assert.deepEqual(
    results.map(item => item.status),
    ["Updated", "Stopped", "Stopped"]
  );
  assert.equal(results[1].newJoinScreenInfoValue, "Everyone");
});

test("stop during the first dropdown prevents the second setting", async () => {
  const calls = [];

  await assert.rejects(
    shared.runLobbySettingSequence({
      settings: ["lobby", "join-info"],
      shouldStop: () => false,
      updateSetting: async setting => {
        calls.push(setting);
        throw new Error("Automation stopped manually");
      }
    }),
    /stopped manually/
  );
  assert.deepEqual(calls, ["lobby"]);
});

test("stop between both settings prevents the second dropdown", async () => {
  const calls = [];
  let stopped = false;

  await assert.rejects(
    shared.runLobbySettingSequence({
      settings: ["lobby", "join-info"],
      shouldStop: () => stopped,
      updateSetting: async setting => {
        calls.push(setting);
        stopped = true;
        return setting;
      }
    }),
    /stopped manually/
  );
  assert.deepEqual(calls, ["lobby"]);
});

test("uses feature-specific state and message keys", () => {
  assert.equal(
    shared.STORAGE_KEYS.LOBBY_CONFIG,
    "teamsLobbyAccessConfig"
  );
  assert.equal(
    shared.MESSAGE_TYPES.START_LOBBY_AUTOMATION,
    "START_LOBBY_AUTOMATION"
  );
});
