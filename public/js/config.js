//
//  DCC — Configuration & Data
//

var WORKSPACE_CONTENT = {
  focus: {
    title: "Focus",
    subtitle: "Quick actions for the current macOS frontmost app.",
    cards: []
  }
};

var WORKSPACE_ORDER = ["focus"];

function loadWorkspaceConfigs() {
  return fetch("/api/workspaces").then(function (r) { return r.json(); }).then(function (data) {
    if (data.configs && data.order) {
      WORKSPACE_ORDER = ["focus"].concat(data.order);
      Object.keys(data.configs).forEach(function (k) {
        WORKSPACE_CONTENT[k] = data.configs[k];
      });
    }
  }).catch(function () {});
}

const STATE_SOURCES = {
  aws: ["/state/aws.json"],
  kubernetes: ["/state/kubernetes.json"],
  git: ["/state/git.json"],
  vpn: ["/state/vpn.json"],
  incidents: ["/state/incidents.json"],
  communicate: ["/state/communicate.json"]
};

const ACTION_ENDPOINTS = ["/api/actions/dispatch", "http://127.0.0.1:8721/action", "http://localhost:8721/action"];

const FRECENCY_KEY = "dcc.freq";

//
//  Action icons — maps action name prefix to an SVG icon
//

var ACTION_ICONS = {
  "open-chrome": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/><path d="M3 12h4.5M16.5 12H21M12 3v4.5M12 16.5V21"/></svg>',
  "open-github": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.9 5.4 2.6 5.4 2.6a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"/></svg>',
  "open-gmail": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 5l9 7 9-7"/></svg>',
  "open-youtube": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 8a4 4 0 0 1 4-4h12a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><path d="M10 9l5 3-5 3V9z"/></svg>',
  "open-linear": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h16M4 4h16M4 12h16"/></svg>',
  "open-aws": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.657 18C4.085 18 2 15.993 2 13.517c0-2.475 2.085-4.482 4.657-4.482.393-1.762 1.794-3.2 3.675-3.773 1.88-.572 3.956-.193 5.444 1 1.488 1.19 2.162 3.007 1.77 4.769h.99c1.913 0 3.464 1.56 3.464 3.486 0 1.927-1.551 3.487-3.465 3.487H6.657"/></svg>',
  "open-incidentio": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  "open-warp": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M7 11l5 5 5-5"/><path d="M12 4v12"/></svg>',
  "open-terminal": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M7 11l5 5 5-5"/><path d="M12 4v12"/></svg>',
  "open-vscode": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8l-4 4 4 4"/><path d="M17 8l4 4-4 4"/><path d="M14 4l-4 16"/></svg>',
  "open-slack": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 9h8"/><path d="M8 13h6"/><path d="M9 18H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-3l-3 3-3-3"/></svg>',
  "open-obsidian": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',
  "open-music": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>',
  "spotify": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 11.3c2.1-1.3 4.8-1.5 7.3-.6M8.3 13.8c1.8-1 4-1.2 6-.5M8.8 16.2c1.3-.7 3-.9 4.5-.3"/></svg>',
  "safari": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v4l3 3-3 3v4"/><path d="M12 3c-5 0-9 4-9 9s4 9 9 9 9-4 9-9"/></svg>',
  "obsidian": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>',
  "chatgpt": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6.4-4.8-6.4 4.8 2.4-7.2-6-4.8h7.6z"/></svg>',
  "calendar": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  "iterm": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M7 11l5 5 5-5"/><path d="M12 4v12"/></svg>',
  "open-chatgpt": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6.4-4.8-6.4 4.8 2.4-7.2-6-4.8h7.6z"/></svg>',
  "open-finder": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2"/></svg>',
  "open-calendar": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  "open-safari": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 3v4l3 3-3 3v4"/><path d="M12 3c-5 0-9 4-9 9s4 9 9 9 9-4 9-9"/></svg>',
  "open-system-settings": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>',
  "open-activity-monitor": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2-8 6 16 2-8h4"/></svg>',
  "open-cloudflare": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 3l18 18"/></svg>',
  "open-openrouter": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6.4-4.8-6.4 4.8 2.4-7.2-6-4.8h7.6z"/></svg>',
  "open-google-meet": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="16" height="12" rx="2"/><path d="M22 7l-4 3.5L22 14V7z"/></svg>',
  "open-grafana": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 16l4-6 4 3 4-8"/></svg>',
  "open-aws-profile": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15v2m-6 4h12a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2zm10-10V7a4 4 0 0 0-8 0v4h8z"/></svg>',
  "warp-k9s": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 9l3 3-3 3"/><path d="M13 15l3 0"/><path d="M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2l0-12"/></svg>',
  "warp-htop": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h4l2-8 6 16 2-8h4"/></svg>',
  "warp-agent": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l2.4 7.2h7.6l-6 4.8 2.4 7.2-6.4-4.8-6.4 4.8 2.4-7.2-6-4.8h7.6z"/><path d="M12 2v20"/></svg>',
  "warp-aws": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6.657 18C4.085 18 2 15.993 2 13.517c0-2.475 2.085-4.482 4.657-4.482.393-1.762 1.794-3.2 3.675-3.773 1.88-.572 3.956-.193 5.444 1 1.488 1.19 2.162 3.007 1.77 4.769h.99c1.913 0 3.464 1.56 3.464 3.486 0 1.927-1.551 3.487-3.465 3.487H6.657"/></svg>',
  "warp-cd-repo": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2"/></svg>',
  "warp-split-vertical": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M12 4v16"/></svg>',
  "warp-split-horizontal": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 12h20"/></svg>',
  "warp-window-new": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 3v18"/></svg>',
  "warp-tab-new": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v16M4 12h16"/></svg>',
  "warp-tab-right": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
  "warp-tab-left": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  "warp-code-open": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 8l-4 4 4 4"/><path d="M17 8l4 4-4 4"/><path d="M14 4l-4 16"/></svg>',
  "warp-finder-open": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2"/></svg>',
  "warp-git-status": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="18" r="2"/><circle cx="6" cy="6" r="2"/><circle cx="18" cy="6" r="2"/><path d="M6 8v8"/><path d="M8 8c0 2.7 1.3 4 4 4h2"/></svg>',
  "warp-git-log": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 16l4-6 4 2 4-5"/></svg>',
  "warp-kubectl-ctx": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4m0 1a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M3 11m0 1a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/></svg>',
  "warp-docker-ps": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/></svg>',
  "warp-ls": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/><path d="M7 11l5 5 5-5"/><path d="M12 4v12"/></svg>',
  "warp-df": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z"/><path d="M12 7v5l3 3"/></svg>',
  "screenshot-clipboard": '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h1l2-2h8l2 2h1a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7"/><circle cx="12" cy="13" r="3"/></svg>'
};

