(function runPopup() {
  const shared = globalThis.TeamsAutoRecordShared;
  const {
    MESSAGE_TYPES,
    STORAGE_KEYS,
    STATUS,
    STATUS_LABELS,
    DEFAULT_CONFIG,
    normalizeConfig,
    buildCsv
  } = shared;

  const elements = {};
  let uiBusy = false;
  let lastState = null;

  function byId(id) {
    return document.getElementById(id);
  }

  function getLimitSelection(config) {
    if (config.limit === 3) {
      return { mode: "3", count: "" };
    }

    if (typeof config.limit === "number") {
      return {
        mode: "custom",
        count: String(config.limit)
      };
    }

    return { mode: "all", count: "" };
  }

  function applyConfig(config) {
    const merged = Object.assign({}, DEFAULT_CONFIG, config);
    const limitSelection = getLimitSelection(merged);

    elements.targetDate.value = merged.targetDate || "";
    elements.startTime.value = merged.startTime;
    elements.endTime.value = merged.endTime;
    elements.titleIncludes.value =
      merged.titleIncludes || "";
    elements.titleExcludes.value =
      merged.titleExcludes || "";
    elements.limitMode.value = limitSelection.mode;
    elements.limitCount.value = limitSelection.count;
    elements.previewOnly.checked =
      Boolean(merged.previewOnly);
    elements.retriesPerMeeting.value =
      merged.retriesPerMeeting;
    elements.delayBetweenMeetingsMs.value =
      merged.delayBetweenMeetingsMs;
    elements.pauseEvery.value = merged.pauseEvery;
    elements.pauseDurationMs.value =
      merged.pauseDurationMs;
    elements.timeoutMs.value = merged.timeoutMs;

    toggleCustomLimit();
  }

  function readConfigFromForm() {
    const limitMode = elements.limitMode.value;
    let limit = null;

    if (limitMode === "3") {
      limit = 3;
    } else if (limitMode === "custom") {
      limit = Number.parseInt(
        elements.limitCount.value,
        10
      );
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
      pauseEvery: Number.parseInt(
        elements.pauseEvery.value,
        10
      ),
      pauseDurationMs: Number.parseInt(
        elements.pauseDurationMs.value,
        10
      ),
      timeoutMs: Number.parseInt(
        elements.timeoutMs.value,
        10
      )
    };
  }

  async function saveConfig() {
    const config = readConfigFromForm();
    await chrome.storage.local.set({
      [STORAGE_KEYS.CONFIG]: config
    });
    return config;
  }

  function setFeedback(target, message) {
    target.textContent = message || "";
    target.classList.toggle("show", Boolean(message));
  }

  function clearMessages() {
    setFeedback(elements.message, "");
    setFeedback(elements.warning, "");
    setFeedback(elements.error, "");
  }

  function updateActionState() {
    const running = Boolean(lastState?.running);
    elements.previewButton.disabled =
      uiBusy || running;
    elements.startButton.disabled =
      uiBusy || running;
    elements.stopButton.disabled =
      uiBusy || !running;
    elements.clearButton.disabled = uiBusy || running;
    elements.exportButton.disabled =
      uiBusy ||
      !lastState ||
      !lastState.results ||
      lastState.results.length === 0;
  }

  function toggleCustomLimit() {
    const custom =
      elements.limitMode.value === "custom";
    elements.limitCountWrap.classList.toggle(
      "hidden",
      !custom
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
      cell.textContent =
        "No preview or automation results yet.";
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
    lastState = state || lastState || {
      status: STATUS.IDLE,
      counts: {
        found: 0,
        processed: 0,
        updated: 0,
        alreadyEnabled: 0,
        failed: 0
      },
      results: []
    };

    elements.statusBadge.textContent =
      STATUS_LABELS[lastState.status] ||
      STATUS_LABELS[STATUS.IDLE];
    elements.meetingsFound.textContent =
      lastState.counts?.found ?? 0;
    elements.meetingsProcessed.textContent =
      lastState.counts?.processed ?? 0;
    elements.updatedCount.textContent =
      lastState.counts?.updated ?? 0;
    elements.alreadyEnabledCount.textContent =
      lastState.counts?.alreadyEnabled ?? 0;
    elements.failedCount.textContent =
      lastState.counts?.failed ?? 0;
    elements.currentMeeting.textContent =
      lastState.currentMeetingTitle || "None";

    const progress =
      lastState.progressPercentage ?? 0;
    elements.progressText.textContent = `${progress}%`;
    elements.progressFill.style.width = `${progress}%`;
    elements.progressTrack.setAttribute(
      "aria-valuenow",
      String(progress)
    );

    setFeedback(elements.warning, lastState.warning);
    setFeedback(elements.error, lastState.lastError);
    renderReport(lastState.results || []);
    updateActionState();
  }

  async function sendMessage(message) {
    const response = await chrome.runtime.sendMessage(
      message
    );

    if (!response?.ok) {
      throw new Error(
        response?.error || "Request failed."
      );
    }

    return response;
  }

  async function refreshState() {
    const response = await sendMessage({
      type: MESSAGE_TYPES.GET_STATE
    });
    applyConfig(response.config || DEFAULT_CONFIG);
    renderState(response.state);
  }

  async function handlePreview() {
    clearMessages();
    uiBusy = true;
    updateActionState();

    try {
      const config = await saveConfig();
      const response = await sendMessage({
        type: MESSAGE_TYPES.PREVIEW_MEETINGS,
        config
      });
      renderState(
        response.snapshot ||
          response.state ||
          lastState
      );
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
          type: MESSAGE_TYPES.PREVIEW_MEETINGS,
          config: rawConfig
        });
        renderState(preview.snapshot || lastState);

        const found = preview.plan.length;
        if (found === 0) {
          setFeedback(
            elements.error,
            "No matching meetings were found."
          );
          return;
        }

        const warningLine =
          found > 20
            ? `\nWarning: ${found} meetings will be processed.`
            : "";
        const confirmed = window.confirm(
          `Preview found ${found} matching meetings.${warningLine}\n\nContinue with live changes?`
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
        type: MESSAGE_TYPES.START_AUTOMATION,
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
      await sendMessage({
        type: MESSAGE_TYPES.STOP_AUTOMATION
      });
      setFeedback(
        elements.message,
        "Stop requested."
      );
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
        type: MESSAGE_TYPES.CLEAR_RESULTS
      });
      renderState(response.state);
      setFeedback(
        elements.message,
        "Report cleared."
      );
    } catch (error) {
      setFeedback(elements.error, error.message);
    } finally {
      uiBusy = false;
      updateActionState();
    }
  }

  function handleExport() {
    if (!lastState?.results?.length) {
      setFeedback(
        elements.error,
        "There are no results to export."
      );
      return;
    }

    const csv = buildCsv(lastState.results);
    const blob = new Blob([csv], {
      type: "text/csv;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "teams-auto-record-report.csv";
    link.click();

    URL.revokeObjectURL(url);
    setFeedback(
      elements.message,
      "CSV export downloaded."
    );
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
    elements.previewButton.addEventListener(
      "click",
      handlePreview
    );
    elements.startButton.addEventListener(
      "click",
      handleStart
    );
    elements.stopButton.addEventListener(
      "click",
      handleStop
    );
    elements.clearButton.addEventListener(
      "click",
      handleClear
    );
    elements.exportButton.addEventListener(
      "click",
      handleExport
    );
  }

  chrome.runtime.onMessage.addListener(message => {
    if (message?.type === MESSAGE_TYPES.STATE_UPDATED) {
      renderState(message.state);
    }
  });

  document.addEventListener("DOMContentLoaded", async () => {
    captureElements();
    bindInputs();
    bindButtons();
    await refreshState();
  });
})();
