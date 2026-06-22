(function attachLobbyAccess(root) {
  const shared =
    root.TeamsAutoRecordShared ||
    (typeof require !== "undefined"
      ? require("../shared/lobby-utils.js")
      : {});

  const SELECTORS = {
    DIALOG: '[role="dialog"]',
    MEETING_ACCESS_TAB: '[role="tab"]',
    LOBBY_CONTROL:
      '[data-tid="AutoAdmittedUsers"][role="combobox"]',
    LOBBY_CONTROL_BY_ID:
      '#AutoAdmittedUsers[role="combobox"]',
    LOBBY_CONTROL_BY_LABEL:
      '[role="combobox"][aria-label="Who can bypass the lobby?"]',
    EVERYONE_OPTION: '[role="option"][data-tid="Everyone"]',
    OPTION: '[role="option"]',
    APPLY: 'button, [role="button"]',
    CLOSE: 'button, [role="button"]'
  };

  function defaultVisible(element) {
    if (!element) {
      return false;
    }

    if (typeof element.getBoundingClientRect !== "function") {
      return true;
    }

    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function controlText(element) {
    const candidates = [
      element?.getAttribute?.("aria-valuetext"),
      element?.innerText,
      element?.textContent,
      element?.getAttribute?.("aria-label")
    ];

    for (const candidate of candidates) {
      const normalized = shared.normalizeLobbyOptionText(candidate);
      if (normalized) {
        return normalized;
      }
    }

    return "";
  }

  function findLobbyControl(dialog, isVisible = defaultVisible) {
    if (!dialog) {
      return null;
    }

    const selector = [
      SELECTORS.LOBBY_CONTROL,
      SELECTORS.LOBBY_CONTROL_BY_ID,
      SELECTORS.LOBBY_CONTROL_BY_LABEL
    ].join(", ");

    return [...dialog.querySelectorAll(selector)].find(
      control => {
        return (
          isVisible(control) &&
          shared.normalizeText(control.getAttribute("aria-label")) ===
            "Who can bypass the lobby?"
        );
      }
    ) || null;
  }

  function findMeetingOptionsDialog(
    documentRoot,
    isVisible = defaultVisible
  ) {
    return [...documentRoot.querySelectorAll(SELECTORS.DIALOG)].find(
      dialog => {
        const text = shared.normalizeText(
          dialog.innerText || dialog.textContent
        );
        return (
          isVisible(dialog) &&
          text.includes("Meeting options") &&
          Boolean(findMeetingAccessTab(dialog, isVisible))
        );
      }
    ) || null;
  }

  function findMeetingAccessTab(dialog, isVisible = defaultVisible) {
    if (!dialog) {
      return null;
    }

    return [...dialog.querySelectorAll(SELECTORS.MEETING_ACCESS_TAB)].find(
      tab => {
        return (
          isVisible(tab) &&
          shared.normalizeLobbyOptionText(
            tab.getAttribute("aria-label") ||
              tab.innerText ||
              tab.textContent
          ) === "Meeting access"
        );
      }
    ) || null;
  }

  function readLobbyValue(control) {
    if (!control) {
      return "";
    }

    const ariaValue = shared.normalizeLobbyOptionText(
      control.getAttribute("aria-valuetext")
    );
    if (ariaValue) {
      return ariaValue;
    }

    const text = shared.normalizeLobbyOptionText(
      control.innerText || control.textContent
    );
    return text.replace(/Who can bypass the lobby\?/i, "").trim();
  }

  function findEveryoneOption(dialog, isVisible = defaultVisible) {
    if (!dialog) {
      return null;
    }

    const preferred = dialog.querySelector(SELECTORS.EVERYONE_OPTION);
    if (
      preferred &&
      isVisible(preferred) &&
      shared.isEveryoneLobbyOption(controlText(preferred))
    ) {
      return preferred;
    }

    return [...dialog.querySelectorAll(SELECTORS.OPTION)].find(option => {
      return (
        isVisible(option) &&
        shared.isEveryoneLobbyOption(controlText(option))
      );
    }) || null;
  }

  function findApplyButton(dialog, isVisible = defaultVisible) {
    if (!dialog) {
      return null;
    }

    return [...dialog.querySelectorAll(SELECTORS.APPLY)].find(button => {
      return (
        isVisible(button) &&
        shared.normalizeLobbyOptionText(
          button.innerText || button.textContent
        ) === "Apply"
      );
    }) || null;
  }

  function isEnabledControl(control) {
    return Boolean(
      control &&
      !control.disabled &&
      control.getAttribute("aria-disabled") !== "true"
    );
  }

  function findCloseButton(dialog, isVisible = defaultVisible) {
    if (!dialog) {
      return null;
    }

    return [...dialog.querySelectorAll(SELECTORS.CLOSE)].find(button => {
      return (
        isVisible(button) &&
        shared.normalizeText(button.getAttribute("aria-label")) ===
          "Close"
      );
    }) || null;
  }

  const api = {
    SELECTORS,
    findMeetingOptionsDialog,
    findMeetingAccessTab,
    findLobbyControl,
    readLobbyValue,
    findEveryoneOption,
    findApplyButton,
    isEnabledControl,
    findCloseButton
  };

  root.TeamsLobbyAccess = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