function getActionIcon(action) {
  if (!action) return ACTION_ICONS["open-chrome"];
  var key = action.split(":")[0];
  if (ACTION_ICONS[key]) return ACTION_ICONS[key];
  // prefix match
  for (var prefix in ACTION_ICONS) {
    if (action.startsWith(prefix)) return ACTION_ICONS[prefix];
  }
  return ACTION_ICONS["open-chrome"];
}

//
//  Focus context panel — shows app-aware quick actions when a macOS app is in focus
//  Map the frontmost app bundle identifier → label + action cards
//

const FOCUS_CONTEXTS = {
  "com.google.Chrome": {
    app: "Chrome",
    actions: [
      { label: "AWS Console", action: "open-aws-profile1" },
      { label: "GitHub", action: "open-github-org" },
      { label: "Linear", action: "open-linear" },
      { label: "YouTube", action: "open-youtube" },
{ label: "Gmail", action: "open-gmail" },
      { label: "Monitoring", action: "open-grafana" },
      { label: "OpenRouter", action: "open-openrouter" },
      { label: "Google Meet", action: "open-google-meet" },
      { label: "ChatGPT", action: "open-chatgpt" },
      { label: "Incident.io", action: "open-incidentio" },
      { label: "Calendar", action: "open-calendar" },
      { label: "Reopen tab", action: "chrome-reopen-tab" },
      { label: "New incognito", action: "chrome-new-incognito" },
      { label: "History", action: "chrome-history" },
      { label: "Downloads", action: "chrome-downloads" },
      { label: "Dev tools", action: "chrome-devtools" },
      { label: "Extensions", action: "chrome-extensions" },
      { label: "Bookmarks", action: "chrome-bookmarks" }
    ]
  },
  "dev.warp.Warp-Stable": {
    app: "Warp",
    actions: [
      { label: "K9s", action: "warp-k9s" },
      { label: "htop", action: "warp-htop" },
      { label: "Agent /models", action: "warp-agent" },
      { label: "AWS profile", action: "open-aws-profile" },
      { label: "Split vertical", action: "warp-split-vertical" },
      { label: "Split horizontal", action: "warp-split-horizontal" },
      { label: "New window", action: "warp-window-new" },
      { label: "New tab", action: "warp-tab-new" },
      { label: "Tab right", action: "warp-tab-right" },
      { label: "Tab left", action: "warp-tab-left" },
      { label: "code .", action: "warp-code-open" },
      { label: "open .", action: "warp-finder-open" },
      { label: "git status", action: "warp-git-status" },
      { label: "git log", action: "warp-git-log" },
      { label: "kubectl ctx", action: "warp-kubectl-ctx" },
      { label: "docker ps", action: "warp-docker-ps" },
      { label: "ls -la", action: "warp-ls" },
      { label: "df -h", action: "warp-df" }
    ]
  },
  "com.microsoft.VSCode": {
    app: "VS Code",
    actions: [
      { label: "Command palette", action: "vscode-palette" },
      { label: "Go to file", action: "vscode-goto-file" },
      { label: "Search", action: "vscode-search" },
      { label: "Terminal", action: "vscode-terminal" },
      { label: "Explorer", action: "vscode-explorer" },
      { label: "Git panel", action: "vscode-git-panel" },
      { label: "Debug", action: "vscode-debug" },
      { label: "Extensions", action: "vscode-extensions" },
      { label: "Settings", action: "vscode-settings" },
      { label: "Split editor", action: "vscode-split" },
      { label: "Go back", action: "vscode-go-back" },
      { label: "Close editor", action: "vscode-close-editor" },
      { label: "Format", action: "vscode-format" },
      { label: "New file", action: "vscode-new-file" },
      { label: "Warp", action: "open-warp" },
      { label: "GitHub", action: "open-github-org" },
      { label: "Slack", action: "open-slack" },
      { label: "Linear", action: "open-linear" }
    ]
  },
  "com.tinyspeck.slackmacgap": {
    app: "Slack",
    actions: [
      { label: "Quick switcher", action: "slack-quick-switcher" },
      { label: "New message", action: "slack-new-message" },
      { label: "Search", action: "slack-search" },
      { label: "Threads", action: "slack-threads" },
      { label: "Unreads", action: "slack-unreads" },
      { label: "Mentions", action: "slack-mentions" },
      { label: "Drafts", action: "slack-drafts" },
      { label: "Channels", action: "slack-channel-browser" },
      { label: "People", action: "slack-people" },
      { label: "Files", action: "slack-files" },
      { label: "Previous", action: "slack-previous" },
      { label: "Next", action: "slack-next" },
      { label: "Calendar", action: "open-calendar" },
      { label: "Linear", action: "open-linear" },
      { label: "Gmail", action: "open-gmail" },
      { label: "GitHub", action: "open-github-org" },
      { label: "VS Code", action: "open-vscode" },
      { label: "Warp", action: "open-warp" }
    ]
  },
  "com.linear": {
    app: "Linear",
    actions: [
      { label: "Quick switcher", action: "linear-quick-switcher" },
      { label: "New issue", action: "linear-new-issue" },
      { label: "My issues", action: "linear-my-issues" },
      { label: "Inbox", action: "linear-inbox" },
      { label: "Active", action: "linear-active" },
      { label: "Backlog", action: "linear-backlog" },
      { label: "Triage", action: "linear-triage" },
      { label: "Search", action: "linear-search" },
      { label: "GitHub", action: "open-github-org" },
      { label: "Slack", action: "open-slack" },
      { label: "Chrome", action: "open-chrome-work" },
      { label: "Warp", action: "open-warp" },
      { label: "VS Code", action: "open-vscode" },
      { label: "Calendar", action: "open-calendar" },
      { label: "Gmail", action: "open-gmail" },
      { label: "AWS Console", action: "open-aws-profile1" },
      { label: "ChatGPT", action: "open-chatgpt" },
      { label: "Incident.io", action: "open-incidentio" }
    ]
  },
  "com.apple.finder": {
    app: "Finder",
    actions: [
      { label: "Desktop", action: "finder-desktop" },
      { label: "Downloads", action: "finder-downloads" },
      { label: "Documents", action: "finder-documents" },
      { label: "Applications", action: "finder-applications" },
      { label: "Home", action: "finder-home" },
      { label: "AirDrop", action: "finder-airdrop" },
      { label: "New folder", action: "finder-new-folder" },
      { label: "Get info", action: "finder-get-info" },
      { label: "Connect server", action: "finder-connect-server" },
      { label: "Empty trash", action: "finder-empty-trash" },
      { label: "System Settings", action: "open-system-settings" },
      { label: "Terminal", action: "open-terminal" },
      { label: "Warp", action: "open-warp" },
      { label: "VS Code", action: "open-vscode" },
      { label: "Activity", action: "open-activity-monitor" },
      { label: "Chrome", action: "open-chrome-work" },
      { label: "Safari", action: "open-safari" },
      { label: "Music", action: "open-music" }
    ]
  },
  "com.apple.systempreferences": {
    app: "System Settings",
    actions: [
      { label: "Finder", action: "open-finder" },
      { label: "Terminal", action: "open-terminal" },
      { label: "Activity", action: "open-activity-monitor" },
      { label: "Warp", action: "open-warp" }
    ]
  },
  "md.obsidian": {
    app: "Obsidian",
    actions: [
      { label: "Quick switcher", action: "obsidian-quick-switcher" },
      { label: "Command palette", action: "obsidian-palette" },
      { label: "New note", action: "obsidian-new-note" },
      { label: "Search", action: "obsidian-search" },
      { label: "Daily note", action: "obsidian-daily" },
      { label: "ChatGPT", action: "open-chatgpt" },
      { label: "Warp", action: "open-warp" }
    ]
  },
  "com.apple.Safari": {
    app: "Safari",
    actions: [
      { label: "New tab", action: "safari-new-tab" },
      { label: "Close tab", action: "safari-close-tab" },
      { label: "Reopen tab", action: "safari-reopen-tab" },
      { label: "Address bar", action: "safari-address-bar" },
      { label: "Refresh", action: "safari-refresh" },
      { label: "Private window", action: "safari-private" },
      { label: "Bookmark", action: "safari-bookmark" },
      { label: "AWS Console", action: "open-aws-profile1" },
      { label: "GitHub", action: "open-github-org" }
    ]
  },
  "com.spotify.client": {
    app: "Spotify",
    actions: [
      { label: "Play / Pause", action: "spotify-playpause" },
      { label: "Next track", action: "spotify-next" },
      { label: "Previous", action: "spotify-previous" },
      { label: "Search", action: "spotify-search" },
      { label: "YouTube", action: "open-youtube" }
    ]
  },
  "com.openai.chat": {
    app: "ChatGPT",
    actions: [
      { label: "New chat", action: "chatgpt-new-chat" },
      { label: "Search", action: "chatgpt-search" },
      { label: "Toggle sidebar", action: "chatgpt-sidebar" },
      { label: "Shortcuts", action: "chatgpt-shortcuts" },
      { label: "Obsidian", action: "open-obsidian" },
      { label: "Warp", action: "open-warp" }
    ]
  },
  "com.apple.iCal": {
    app: "Calendar",
    actions: [
      { label: "Today", action: "calendar-today" },
      { label: "Day view", action: "calendar-day" },
      { label: "Week view", action: "calendar-week" },
      { label: "Month view", action: "calendar-month" },
      { label: "New event", action: "calendar-new-event" },
      { label: "Slack", action: "open-slack" }
    ]
  },
  "com.googlecode.iterm2": {
    app: "iTerm2",
    actions: [
      { label: "New tab", action: "iterm-new-tab" },
      { label: "Split vertical", action: "iterm-split-vertical" },
      { label: "Split horizontal", action: "iterm-split-horizontal" },
      { label: "Close pane", action: "iterm-close-pane" },
      { label: "Broadcast", action: "iterm-broadcast" },
      { label: "Search", action: "iterm-search" },
      { label: "VS Code", action: "open-vscode" },
      { label: "Warp", action: "open-warp" }
    ]
  },


//
//  Shortcut context config — add pickerMode: "single" for tap-to-pick behavior
//

const SHORTCUT_CONTEXTS = {
  "open-chrome": {
    title: "Chrome — profile",
    pickerMode: "single",
    defaultAction: "open-chrome-work",
    options: [
      { label: "Work", description: "Your work profile", action: "open-chrome-work" },
      { label: "Personal", description: "Default profile", action: "open-chrome-personal" }
    ]
  },
  "open-aws": {
    title: "AWS Console — account",
    pickerMode: "single",
    defaultAction: "open-aws-profile1",
    options: [
      { label: "Account 1", description: "YOUR_ACCOUNT_ID", action: "open-aws-profile1" },
      { label: "Account 2", description: "YOUR_ACCOUNT_ID", action: "open-aws-profile2" }
    ]
  },
  "open-vpn": {
    title: "VPN — app",
    pickerMode: "single",
    defaultAction: "open-pritunl",
    options: [
      { label: "Pritunl", description: "OpenVPN client", action: "open-pritunl" },
      { label: "NordLayer", description: "WireGuard + OpenVPN", action: "open-nordlayer" }
    ]
  },
  "open-k9s": {
    title: "K9s — cluster",
    pickerMode: "single",
    defaultAction: "open-k9s",
    fetchOptions: "/api/clusters",
    refreshEndpoint: "/api/clusters/refresh",
    mapResponse: function (data) { return { items: data.items || [], refreshedAt: data.refreshedAt }; },
    mapItem: function (item) { return { label: item.name, description: `${item.accountId || item.profile} · ${item.region}`, action: `open-k9s:${item.profile}:${item.region}:${item.name}` }; }
  },
  "open-github": {
    title: "GitHub — repository",
    pickerMode: "single",
    defaultAction: "open-github-org",
    fetchOptions: "/api/github-repos",
    mapItem: function (item) { return { label: item.name, description: item.description || "", action: item.action || `open-github-repo:${item.name}` }; },
    sortItems: function (options) { return sortByFrequency(options); }
  },
  "open-grafana": {
    title: "Monitoring",
    pickerMode: "single",
    defaultAction: "open-grafana-dev",
    options: [
      { label: "Grafana · Dev", description: "monitoring.YOUR_DOMAIN.com", action: "open-grafana-dev" },
      { label: "Grafana · Prod", description: "monitoring.YOUR_DOMAIN.com", action: "open-grafana-prod" },
      { label: "Vercel", description: "YOUR_ORG/YOUR_PROJECT", action: "open-vercel-project" },
      { label: "Cloudflare", description: "dash.cloudflare.com", action: "open-cloudflare" },
      { label: "PostHog", description: "YOUR_PROJECT_ID", action: "open-posthog-project" }
    ]
  },
  "open-aws-profile": {
    title: "AWS Profile",
    pickerMode: "single",
    defaultAction: "warp-aws-profile1",
    options: [
      { label: "Profile 1", description: "AWS_PROFILE=YOUR_PROFILE", action: "warp-aws-profile1" },
      { label: "Profile 2", description: "AWS_PROFILE=YOUR_PROFILE", action: "warp-aws-profile2" }
    ]
  },
  "open-vscode": {
    title: "VS Code — project",
    pickerMode: "single",
    defaultAction: "open-vscode",
    fetchOptions: "/api/vscode-folders",
    mapItem: function (item) { return { label: item.name, action: `open-vscode-folder:${item.path}` }; },
    sortItems: function (options) { return sortByFrequency(options); }
  }
};
