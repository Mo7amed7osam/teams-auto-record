(function attachUtils(root) {
  const shared =
    root.TeamsAutoRecordShared ||
    (typeof require !== "undefined"
      ? require("./constants.js")
      : {});

  const WEEKDAY_PATTERN =
    "(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)";
  const MONTH_PATTERN =
    "(January|February|March|April|May|June|July|August|September|October|November|December)";
  const DATE_LABEL_REGEX = new RegExp(
    `${WEEKDAY_PATTERN},\\s+${MONTH_PATTERN}\\s+\\d{1,2},\\s+\\d{4}`,
    "i"
  );
  const TIME_TOKEN_PATTERN =
    "(?:[01]?\\d|2[0-3]):\\d{2}(?:\\s*(?:AM|PM))?";
  const TIME_RANGE_REGEX =
    new RegExp(
      `(${TIME_TOKEN_PATTERN}\\s+to\\s+${TIME_TOKEN_PATTERN})`,
      "i"
    );
  const SUPPORTED_TEAMS_HOST_REGEX =
    /^https:\/\/teams\.(microsoft\.com|cloud\.microsoft)\//i;
  const SUPPORTED_CALENDAR_FRAME_REGEX =
    /^https:\/\/outlook\.office\.com\/hosted\/calendar\/?/i;

  function normalizeText(value) {
    return String(value || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function parseFilterList(value) {
    if (Array.isArray(value)) {
      return value.map(normalizeText).filter(Boolean);
    }

    return normalizeText(value)
      .split(/[\n,]/)
      .map(normalizeText)
      .filter(Boolean);
  }

  function coercePositiveInteger(value, fallback, options) {
    const settings = options || {};
    if (settings.allowNull && (value === null || value === "")) {
      return null;
    }

    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return fallback;
    }

    return parsed;
  }

  function formatDateForTeamsLabel(value) {
    const normalized = normalizeText(value);
    if (!normalized) {
      return "";
    }

    if (DATE_LABEL_REGEX.test(normalized)) {
      return normalized.match(DATE_LABEL_REGEX)[0];
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
      const date = new Date(`${normalized}T12:00:00`);
      if (Number.isNaN(date.getTime())) {
        return normalized;
      }

      return new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric"
      }).format(date);
    }

    return normalized;
  }

  function parseMeetingLabel(label) {
    const normalizedLabel = normalizeText(label);
    const title = normalizeText(
      normalizedLabel
        .split(",")[0]
        .replace(/Microsoft Teams Meeting/gi, "")
    );
    const timeMatch = normalizedLabel.match(TIME_RANGE_REGEX);
    const dateMatch = normalizedLabel.match(DATE_LABEL_REGEX);

    return {
      title,
      time: timeMatch ? normalizeText(timeMatch[1]) : "",
      date: dateMatch ? normalizeText(dateMatch[0]) : "",
      label: normalizedLabel
    };
  }

  function parseTimeToMinutes(value) {
    const normalized = normalizeText(value).toUpperCase();
    const match = normalized.match(
      /^(\d{1,2}):(\d{2})(?:\s*(AM|PM))?$/
    );

    if (!match) {
      return null;
    }

    let hours = Number.parseInt(match[1], 10);
    const minutes = Number.parseInt(match[2], 10);
    const period = match[3] || "";

    if (minutes < 0 || minutes > 59) {
      return null;
    }

    if (period) {
      if (hours < 1 || hours > 12) {
        return null;
      }

      if (period === "AM") {
        hours = hours === 12 ? 0 : hours;
      } else {
        hours = hours === 12 ? 12 : hours + 12;
      }
    } else if (hours > 23) {
      return null;
    }

    return hours * 60 + minutes;
  }

  function parseTimeRange(value) {
    const normalized = normalizeText(value);
    const match = normalized.match(TIME_RANGE_REGEX);

    if (!match) {
      return null;
    }

    const parts = match[1]
      .split(/\s+to\s+/i)
      .map(normalizeText);

    if (parts.length !== 2) {
      return null;
    }

    const startMinutes = parseTimeToMinutes(parts[0]);
    const endMinutes = parseTimeToMinutes(parts[1]);

    if (
      startMinutes === null ||
      endMinutes === null
    ) {
      return null;
    }

    return {
      startText: parts[0],
      endText: parts[1],
      startMinutes,
      endMinutes
    };
  }

  function timesMatch(
    meetingTimeRange,
    configuredStartTime,
    configuredEndTime
  ) {
    if (!configuredStartTime || !configuredEndTime) {
      return true;
    }

    const meetingRange = parseTimeRange(meetingTimeRange);
    const configuredStartMinutes =
      parseTimeToMinutes(configuredStartTime);
    const configuredEndMinutes =
      parseTimeToMinutes(configuredEndTime);

    if (
      meetingRange &&
      configuredStartMinutes !== null &&
      configuredEndMinutes !== null
    ) {
      return (
        meetingRange.startMinutes ===
          configuredStartMinutes &&
        meetingRange.endMinutes === configuredEndMinutes
      );
    }

    const fallbackRange = normalizeText(
      `${configuredStartTime} to ${configuredEndTime}`
    );
    return normalizeText(meetingTimeRange)
      .toLowerCase()
      .includes(fallbackRange.toLowerCase());
  }

  function normalizeConfig(rawConfig) {
    const source = Object.assign({}, shared.DEFAULT_CONFIG, rawConfig || {});
    const targetDateLabel = formatDateForTeamsLabel(source.targetDate);

    return {
      targetDate: normalizeText(source.targetDate),
      targetDateLabel,
      startTime: normalizeText(source.startTime),
      endTime: normalizeText(source.endTime),
      titleIncludes: parseFilterList(source.titleIncludes),
      titleExcludes: parseFilterList(source.titleExcludes),
      limit: coercePositiveInteger(source.limit, null, {
        allowNull: true
      }),
      previewOnly: Boolean(source.previewOnly),
      retriesPerMeeting: coercePositiveInteger(
        source.retriesPerMeeting,
        shared.DEFAULT_CONFIG.retriesPerMeeting
      ),
      delayBetweenMeetingsMs: coercePositiveInteger(
        source.delayBetweenMeetingsMs,
        shared.DEFAULT_CONFIG.delayBetweenMeetingsMs
      ),
      pauseEvery: coercePositiveInteger(
        source.pauseEvery,
        shared.DEFAULT_CONFIG.pauseEvery
      ),
      pauseDurationMs: coercePositiveInteger(
        source.pauseDurationMs,
        shared.DEFAULT_CONFIG.pauseDurationMs
      ),
      timeoutMs: coercePositiveInteger(
        source.timeoutMs,
        shared.DEFAULT_CONFIG.timeoutMs
      )
    };
  }

  function matchesTitleFilters(title, includes, excludes) {
    const lowerTitle = normalizeText(title).toLowerCase();
    const includeMatches =
      includes.length === 0 ||
      includes.some(value =>
        lowerTitle.includes(value.toLowerCase())
      );
    const excluded = excludes.some(value =>
      lowerTitle.includes(value.toLowerCase())
    );

    return includeMatches && !excluded;
  }

  function matchesMeetingLabel(label, config) {
    const parsed = parseMeetingLabel(label);
    const dateMatches =
      !config.targetDateLabel ||
      parsed.label.includes(config.targetDateLabel);
    const timeMatches = timesMatch(
      parsed.time,
      config.startTime,
      config.endTime
    );
    const titleMatches = matchesTitleFilters(
      parsed.title,
      config.titleIncludes,
      config.titleExcludes
    );

    return dateMatches && timeMatches && titleMatches;
  }

  function applyLimit(items, limit) {
    if (typeof limit !== "number" || limit <= 0) {
      return items.slice();
    }

    return items.slice(0, limit);
  }

  function summarizeResults(results, foundCount) {
    const updated = results.filter(
      item => item.status === "Updated"
    ).length;
    const alreadyEnabled = results.filter(
      item => item.status === "Already enabled"
    ).length;
    const failed = results.filter(
      item => item.status === "Failed"
    ).length;
    const processed = results.length;
    const found =
      typeof foundCount === "number" && foundCount >= 0
        ? foundCount
        : processed;
    const progressPercentage =
      found > 0
        ? Math.min(
            100,
            Math.round((processed / found) * 100)
          )
        : 0;

    return {
      found,
      processed,
      updated,
      alreadyEnabled,
      failed,
      progressPercentage
    };
  }

  function csvEscape(value) {
    const text = normalizeText(value);
    if (/[",\n]/.test(text)) {
      return `"${text.replace(/"/g, '""')}"`;
    }

    return text;
  }

  function buildCsv(results) {
    const header = shared.REPORT_COLUMNS.join(",");
    const rows = results.map(result =>
      shared.REPORT_COLUMNS.map(column =>
        csvEscape(result[column])
      ).join(",")
    );

    return [header].concat(rows).join("\n");
  }

  function isLikelyTeamsCalendarUrl(url) {
    const normalized = String(url || "").toLowerCase();
    return (
      (SUPPORTED_TEAMS_HOST_REGEX.test(normalized) ||
        SUPPORTED_CALENDAR_FRAME_REGEX.test(normalized)) &&
      /calendar|meeting/.test(normalized)
    );
  }

  function isSupportedTeamsUrl(url) {
    const normalized = String(url || "");
    return (
      SUPPORTED_TEAMS_HOST_REGEX.test(normalized) ||
      SUPPORTED_CALENDAR_FRAME_REGEX.test(normalized)
    );
  }

  function formatError(error) {
    if (!error) {
      return "Unknown error";
    }

    if (typeof error === "string") {
      return error;
    }

    return normalizeText(error.message || String(error));
  }

  const api = {
    DATE_LABEL_REGEX,
    TIME_RANGE_REGEX,
    parseTimeToMinutes,
    parseTimeRange,
    timesMatch,
    normalizeText,
    parseFilterList,
    coercePositiveInteger,
    formatDateForTeamsLabel,
    parseMeetingLabel,
    normalizeConfig,
    matchesTitleFilters,
    matchesMeetingLabel,
    applyLimit,
    summarizeResults,
    buildCsv,
    isLikelyTeamsCalendarUrl,
    isSupportedTeamsUrl,
    formatError
  };

  root.TeamsAutoRecordShared = Object.assign(
    {},
    shared,
    api
  );

  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.TeamsAutoRecordShared;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
