(function bootstrapContentScript() {
  if (globalThis.__teamsAutoRecordExtensionLoaded) {
    return;
  }

  globalThis.__teamsAutoRecordExtensionLoaded = true;

  const shared = globalThis.TeamsAutoRecordShared;
  const {
    MESSAGE_TYPES,
    STATUS,
    normalizeText,
    normalizeConfig,
    parseMeetingLabel,
    matchesMeetingLabel,
    applyLimit,
    summarizeResults,
    formatError,
    isLikelyTeamsCalendarUrl
  } = shared;

  const runtime = {
    running: false,
    stopRequested: false,
    results: [],
    previewPlan: [],
    foundCount: 0,
    currentMeetingTitle: "",
    currentConfig: normalizeConfig(shared.DEFAULT_CONFIG)
  };

  const sleep = ms =>
    new Promise(resolve => setTimeout(resolve, ms));

  function visible(element) {
    if (!element) {
      return false;
    }

    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== "none" &&
      style.visibility !== "hidden"
    );
  }

  function elementText(element) {
    return normalizeText(
      [
        element?.innerText,
        element?.getAttribute?.("aria-label"),
        element?.getAttribute?.("title")
      ]
        .filter(Boolean)
        .join(" ")
    );
  }

  function isStopError(error) {
    return /stopped manually/i.test(formatError(error));
  }

  function buildSnapshot(overrides) {
    const counts = summarizeResults(
      runtime.results,
      runtime.foundCount
    );

    return Object.assign(
      {
        status: STATUS.IDLE,
        running: runtime.running,
        stopRequested: runtime.stopRequested,
        currentMeetingTitle: runtime.currentMeetingTitle,
        previewPlan: runtime.previewPlan.slice(),
        results: runtime.results.slice(),
        counts,
        progressPercentage: counts.progressPercentage,
        warning: "",
        lastError: ""
      },
      overrides || {}
    );
  }

  function sendUpdate(type, overrides) {
    const snapshot = buildSnapshot(overrides);
    chrome.runtime.sendMessage({
      source: "content",
      type,
      state: snapshot
    });
    return snapshot;
  }

  function getCalendarMeetingButtons() {
    return [
      ...document.querySelectorAll('[role="button"]')
    ].filter(button => {
      if (!visible(button)) {
        return false;
      }

      const label = button.getAttribute("aria-label") || "";
      return /Microsoft Teams Meeting/i.test(label);
    });
  }

  function validateTeamsCalendarPage() {
    if (location.hostname !== "teams.microsoft.com") {
      throw new Error("Not on Microsoft Teams Web.");
    }

    const looksLikeCalendar =
      isLikelyTeamsCalendarUrl(location.href) ||
      getCalendarMeetingButtons().length > 0;

    if (!looksLikeCalendar) {
      throw new Error(
        "Not on the Teams Calendar page."
      );
    }
  }

  function matchesMeetingElement(element, config) {
    if (!visible(element)) {
      return false;
    }

    const label = element.getAttribute("aria-label") || "";
    if (!/Microsoft Teams Meeting/i.test(label)) {
      return false;
    }

    return matchesMeetingLabel(label, config);
  }

  function getMatchingMeetings(config) {
    return [
      ...document.querySelectorAll('[role="button"]')
    ]
      .filter(element =>
        matchesMeetingElement(element, config)
      )
      .sort((left, right) => {
        const leftRect = left.getBoundingClientRect();
        const rightRect = right.getBoundingClientRect();

        if (leftRect.y !== rightRect.y) {
          return leftRect.y - rightRect.y;
        }

        return leftRect.x - rightRect.x;
      });
  }

  function buildMeetingPlan(meetings) {
    const occurrences = new Map();

    return meetings.map((element, index) => {
      const label =
        element.getAttribute("aria-label") || "";
      const occurrence = occurrences.get(label) || 0;
      const parsed = parseMeetingLabel(label);

      occurrences.set(label, occurrence + 1);

      return {
        number: index + 1,
        ariaLabel: label,
        occurrence,
        title: parsed.title,
        time: parsed.time,
        date: parsed.date || "Visible calendar date"
      };
    });
  }

  function findPlannedMeeting(item, config) {
    const matches = getMatchingMeetings(config).filter(
      element =>
        (element.getAttribute("aria-label") || "") ===
        item.ariaLabel
    );

    return matches[item.occurrence] || null;
  }

  async function waitFor(
    finder,
    errorMessage,
    timeout,
    interval
  ) {
    const startedAt = Date.now();
    const effectiveTimeout = timeout || 25000;
    const effectiveInterval = interval || 300;

    while (
      Date.now() - startedAt <
      effectiveTimeout
    ) {
      if (runtime.stopRequested) {
        throw new Error("Automation stopped manually");
      }

      const result = finder();
      if (result) {
        return result;
      }

      await sleep(effectiveInterval);
    }

    throw new Error(errorMessage);
  }

  function pressEscape() {
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        code: "Escape",
        keyCode: 27,
        which: 27,
        bubbles: true
      })
    );
  }

  async function closeTopDialog() {
    const closeButton = [
      ...document.querySelectorAll("button")
    ]
      .filter(button => {
        const ariaLabel =
          button.getAttribute("aria-label") || "";

        return (
          visible(button) &&
          /^Close$/i.test(ariaLabel)
        );
      })
      .at(-1);

    if (!closeButton) {
      return false;
    }

    closeButton.click();
    await sleep(800);
    return true;
  }

  async function returnToCalendar() {
    pressEscape();
    await sleep(400);

    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (getCalendarMeetingButtons().length > 0) {
        return true;
      }

      const closed = await closeTopDialog();
      if (!closed) {
        pressEscape();
        await sleep(600);
      }
    }

    return getCalendarMeetingButtons().length > 0;
  }

  function findVisibleControl(regex) {
    return [
      ...document.querySelectorAll(
        'button, [role="button"], a, [role="link"]'
      )
    ].find(control => {
      return (
        visible(control) &&
        regex.test(elementText(control))
      );
    });
  }

  async function openMeetingOptions(meeting, config) {
    meeting.click();

    const editButton = await waitFor(
      () =>
        [
          ...document.querySelectorAll(
            'button, [role="button"]'
          )
        ].find(button => {
          if (!visible(button)) {
            return false;
          }

          const ariaLabel =
            button.getAttribute("aria-label") || "";
          const text = normalizeText(button.innerText);

          return (
            ariaLabel === "Edit" ||
            /^Edit$/i.test(text)
          );
        }),
      "Edit button not found",
      config.timeoutMs
    );

    editButton.click();

    const optionsButton = await waitFor(
      () =>
        [
          ...document.querySelectorAll(
            'button[aria-label*="online meeting options"]'
          )
        ].find(visible) ||
        findVisibleControl(
          /online meeting options|change the online meeting options/i
        ),
      "Meeting options button not found",
      config.timeoutMs
    );

    optionsButton.click();

    return waitFor(
      () =>
        [
          ...document.querySelectorAll(
            '[data-tid="AutoRecordAndTranscribeMode"]'
          )
        ].find(visible),
      "Auto-record dropdown not found",
      config.timeoutMs
    );
  }

  async function enableAutoRecording(config) {
    const combo = await waitFor(
      () =>
        [
          ...document.querySelectorAll(
            '[data-tid="AutoRecordAndTranscribeMode"]'
          )
        ].find(visible),
      "Auto-record dropdown not found",
      config.timeoutMs
    );

    combo.click();

    const recordOption = await waitFor(
      () =>
        [
          ...document.querySelectorAll(
            '[data-tid="AutoRecordingAndTranscription"]'
          )
        ].find(visible),
      "Record and transcribe option not found",
      12000
    );

    const alreadyEnabled =
      recordOption.getAttribute("aria-selected") ===
      "true";

    if (alreadyEnabled) {
      pressEscape();
      await sleep(400);
      return { status: "Already enabled" };
    }

    recordOption.click();
    await sleep(500);

    const applyButton = await waitFor(
      () =>
        [...document.querySelectorAll("button")].find(
          button => {
            const text = normalizeText(button.innerText);
            return (
              visible(button) &&
              /^Apply$/i.test(text) &&
              !button.disabled
            );
          }
        ),
      "Enabled Apply button not found",
      12000
    );

    applyButton.click();
    await sleep(1500);

    return { status: "Updated" };
  }

  async function previewMeetings(rawConfig) {
    validateTeamsCalendarPage();

    const config = normalizeConfig(rawConfig);
    const meetings = applyLimit(
      getMatchingMeetings(config),
      config.limit
    );
    const plan = buildMeetingPlan(meetings);

    runtime.currentConfig = config;
    runtime.previewPlan = plan;
    runtime.results = [];
    runtime.foundCount = plan.length;
    runtime.currentMeetingTitle = "";

    if (plan.length === 0) {
      throw new Error(
        "No matching Teams meetings were found."
      );
    }

    const warning =
      plan.length > 20
        ? "More than 20 meetings match the current filters."
        : "";

    const snapshot = sendUpdate(
      MESSAGE_TYPES.PROGRESS_UPDATE,
      {
        status: STATUS.PREVIEW_READY,
        warning
      }
    );

    return {
      plan,
      snapshot
    };
  }

  async function runAutomation(rawConfig) {
    validateTeamsCalendarPage();

    if (runtime.running) {
      throw new Error(
        "Automation is already running."
      );
    }

    const config = normalizeConfig(rawConfig);
    runtime.currentConfig = config;
    runtime.stopRequested = false;
    runtime.running = true;
    runtime.results = [];
    runtime.currentMeetingTitle = "";

    try {
      const preview = await previewMeetings(config);
      runtime.previewPlan = preview.plan;
      runtime.foundCount = preview.plan.length;

      if (config.previewOnly) {
        runtime.running = false;
        sendUpdate(MESSAGE_TYPES.AUTOMATION_COMPLETE, {
          status: STATUS.PREVIEW_READY,
          running: false,
          warning:
            "Preview-only mode is enabled. No meetings were changed."
        });
        return;
      }

      sendUpdate(MESSAGE_TYPES.PROGRESS_UPDATE, {
        status: STATUS.RUNNING,
        running: true,
        warning: runtime.foundCount > 20
          ? "More than 20 meetings are being processed."
          : ""
      });

      for (
        let index = 0;
        index < runtime.previewPlan.length;
        index += 1
      ) {
        if (runtime.stopRequested) {
          break;
        }

        const plannedMeeting = runtime.previewPlan[index];
        let completed = false;
        let lastError = "";

        runtime.currentMeetingTitle =
          plannedMeeting.title;
        sendUpdate(MESSAGE_TYPES.PROGRESS_UPDATE, {
          status: STATUS.RUNNING,
          running: true
        });

        for (
          let attempt = 0;
          attempt <= config.retriesPerMeeting;
          attempt += 1
        ) {
          try {
            const meeting = await waitFor(
              () =>
                findPlannedMeeting(plannedMeeting, config),
              `Meeting not found: ${plannedMeeting.title}`,
              config.timeoutMs
            );

            await openMeetingOptions(meeting, config);
            const result =
              await enableAutoRecording(config);

            runtime.results.push({
              number: index + 1,
              title: plannedMeeting.title,
              date: plannedMeeting.date,
              time: plannedMeeting.time,
              status: result.status,
              error: ""
            });

            await returnToCalendar();

            completed = true;
            sendUpdate(MESSAGE_TYPES.PROGRESS_UPDATE, {
              status: STATUS.RUNNING,
              running: true
            });
            break;
          } catch (error) {
            lastError = formatError(error);
            await returnToCalendar();

            if (isStopError(error)) {
              break;
            }

            if (attempt < config.retriesPerMeeting) {
              await sleep(2000);
            }
          }
        }

        if (!completed) {
          runtime.results.push({
            number: index + 1,
            title: plannedMeeting.title,
            date: plannedMeeting.date,
            time: plannedMeeting.time,
            status: "Failed",
            error:
              lastError || "Meeting processing failed"
          });
          sendUpdate(MESSAGE_TYPES.PROGRESS_UPDATE, {
            status: STATUS.RUNNING,
            running: true,
            lastError
          });
        }

        if (runtime.stopRequested) {
          break;
        }

        if (
          config.pauseEvery > 0 &&
          (index + 1) % config.pauseEvery === 0 &&
          index + 1 < runtime.previewPlan.length
        ) {
          await sleep(config.pauseDurationMs);
        } else {
          await sleep(config.delayBetweenMeetingsMs);
        }
      }

      runtime.running = false;
      runtime.currentMeetingTitle = "";

      if (runtime.stopRequested) {
        sendUpdate(MESSAGE_TYPES.AUTOMATION_COMPLETE, {
          status: STATUS.STOPPED,
          running: false,
          warning:
            "Automation was stopped by the user."
        });
        return;
      }

      sendUpdate(MESSAGE_TYPES.AUTOMATION_COMPLETE, {
        status: STATUS.COMPLETE,
        running: false
      });
    } catch (error) {
      runtime.running = false;
      runtime.currentMeetingTitle = "";
      sendUpdate(MESSAGE_TYPES.AUTOMATION_ERROR, {
        status: isStopError(error)
          ? STATUS.STOPPED
          : STATUS.ERROR,
        running: false,
        lastError: formatError(error),
        warning: isStopError(error)
          ? "Automation was stopped by the user."
          : ""
      });
    } finally {
      runtime.stopRequested = false;
    }
  }

  chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse) => {
      if (!message?.type) {
        return false;
      }

      if (message.type === MESSAGE_TYPES.GET_STATE) {
        sendResponse({
          ok: true,
          snapshot: buildSnapshot({
            status: runtime.running
              ? STATUS.RUNNING
              : STATUS.IDLE
          })
        });
        return false;
      }

      if (message.type === MESSAGE_TYPES.STOP_AUTOMATION) {
        runtime.stopRequested = true;
        sendUpdate(MESSAGE_TYPES.PROGRESS_UPDATE, {
          status: STATUS.STOPPING,
          running: runtime.running,
          warning:
            "Stop requested. Waiting for the current step to finish."
        });
        sendResponse({ ok: true });
        return false;
      }

      if (message.type === MESSAGE_TYPES.PREVIEW_MEETINGS) {
        previewMeetings(message.config)
          .then(result => {
            sendResponse({
              ok: true,
              plan: result.plan,
              snapshot: result.snapshot
            });
          })
          .catch(error => {
            sendUpdate(MESSAGE_TYPES.AUTOMATION_ERROR, {
              status: STATUS.ERROR,
              running: false,
              lastError: formatError(error)
            });
            sendResponse({
              ok: false,
              error: formatError(error)
            });
          });
        return true;
      }

      if (message.type === MESSAGE_TYPES.START_AUTOMATION) {
        runAutomation(message.config);
        sendResponse({ ok: true });
        return false;
      }

      return false;
    }
  );
})();
