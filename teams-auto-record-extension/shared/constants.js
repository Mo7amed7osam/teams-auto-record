(function attachConstants(root) {
  const MESSAGE_TYPES = {
    PREVIEW_MEETINGS: "PREVIEW_MEETINGS",
    START_AUTOMATION: "START_AUTOMATION",
    STOP_AUTOMATION: "STOP_AUTOMATION",
    GET_STATE: "GET_STATE",
    CLEAR_RESULTS: "CLEAR_RESULTS",
    PROGRESS_UPDATE: "PROGRESS_UPDATE",
    AUTOMATION_COMPLETE: "AUTOMATION_COMPLETE",
    AUTOMATION_ERROR: "AUTOMATION_ERROR",
    STATE_UPDATED: "STATE_UPDATED",
    PREVIEW_LOBBY_MEETINGS: "PREVIEW_LOBBY_MEETINGS",
    START_LOBBY_AUTOMATION: "START_LOBBY_AUTOMATION",
    STOP_LOBBY_AUTOMATION: "STOP_LOBBY_AUTOMATION",
    CLEAR_LOBBY_RESULTS: "CLEAR_LOBBY_RESULTS",
    LOBBY_PROGRESS_UPDATE: "LOBBY_PROGRESS_UPDATE",
    LOBBY_AUTOMATION_COMPLETE: "LOBBY_AUTOMATION_COMPLETE",
    LOBBY_AUTOMATION_ERROR: "LOBBY_AUTOMATION_ERROR",
    LOBBY_STATE_UPDATED: "LOBBY_STATE_UPDATED"
  };

  const STORAGE_KEYS = {
    CONFIG: "teamsAutoRecordConfig",
    STATE: "teamsAutoRecordState",
    LOBBY_CONFIG: "teamsLobbyAccessConfig",
    LOBBY_STATE: "teamsLobbyAccessState"
  };

  const FEATURES = {
    AUTO_RECORDING: "auto-recording",
    LOBBY_ACCESS: "lobby-access"
  };

  const STATUS = {
    IDLE: "idle",
    PREVIEWING: "previewing",
    PREVIEW_READY: "preview-ready",
    RUNNING: "running",
    STOPPING: "stopping",
    STOPPED: "stopped",
    COMPLETE: "complete",
    ERROR: "error"
  };

  const STATUS_LABELS = {
    [STATUS.IDLE]: "Idle",
    [STATUS.PREVIEWING]: "Previewing meetings",
    [STATUS.PREVIEW_READY]: "Preview ready",
    [STATUS.RUNNING]: "Automation running",
    [STATUS.STOPPING]: "Stopping after current step",
    [STATUS.STOPPED]: "Stopped",
    [STATUS.COMPLETE]: "Completed",
    [STATUS.ERROR]: "Error"
  };

  const DEFAULT_CONFIG = {
    targetDate: "",
    startTime: "2:00 PM",
    endTime: "5:00 PM",
    titleIncludes: "",
    titleExcludes: "",
    limit: null,
    previewOnly: true,
    retriesPerMeeting: 1,
    delayBetweenMeetingsMs: 1500,
    pauseEvery: 10,
    pauseDurationMs: 5000,
    timeoutMs: 25000
  };

  const DEFAULT_LOBBY_CONFIG = Object.assign(
    {},
    DEFAULT_CONFIG,
    {
      desiredLobbyValue: "Everyone"
    }
  );

  const REPORT_COLUMNS = [
    "number",
    "title",
    "date",
    "time",
    "status",
    "error"
  ];

  function cloneDefaultState() {
    return {
      status: STATUS.IDLE,
      running: false,
      stopRequested: false,
      activeTabId: null,
      activeFrameId: null,
      currentMeetingTitle: "",
      previewPlan: [],
      results: [],
      counts: {
        found: 0,
        processed: 0,
        updated: 0,
        alreadyEnabled: 0,
        failed: 0
      },
      progressPercentage: 0,
      warning: "",
      lastError: "",
      lastUpdatedAt: null
    };
  }

  function cloneDefaultLobbyState() {
    return {
      status: STATUS.IDLE,
      running: false,
      stopRequested: false,
      activeTabId: null,
      activeFrameId: null,
      currentMeetingTitle: "",
      previewPlan: [],
      results: [],
      counts: {
        found: 0,
        processed: 0,
        updated: 0,
        alreadyConfigured: 0,
        failed: 0,
        stopped: 0
      },
      progressPercentage: 0,
      warning: "",
      lastError: "",
      lastUpdatedAt: null
    };
  }

  const api = {
    MESSAGE_TYPES,
    STORAGE_KEYS,
    FEATURES,
    STATUS,
    STATUS_LABELS,
    DEFAULT_CONFIG,
    DEFAULT_LOBBY_CONFIG,
    REPORT_COLUMNS,
    cloneDefaultState,
    cloneDefaultLobbyState
  };

  root.TeamsAutoRecordShared = Object.assign(
    {},
    root.TeamsAutoRecordShared || {},
    api
  );

  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.TeamsAutoRecordShared;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
