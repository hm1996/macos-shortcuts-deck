//
//  DCC — Clock & macOS focus
//

var lastFocusApp = "";
var lastFocusBundleId = "";
var _focusAutoTimer = null;

function updateClock() {
  var now = new Date();
  var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  elements.clock.textContent =
    days[now.getDay()] + " " + months[now.getMonth()] + " " +
    String(now.getDate()).padStart(2, "0") + "  \u00b7  " +
    String(now.getHours()).padStart(2, "0") + ":" +
    String(now.getMinutes()).padStart(2, "0");
}

function refreshFocus() {
  fetch("/api/focus").then(function (r) { return r.json(); }).then(function (d) {
    var el = document.getElementById("focusIndicator");
    if (el && d.app) el.textContent = "macOS \u00b7 " + d.app;

    if (d.bundleId !== lastFocusBundleId) {
      lastFocusApp = d.app || "";
      lastFocusBundleId = d.bundleId || "";
      applyFocusExitThenRender();

      // auto-navigate to Focus screen after 5s if not already there
      clearTimeout(_focusAutoTimer);
      if (WORKSPACE_ORDER[currentWorkspaceIndex] !== "focus") {
        _focusAutoTimer = setTimeout(function () {
          if (WORKSPACE_ORDER[currentWorkspaceIndex] !== "focus") {
            setActiveWorkspace("focus");
          }
        }, 5000);
      }
    }
  }).catch(function () {});
}

function applyFocusExitThenRender() {
  var grids = document.querySelectorAll(".swiper-slide[data-workspace=\"focus\"] .workspace-grid");
  grids.forEach(function (grid) {
    var oldCards = grid.querySelectorAll(".dcc-card");
    if (oldCards.length > 0) {
      oldCards.forEach(function (card) { card.classList.add("dcc-card--out"); });
      setTimeout(function () { renderFocusWorkspaceGrid(grid); }, 180);
    } else {
      renderFocusWorkspaceGrid(grid);
    }
  });
}

function renderFocusWorkspaceGrid(grid) {
  if (!grid) return;
  grid.innerHTML = "";

  var ctx = FOCUS_CONTEXTS[lastFocusBundleId];

  if (!ctx || !ctx.actions || ctx.actions.length === 0) {
    var empty = document.createElement("p");
    empty.style.cssText = "grid-column:1/-1;text-align:center;color:var(--text-secondary);padding:40px;font-size:1.1rem;";
    empty.textContent = lastFocusApp
      ? "No quick actions configured for " + lastFocusApp
      : "Switch to a macOS app to see context actions";
    grid.appendChild(empty);
    return;
  }

  ctx.actions.forEach(function (a, index) {
    var node = elements.cardTemplate.content.firstElementChild.cloneNode(true);
    node.classList.add("dcc-card--compact");
    node.style.animationDelay = (index * 55) + "ms";
    node.querySelector(".dcc-card__title").textContent = a.label;
    var tagEl = node.querySelector(".dcc-card__tag");
    if (tagEl) tagEl.style.display = "none";
    var hintEl = node.querySelector(".dcc-card__hint");
    if (hintEl) { hintEl.textContent = ""; hintEl.style.display = "none"; }
    var icon = getActionIcon(a.action);
    node.querySelector(".dcc-card__value").innerHTML = icon;
    node.querySelector(".dcc-card__hint").textContent = "";
    var iconWrap = node.querySelector(".dcc-card__icon-wrap");
    if (iconWrap) iconWrap.style.display = "none";
    node.style.cursor = "pointer";
    node.addEventListener("click", function (e) {
      e.stopPropagation();
      playTapSound();
      if (SHORTCUT_CONTEXTS[a.action]) {
        openContextPicker(a.action);
      } else {
        dispatchShortcutAction(a.action);
      }
    });
    grid.appendChild(node);
  });
}