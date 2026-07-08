// DCC Admin — screens, actions, env vars, focus management

var _editingScreen = null;
var _editingCards = [];
var _editingFocus = null;
var _editingFocusActions = [];

// Tab switching
document.querySelectorAll(".tab").forEach(function (t) {
  t.addEventListener("click", function () {
    switchTab(t.dataset.tab);
  });
});

function switchTab(name) {
  document.querySelectorAll(".tab, .panel").forEach(function (e) { e.classList.remove("active"); });
  var tab = document.querySelector('.tab[data-tab="' + name + '"]');
  if (tab) tab.classList.add("active");
  var panel = document.getElementById("panel-" + name);
  if (panel) panel.classList.add("active");
  if (name === "dashboard") refreshDashboard();
  if (name === "screens") refreshScreens();
  if (name === "focus") refreshFocus();
  if (name === "actions") refreshActions();
  if (name === "env") refreshEnv();
}

// ── Dashboard ──

function refreshDashboard() {
  document.getElementById("statServer").textContent = "checking...";
  fetch("/api/health")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var el = document.getElementById("statServer");
      el.textContent = d.ok ? "● Online" : "○ Offline";
      el.parentElement.className = "stat " + (d.ok ? "online" : "offline");
    })
    .catch(function () {
      var el = document.getElementById("statServer");
      el.textContent = "○ Offline";
      el.parentElement.className = "stat offline";
    });

  fetch("/api/admin/workspaces")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      document.getElementById("statScreens").textContent = (data || []).length;
      document.getElementById("statCards").textContent = (data || []).reduce(function (sum, w) { return sum + (w.cards || []).length; }, 0);
    });

  fetch("/api/admin/actions")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      document.getElementById("statActions").textContent = (data || []).length;
    });

  refreshLogs();
}

function refreshLogs() {
  fetch("/api/admin/logs?lines=50")
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var container = document.getElementById("logPreview");
      if (!d.lines || d.lines.length === 0) {
        container.innerHTML = "<pre>No logs yet. Start the server to generate logs.</pre>";
        return;
      }
      container.innerHTML = "<pre>" + esc(d.lines.join("\n")) + "</pre>";
      container.scrollTop = container.scrollHeight;
    })
    .catch(function () {
      document.getElementById("logPreview").innerHTML = "<pre>Server offline.</pre>";
    });
}

// ── Focus ──

function refreshFocus() {
  fetch("/api/admin/focus")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      document.getElementById("focusList").innerHTML = (data || []).map(function (f) {
        return '<div class="item">' +
          '<div><span>' + esc(f.app) + '</span> <span class="sub">' + esc(f.bundleId) + ' (' + (f.actions || []).length + ' actions)</span></div>' +
          '<div style="display:flex;gap:6px">' +
          '<button class="btn" onclick="editFocus(\'' + escAttr(f.bundleId) + '\')">Edit</button>' +
          '</div></div>';
      }).join("") || '<div class="item"><span class="sub">No focus contexts loaded.</span></div>';
    });
}

function editFocus(bundleId) {
  fetch("/api/admin/focus/" + bundleId)
    .then(function (r) { return r.json(); })
    .then(function (d) {
      _editingFocus = bundleId;
      _editingFocusActions = d.actions || [];
      document.getElementById("focusEditor").hidden = false;
      document.getElementById("focusEditTitle").textContent = "Editing: " + d.app;
      document.getElementById("focusBundleId").value = d.bundleId;
      document.getElementById("focusApp").value = d.app;
      renderFocusActions();
    });
}

function renderFocusActions() {
  document.getElementById("focusActionList").innerHTML = _editingFocusActions.map(function (a, i) {
    return '<div class="form-row">' +
      '<input value="' + esc(a.label) + '" onchange="_editingFocusActions[' + i + '].label=this.value" placeholder="Label" style="max-width:140px" />' +
      '<input value="' + esc(a.action) + '" onchange="_editingFocusActions[' + i + '].action=this.value" placeholder="Action" style="font-family:monospace" />' +
      '<button class="btn btn-del" onclick="_editingFocusActions.splice(' + i + ',1);renderFocusActions()">✕</button>' +
      '</div>';
  }).join("");
}

function addFocusAction() {
  _editingFocusActions.push({ label: "New", action: "" });
  renderFocusActions();
}

