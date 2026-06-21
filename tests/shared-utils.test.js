const test = require("node:test");
const assert = require("node:assert/strict");

require("../teams-auto-record-extension/shared/constants.js");
const shared = require("../teams-auto-record-extension/shared/utils.js");

test("formatDateForTeamsLabel converts ISO date", () => {
  assert.equal(
    shared.formatDateForTeamsLabel("2026-06-23"),
    "Tuesday, June 23, 2026"
  );
});

test("parseMeetingLabel extracts title, time, and date", () => {
  const parsed = shared.parseMeetingLabel(
    "L1_0172, 2:00 PM to 5:00 PM, Tuesday, June 23, 2026, Microsoft Teams Meeting, Busy"
  );

  assert.equal(parsed.title, "L1_0172");
  assert.equal(parsed.time, "2:00 PM to 5:00 PM");
  assert.equal(parsed.date, "Tuesday, June 23, 2026");
});

test("matchesMeetingLabel respects include and exclude filters", () => {
  const config = shared.normalizeConfig({
    targetDate: "2026-06-23",
    startTime: "2:00 PM",
    endTime: "5:00 PM",
    titleIncludes: "L1_, Shift",
    titleExcludes: "Cancelled"
  });

  assert.equal(
    shared.matchesMeetingLabel(
      "L1_0172, 2:00 PM to 5:00 PM, Tuesday, June 23, 2026, Microsoft Teams Meeting, Busy",
      config
    ),
    true
  );

  assert.equal(
    shared.matchesMeetingLabel(
      "Cancelled L1_0172, 2:00 PM to 5:00 PM, Tuesday, June 23, 2026, Microsoft Teams Meeting, Busy",
      config
    ),
    false
  );
});

test("matchesMeetingLabel supports 24-hour time ranges", () => {
  const config = shared.normalizeConfig({
    targetDate: "2026-06-23",
    startTime: "2:00 PM",
    endTime: "5:00 PM"
  });

  assert.equal(
    shared.matchesMeetingLabel(
      "L1_0172, 14:00 to 17:00, Tuesday, June 23, 2026, Busy",
      config
    ),
    true
  );
});

test("applyLimit returns the first n items when configured", () => {
  assert.deepEqual(
    shared.applyLimit([1, 2, 3, 4], 3),
    [1, 2, 3]
  );
  assert.deepEqual(
    shared.applyLimit([1, 2, 3], null),
    [1, 2, 3]
  );
});

test("summarizeResults counts statuses correctly", () => {
  const summary = shared.summarizeResults(
    [
      { status: "Updated" },
      { status: "Already enabled" },
      { status: "Failed" }
    ],
    4
  );

  assert.deepEqual(summary, {
    found: 4,
    processed: 3,
    updated: 1,
    alreadyEnabled: 1,
    failed: 1,
    progressPercentage: 75
  });
});

test("buildCsv escapes commas and quotes", () => {
  const csv = shared.buildCsv([
    {
      number: 1,
      title: 'L1 "Ops", Shift',
      date: "Tuesday, June 23, 2026",
      time: "2:00 PM to 5:00 PM",
      status: "Updated",
      error: ""
    }
  ]);

  assert.match(csv, /^number,title,date,time,status,error/);
  assert.match(csv, /"L1 ""Ops"", Shift"/);
});
