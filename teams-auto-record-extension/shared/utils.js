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
  const TIME_RANGE_REGEX =
    /(\d{1,2}:\d{2}\s*(?:AM|PM)\s+to\s+\d{1,2}:\d{2}\s*(?:AM|PM))/i;

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
    const timeRange = normalizeText(
      `${config.startTime} to ${config.endTime}`
    );
    const timeMatches =
      !config.startTime ||
      !config.endTime ||
      parsed.label.includes(timeRange);
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
      normalized.startsWith("https://teams.microsoft.com/") &&
      /calendar|meeting/.test(normalized)
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
