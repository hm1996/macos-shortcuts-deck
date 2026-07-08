//
//  DCC — Shortcut handling & action dispatch
//

async function dispatchShortcutAction(action, element) {
  if (!action) return;
  for (var i = 0; i < ACTION_ENDPOINTS.length; i++) {
    try {
      var res = await fetch(ACTION_ENDPOINTS[i], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: action })
      });
      if (!res.ok) continue;
      playSuccessSound();
      return;
    } catch (e) { /* try next */ }
  }
  playErrorSound();
  if (element) {
    element.classList.add("shortcut-link--error");
    setTimeout(function () { element.classList.remove("shortcut-link--error"); }, 500);
  }
}

function bindShortcutEvents() {
  elements.shortcutLinks.forEach(function (link) {
    var doubleTapTimer = null;

    link.addEventListener("pointerdown", playTapSound);

    link.addEventListener("click", function (e) {
      e.preventDefault();
      var action = link.dataset.action;
      if (!action) return;

      var ctx = SHORTCUT_CONTEXTS[action];

      if (!ctx) {
        dispatchShortcutAction(action, link);
        return;
      }

      if (ctx.pickerMode === "single") {
        if (doubleTapTimer !== null) {
          clearTimeout(doubleTapTimer);
          doubleTapTimer = null;
          dispatchShortcutAction(ctx.defaultAction, link);
          return;
        }
        doubleTapTimer = setTimeout(function () {
          doubleTapTimer = null;
          openContextPicker(action);
        }, 300);
        return;
      }

      if (doubleTapTimer !== null) {
        clearTimeout(doubleTapTimer);
        doubleTapTimer = null;
        openContextPicker(action);
        return;
      }

      doubleTapTimer = setTimeout(function () {
        doubleTapTimer = null;
        dispatchShortcutAction(ctx.defaultAction, link);
      }, 300);
    });
  });
}

function bindPickerBackdrop() {
  if (elements.contextPickerBackdrop) {
    elements.contextPickerBackdrop.addEventListener("click", closePicker);
  }
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closePicker();
  });
}
