(function bootstrapContentScript() {
  if (globalThis.__teamsAutoRecordExtensionLoaded) {
    return;
  }

  globalThis.__teamsAutoRecordExtensionLoaded = true;

  const shared = globalThis.TeamsAutoRecordShared;
  const {
    MESSAGE_TYPES,
    STATUS,
    DATE_LABEL_REGEX,
    TIME_RANGE_REGEX,
    normalizeText,
    normalizeConfig,
    parseMeetingLabel,
    matchesMeetingLabel,
    applyLimit,
    summarizeResults,
    formatError,
    isLikelyTeamsCalendarUrl,
    isSupportedTeamsUrl
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

  function getMeetingMetadataTexts(element) {
    const texts = [];

    function pushText(value) {
      const normalized = normalizeText(value);
      if (
        normalized &&
        !texts.includes(normalized)
      ) {
        texts.push(normalized);
      }
    }

    pushText(element?.getAttribute?.("aria-label"));
    pushText(element?.getAttribute?.("title"));
    pushText(element?.innerText);

    let current = element?.parentElement || null;
    let depth = 0;

    while (current && depth < 5) {
      pushText(current.getAttribute?.("aria-label"));
      pushText(current.getAttribute?.("title"));
      current = current.parentElement;
      depth += 1;
    }

    return texts;
  }

  function getMeetingDescriptor(element) {
    const rect = element.getBoundingClientRect();
    const metadataTexts = getMeetingMetadataTexts(element);
    const primaryText =
      metadataTexts.find(text => {
        return (
          /meeting|busy|free|tentative|organizer/i.test(
            text
          ) ||
          DATE_LABEL_REGEX.test(text) ||
          TIME_RANGE_REGEX.test(text)
        );
      }) ||
      metadataTexts[0] ||
      "";

    const parsed = parseMeetingLabel(primaryText);
    const fallbackTitle = normalizeText(
      element?.innerText || primaryText
    );
    const hasTimeRange =
      TIME_RANGE_REGEX.test(primaryText);
    const hasDateLabel =
      DATE_LABEL_REGEX.test(primaryText);
    const hasMeetingKeyword =
      /meeting|busy|free|tentative/i.test(primaryText);
    const eventLikeGeometry =
      rect.top > 120 &&
      rect.height >= 80 &&
      rect.width >= 10;

    return {
      element,
      rect,
      primaryText,
      parsed,
      key:
        primaryText ||
        `${Math.round(rect.x)}:${Math.round(rect.y)}:${Math.round(rect.width)}:${Math.round(rect.height)}`,
      title: parsed.title || fallbackTitle,
      time: parsed.time,
      date: parsed.date,
      eventLike:
        eventLikeGeometry &&
        (hasMeetingKeyword ||
          hasTimeRange ||
          hasDateLabel ||
          rect.height >= 140)
    };
  }

  function dedupeMeetingElements(elements) {
    const seen = new Set();
    const deduped = [];

    elements.forEach(element => {
      const descriptor = getMeetingDescriptor(element);
      const signature = [
        descriptor.key,
        Math.round(descriptor.rect.x),
        Math.round(descriptor.rect.y),
        Math.round(descriptor.rect.width),
        Math.round(descriptor.rect.height)
      ].join("|");

      if (seen.has(signature)) {
        return;
      }

      seen.add(signature);
      deduped.push(element);
    });

    return deduped;
  }

  function getPotentialMeetingElements() {
    const selector = [
      'button',
      '[role="button"]',
      '[title]',
      '[aria-label]',
      '[draggable="true"]'
    ].join(", ");

    const candidates = [
      ...document.querySelectorAll(selector)
    ].filter(element => {
      if (!visible(element)) {
        return false;
      }

      return getMeetingDescriptor(element).eventLike;
    });

    return dedupeMeetingElements(candidates);
  }

  function getCalendarMeetingButtons() {
    return getPotentialMeetingElements();
  }

  function validateTeamsCalendarPage() {
    if (!isSupportedTeamsUrl(location.href)) {
      throw new Error("Not on Microsoft Teams Web.");
    }
  }

  function isSupportedCalendarFrame() {
    return (
      isSupportedTeamsUrl(location.href) &&
      getCalendarMeetingButtons().length > 0
    );
  }

  function matchesMeetingElement(element, config) {
    if (!visible(element)) {
      return false;
    }

    const descriptor = getMeetingDescriptor(element);

    if (!descriptor.eventLike) {
      return false;
    }

    if (
      descriptor.primaryText &&
      (TIME_RANGE_REGEX.test(descriptor.primaryText) ||
        DATE_LABEL_REGEX.test(descriptor.primaryText) ||
        /meeting/i.test(descriptor.primaryText))
    ) {
      return matchesMeetingLabel(
        descriptor.primaryText,
        config
      );
    }

    const title = descriptor.title.toLowerCase();
    const includeMatches =
      config.titleIncludes.length === 0 ||
      config.titleIncludes.some(value =>
        title.includes(value.toLowerCase())
      );
    const excluded = config.titleExcludes.some(value =>
      title.includes(value.toLowerCase())
    );

    return includeMatches && !excluded;
  }

  function getMatchingMeetings(config) {
    return getPotentialMeetingElements()
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
      const descriptor = getMeetingDescriptor(element);
      const occurrence =
        occurrences.get(descriptor.key) || 0;

      occurrences.set(descriptor.key, occurrence + 1);

      return {
        number: index + 1,
        key: descriptor.key,
        occurrence,
        title:
          descriptor.title || `Meeting ${index + 1}`,
        time:
          descriptor.time || "Visible calendar time",
        date:
          descriptor.date || "Visible calendar date"
      };
    });
  }

  function findPlannedMeeting(item, config) {
    const matches = getMatchingMeetings(config).filter(
      element =>
        getMeetingDescriptor(element).key === item.key
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
            'button[aria-label*="online meeting options"], button[title*="online meeting options"]'
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
        if (!isSupportedCalendarFrame()) {
          sendResponse({
            ok: false,
            errorCode: "UNSUPPORTED_CONTEXT",
            error: "This frame is not the Teams calendar content."
          });
          return false;
        }

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
        if (!isSupportedCalendarFrame()) {
          sendResponse({
            ok: false,
            errorCode: "UNSUPPORTED_CONTEXT",
            error: "This frame is not the Teams calendar content."
          });
          return false;
        }

        runAutomation(message.config);
        sendResponse({ ok: true });
        return false;
      }

      return false;
    }
  );
})();
