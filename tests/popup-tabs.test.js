const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");

const extensionRoot = path.resolve(
  __dirname,
  "../teams-auto-record-extension"
);

function script(relativePath) {
  return readFileSync(path.join(extensionRoot, relativePath), "utf8");
}

async function createPopup() {
  const html = script("popup/popup.html");
  const dom = new JSDOM(html, {
    runScripts: "outside-only",
    url: "https://extension.test/popup/popup.html"
  });
  const listeners = [];

  dom.window.chrome = {
    storage: {
      local: {
        set: async () => {}
      }
    },
    runtime: {
      sendMessage: async message => {
        if (message.type !== "GET_STATE") {
          return { ok: true, plan: [], state: {} };
        }

        return {
          ok: true,
          config: { titleIncludes: "recording-only" },
          state: null,
          lobbyConfig: { titleIncludes: "lobby-only" },
          lobbyState: null
        };
      },
      onMessage: {
        addListener: listener => listeners.push(listener)
      }
    }
  };
  dom.window.confirm = () => false;

  dom.window.eval(script("shared/constants.js"));
  dom.window.eval(script("shared/utils.js"));
  dom.window.eval(script("shared/lobby-utils.js"));
  dom.window.eval(script("popup/popup.js"));
  dom.window.document.dispatchEvent(
    new dom.window.Event("DOMContentLoaded")
  );
  await new Promise(resolve => setTimeout(resolve, 0));

  dom.runtimeListeners = listeners;
  return dom;
}

test("popup switches between independent feature tabs", async () => {
  const dom = await createPopup();
  const document = dom.window.document;
  const autoTab = document.getElementById("autoRecordingTab");
  const lobbyTab = document.getElementById("lobbyAccessTab");
  const titleFilter = document.getElementById("titleIncludes");

  assert.equal(autoTab.getAttribute("aria-selected"), "true");
  assert.equal(titleFilter.value, "recording-only");

  lobbyTab.click();

  assert.equal(lobbyTab.getAttribute("aria-selected"), "true");
  assert.equal(autoTab.getAttribute("aria-selected"), "false");
  assert.equal(titleFilter.value, "lobby-only");
  assert.equal(
    document.getElementById("desiredAction").classList.contains("hidden"),
    false
  );
  assert.equal(
    document.getElementById("alreadyCountLabel").textContent,
    "Already configured"
  );
  assert.equal(
    document.getElementById("startButton").textContent,
    "Start lobby access"
  );
  assert.match(
    document.getElementById("desiredAction").textContent,
    /Who can bypass the lobby.*Everyone/s
  );
  assert.match(
    document.getElementById("desiredAction").textContent,
    /Show meeting info on join screen.*Everyone/s
  );
  assert.equal(
    document.querySelectorAll("[data-lobby-column]:not(.hidden)").length,
    4
  );
});

test("popup renders both Lobby Access setting values", async () => {
  const dom = await createPopup();
  const document = dom.window.document;
  document.getElementById("lobbyAccessTab").click();

  dom.runtimeListeners[0]({
    type: "LOBBY_STATE_UPDATED",
    state: {
      status: "complete",
      running: false,
      counts: {
        found: 1,
        processed: 1,
        updated: 1,
        alreadyConfigured: 0,
        failed: 0
      },
      progressPercentage: 100,
      results: [
        {
          number: 1,
          title: "L1_0172",
          date: "Tuesday, June 23, 2026",
          time: "14:00 to 17:00",
          previousLobbyBypassValue: "People in my org and guests",
          newLobbyBypassValue: "Everyone",
          previousJoinScreenInfoValue:
            "Users allowed to bypass the lobby",
          newJoinScreenInfoValue: "Everyone",
          status: "Updated",
          error: ""
        }
      ]
    }
  });

  const cells = [
    ...document.querySelectorAll("#reportBody tr:first-child td")
  ].map(cell => cell.textContent);
  assert.equal(cells.length, 10);
  assert.equal(cells[4], "People in my org and guests");
  assert.equal(cells[6], "Users allowed to bypass the lobby");
  assert.equal(cells[8], "Updated");
});
