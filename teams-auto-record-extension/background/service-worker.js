importScripts(
  "../shared/constants.js",
  "../shared/utils.js"
);

const shared = globalThis.TeamsAutoRecordShared;
const {
  MESSAGE_TYPES,
  STORAGE_KEYS,
  FEATURES,
  STATUS,
  DEFAULT_CONFIG,
  DEFAULT_LOBBY_CONFIG,
  cloneDefaultState,
  cloneDefaultLobbyState,
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

async function getStoredLobbyConfig() {
  const stored = await chrome.storage.local.get(
    STORAGE_KEYS.LOBBY_CONFIG
  );

  return Object.assign(
    {},
    DEFAULT_LOBBY_CONFIG,
    stored[STORAGE_KEYS.LOBBY_CONFIG] || {}
  );
}

async function getStoredLobbyState() {
  const stored = await chrome.storage.local.get(
    STORAGE_KEYS.LOBBY_STATE
  );
  const state = Object.assign(
    cloneDefaultLobbyState(),
    stored[STORAGE_KEYS.LOBBY_STATE] || {}
  );

  state.counts = Object.assign(
    cloneDefaultLobbyState().counts,
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

async function persistLobbyState(partialState) {
  const current = await getStoredLobbyState();
  const next = Object.assign({}, current, partialState || {});

  next.counts = Object.assign(
    {},
    current.counts,
    partialState?.counts || {}
  );
  next.lastUpdatedAt = new Date().toISOString();

  await chrome.storage.local.set({
    [STORAGE_KEYS.LOBBY_STATE]: next
  });

  try {
    await chrome.runtime.sendMessage({
      type: MESSAGE_TYPES.LOBBY_STATE_UPDATED,
      feature: FEATURES.LOBBY_ACCESS,
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

async function resetLobbyState() {
  return persistLobbyState(cloneDefaultLobbyState());
}

async function ensureDefaults() {
  const config = await getStoredConfig();
  const state = await getStoredState();
  const lobbyConfig = await getStoredLobbyConfig();
  const lobbyState = await getStoredLobbyState();

  await chrome.storage.local.set({
    [STORAGE_KEYS.CONFIG]: config,
    [STORAGE_KEYS.STATE]: state,
    [STORAGE_KEYS.LOBBY_CONFIG]: lobbyConfig,
    [STORAGE_KEYS.LOBBY_STATE]: lobbyState
  });
}

function isTeamsTab(tab) {
  const url = String(tab?.url || "");
  return /^https:\/\/teams\.(microsoft\.com|cloud\.microsoft)\//i.test(
    url
  );
}

async function getActiveTeamsTab() {
  const allTabs = await chrome.tabs.query({});
  const teamsTabs = allTabs.filter(isTeamsTab);

  if (teamsTabs.length === 0) {
    throw new Error(
      "Open Microsoft Teams Web in a browser tab first."
    );
  }

  const rankedTabs = teamsTabs
    .slice()
    .sort((left, right) => {
      const leftScore =
        (left.active ? 100 : 0) +
        (left.highlighted ? 50 : 0) +
        (left.lastAccessed || 0);
      const rightScore =
        (right.active ? 100 : 0) +
        (right.highlighted ? 50 : 0) +
        (right.lastAccessed || 0);

      return rightScore - leftScore;
    });

  return rankedTabs[0];
}

async function ensureContentScript(tabId) {
  await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: [
      "shared/constants.js",
      "shared/utils.js",
      "shared/lobby-utils.js",
      "content/lobby-access.js",
      "content/content.js"
    ]
  });
}

function isPreferredCalendarFrame(url) {
  return /^https:\/\/outlook\.office\.com\/hosted\/calendar\/?/i.test(
    String(url || "")
  );
}

function isSupportedFrameUrl(url) {
  return (
    /^https:\/\/teams\.(microsoft\.com|cloud\.microsoft)\//i.test(
      String(url || "")
    ) ||
    isPreferredCalendarFrame(url)
  );
}

async function getCandidateFrames(tabId) {
  const frames =
    (await chrome.webNavigation.getAllFrames({ tabId })) || [];

  return frames
    .filter(frame => isSupportedFrameUrl(frame.url))
    .sort((left, right) => {
      const leftScore =
        (isPreferredCalendarFrame(left.url) ? 100 : 0) +
        (left.frameId === 0 ? 0 : 10);
      const rightScore =
        (isPreferredCalendarFrame(right.url) ? 100 : 0) +
        (right.frameId === 0 ? 0 : 10);
      return rightScore - leftScore;
    });
}

async function sendToTab(tabId, message, frameId) {
  await ensureContentScript(tabId);
  return chrome.tabs.sendMessage(tabId, message, {
    frameId
  });
}

async function sendToCalendarFrame(tabId, message) {
  const frames = await getCandidateFrames(tabId);
  let lastError = null;

  for (const frame of frames) {
    try {
      const response = await sendToTab(
        tabId,
        message,
        frame.frameId
      );

      if (response?.ok) {
        return {
          frameId: frame.frameId,
          response
        };
      }

      if (
        response?.errorCode === "UNSUPPORTED_CONTEXT"
      ) {
        continue;
      }

      lastError = new Error(
        response?.error || "Frame request failed."
      );
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw new Error(
    "Could not find the embedded Teams calendar frame."
  );
}

async function handlePreview(rawConfig) {
  const lobbyState = await getStoredLobbyState();
  if (lobbyState.running) {
    throw new Error(
      "Lobby Access automation is currently running."
    );
  }

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
    activeFrameId: null,
    warning: "",
    lastError: "",
    previewPlan: [],
    results: []
  });

  const result = await sendToCalendarFrame(tab.id, {
    type: MESSAGE_TYPES.PREVIEW_MEETINGS,
    config
  });

  await persistState({
    activeFrameId: result.frameId
  });

  return result.response;
}

async function handleStart(rawConfig) {
  const currentState = await getStoredState();
  const lobbyState = await getStoredLobbyState();
  if (currentState.running) {
    throw new Error("Automation is already running.");
  }
  if (lobbyState.running) {
    throw new Error(
      "Lobby Access automation is currently running."
    );
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
    activeFrameId: null,
    warning: "",
    lastError: "",
    currentMeetingTitle: "",
    previewPlan: [],
    results: []
  });

  const result = await sendToCalendarFrame(tab.id, {
    type: MESSAGE_TYPES.START_AUTOMATION,
    config: normalizedConfig
  });

  await persistState({
    activeFrameId: result.frameId
  });

  return result.response;
}

async function handleStop() {
  const currentState = await getStoredState();
  const tabId = currentState.activeTabId;
  const frameId = currentState.activeFrameId;

  if (!tabId) {
    throw new Error("No active automation tab found.");
  }

  await persistState({
    status: STATUS.STOPPING,
    stopRequested: true,
    warning:
      "Stop requested. Waiting for the current step to finish."
  });

  if (typeof frameId !== "number") {
    throw new Error(
      "No active calendar frame is currently attached."
    );
  }

  return sendToTab(tabId, {
    type: MESSAGE_TYPES.STOP_AUTOMATION
  }, frameId);
}

async function handleLobbyPreview(rawConfig) {
  const autoState = await getStoredState();
  if (autoState.running) {
    throw new Error(
      "Auto Recording automation is currently running."
    );
  }

  const tab = await getActiveTeamsTab();
  const config = Object.assign(
    {},
    DEFAULT_LOBBY_CONFIG,
    rawConfig || {}
  );
  await chrome.storage.local.set({
    [STORAGE_KEYS.LOBBY_CONFIG]: config
  });

  await persistLobbyState({
    status: STATUS.PREVIEWING,
    running: false,
    activeTabId: tab.id,
    activeFrameId: null,
    warning: "",
    lastError: "",
    previewPlan: [],
    results: []
  });

  const result = await sendToCalendarFrame(tab.id, {
    type: MESSAGE_TYPES.PREVIEW_LOBBY_MEETINGS,
    config
  });

  await persistLobbyState({ activeFrameId: result.frameId });
  return result.response;
}

async function handleLobbyStart(rawConfig) {
  const autoState = await getStoredState();
  const currentState = await getStoredLobbyState();

  if (currentState.running) {
    throw new Error("Lobby Access automation is already running.");
  }
  if (autoState.running) {
    throw new Error(
      "Auto Recording automation is currently running."
    );
  }

  const tab = await getActiveTeamsTab();
  const normalizedConfig = normalizeConfig(rawConfig);
  const storedConfig = Object.assign(
    {},
    DEFAULT_LOBBY_CONFIG,
    rawConfig || {}
  );
  await chrome.storage.local.set({
    [STORAGE_KEYS.LOBBY_CONFIG]: storedConfig
  });

  await persistLobbyState({
    status: STATUS.RUNNING,
    running: true,
    stopRequested: false,
    activeTabId: tab.id,
    activeFrameId: null,
    warning: "",
    lastError: "",
    currentMeetingTitle: "",
    previewPlan: [],
    results: []
  });

  const result = await sendToCalendarFrame(tab.id, {
    type: MESSAGE_TYPES.START_LOBBY_AUTOMATION,
    config: normalizedConfig
  });

  await persistLobbyState({ activeFrameId: result.frameId });
  return result.response;
}

async function handleLobbyStop() {
  const currentState = await getStoredLobbyState();
  const tabId = currentState.activeTabId;
  const frameId = currentState.activeFrameId;

  if (!tabId) {
    throw new Error("No active Lobby Access tab found.");
  }

  await persistLobbyState({
    status: STATUS.STOPPING,
    stopRequested: true,
    warning:
      "Stop requested. Waiting for the current step to finish."
  });

  if (typeof frameId !== "number") {
    throw new Error(
      "No active calendar frame is currently attached."
    );
  }

  return sendToTab(
    tabId,
    { type: MESSAGE_TYPES.STOP_LOBBY_AUTOMATION },
    frameId
  );
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
      const persist =
        message.feature === FEATURES.LOBBY_ACCESS
          ? persistLobbyState
          : persistState;
      persist(
        Object.assign({}, message.state || {}, {
          activeTabId:
            sender.tab?.id ?? message.state?.activeTabId ?? null,
          activeFrameId:
            sender.frameId ?? message.state?.activeFrameId ?? null
        })
      );
      return false;
    }

    if (message.type === MESSAGE_TYPES.GET_STATE) {
      Promise.all([
        getStoredConfig(),
        getStoredState(),
        getStoredLobbyConfig(),
        getStoredLobbyState()
      ])
        .then(([config, state, lobbyConfig, lobbyState]) => {
          sendResponse({
            ok: true,
            config,
            state,
            lobbyConfig,
            lobbyState
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

    if (message.type === MESSAGE_TYPES.CLEAR_LOBBY_RESULTS) {
      resetLobbyState()
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

    if (
      message.type === MESSAGE_TYPES.PREVIEW_LOBBY_MEETINGS
    ) {
      handleLobbyPreview(message.config)
        .then(response => {
          sendResponse(response);
        })
        .catch(error => {
          persistLobbyState({
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

    if (
      message.type === MESSAGE_TYPES.START_LOBBY_AUTOMATION
    ) {
      handleLobbyStart(message.config)
        .then(response => {
          sendResponse(response);
        })
        .catch(error => {
          persistLobbyState({
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

    if (
      message.type === MESSAGE_TYPES.STOP_LOBBY_AUTOMATION
    ) {
      handleLobbyStop()
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
