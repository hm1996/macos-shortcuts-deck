//
//  DCC — Media controls, floating volume, audio devices & notifications
//

var _mediaData = { player: "none", state: "stopped", track: "", artist: "", album: "", duration: 0, position: 0, artwork: "" };
var _mediaProgressTimer = null;

function formatMediaTime(ms) {
  if (!ms || ms <= 0) return "0:00";
  var totalSec = Math.floor(ms / 1000);
  return Math.floor(totalSec / 60) + ":" + String(totalSec % 60).padStart(2, "0");
}

function refreshMedia() {
  fetch("/api/media").then(function (r) { return r.json(); }).then(function (d) {
    var strip = document.getElementById("mediaStrip");
    var trackEl = document.getElementById("mediaTrackTitle");
    var artistEl = document.getElementById("mediaTrackArtist");
    if (!strip || !trackEl || !artistEl) return;

    _mediaData = d;

    if (d.player === "none" || d.state === "stopped" || !d.track) {
      strip.hidden = true;
      return;
    }

    strip.hidden = false;
    trackEl.textContent = d.track;
    artistEl.textContent = d.artist ? "\u00b7 " + d.artist : "";

    var playBtn = strip.querySelector('[data-media-cmd="playpause"] svg');
    if (playBtn) {
      playBtn.innerHTML = d.state === "playing"
        ? '<path d="M6 4h4v16H6z M14 4h4v16h-4z"/>'
        : '<path d="M7 4v16l13 -8z"/>';
    }

    updateMediaPopup();
  }).catch(function () {});
}

function updateMediaPopup() {
  var modal = document.getElementById("mediaDetailModal");
  if (!modal || modal.hidden) return;

  var art = document.getElementById("mediaDetailArtwork");
  if (art) {
    art.src = _mediaData.artwork || "";
    art.style.display = _mediaData.artwork ? "block" : "none";
  }
  document.getElementById("mediaDetailAlbum").textContent = _mediaData.album || "\u2014";
  document.getElementById("mediaDetailTrack").textContent = _mediaData.track || "\u2014";
  document.getElementById("mediaDetailArtist").textContent = _mediaData.artist || "\u2014";

  var d = _mediaData.duration || 0;
  var p = _mediaData.position || 0;
  document.getElementById("mediaTimeDuration").textContent = formatMediaTime(d);

  if (_mediaData.state === "playing" && _mediaData.position > 0) {
    p = _mediaData.position + (Date.now() - (_mediaData._fetchedAt || Date.now()));
  }
  document.getElementById("mediaTimeCurrent").textContent = formatMediaTime(p);

  var pct = d > 0 ? Math.min(100, (p / d) * 100) : 0;
  document.getElementById("mediaProgressFill").style.width = pct + "%";

  // sync all play/pause icons (strip + popup)
  document.querySelectorAll('[data-media-cmd="playpause"] svg').forEach(function (svg) {
    svg.innerHTML = _mediaData.state === "playing"
      ? '<path d="M6 4h4v16H6z M14 4h4v16h-4z"/>'
      : '<path d="M7 4v16l13 -8z"/>';
  });
}

function tickMediaPopup() {
  if (_mediaData.state === "playing") {
    _mediaData.position += 1000;
    updateMediaPopup();
  }
}

function openMediaDetail() {
  _mediaData._fetchedAt = Date.now();
  var modal = document.getElementById("mediaDetailModal");
  if (modal) {
    modal.hidden = false;
    updateMediaPopup();
    clearInterval(_mediaProgressTimer);
    _mediaProgressTimer = setInterval(tickMediaPopup, 1000);
  }
}

function closeMediaDetail() {
  var modal = document.getElementById("mediaDetailModal");
  if (modal) modal.hidden = true;
  clearInterval(_mediaProgressTimer);
  _mediaProgressTimer = null;
}

function bindMediaStrip() {
  var strip = document.getElementById("mediaStrip");
  if (!strip) return;

  var dblTapTimer = null;
  strip.addEventListener("click", function (e) {
    if (e.target.closest(".media-btn")) return;

    if (dblTapTimer !== null) {
      clearTimeout(dblTapTimer);
      dblTapTimer = null;
      playTapSound();
      dispatchShortcutAction("open-music");
      return;
    }
    dblTapTimer = setTimeout(function () {
      dblTapTimer = null;
      openMediaDetail();
    }, 300);
  });

  var backdrop = document.getElementById("mediaDetailBackdrop");
  if (backdrop) backdrop.addEventListener("click", closeMediaDetail);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeMediaDetail();
  });
}

function bindMediaControls() {
  document.querySelectorAll(".media-btn[data-media-cmd]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      playTapSound();
      var cmd = btn.dataset.mediaCmd;

      if (cmd === "playpause") {
        var svg = btn.querySelector("svg");
        var nextState = _mediaData.state === "playing" ? "paused" : "playing";
        if (svg) {
          svg.innerHTML = nextState === "playing"
            ? '<path d="M6 4h4v16H6z M14 4h4v16h-4z"/>'
            : '<path d="M7 4v16l13 -8z"/>';
        }
        _mediaData.state = nextState;
        _mediaData._fetchedAt = Date.now();
      }

      fetch("/api/media/control", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: cmd })
      }).then(function () {
        if (cmd === "next" || cmd === "previous") {
          _mediaData._fetchedAt = Date.now();
          updateMediaPopup();
        }
        setTimeout(refreshMedia, 800);
      }).catch(function () {});
    });
  });
}

