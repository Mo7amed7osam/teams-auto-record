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
    "Already Everyone"
  );
  assert.equal(
    document.getElementById("startButton").textContent,
    "Start lobby access"
  );
});
