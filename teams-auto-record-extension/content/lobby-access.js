(function attachLobbyAccess(root) {
  const shared =
    root.TeamsAutoRecordShared ||
    (typeof require !== "undefined"
      ? require("../shared/lobby-utils.js")
      : {});

  const SELECTORS = {
    DIALOG: '[role="dialog"]',
    DIALOG_CONTENT: '[role="document"]',
    TAB_LIST: '[role="tablist"]',
    MEETING_ACCESS_TAB: '[role="tab"]',
    COMBOBOX: '[role="combobox"]',
    LOBBY_CONTROL:
      '[data-tid="AutoAdmittedUsers"][role="combobox"]',
    LOBBY_CONTROL_BY_ID:
      '#AutoAdmittedUsers[role="combobox"]',
    LOBBY_CONTROL_BY_LABEL:
      '[role="combobox"][aria-label="Who can bypass the lobby?"]',
    JOIN_SCREEN_CONTROL:
      '[data-tid="AllowedUsersForMeetingDetails"][role="combobox"]',
    JOIN_SCREEN_CONTROL_BY_ID:
      '#AllowedUsersForMeetingDetails[role="combobox"]',
    JOIN_SCREEN_CONTROL_BY_LABEL:
      '[role="combobox"][aria-label="Show meeting info on join screen"]',
    LOADING_INDICATOR: '[role="progressbar"], [aria-busy="true"]',
    LISTBOX: '[role="listbox"]',
    EVERYONE_OPTION: '[role="option"][data-tid="Everyone"]',
    OPTION: '[role="option"]',
    APPLY: 'button, [role="button"]',
    CLOSE: 'button, [role="button"]'
  };

  const SETTING_DEFINITIONS = {
    LOBBY_BYPASS: {
      key: "lobbyBypass",
      label: "Who can bypass the lobby?",
      selectors: [
        SELECTORS.LOBBY_CONTROL,
        SELECTORS.LOBBY_CONTROL_BY_ID,
        SELECTORS.LOBBY_CONTROL_BY_LABEL
      ],
      errorLabel: "Lobby bypass"
    },
    JOIN_SCREEN_INFO: {
      key: "joinScreenInfo",
      label: "Show meeting info on join screen",
      description:
        "Display details about the meeting like title and start time, number of others joined, and presence of the organizer.",
      selectors: [
        SELECTORS.JOIN_SCREEN_CONTROL,
        SELECTORS.JOIN_SCREEN_CONTROL_BY_ID,
        SELECTORS.JOIN_SCREEN_CONTROL_BY_LABEL
      ],
      errorLabel: "Join-screen info"
    }
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

  function elementText(element) {
    return shared.normalizeLobbyOptionText(
      element?.innerText || element?.textContent
    );
  }

  function getAccessibleLabel(control, documentRoot) {
    const ariaLabel = shared.normalizeLobbyOptionText(
      control?.getAttribute?.("aria-label")
    );
    if (ariaLabel) {
      return ariaLabel;
    }

    const labelledBy = shared.normalizeText(
      control?.getAttribute?.("aria-labelledby")
    );
    if (!labelledBy || !documentRoot) {
      return "";
    }

    return shared.normalizeLobbyOptionText(
      labelledBy
        .split(/\s+/)
        .map(id => documentRoot.getElementById(id))
        .filter(Boolean)
        .map(elementText)
        .join(" ")
    );
  }

  function visibleComboboxes(root, isVisible) {
    return [...root.querySelectorAll(SELECTORS.COMBOBOX)].filter(
      isVisible
    );
  }

  function findLogicalSettingGroup(
    dialog,
    control,
    labelText,
    descriptionText,
    isVisible
  ) {
    const normalizedLabel = shared.normalizeLobbyOptionText(labelText);
    const normalizedDescription = shared.normalizeLobbyOptionText(
      descriptionText
    );
    let current = control.parentElement;

    while (current && dialog.contains(current)) {
      const text = elementText(current);
      const controls = visibleComboboxes(current, isVisible);
      const labelFound = text.includes(normalizedLabel);
      const descriptionFound =
        normalizedDescription && text.includes(normalizedDescription);

      if (
        isVisible(current) &&
        controls.length === 1 &&
        controls[0] === control &&
        (labelFound || descriptionFound)
      ) {
        return current;
      }

      if (current === dialog) {
        break;
      }
      current = current.parentElement;
    }

    return null;
  }

  function findSettingGroupByLabel(
    dialog,
    labelText,
    isVisible = defaultVisible,
    descriptionText = ""
  ) {
    if (!dialog) {
      return null;
    }

    const documentRoot = dialog.ownerDocument;
    const normalizedLabel = shared.normalizeLobbyOptionText(labelText);
    const controls = visibleComboboxes(dialog, isVisible);

    for (const control of controls) {
      if (
        getAccessibleLabel(control, documentRoot) !== normalizedLabel
      ) {
        continue;
      }

      const group = findLogicalSettingGroup(
        dialog,
        control,
        normalizedLabel,
        descriptionText,
        isVisible
      );
      if (group) {
        return { group, control };
      }
    }

    const textCandidates = [
      ...dialog.querySelectorAll("label, span, div, p, h1, h2, h3, h4")
    ].filter(isVisible);
    const labelElement = textCandidates.find(
      element => elementText(element) === normalizedLabel
    );

    if (!labelElement) {
      return null;
    }

    let current = labelElement.parentElement;
    while (current && dialog.contains(current)) {
      const groupControls = visibleComboboxes(current, isVisible);
      if (isVisible(current) && groupControls.length === 1) {
        return { group: current, control: groupControls[0] };
      }
      if (current === dialog) {
        break;
      }
      current = current.parentElement;
    }

    return null;
  }

  function findSetting(
    dialog,
    definition,
    isVisible = defaultVisible
  ) {
    const byLabel = findSettingGroupByLabel(
      dialog,
      definition.label,
      isVisible,
      definition.description
    );
    if (byLabel) {
      return byLabel;
    }

    const selector = definition.selectors.join(", ");
    const control = [...dialog.querySelectorAll(selector)].find(isVisible);
    if (!control) {
      return null;
    }

    const group = findLogicalSettingGroup(
      dialog,
      control,
      definition.label,
      definition.description,
      isVisible
    );
    return group ? { group, control } : null;
  }

  function findLobbyControl(dialog, isVisible = defaultVisible) {
    return (
      findSetting(
        dialog,
        SETTING_DEFINITIONS.LOBBY_BYPASS,
        isVisible
      )?.control || null
    );
  }

  function findJoinScreenInfoControl(
    dialog,
    isVisible = defaultVisible
  ) {
    return (
      findSetting(
        dialog,
        SETTING_DEFINITIONS.JOIN_SCREEN_INFO,
        isVisible
      )?.control || null
    );
  }

  function findMeetingOptionsDialog(
    documentRoot,
    isVisible = defaultVisible
  ) {
    for (const dialog of documentRoot.querySelectorAll(SELECTORS.DIALOG)) {
      const contentRoots = [
        ...dialog.querySelectorAll(SELECTORS.DIALOG_CONTENT),
        dialog
      ];

      const contentRoot = contentRoots.find(candidate => {
        if (!isVisible(candidate)) {
          return false;
        }

        const text = shared.normalizeText(
          candidate.innerText || candidate.textContent
        );
        const hasOptionsStructure = Boolean(
          findLobbyControl(candidate, isVisible) ||
            candidate.querySelector(SELECTORS.TAB_LIST) ||
            candidate.querySelector(SELECTORS.LOADING_INDICATOR)
        );

        return text.includes("Meeting options") && hasOptionsStructure;
      });

      if (contentRoot) {
        return contentRoot;
      }
    }

    return null;
  }

  function isMeetingOptionsLoading(dialog, isVisible = defaultVisible) {
    if (!dialog) {
      return false;
    }

    return [...dialog.querySelectorAll(SELECTORS.LOADING_INDICATOR)].some(
      isVisible
    );
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

  function readSettingValue(control, labelText = "") {
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
    const normalizedLabel = shared.normalizeLobbyOptionText(labelText);
    return normalizedLabel
      ? text.replace(normalizedLabel, "").trim()
      : text;
  }

  function readLobbyValue(control) {
    return readSettingValue(
      control,
      SETTING_DEFINITIONS.LOBBY_BYPASS.label
    );
  }

  function readJoinScreenInfoValue(control) {
    return readSettingValue(
      control,
      SETTING_DEFINITIONS.JOIN_SCREEN_INFO.label
    );
  }

  function findControlledListbox(
    documentRoot,
    dialog,
    control,
    isVisible = defaultVisible
  ) {
    if (
      !documentRoot ||
      !dialog ||
      !control ||
      !dialog.contains(control) ||
      !isVisible(control) ||
      control.getAttribute("aria-expanded") !== "true"
    ) {
      return null;
    }

    const listboxId =
      control.getAttribute("aria-controls") ||
      control.getAttribute("aria-owns");
    const listbox = listboxId
      ? documentRoot.getElementById(listboxId)
      : null;

    return listbox &&
      listbox.matches(SELECTORS.LISTBOX) &&
      isVisible(listbox)
      ? listbox
      : null;
  }

  function findEveryoneOptionForControl(
    documentRoot,
    dialog,
    control,
    isVisible = defaultVisible
  ) {
    const listbox = findControlledListbox(
      documentRoot,
      dialog,
      control,
      isVisible
    );
    if (!listbox) {
      return null;
    }

    return [...listbox.querySelectorAll(SELECTORS.OPTION)].find(
      option =>
        isVisible(option) &&
        shared.isEveryoneLobbyOption(controlText(option))
    ) || null;
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
    SETTING_DEFINITIONS,
    findMeetingOptionsDialog,
    isMeetingOptionsLoading,
    findMeetingAccessTab,
    findSettingGroupByLabel,
    findSetting,
    findLobbyControl,
    findJoinScreenInfoControl,
    readSettingValue,
    readLobbyValue,
    readJoinScreenInfoValue,
    findControlledListbox,
    findEveryoneOptionForControl,
    findApplyButton,
    isEnabledControl,
    findCloseButton
  };

  root.TeamsLobbyAccess = api;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