//
//  Floating volume
//

var _volCollapseTimer = null;

function refreshVolume() {
  fetch("/api/volume").then(function (r) { return r.json(); }).then(function (d) {
    var valEl = document.getElementById("volFloatVal");
    var muteBtn = document.querySelector('.vol-float-btn[data-vol-cmd="mute"]');
    var micBtn = document.getElementById("micMuteBtn");
    if (valEl) valEl.textContent = Math.round(d.volume);
    if (muteBtn) muteBtn.classList.toggle("is-muted", d.muted);
    if (micBtn) micBtn.classList.toggle("is-muted", d.micMuted);
  }).catch(function () {});
}

function bindVolumeControls() {
  var handle = document.getElementById("volFloatHandle");
  if (!handle) return;

  var dblTapTimer = null;
  handle.addEventListener("pointerdown", function () {
    if (dblTapTimer !== null) {
      clearTimeout(dblTapTimer);
      dblTapTimer = null;
      openAudioDevicePicker();
      return;
    }
    dblTapTimer = setTimeout(function () {
      dblTapTimer = null;
      toggleVolExpanded();
    }, 300);
  });

  document.querySelectorAll(".vol-float-btn[data-vol-cmd]").forEach(function (btn) {
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      playTapSound();
      resetVolCollapseTimer();
      var cmd = btn.dataset.volCmd;
      fetch("/api/volume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: cmd })
      }).then(function () { setTimeout(refreshVolume, 300); })
        .catch(function () {});
    });
  });
}

function toggleVolExpanded() {
  var expanded = document.getElementById("volFloatExpanded");
  var handle = document.getElementById("volFloatHandle");
  if (!expanded || !handle) return;
  if (expanded.hidden) {
    expanded.hidden = false;
    handle.hidden = true;
    resetVolCollapseTimer();
  } else {
    expanded.hidden = true;
    handle.hidden = false;
  }
}

var _volCollapseTimer = null;
function resetVolCollapseTimer() {
  clearTimeout(_volCollapseTimer);
  _volCollapseTimer = setTimeout(function () {
    var expanded = document.getElementById("volFloatExpanded");
    var handle = document.getElementById("volFloatHandle");
    if (expanded && !expanded.hidden) {
      expanded.hidden = true;
      handle.hidden = false;
    }
  }, 3500);
}

//
//  Audio device picker
//

function openAudioDevicePicker() {
  fetch("/api/audio-devices").then(function (r) { return r.json(); }).then(function (d) {
    var picker = document.getElementById("audioDevicePicker");
    var outList = document.getElementById("audioOutputList");
    var inList = document.getElementById("audioInputList");
    if (!picker || !outList || !inList) return;

    picker.hidden = false;
    outList.innerHTML = "";
    inList.innerHTML = "";

    (d.outputs || []).forEach(function (dev) {
      var item = document.createElement("div");
      item.className = "audio-device-picker__item" + (dev.current ? " is-current" : "");
      item.textContent = dev.name;
      item.addEventListener("click", function () {
        switchAudioDevice("output", dev.name);
        closeAudioDevicePicker();
      });
      outList.appendChild(item);
    });
    (d.inputs || []).forEach(function (dev) {
      var item = document.createElement("div");
      item.className = "audio-device-picker__item" + (dev.current ? " is-current" : "");
      item.textContent = dev.name;
      item.addEventListener("click", function () {
        switchAudioDevice("input", dev.name);
        closeAudioDevicePicker();
      });
      inList.appendChild(item);
    });
  }).catch(function () {});
}

function closeAudioDevicePicker() {
  var picker = document.getElementById("audioDevicePicker");
  if (picker) picker.hidden = true;
}

function switchAudioDevice(type, device) {
  fetch("/api/audio-devices", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: type, device: device })
  }).catch(function () {});
}

//
//  Notifications
//

function refreshNotifications() {
  fetch("/api/notifications").then(function (r) { return r.json(); }).then(function (d) {
    updateNotifBadge("notifSlack", d.slack);
  }).catch(function () {});
}

function updateNotifBadge(id, count) {
  var el = document.getElementById(id);
  if (!el) return;
  if (count > 0) {
    el.hidden = false;
    el.textContent = count > 99 ? "99+" : String(count);
  } else {
    el.hidden = true;
  }
}

//
//  Init
//

function initMedia() {
  bindMediaStrip();
  bindMediaControls();
  bindVolumeControls();

  var scrBtn = document.getElementById("screenshotBtn");
  if (scrBtn) {
    scrBtn.addEventListener("click", function () {
      playTapSound();
      dispatchShortcutAction("screenshot-clipboard");
    });
  }

  var backdrop = document.getElementById("audioDeviceBackdrop");
  if (backdrop) backdrop.addEventListener("click", closeAudioDevicePicker);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeAudioDevicePicker();
  });

  refreshMedia();
  refreshVolume();
  refreshNotifications();

  setInterval(refreshMedia, 5000);
  setInterval(refreshVolume, 10000);
  setInterval(refreshNotifications, 30000);
}