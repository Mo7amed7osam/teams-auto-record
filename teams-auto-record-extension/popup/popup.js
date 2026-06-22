(function runPopup() {
  const shared = globalThis.TeamsAutoRecordShared;
  const {
    MESSAGE_TYPES,
    STORAGE_KEYS,
    FEATURES,
    STATUS,
    STATUS_LABELS,
    DEFAULT_CONFIG,
    DEFAULT_LOBBY_CONFIG,
    cloneDefaultState,
    cloneDefaultLobbyState,
    normalizeConfig,
    buildCsv,
    buildLobbyCsv
  } = shared;

  const featureSettings = {
    [FEATURES.AUTO_RECORDING]: {
      tabId: "autoRecordingTab",
      storageKey: STORAGE_KEYS.CONFIG,
      defaultConfig: DEFAULT_CONFIG,
      previewMessage: MESSAGE_TYPES.PREVIEW_MEETINGS,
      startMessage: MESSAGE_TYPES.START_AUTOMATION,
      stopMessage: MESSAGE_TYPES.STOP_AUTOMATION,
      clearMessage: MESSAGE_TYPES.CLEAR_RESULTS,
      updatedMessage: MESSAGE_TYPES.STATE_UPDATED,
      subtitle:
        "Preview meetings first, then update only automatic recording and transcription.",
      startLabel: "Start auto recording",
      alreadyLabel: "Already enabled",
      alreadyCountKey: "alreadyEnabled",
      filename: "teams-auto-record-report.csv",
      buildReport: buildCsv
    },
    [FEATURES.LOBBY_ACCESS]: {
      tabId: "lobbyAccessTab",
      storageKey: STORAGE_KEYS.LOBBY_CONFIG,
      defaultConfig: DEFAULT_LOBBY_CONFIG,
      previewMessage: MESSAGE_TYPES.PREVIEW_LOBBY_MEETINGS,
      startMessage: MESSAGE_TYPES.START_LOBBY_AUTOMATION,
      stopMessage: MESSAGE_TYPES.STOP_LOBBY_AUTOMATION,
      clearMessage: MESSAGE_TYPES.CLEAR_LOBBY_RESULTS,
      updatedMessage: MESSAGE_TYPES.LOBBY_STATE_UPDATED,
      subtitle:
        "Preview meetings first, then change only who can bypass the lobby.",
      startLabel: "Start lobby access",
      alreadyLabel: "Already Everyone",
      alreadyCountKey: "alreadyEveryone",
      filename: "teams-lobby-access-report.csv",
      buildReport: buildLobbyCsv
    }
  };

  const elements = {};
  const configs = {
    [FEATURES.AUTO_RECORDING]: Object.assign({}, DEFAULT_CONFIG),
    [FEATURES.LOBBY_ACCESS]: Object.assign(
      {},
      DEFAULT_LOBBY_CONFIG
    )
  };
  const states = {
    [FEATURES.AUTO_RECORDING]: cloneDefaultState(),
    [FEATURES.LOBBY_ACCESS]: cloneDefaultLobbyState()
  };

  let activeFeature = FEATURES.AUTO_RECORDING;
  let uiBusy = false;

  function byId(id) {
    return document.getElementById(id);
  }

  function activeSettings() {
    return featureSettings[activeFeature];
  }

  function activeState() {
    return states[activeFeature];
  }

  function getLimitSelection(config) {
    if (config.limit === 3) {
      return { mode: "3", count: "" };
    }

    if (typeof config.limit === "number") {
      return { mode: "custom", count: String(config.limit) };
    }

    return { mode: "all", count: "" };
  }

  function applyConfig(config) {
    const merged = Object.assign(
      {},
      activeSettings().defaultConfig,
      config
    );
    const limitSelection = getLimitSelection(merged);

    elements.targetDate.value = merged.targetDate || "";
    elements.startTime.value = merged.startTime;
    elements.endTime.value = merged.endTime;
    elements.titleIncludes.value = merged.titleIncludes || "";
    elements.titleExcludes.value = merged.titleExcludes || "";
    elements.limitMode.value = limitSelection.mode;
    elements.limitCount.value = limitSelection.count;
    elements.previewOnly.checked = Boolean(merged.previewOnly);
    elements.retriesPerMeeting.value = merged.retriesPerMeeting;
    elements.delayBetweenMeetingsMs.value =
      merged.delayBetweenMeetingsMs;
    elements.pauseEvery.value = merged.pauseEvery;
    elements.pauseDurationMs.value = merged.pauseDurationMs;
    elements.timeoutMs.value = merged.timeoutMs;
    toggleCustomLimit();
  }

  function readConfigFromForm() {
    const limitMode = elements.limitMode.value;
    let limit = null;

    if (limitMode === "3") {
      limit = 3;
    } else if (limitMode === "custom") {
      limit = Number.parseInt(elements.limitCount.value, 10);
      if (!Number.isFinite(limit) || limit <= 0) {
        limit = null;
      }
    }

    return {
      targetDate: elements.targetDate.value,
      startTime: elements.startTime.value,
      endTime: elements.endTime.value,
      titleIncludes: elements.titleIncludes.value,
      titleExcludes: elements.titleExcludes.value,
      limit,
      previewOnly: elements.previewOnly.checked,
      retriesPerMeeting: Number.parseInt(
        elements.retriesPerMeeting.value,
        10
      ),
      delayBetweenMeetingsMs: Number.parseInt(
        elements.delayBetweenMeetingsMs.value,
        10
      ),
      pauseEvery: Number.parseInt(elements.pauseEvery.value, 10),
      pauseDurationMs: Number.parseInt(
        elements.pauseDurationMs.value,
        10
      ),
      timeoutMs: Number.parseInt(elements.timeoutMs.value, 10),
      desiredLobbyValue:
        activeFeature === FEATURES.LOBBY_ACCESS
          ? shared.EVERYONE_VALUE
          : undefined
    };
  }

  async function saveConfig() {
    const config = readConfigFromForm();
    configs[activeFeature] = config;
    await chrome.storage.local.set({
      [activeSettings().storageKey]: config
    });
    return config;
  }

  function setFeedback(element, text) {
    element.textContent = text || "";
    element.classList.toggle("show", Boolean(text));
  }

  function clearMessages() {
    setFeedback(elements.message, "");
    setFeedback(elements.warning, "");
    setFeedback(elements.error, "");
  }

  function anyAutomationRunning() {
    return Object.values(states).some(state => state.running);
  }

  function updateActionState() {
    const running = Boolean(activeState()?.running);
    const anyRunning = anyAutomationRunning();

    elements.previewButton.disabled = uiBusy || anyRunning;
    elements.startButton.disabled = uiBusy || anyRunning;
    elements.stopButton.disabled = uiBusy || !running;
    elements.clearButton.disabled = uiBusy || anyRunning;
    elements.exportButton.disabled =
      uiBusy || !activeState()?.results?.length;
  }

  function toggleCustomLimit() {
    elements.limitCountWrap.classList.toggle(
      "hidden",
      elements.limitMode.value !== "custom"
    );
  }

  function renderReport(results) {
    const rows = results || [];
    elements.reportBody.innerHTML = "";
    elements.reportCount.textContent = `${rows.length} rows`;

    if (rows.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.textContent = "No preview or automation results yet.";
      row.appendChild(cell);
      elements.reportBody.appendChild(row);
      return;
    }

    rows.forEach(item => {
      const row = document.createElement("tr");
      [
        item.number,
        item.title,
        item.date,
        item.time,
        item.status,
        item.error
      ].forEach(value => {
        const cell = document.createElement("td");
        cell.textContent = value || "";
        row.appendChild(cell);
      });
      elements.reportBody.appendChild(row);
    });
  }

  function renderState(state) {
    const current = state || activeState();
    const settings = activeSettings();
    const counts = current.counts || {};
    const progress = current.progressPercentage ?? 0;

    states[activeFeature] = current;
    elements.statusBadge.textContent =
      STATUS_LABELS[current.status] || STATUS_LABELS[STATUS.IDLE];
    elements.meetingsFound.textContent = counts.found ?? 0;
    elements.meetingsProcessed.textContent = counts.processed ?? 0;
    elements.updatedCount.textContent = counts.updated ?? 0;
    elements.alreadyEnabledCount.textContent =
      counts[settings.alreadyCountKey] ?? 0;
    elements.failedCount.textContent = counts.failed ?? 0;
    elements.currentMeeting.textContent =
      current.currentMeetingTitle || "None";
    elements.progressText.textContent = `${progress}%`;
    elements.progressFill.style.width = `${progress}%`;
    elements.progressTrack.setAttribute(
      "aria-valuenow",
      String(progress)
    );
    setFeedback(elements.warning, current.warning);
    setFeedback(elements.error, current.lastError);
    renderReport(current.results || []);
    updateActionState();
  }

  function renderFeature() {
    const settings = activeSettings();
    const isLobby = activeFeature === FEATURES.LOBBY_ACCESS;

    Object.entries(featureSettings).forEach(([feature, item]) => {
      const tab = byId(item.tabId);
      const selected = feature === activeFeature;
      tab.classList.toggle("active", selected);
      tab.setAttribute("aria-selected", String(selected));
    });

    elements.featurePanel.setAttribute(
      "aria-labelledby",
      settings.tabId
    );
    elements.featureSubtitle.textContent = settings.subtitle;
    elements.startButton.textContent = settings.startLabel;
    elements.alreadyCountLabel.textContent = settings.alreadyLabel;
    elements.desiredAction.classList.toggle("hidden", !isLobby);
    applyConfig(configs[activeFeature]);
    clearMessages();
    renderState(states[activeFeature]);
  }

  async function sendMessage(message) {
    const response = await chrome.runtime.sendMessage(message);
    if (!response?.ok) {
      throw new Error(response?.error || "Request failed.");
    }
    return response;
  }

  async function refreshState() {
    const response = await sendMessage({
      type: MESSAGE_TYPES.GET_STATE
    });
    configs[FEATURES.AUTO_RECORDING] =
      response.config || DEFAULT_CONFIG;
    configs[FEATURES.LOBBY_ACCESS] =
      response.lobbyConfig || DEFAULT_LOBBY_CONFIG;
    states[FEATURES.AUTO_RECORDING] =
      response.state || cloneDefaultState();
    states[FEATURES.LOBBY_ACCESS] =
      response.lobbyState || cloneDefaultLobbyState();
    renderFeature();
  }

  async function handlePreview() {
    clearMessages();
    uiBusy = true;
    updateActionState();

    try {
      const config = await saveConfig();
      const response = await sendMessage({
        type: activeSettings().previewMessage,
        config
      });
      states[activeFeature] =
        response.snapshot || states[activeFeature];
      renderState(states[activeFeature]);
      setFeedback(
        elements.message,
        `Preview found ${response.plan.length} matching meetings.`
      );
    } catch (error) {
      setFeedback(elements.error, error.message);
    } finally {
      uiBusy = false;
      updateActionState();
    }
  }

  async function handleStart() {
    clearMessages();
    uiBusy = true;
    updateActionState();

    try {
      const rawConfig = await saveConfig();
      const config = normalizeConfig(rawConfig);

      if (!config.previewOnly) {
        const preview = await sendMessage({
          type: activeSettings().previewMessage,
          config: rawConfig
        });
        states[activeFeature] =
          preview.snapshot || states[activeFeature];
        renderState(states[activeFeature]);

        const found = preview.plan.length;
        if (found === 0) {
          setFeedback(
            elements.error,
            "No matching meetings were found."
          );
          return;
        }

        const action =
          activeFeature === FEATURES.LOBBY_ACCESS
            ? "set lobby bypass to Everyone"
            : "enable automatic recording and transcription";
        const warningLine =
          found > 20
            ? `\nWarning: ${found} meetings will be processed.`
            : "";
        const confirmed = window.confirm(
          `Preview found ${found} matching meetings.${warningLine}\n\nContinue and ${action}?`
        );

        if (!confirmed) {
          setFeedback(
            elements.message,
            "Automation cancelled before any meeting was changed."
          );
          return;
        }
      }

      await sendMessage({
        type: activeSettings().startMessage,
        config: rawConfig
      });
      setFeedback(
        elements.message,
        config.previewOnly
          ? "Preview-only run started."
          : "Automation started."
      );
      await refreshState();
    } catch (error) {
      setFeedback(elements.error, error.message);
    } finally {
      uiBusy = false;
      updateActionState();
    }
  }

  async function handleStop() {
    clearMessages();
    uiBusy = true;
    updateActionState();

    try {
      await sendMessage({ type: activeSettings().stopMessage });
      setFeedback(elements.message, "Stop requested.");
      await refreshState();
    } catch (error) {
      setFeedback(elements.error, error.message);
    } finally {
      uiBusy = false;
      updateActionState();
    }
  }

  async function handleClear() {
    clearMessages();
    uiBusy = true;
    updateActionState();

    try {
      const response = await sendMessage({
        type: activeSettings().clearMessage
      });
      states[activeFeature] = response.state;
      renderState(response.state);
      setFeedback(elements.message, "Report cleared.");
    } catch (error) {
      setFeedback(elements.error, error.message);
    } finally {
      uiBusy = false;
      updateActionState();
    }
  }

  function handleExport() {
    const results = activeState()?.results || [];
    if (results.length === 0) {
      setFeedback(
        elements.error,
        "There are no results to export."
      );
      return;
    }

    const settings = activeSettings();
    const csv = settings.buildReport(results);
    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = settings.filename;
    link.click();
    URL.revokeObjectURL(url);
    setFeedback(elements.message, "CSV export downloaded.");
  }

  function bindInputs() {
    [
      elements.targetDate,
      elements.startTime,
      elements.endTime,
      elements.titleIncludes,
      elements.titleExcludes,
      elements.limitMode,
      elements.limitCount,
      elements.previewOnly,
      elements.retriesPerMeeting,
      elements.delayBetweenMeetingsMs,
      elements.pauseEvery,
      elements.pauseDurationMs,
      elements.timeoutMs
    ].forEach(element => {
      element.addEventListener("change", async () => {
        toggleCustomLimit();
        await saveConfig();
      });
    });
  }

  function captureElements() {
    [
      "featurePanel",
      "featureSubtitle",
      "desiredAction",
      "alreadyCountLabel",
      "targetDate",
      "startTime",
      "endTime",
      "titleIncludes",
      "titleExcludes",
      "limitMode",
      "limitCountWrap",
      "limitCount",
      "previewOnly",
      "retriesPerMeeting",
      "delayBetweenMeetingsMs",
      "pauseEvery",
      "pauseDurationMs",
      "timeoutMs",
      "previewButton",
      "startButton",
      "stopButton",
      "clearButton",
      "exportButton",
      "message",
      "statusBadge",
      "meetingsFound",
      "meetingsProcessed",
      "updatedCount",
      "alreadyEnabledCount",
      "failedCount",
      "currentMeeting",
      "progressText",
      "progressFill",
      "progressTrack",
      "warning",
      "error",
      "reportCount",
      "reportBody"
    ].forEach(id => {
      elements[id] = byId(id);
    });
  }

  function bindButtons() {
    elements.previewButton.addEventListener("click", handlePreview);
    elements.startButton.addEventListener("click", handleStart);
    elements.stopButton.addEventListener("click", handleStop);
    elements.clearButton.addEventListener("click", handleClear);
    elements.exportButton.addEventListener("click", handleExport);

    document.querySelectorAll("[data-feature]").forEach(tab => {
      tab.addEventListener("click", () => {
        activeFeature = tab.dataset.feature;
        renderFeature();
      });
    });
  }

  chrome.runtime.onMessage.addListener(message => {
    const feature = Object.entries(featureSettings).find(
      ([, settings]) => settings.updatedMessage === message?.type
    )?.[0];

    if (!feature) {
      return;
    }

    states[feature] = message.state;
    if (feature === activeFeature) {
      renderState(message.state);
    } else {
      updateActionState();
    }
  });

  document.addEventListener("DOMContentLoaded", async () => {
    captureElements();
    bindInputs();
    bindButtons();
    await refreshState();
  });
})();