function saveFocus() {
  if (!_editingFocus) return;
  var body = {
    app: document.getElementById("focusApp").value || _editingFocus,
    actions: _editingFocusActions
  };
  fetch("/api/admin/focus/" + _editingFocus, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.ok) msg("focusMsg", "Saved");
      else msg("focusMsg", d.error || "Error", true);
    });
}

function createFocus() {
  var id = document.getElementById("newFocusBundle").value.trim();
  var app = document.getElementById("newFocusApp").value.trim();
  if (!id || !app) return msg("focusCreateMsg", "Bundle ID and App name required", true);
  fetch("/api/admin/focus/" + id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ app: app, actions: [] }) })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.ok) { document.getElementById("newFocusBundle").value = ""; document.getElementById("newFocusApp").value = ""; refreshFocus(); msg("focusCreateMsg", "Created"); }
      else msg("focusCreateMsg", d.error || "Error", true);
    });
}

// ── Screens ──

function refreshScreens() {
  fetch("/api/admin/workspaces")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      document.getElementById("screenList").innerHTML = (data || []).map(function (w) {
        return '<div class="item">' +
          '<div><span>' + esc(w.name) + '</span> <span class="sub">' + esc(w.title || "") + '</span></div>' +
          '<div style="display:flex;gap:6px">' +
          '<button class="btn" onclick="editScreen(\'' + escAttr(w.name) + '\')">Edit</button>' +
          '<button class="btn btn-del" onclick="deleteScreen(\'' + escAttr(w.name) + '\')">Del</button>' +
          '</div></div>';
      }).join("") || '<div class="item"><span class="sub">No screens yet.</span></div>';
    });
}

function createScreen() {
  var name = document.getElementById("newScreenName").value.trim();
  if (!name) return msg("screenMsg", "Enter a name", true);
  if (!/^[\w-]+$/.test(name)) return msg("screenMsg", "Name: letters, numbers, hyphens only", true);
  fetch("/api/admin/workspaces/" + name, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: name, subtitle: "", cards: [] }) })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.ok) { document.getElementById("newScreenName").value = ""; refreshScreens(); msg("screenMsg", "Created " + name); }
      else msg("screenMsg", d.error || "Error", true);
    });
}

function editScreen(name) {
  fetch("/api/admin/workspaces/" + name)
    .then(function (r) { return r.json(); })
    .then(function (d) {
      _editingScreen = name;
      _editingCards = d.cards || [];
      document.getElementById("screenEditor").hidden = false;
      document.getElementById("editingName").textContent = "Editing: " + name;
      document.getElementById("editTitle").value = d.title || "";
      document.getElementById("editSubtitle").value = d.subtitle || "";
      renderCards();
    });
}

function renderCards() {
  document.getElementById("cardList").innerHTML = _editingCards.map(function (c, i) {
    return '<div class="card-row">' +
      '<input value="' + esc(c.title) + '" onchange="updateCard(' + i + ',\'title\', this.value)" placeholder="Title" />' +
      '<input value="' + esc(c.tag) + '" onchange="updateCard(' + i + ',\'tag\', this.value)" placeholder="Tag" />' +
      '<input value="' + esc(c.value) + '" onchange="updateCard(' + i + ',\'value\', this.value)" placeholder="Value" />' +
      '<input value="' + esc(c.hint) + '" onchange="updateCard(' + i + ',\'hint\', this.value)" placeholder="Hint" />' +
      '<div style="display:flex;gap:4px;align-items:center">' +
      '<input value="' + esc(c.action || "") + '" onchange="updateCard(' + i + ',\'action\', this.value)" placeholder="action" style="font-size:0.7rem" />' +
      '<button class="btn btn-del" onclick="removeCard(' + i + ')" style="padding:2px 6px;font-size:0.7rem">✕</button>' +
      '</div></div>';
  }).join("");
}

function updateCard(idx, field, val) { _editingCards[idx][field] = val; }
function addCard() { _editingCards.push({ title: "New", tag: "", value: "", hint: "", action: "" }); renderCards(); }
function removeCard(idx) { _editingCards.splice(idx, 1); renderCards(); }

function saveScreen() {
  if (!_editingScreen) return;
  var body = {
    title: document.getElementById("editTitle").value || _editingScreen,
    subtitle: document.getElementById("editSubtitle").value || "",
    cards: _editingCards
  };
  fetch("/api/admin/workspaces/" + _editingScreen, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.ok) msg("screenMsg", "Saved " + _editingScreen);
      else msg("screenMsg", d.error || "Error", true);
    });
}

