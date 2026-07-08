//
//  DCC — Initialize & glue everything together
//

function initialize() {
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js?v=3").catch(function () {});
  }

  bindShortcutEvents();
  bindPickerBackdrop();
  bindPomodoro();
  bindTooltip();
  loadWorkspaceConfigs().then(function () { initSwiper(); });

  if (elements.clock) {
    elements.clock.addEventListener("click", function () {
      playTapSound();
      dispatchShortcutAction("open-calendar");
    });
  }
  if (elements.incidentBadge) {
    elements.incidentBadge.addEventListener("click", function () {
      playTapSound();
      dispatchShortcutAction("open-incidentio");
    });
  }

  pomRender();
  updateClock();
  refreshState();
  refreshFocus();
  initMedia();

  var _focusMs = 3000;
  var _focusInterval = setInterval(refreshFocus, _focusMs);
  fetch("/api/config").then(function (r) { return r.json(); }).then(function (c) {
    _incidentioEnabled = c.incidentio === true;
    if (c.focusMs && c.focusMs > 0 && c.focusMs !== _focusMs) {
      _focusMs = c.focusMs;
      clearInterval(_focusInterval);
      _focusInterval = setInterval(refreshFocus, _focusMs);
    }
  }).catch(function () {});

  setInterval(updateClock, 1000);
  setInterval(refreshState, 15000);
  // re-check focus interval every 30s
  setInterval(function () {
    fetch("/api/config").then(function (r) { return r.json(); }).then(function (c) {
      if (c.focusMs && c.focusMs !== _focusMs) {
        _focusMs = c.focusMs;
        clearInterval(_focusInterval);
        _focusInterval = setInterval(refreshFocus, _focusMs);
      }
    }).catch(function () {});
  }, 30000);
}

initialize();
