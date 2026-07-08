//
//  DCC — State polling & status pills
//

var lastStateData = {};
var _offlineStreak = 0;
var _incidentioEnabled = false;

function classifyStatus(value) {
  var v = String(value || "").toLowerCase();
  if (v.indexOf("down") !== -1 || v.indexOf("error") !== -1 || v.indexOf("fail") !== -1 || v.indexOf("bad") !== -1) return "bad";
  if (v.indexOf("warn") !== -1 || v.indexOf("degraded") !== -1 || v.indexOf("unknown") !== -1) return "warn";
  return "ok";
}

function updatePillMood(serviceName, label, mood) {
  var pill = elements.pills[serviceName];
  if (!pill) return;
  pill.classList.remove("status-pill--ok", "status-pill--warn", "status-pill--bad");
  pill.classList.add("status-pill--" + mood);
  var span = pill.querySelector("span");
  if (span) span.textContent = label;
}

function computeServiceStatus(data) {
  if (!data) return { label: "?", mood: "warn" };
  if (Array.isArray(data.instances)) {
    var total = data.instances.length;
    if (total === 0) return { label: "0", mood: "warn" };
    var moods = data.instances.map(function (i) { return classifyStatus(i.status || i.label || "ok"); });
    var badCount = moods.filter(function (m) { return m === "bad"; }).length;
    var warnCount = moods.filter(function (m) { return m === "warn"; }).length;
    var okCount = total - badCount - warnCount;
    return { label: okCount + "/" + total, mood: badCount > 0 ? "bad" : warnCount > 0 ? "warn" : "ok" };
  }
  var raw = data.label || data.status || "?";
  return { label: raw, mood: classifyStatus(raw) };
}

async function readFirstAvailable(urls) {
  for (var i = 0; i < urls.length; i++) {
    try {
      var res = await fetch(urls[i], { cache: "no-store" });
      if (!res.ok) continue;
      return await res.json();
    } catch (e) { /* try next */ }
  }
  return null;
}

async function refreshState() {
  var results = await Promise.all([
    readFirstAvailable(STATE_SOURCES.aws),
    readFirstAvailable(STATE_SOURCES.kubernetes),
    readFirstAvailable(STATE_SOURCES.git),
    readFirstAvailable(STATE_SOURCES.vpn)
  ]);
  var aws = results[0], kubernetes = results[1], git = results[2], vpn = results[3];

  var anySuccess = [aws, kubernetes, git, vpn].some(Boolean);
  if (anySuccess) {
    document.querySelector(".status-bar")?.classList.remove("is-offline");
    _offlineStreak = 0;
  } else {
    _offlineStreak++;
    if (_offlineStreak >= 2) document.querySelector(".status-bar")?.classList.add("is-offline");
  }

  var incidents = null, communicate = null;
  if (_incidentioEnabled) {
    var extra = await Promise.all([
      readFirstAvailable(STATE_SOURCES.incidents),
      readFirstAvailable(STATE_SOURCES.communicate)
    ]);
    incidents = extra[0];
    communicate = extra[1];
  }

  lastStateData = { aws: aws, kubernetes: kubernetes, git: git, vpn: vpn, incidents: incidents, communicate: communicate };

  var info = {
    aws: computeServiceStatus(aws),
    kubernetes: computeServiceStatus(kubernetes),
    git: computeServiceStatus(git),
    vpn: computeServiceStatus(vpn)
  };

  Object.keys(info).forEach(function (svc) {
    updatePillMood(svc, info[svc].label, info[svc].mood);
  });

  if (elements.incidentBadge && elements.incidentCount) {
    var active = incidents?.active || [];
    if (active.length > 0) {
      elements.incidentBadge.hidden = false;
      elements.incidentCount.textContent = active.length;
      elements.incidentBadge.title = active.map(function (i) { return i.severity + ": " + i.name; }).join(" \u00b7 ");
    } else {
      elements.incidentBadge.hidden = true;
    }
  }

  if (elements.oncallIndicator && elements.oncallName) {
    var oncall = communicate?.oncall;
    if (oncall?.name) {
      elements.oncallIndicator.hidden = false;
      elements.oncallName.textContent = oncall.name;
    } else {
      elements.oncallIndicator.hidden = true;
    }
  }

  updateHomeCards();
  updateOpsCards();
}