function deleteScreen(name) {
  if (!confirm("Delete screen '" + name + "'?")) return;
  fetch("/api/admin/workspaces/" + name, { method: "DELETE" })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.ok) { refreshScreens(); if (_editingScreen === name) { _editingScreen = null; document.getElementById("screenEditor").hidden = true; } }
    });
}

// ── Actions ──

function refreshActions() {
  fetch("/api/admin/actions")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      document.getElementById("actionList").innerHTML = (data || []).map(function (a, i) {
        return '<div class="item">' +
          '<div style="display:flex;gap:10px;align-items:center;flex:1">' +
          '<span style="min-width:180px">' + esc(a.name) + '</span>' +
          '<code class="sub" style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(a.command) + '</code>' +
          '</div>' +
          '<button class="btn btn-del" onclick="deleteAction(' + i + ')">Del</button>' +
          '</div>';
      }).join("");
    });
}

function createAction() {
  var name = document.getElementById("newActionName").value.trim();
  var cmd = document.getElementById("newActionCmd").value.trim();
  if (!name || !cmd) return msg("actionMsg", "Both fields required", true);
  fetch("/api/admin/actions")
    .then(function (r) { return r.json(); })
    .then(function (actions) {
      var exists = actions.findIndex(function (a) { return a.name === name; });
      if (exists >= 0) actions[exists].command = cmd;
      else actions.push({ name: name, command: cmd });
      return fetch("/api/admin/actions", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(actions) });
    })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      if (d.ok) { document.getElementById("newActionName").value = ""; document.getElementById("newActionCmd").value = ""; refreshActions(); msg("actionMsg", "Saved"); }
      else msg("actionMsg", d.error || "Error", true);
    });
}

function deleteAction(idx) {
  fetch("/api/admin/actions")
    .then(function (r) { return r.json(); })
    .then(function (actions) {
      var name = actions[idx].name;
      if (!confirm("Delete action '" + name + "'?")) return;
      actions.splice(idx, 1);
      return fetch("/api/admin/actions", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(actions) });
    })
    .then(function (r) { return r.json(); })
    .then(function (d) { if (d.ok) refreshActions(); });
}

// ── Env ──

function refreshEnv() {
  fetch("/api/admin/env")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      document.getElementById("envList").innerHTML = Object.keys(data).sort().map(function (k) {
        return '<div class="env-row">' +
          '<span style="font-size:0.82rem;font-weight:600">' + esc(k) + '</span>' +
          '<input value="' + esc(data[k]) + '" onchange="saveEnv(\'' + escAttr(k) + '\', this.value)" style="padding:6px 8px;border-radius:6px;border:1px solid rgba(170,188,204,0.18);background:#0d1723;color:#e0e6ed;font-size:0.82rem;font-family:monospace" />' +
          '<button class="btn btn-del" onclick="deleteEnv(\'' + escAttr(k) + '\')">Del</button>' +
          '</div>';
      }).join("");
    });
}

function saveEnv(key, val) {
  var body = {};
  body[key] = val;
  fetch("/api/admin/env", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(function (r) { return r.json(); })
    .then(function (d) { if (d.ok) msg("envMsg", key + " saved"); else msg("envMsg", "Error", true); });
}

function addEnv() {
  var k = document.getElementById("newEnvKey").value.trim();
  var v = document.getElementById("newEnvVal").value.trim();
  if (!k) return msg("envMsg", "Key required", true);
  saveEnv(k, v);
  document.getElementById("newEnvKey").value = "";
  document.getElementById("newEnvVal").value = "";
  setTimeout(refreshEnv, 500);
}

function deleteEnv(key) {
  if (!confirm("Delete " + key + "?")) return;
  var body = {};
  body[key] = "";
  fetch("/api/admin/env", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then(function (r) { return r.json(); })
    .then(function (d) { if (d.ok) { refreshEnv(); msg("envMsg", key + " removed"); } });
}

// ── Helpers ──

function esc(s) { return (s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function escAttr(s) { return (s || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'"); }
function msg(id, text, isErr) {
  var el = document.getElementById(id);
  el.textContent = text;
  el.className = "msg " + (isErr ? "msg-err" : "msg-ok");
  setTimeout(function () { el.textContent = ""; }, 3000);
}

// Init
refreshDashboard();
