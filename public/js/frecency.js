//
//  DCC — Frecency (time-decayed frequency ranking)
//

function getFrequency() {
  try { return JSON.parse(localStorage.getItem(FRECENCY_KEY) || "{}"); }
  catch (e) { return {}; }
}

function incrementFrequency(action) {
  try {
    var freq = getFrequency();
    var entry = freq[action];
    freq[action] = {
      count: typeof entry === "object" ? (entry.count || 0) + 1 : typeof entry === "number" ? entry + 1 : 1,
      lastUsed: Date.now()
    };
    localStorage.setItem(FRECENCY_KEY, JSON.stringify(freq));
  } catch (e) { /* storage unavailable */ }
}

function sortByFrequency(options) {
  var freq = getFrequency();
  return [].concat(options).sort(function (a, b) {
    function weight(key) {
      var e = freq[key];
      if (!e) return 0;
      var count = typeof e === "object" ? (e.count || 1) : e;
      var lastUsed = typeof e === "object" && e.lastUsed ? e.lastUsed : 0;
      var daysSince = lastUsed ? (Date.now() - lastUsed) / 86400000 : 0;
      return count / (daysSince + 1);
    }
    var wa = weight(a.action);
    var wb = weight(b.action);
    if (wb !== wa) return wb - wa;
    return a.label.localeCompare(b.label);
  });
}
