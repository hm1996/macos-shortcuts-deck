//
//  DCC — Context pickers
//

function closePicker() {
  if (elements.contextPicker) elements.contextPicker.hidden = true;
}

function renderPickerOptions(options, onSelect) {
  elements.contextPickerOptions.innerHTML = "";
  if (!options.length) {
    var el = document.createElement("p");
    el.className = "context-picker__empty";
    el.textContent = "No options available.";
    elements.contextPickerOptions.appendChild(el);
    return;
  }
  options.forEach(function (opt) {
    var btn = document.createElement("button");
    btn.className = "context-picker__option";
    btn.type = "button";
    var labelEl = document.createElement("span");
    labelEl.className = "context-picker__opt-label";
    labelEl.textContent = opt.label;
    btn.appendChild(labelEl);
    if (opt.description) {
      var descEl = document.createElement("span");
      descEl.className = "context-picker__opt-desc";
      descEl.textContent = opt.description;
      btn.appendChild(descEl);
    }
    btn.addEventListener("click", function () { closePicker(); onSelect(opt); });
    elements.contextPickerOptions.appendChild(btn);
  });
}

function formatAge(iso) {
  if (!iso) return null;
  var secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 30) return "Updated just now";
  if (secs < 90) return "Updated 1 min ago";
  var mins = Math.floor(secs / 60);
  if (mins < 60) return "Updated " + mins + " min ago";
  return "Updated " + Math.floor(mins / 60) + "h ago";
}

function setPickerAge(iso) {
  if (!elements.contextPickerAge) return;
  var label = formatAge(iso);
  if (label) {
    elements.contextPickerAge.textContent = label;
    elements.contextPickerAge.hidden = false;
  } else {
    elements.contextPickerAge.hidden = true;
  }
}

async function fetchAndRenderPickerOptions(ctx, onSelect) {
  elements.contextPickerOptions.innerHTML = "";
  var loadEl = document.createElement("p");
  loadEl.className = "context-picker__empty";
  loadEl.textContent = "Loading\u2026";
  elements.contextPickerOptions.appendChild(loadEl);

  try {
    var res = await fetch(ctx.fetchOptions, { cache: "no-store" });
    if (!res.ok) throw new Error("server error");
    var raw = await res.json();
    var mapped = ctx.mapResponse ? ctx.mapResponse(raw) : { items: raw };
    var options = (mapped.items || []).map(ctx.mapItem);
    if (ctx.sortItems) options = ctx.sortItems(options);
    renderPickerOptions(options, onSelect);
    setPickerAge(mapped.refreshedAt);
    return options;
  } catch (e) {
    elements.contextPickerOptions.innerHTML = "";
    var errEl = document.createElement("p");
    errEl.className = "context-picker__empty";
    errEl.textContent = "Could not load options \u2014 server may be offline.";
    elements.contextPickerOptions.appendChild(errEl);
    return null;
  }
}

async function refreshPickerOptions(ctx, onSelect) {
  var btn = elements.contextPickerRefresh;
  if (btn) { btn.disabled = true; btn.classList.add("is-spinning"); }
  if (elements.contextPickerAge) elements.contextPickerAge.textContent = "Refreshing\u2026";

  elements.contextPickerOptions.innerHTML = "";
  var loadEl = document.createElement("p");
  loadEl.className = "context-picker__empty";
  loadEl.textContent = "Fetching clusters\u2026";
  elements.contextPickerOptions.appendChild(loadEl);

  try {
    var res = await fetch(ctx.refreshEndpoint, { method: "POST", cache: "no-store" });
    if (!res.ok) throw new Error("refresh failed");
    var raw = await res.json();
    var mapped = ctx.mapResponse ? ctx.mapResponse(raw) : { items: raw };
    var options = (mapped.items || []).map(ctx.mapItem);
    if (ctx.sortItems) options = ctx.sortItems(options);
    renderPickerOptions(options, onSelect);
    setPickerAge(mapped.refreshedAt);
  } catch (e) {
    elements.contextPickerOptions.innerHTML = "";
    var errEl = document.createElement("p");
    errEl.className = "context-picker__empty";
    errEl.textContent = "Refresh failed \u2014 check AWS CLI access.";
    elements.contextPickerOptions.appendChild(errEl);
  } finally {
    if (btn) { btn.disabled = false; btn.classList.remove("is-spinning"); }
  }
}

async function openContextPicker(action) {
  var ctx = SHORTCUT_CONTEXTS[action];
  if (!ctx) return false;

  playTapSound();
  elements.contextPickerTitle.textContent = ctx.title;
  elements.contextPickerOptions.innerHTML = "";
  elements.contextPicker.hidden = false;
  if (elements.contextPickerRefresh) elements.contextPickerRefresh.hidden = true;
  if (elements.contextPickerAge) elements.contextPickerAge.hidden = true;

  var onSelect = function (opt) {
    if (!opt.action) return;
    incrementFrequency(opt.action);
    dispatchShortcutAction(opt.action);
  };

  if (ctx.options) {
    renderPickerOptions(ctx.options, onSelect);
    return true;
  }

  await fetchAndRenderPickerOptions(ctx, onSelect);

  if (ctx.refreshEndpoint && elements.contextPickerRefresh) {
    elements.contextPickerRefresh.hidden = false;
    elements.contextPickerRefresh.onclick = function () { refreshPickerOptions(ctx, onSelect); };
  }

  return true;
}
