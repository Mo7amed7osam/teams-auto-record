importScripts(
  "../shared/constants.js",
  "../shared/utils.js"
);

const shared = globalThis.TeamsAutoRecordShared;
const {
  MESSAGE_TYPES,
  STORAGE_KEYS,
  STATUS,
  DEFAULT_CONFIG,
  cloneDefaultState,
  normalizeConfig
} = shared;

async function getStoredConfig() {
  const stored = await chrome.storage.local.get(
    STORAGE_KEYS.CONFIG
  );

  return Object.assign(
    {},
    DEFAULT_CONFIG,
    stored[STORAGE_KEYS.CONFIG] || {}
  );
}

async function getStoredState() {
  const stored = await chrome.storage.local.get(
    STORAGE_KEYS.STATE
  );
  const state = Object.assign(
    cloneDefaultState(),
    stored[STORAGE_KEYS.STATE] || {}
  );

  state.counts = Object.assign(
    cloneDefaultState().counts,
    state.counts || {}
  );

  return state;
}

async function persistState(partialState) {
  const current = await getStoredState();
  const next = Object.assign({}, current, partialState || {});

  next.counts = Object.assign(
    {},
    current.counts,
    partialState?.counts || {}
  );
  next.lastUpdatedAt = new Date().toISOString();

  await chrome.storage.local.set({
    [STORAGE_KEYS.STATE]: next
  });

  try {
    await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.STATE_UPDATED,
      state: next
    });
  } catch (error) {
    void error;
  }

  return next;
}

async function resetState() {
  return persistState(cloneDefaultState());
}

async function ensureDefaults() {
  const config = await getStoredConfig();
  const state = await getStoredState();

  await chrome.storage.local.set({
    [STORAGE_KEYS.CONFIG]: config,
    [STORAGE_KEYS.STATE]: state
  });
}

async function getActiveTeamsTab() {
  const tabs = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });
  const tab = tabs[0];

  if (
    !tab ||
    !String(tab.url || "").startsWith(
      "https://teams.microsoft.com/"
    )
  ) {
    throw new Error(
      "Open Microsoft Teams Web in the active tab first."
    );
  }

  return tab;
}

async function ensureContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: [
      "shared/constants.js",
      "shared/utils.js",
      "content/content.js"
    ]
  });
}

async function sendToTab(tabId, message) {
  await ensureContentScript(tabId);
  return chrome.tabs.sendMessage(tabId, message);
}

async function handlePreview(rawConfig) {
  const tab = await getActiveTeamsTab();
  const config = Object.assign(
    {},
    DEFAULT_CONFIG,
    rawConfig || {}
  );
  await chrome.storage.local.set({
    [STORAGE_KEYS.CONFIG]: config
  });

  await persistState({
    status: STATUS.PREVIEWING,
    running: false,
    activeTabId: tab.id,
    warning: "",
    lastError: "",
    previewPlan: [],
    results: []
  });

  return sendToTab(tab.id, {
    type: MESSAGE_TYPES.PREVIEW_MEETINGS,
    config
  });
}

async function handleStart(rawConfig) {
  const currentState = await getStoredState();
  if (currentState.running) {
    throw new Error("Automation is already running.");
  }

  const tab = await getActiveTeamsTab();
  const normalizedConfig = normalizeConfig(rawConfig);
  const storedConfig = Object.assign(
    {},
    DEFAULT_CONFIG,
    rawConfig || {}
  );
  await chrome.storage.local.set({
    [STORAGE_KEYS.CONFIG]: storedConfig
  });

  await persistState({
    status: STATUS.RUNNING,
    running: true,
    stopRequested: false,
    activeTabId: tab.id,
    warning: "",
    lastError: "",
    currentMeetingTitle: "",
    previewPlan: [],
    results: []
  });

  return sendToTab(tab.id, {
    type: MESSAGE_TYPES.START_AUTOMATION,
    config: normalizedConfig
  });
}

async function handleStop() {
  const currentState = await getStoredState();
  const tabId = currentState.activeTabId;

  if (!tabId) {
    throw new Error("No active automation tab found.");
  }

  await persistState({
    status: STATUS.STOPPING,
    stopRequested: true,
    warning:
      "Stop requested. Waiting for the current step to finish."
  });

  return sendToTab(tabId, {
    type: MESSAGE_TYPES.STOP_AUTOMATION
  });
}

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaults();
});

chrome.runtime.onStartup.addListener(() => {
  ensureDefaults();
});

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {
    if (!message?.type) {
      return false;
    }

    if (message.source === "content") {
      persistState(
        Object.assign({}, message.state || {}, {
          activeTabId:
            sender.tab?.id ?? message.state?.activeTabId ?? null
        })
      );
      return false;
    }

    if (message.type === MESSAGE_TYPES.GET_STATE) {
      Promise.all([getStoredConfig(), getStoredState()])
        .then(([config, state]) => {
          sendResponse({
            ok: true,
            config,
            state
          });
        })
        .catch(error => {
          sendResponse({
            ok: false,
            error: error.message
          });
        });
      return true;
    }

    if (message.type === MESSAGE_TYPES.CLEAR_RESULTS) {
      resetState()
        .then(state => {
          sendResponse({ ok: true, state });
        })
        .catch(error => {
          sendResponse({
            ok: false,
            error: error.message
          });
        });
      return true;
    }

    if (message.type === MESSAGE_TYPES.PREVIEW_MEETINGS) {
      handlePreview(message.config)
        .then(response => {
          sendResponse(response);
        })
        .catch(error => {
          persistState({
            status: STATUS.ERROR,
            running: false,
            lastError: error.message
          });
          sendResponse({
            ok: false,
            error: error.message
          });
        });
      return true;
    }

    if (message.type === MESSAGE_TYPES.START_AUTOMATION) {
      handleStart(message.config)
        .then(response => {
          sendResponse(response);
        })
        .catch(error => {
          persistState({
            status: STATUS.ERROR,
            running: false,
            lastError: error.message
          });
          sendResponse({
            ok: false,
            error: error.message
          });
        });
      return true;
    }

    if (message.type === MESSAGE_TYPES.STOP_AUTOMATION) {
      handleStop()
        .then(response => {
          sendResponse(response);
        })
        .catch(error => {
          sendResponse({
            ok: false,
            error: error.message
          });
        });
      return true;
    }

    return false;
  }
);
