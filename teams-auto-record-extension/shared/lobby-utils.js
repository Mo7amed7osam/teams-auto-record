(function attachLobbyUtils(root) {
  const shared =
    root.TeamsAutoRecordShared ||
    (typeof require !== "undefined"
      ? require("./utils.js")
      : {});

  const LOBBY_FEATURE_NAME = "Lobby Access";
  const EVERYONE_VALUE = "Everyone";

  function normalizeLobbyOptionText(value) {
    return shared
      .normalizeText(value)
      .replace(/[\uE000-\uF8FF]/g, "")
      .trim();
  }

  function isEveryoneLobbyOption(value) {
    return normalizeLobbyOptionText(value) === EVERYONE_VALUE;
  }

  function summarizeLobbyResults(results, foundCount) {
    const rows = Array.isArray(results) ? results : [];
    const countStatus = status =>
      rows.filter(item => item.status === status).length;
    const processed = rows.length;
    const found =
      typeof foundCount === "number" && foundCount >= 0
        ? foundCount
        : processed;

    return {
      found,
      processed,
      updated: countStatus("Updated"),
      alreadyEveryone: countStatus("Already Everyone"),
      failed: countStatus("Failed"),
      stopped: countStatus("Stopped"),
      progressPercentage:
        found > 0
          ? Math.min(100, Math.round((processed / found) * 100))
          : 0
    };
  }

  function buildLobbyCsv(results) {
    const columns = [
      "feature",
      "number",
      "title",
      "date",
      "time",
      "previousValue",
      "newValue",
      "status",
      "error"
    ];
    const rows = (results || []).map(result => {
      const row = Object.assign(
        { feature: LOBBY_FEATURE_NAME },
        result
      );
      return columns
        .map(column => shared.csvEscape(row[column]))
        .join(",");
    });

    return [columns.join(",")].concat(rows).join("\n");
  }

  function appendStoppedLobbyResults(plan, results, startIndex) {
    const output = results.slice();

    for (let index = startIndex; index < plan.length; index += 1) {
      const item = plan[index];
      output.push({
        number: index + 1,
        title: item.title,
        date: item.date,
        time: item.time,
        feature: LOBBY_FEATURE_NAME,
        previousValue: "",
        newValue: EVERYONE_VALUE,
        status: "Stopped",
        error: "Stopped by user"
      });
    }

    return output;
  }

  const api = {
    LOBBY_FEATURE_NAME,
    EVERYONE_VALUE,
    normalizeLobbyOptionText,
    isEveryoneLobbyOption,
    summarizeLobbyResults,
    buildLobbyCsv,
    appendStoppedLobbyResults
  };

  root.TeamsAutoRecordShared = Object.assign({}, shared, api);

  if (typeof module !== "undefined" && module.exports) {
    module.exports = root.TeamsAutoRecordShared;
  }
})(typeof globalThis !== "undefined" ? globalThis : window);
