//
//  DCC — Pomodoro timer
//

var POMODORO = { work: 25 * 60, break: 5 * 60, longBreak: 15 * 60 };

var pom = {
  phase: "work",
  remaining: POMODORO.work,
  running: false,
  interval: null,
  sessions: 0,
  streak: 0
};

(function restorePomodoro() {
  try {
    var saved = JSON.parse(localStorage.getItem("dcc.pomodoro"));
    if (saved) {
      pom.phase = saved.phase || "work";
      pom.remaining = typeof saved.remaining === "number" ? saved.remaining : POMODORO[pom.phase];
      pom.sessions = typeof saved.sessions === "number" ? saved.sessions : 0;
      pom.streak = typeof saved.streak === "number" ? saved.streak : 0;
    }
  } catch (e) { /* ignore */ }
})();

function pomFormatTime(secs) {
  return String(Math.floor(secs / 60)).padStart(2, "0") + ":" + String(secs % 60).padStart(2, "0");
}

function pomRender() {
  var timeStr = pomFormatTime(pom.remaining);
  var phaseLabel = pom.phase === "work" ? "WORK" : pom.phase === "longBreak" ? "LONG BREAK" : "BREAK";
  var phaseKey = pom.phase === "longBreak" ? "longBreak" : pom.phase;
  var isIdle = !pom.running && pom.remaining === POMODORO[phaseKey];
  var isPaused = !pom.running && !isIdle;

  try {
    localStorage.setItem("dcc.pomodoro", JSON.stringify({
      phase: pom.phase, remaining: pom.remaining, running: pom.running,
      sessions: pom.sessions, streak: pom.streak, savedAt: Date.now()
    }));
  } catch (e) {}

  if (elements.pomodoroTime) elements.pomodoroTime.textContent = timeStr;
  if (elements.pomodoroBtn) {
    elements.pomodoroBtn.classList.toggle("is-work", pom.running && pom.phase === "work");
    elements.pomodoroBtn.classList.toggle("is-break", pom.phase === "break" || pom.phase === "longBreak");
    elements.pomodoroBtn.classList.toggle("is-paused", isPaused);
    elements.pomodoroBtn.classList.toggle("is-long-break", pom.phase === "longBreak");
  }

  var icon = document.getElementById("pomodoroIcon");
  if (icon) {
    if (pom.phase === "break" || pom.phase === "longBreak") {
      icon.innerHTML = '<path d="M18 8c0 -3 -2 -4 -6 -4s-6 1 -6 4c0 1.5 .5 3 1 4.5a9 9 0 0 0 5 3.5l0 3l-1 0l0 2l6 0l0 -2l-1 0l0 -3a9 9 0 0 0 5 -3.5c.5 -1.5 1 -3 1 -4.5"/><path d="M12 7l0 4l-2 0l4 3"/>';
    } else {
      icon.innerHTML = '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>';
    }
  }

  if (elements.pomodoroModalTime) elements.pomodoroModalTime.textContent = timeStr;
  if (elements.pomodoroModalPhase) {
    elements.pomodoroModalPhase.textContent = phaseLabel;
    elements.pomodoroModalPhase.dataset.phase = pom.phase === "longBreak" ? "break" : pom.phase;
  }
  if (elements.pomodoroModalSessions) {
    elements.pomodoroModalSessions.textContent = pom.sessions === 0
      ? "Session 1"
      : "Session " + (pom.sessions + 1) + " \u00b7 " + pom.sessions + " completed";
  }
  if (elements.pomodoroModalHint) {
    elements.pomodoroModalHint.textContent = pom.running
      ? "tap to pause \u00b7 double-tap to skip"
      : isIdle ? "tap to start \u00b7 double-tap to skip" : "tap to resume \u00b7 double-tap to skip";
  }
}

function pomAdvancePhase() {
  if (pom.phase === "work") {
    pom.sessions++;
    pom.streak++;
    var isLong = pom.streak >= 4;
    pom.phase = isLong ? "longBreak" : "break";
    pom.remaining = isLong ? POMODORO.longBreak : POMODORO.break;
  } else {
    pom.phase = "work";
    pom.remaining = POMODORO.work;
    pom.running = false;
    clearInterval(pom.interval);
    pom.interval = null;
    if (pom.streak >= 4) pom.streak = 0;
  }
  playPomodoroAlert();
  pomRender();

  if (elements.pomodoroBtn) {
    elements.pomodoroBtn.classList.add("pomodoro-btn--blink");
    setTimeout(function () { elements.pomodoroBtn.classList.remove("pomodoro-btn--blink"); }, 1400);
  }
}

function pomTick() {
  pom.remaining--;
  if (pom.remaining <= 0) pomAdvancePhase();
  else pomRender();
}

function pomToggle() {
  if (pom.running) {
    clearInterval(pom.interval);
    pom.interval = null;
    pom.running = false;
  } else {
    pom.running = true;
    pom.interval = setInterval(pomTick, 1000);
  }
  playTapSound();
  pomRender();
}

function pomSkip() {
  if (pom.phase === "work" && pom.running) pom.sessions++;
  clearInterval(pom.interval);
  pom.interval = null;
  pom.running = false;
  pom.phase = pom.phase === "work" ? "break" : "work";
  pom.remaining = POMODORO[pom.phase];
  playTapSound();
  pomRender();
}

function bindPomodoro() {
  if (elements.pomodoroBtn) {
    elements.pomodoroBtn.addEventListener("click", function () {
      playTapSound();
      elements.pomodoroModal.hidden = false;
    });
  }
  if (elements.pomodoroModalBackdrop) {
    elements.pomodoroModalBackdrop.addEventListener("click", function () {
      elements.pomodoroModal.hidden = true;
    });
  }
  if (elements.pomodoroModalPanel) {
    var doubleTapTimer = null;
    elements.pomodoroModalPanel.addEventListener("click", function () {
      if (doubleTapTimer !== null) {
        clearTimeout(doubleTapTimer);
        doubleTapTimer = null;
        pomSkip();
        return;
      }
      doubleTapTimer = setTimeout(function () { doubleTapTimer = null; pomToggle(); }, 300);
    });
  }
}
