//
//  DCC Server — Route handlers
//

const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const { exec } = require("child_process");
const { clusterCache } = require("./eks");

const ROOT = path.resolve(__dirname, "..");
const DEV_MODE = process.env.DCC_DEV === "1";
const VERBOSE = process.env.DCC_VERBOSE === "1";
const GITHUB_ORG = process.env.DCC_GIT_ORG || "";
const CHROME_PROFILES = { work: process.env.DCC_CHROME_PROFILE_WORK || "Default", personal: process.env.DCC_CHROME_PROFILE_PERSONAL || "Default" };
const AWS_PROFILES = process.env.DCC_AWS_PROFILES
  ? Object.fromEntries(process.env.DCC_AWS_PROFILES.split(",").map(p => [p.trim(), "Default"]).filter(([k]) => k))
  : {};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon",
  ".crt": "application/x-x509-ca-cert", ".pem": "application/x-pem-file"
};

//
//  Helpers
//

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
  });
  res.end(JSON.stringify(payload));
}

function logInfo(message) {
  console.log(`[dcc] ${message}`);
}

function logDebug(message) {
  if (VERBOSE) console.log(`[dcc:debug] ${message}`);
}

function logErr(message, err) {
  console.error(`[dcc:err] ${message}`, err ? err.message || err : "");
}

function safePathFromUrl(urlPath) {
  const cleanPath = decodeURIComponent(urlPath.split("?")[0]);
  const requested = cleanPath === "/" ? "/index.html" : cleanPath;

  // state/, node_modules/, and certs/ are served from the project root
  if (requested.startsWith("/state/") || requested.startsWith("/node_modules/") || requested.startsWith("/certs/")) {
    const projectPath = path.resolve(ROOT, `.${requested}`);
    if (projectPath.startsWith(ROOT)) return projectPath;
  }

  const publicRoot = path.resolve(ROOT, "public");
  const publicPath = path.resolve(publicRoot, `.${requested}`);
  if (publicPath.startsWith(publicRoot)) return publicPath;

  return null;
}

//
//  SSE Dev Reload
//

const devSseClients = new Set();
const DEV_RELOAD_SNIPPET = `
<script>
(function(){
  var es = new EventSource("/api/dev-events");
  es.addEventListener("reload", function(){ es.close(); window.location.reload(); });
  es.addEventListener("error", function(){ es.close(); setTimeout(function(){
    var retry = new EventSource("/api/dev-events");
    retry.addEventListener("reload", function(){ retry.close(); window.location.reload(); });
    retry.addEventListener("error", function(){ retry.close(); });
  }, 2000); });
})();
</script>
`;

function devBroadcastReload() {
  if (!DEV_MODE) return;
  const payload = "event: reload\ndata: {}\n\n";
  for (const res of devSseClients) try { res.write(payload); } catch (e) { devSseClients.delete(res); }
}

function devHandleSse(req, res) {
  res.writeHead(200, {
    "Content-Type": "text/event-stream", "Cache-Control": "no-cache",
    "Connection": "keep-alive", "Access-Control-Allow-Origin": "*"
  });
  res.write(":ok\n\n");
  devSseClients.add(res);
  req.on("close", () => devSseClients.delete(res));
}

//
//  Static file serving
//

async function serveStatic(req, res) {
  const fullPath = safePathFromUrl(req.url || "/");
  if (!fullPath) {
    logDebug(`serveStatic: 403 Forbidden — ${req.url}`);
    res.writeHead(403); res.end("Forbidden");
    return;
  }
  const cors = { "Access-Control-Allow-Origin": "*" };
  try {
    const stat = await fsp.stat(fullPath);
    if (stat.isDirectory()) {
      const indexPath = path.join(fullPath, "index.html");
      await fsp.stat(indexPath);
      logDebug(`serveStatic: 200 ${indexPath} (dir→index, ${stat.size} bytes)`);
      if (DEV_MODE && path.extname(indexPath) === ".html") {
        let html = await fsp.readFile(indexPath, "utf8");
        html = html.replace("</body>", `${DEV_RELOAD_SNIPPET}\n</body>`);
        res.writeHead(200, { ...cors, "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }
      res.writeHead(200, { ...cors, "Content-Type": "text/html; charset=utf-8" });
      fs.createReadStream(indexPath).pipe(res);
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    logDebug(`serveStatic: 200 ${fullPath} (${stat.size} bytes, ${ext})`);
    if (DEV_MODE && ext === ".html") {
      let html = await fsp.readFile(fullPath, "utf8");
      html = html.replace("</body>", `${DEV_RELOAD_SNIPPET}\n</body>`);
      res.writeHead(200, { ...cors, "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { ...cors, "Content-Type": contentType });
    fs.createReadStream(fullPath).pipe(res);
  } catch (e) {
    logDebug(`serveStatic: 404 — ${fullPath} (${e.message})`);
    res.writeHead(404); res.end("Not Found");
  }
}

//
//  Action dispatch
//

const ACTION_MAP = {};

function loadActionMap() {
  const actionsFile = path.join(ROOT, "actions", "actions.json");
  try {
    const raw = fs.readFileSync(actionsFile, "utf8");
    const actions = JSON.parse(raw);
    actions.forEach(function (a) {
      if (a.name && a.command) ACTION_MAP[a.name] = a.command;
    });
    logInfo(`Loaded ${Object.keys(ACTION_MAP).length} actions from actions.json`);
  } catch (e) {
    logErr("Failed to load action map, using built-in defaults", e);
    Object.assign(ACTION_MAP, {
      "open-warp": 'open -a "Warp"',
      "open-slack": 'open -a "Slack"',
      "open-finder": 'open -a "Finder" ~/Documents',
      "open-terminal": 'open -a "Terminal"',
      "open-safari": 'open -a "Safari"',
      "open-music": 'open -a "Spotify"'
    });
  }
  // dynamic actions use warpExec, always available
  ACTION_MAP["open-k9s"] = warpExec("k9s");
  ACTION_MAP["warp-k9s"] = warpInline("k9s");
  ACTION_MAP["warp-htop"] = warpInline("htop");
  ACTION_MAP["warp-agent"] = warpInline("/models");
  ACTION_MAP["warp-aws-profile1"] = warpInline("export AWS_PROFILE=YOUR_PROFILE && clear");
  ACTION_MAP["warp-aws-profile2"] = warpInline("export AWS_PROFILE=YOUR_PROFILE && clear");

  // Warp keyboard shortcuts (no new tab)
  ACTION_MAP["warp-split-vertical"] = warpShortcut("d", "command down");
  ACTION_MAP["warp-split-horizontal"] = warpShortcut("d", "command down, shift down");
  ACTION_MAP["warp-window-new"] = warpShortcut("n", "command down");
  ACTION_MAP["warp-tab-new"] = warpShortcut("t", "command down");
  ACTION_MAP["warp-tab-right"] = warpShortcut("]", "command down, shift down");
  ACTION_MAP["warp-tab-left"] = warpShortcut("[", "command down, shift down");

  // Warp terminal commands (inline — no new tab)
  ACTION_MAP["warp-code-open"] = warpInline("code .");
  ACTION_MAP["warp-finder-open"] = warpInline("open .");
  ACTION_MAP["warp-git-status"] = warpInline("git status");
  ACTION_MAP["warp-git-log"] = warpInline("git log --oneline --graph -15");
  ACTION_MAP["warp-kubectl-ctx"] = warpInline("kubectl config get-contexts");
  ACTION_MAP["warp-docker-ps"] = warpInline("docker ps");
  ACTION_MAP["warp-ls"] = warpInline("ls -la");
  ACTION_MAP["warp-df"] = warpInline("df -h");

  // Chrome shortcuts
  ACTION_MAP["chrome-history"] = appShortcut("Google Chrome", "y", "command down");
  ACTION_MAP["chrome-downloads"] = appShortcut("Google Chrome", "j", "command down, shift down");
  ACTION_MAP["chrome-extensions"] = chromeTab("chrome://extensions");
  ACTION_MAP["chrome-settings"] = chromeTab("chrome://settings");
  ACTION_MAP["chrome-new-incognito"] = appShortcut("Google Chrome", "n", "command down, shift down");
  ACTION_MAP["chrome-reopen-tab"] = appShortcut("Google Chrome", "t", "command down, shift down");
  ACTION_MAP["chrome-devtools"] = appShortcut("Google Chrome", "i", "command down, option down");
  ACTION_MAP["chrome-bookmarks"] = appShortcut("Google Chrome", "b", "command down, option down");

  // VS Code shortcuts
  ACTION_MAP["vscode-palette"] = appShortcut("Visual Studio Code", "p", "command down, shift down");
  ACTION_MAP["vscode-goto-file"] = appShortcut("Visual Studio Code", "p", "command down");
  ACTION_MAP["vscode-search"] = appShortcut("Visual Studio Code", "f", "command down, shift down");
  ACTION_MAP["vscode-terminal"] = appShortcut("Visual Studio Code", "`", "control down");
  ACTION_MAP["vscode-explorer"] = appShortcut("Visual Studio Code", "e", "command down, shift down");
  ACTION_MAP["vscode-git-panel"] = appShortcut("Visual Studio Code", "g", "command down, shift down");
  ACTION_MAP["vscode-debug"] = appShortcut("Visual Studio Code", "d", "command down, shift down");
  ACTION_MAP["vscode-extensions"] = appShortcut("Visual Studio Code", "x", "command down, shift down");
  ACTION_MAP["vscode-settings"] = appShortcut("Visual Studio Code", ",", "command down");
  ACTION_MAP["vscode-split"] = appShortcut("Visual Studio Code", "\\", "command down");
  ACTION_MAP["vscode-format"] = appShortcut("Visual Studio Code", "f", "command down, shift down, option down");
  ACTION_MAP["vscode-close-editor"] = appShortcut("Visual Studio Code", "w", "command down");
  ACTION_MAP["vscode-go-back"] = appShortcut("Visual Studio Code", "-", "control down");
  ACTION_MAP["vscode-new-file"] = appShortcut("Visual Studio Code", "n", "command down");

  // Slack shortcuts
  ACTION_MAP["slack-quick-switcher"] = appShortcut("Slack", "k", "command down");
  ACTION_MAP["slack-new-message"] = appShortcut("Slack", "n", "command down");
  ACTION_MAP["slack-search"] = appShortcut("Slack", "g", "command down");
  ACTION_MAP["slack-threads"] = appShortcut("Slack", "t", "command down, shift down");
  ACTION_MAP["slack-unreads"] = appShortcut("Slack", "a", "command down, shift down");
  ACTION_MAP["slack-mentions"] = appShortcut("Slack", "m", "command down, shift down");
  ACTION_MAP["slack-drafts"] = appShortcut("Slack", "d", "command down, shift down");
  ACTION_MAP["slack-channel-browser"] = appShortcut("Slack", "l", "command down, shift down");
  ACTION_MAP["slack-people"] = appShortcut("Slack", "e", "command down, shift down");
  ACTION_MAP["slack-files"] = appShortcut("Slack", "j", "command down, shift down");
  ACTION_MAP["slack-previous"] = appShortcut("Slack", "[", "command down");
  ACTION_MAP["slack-next"] = appShortcut("Slack", "]", "command down");

  // Linear shortcuts
  ACTION_MAP["linear-new-issue"] = appShortcut("Linear", "d", "");
  ACTION_MAP["linear-quick-switcher"] = appShortcut("Linear", "k", "command down");
  ACTION_MAP["linear-search"] = appShortcut("Linear", "/", "command down");
  ACTION_MAP["linear-my-issues"] = appShortcut("Linear", "i", "command down, shift down");
  ACTION_MAP["linear-inbox"] = appShortcut("Linear", "m", "command down");
  ACTION_MAP["linear-active"] = appShortcut("Linear", "a", "command down, shift down");
  ACTION_MAP["linear-backlog"] = appShortcut("Linear", "b", "command down, shift down");
  ACTION_MAP["linear-triage"] = appShortcut("Linear", "t", "command down, shift down");

  // Finder shortcuts
  ACTION_MAP["finder-desktop"] = finderGo("Desktop");
  ACTION_MAP["finder-downloads"] = finderGo("Downloads");
  ACTION_MAP["finder-documents"] = finderGo("Documents");
  ACTION_MAP["finder-applications"] = finderGo("Applications");
  ACTION_MAP["finder-home"] = finderGo("Home");
  ACTION_MAP["finder-airdrop"] = appShortcut("Finder", "r", "command down, shift down");
  ACTION_MAP["finder-new-folder"] = appShortcut("Finder", "n", "command down, shift down");
  ACTION_MAP["finder-empty-trash"] = appShortcut("Finder", "delete", "command down, shift down, option down");
  ACTION_MAP["finder-get-info"] = appShortcut("Finder", "i", "command down");
  ACTION_MAP["finder-connect-server"] = appShortcut("Finder", "k", "command down");

  // Spotify shortcuts (use AppleScript, not keystrokes)
  ACTION_MAP["spotify-playpause"] = `osascript -e 'tell application "Spotify" to playpause'`;
  ACTION_MAP["spotify-next"] = `osascript -e 'tell application "Spotify" to next track'`;
  ACTION_MAP["spotify-previous"] = `osascript -e 'tell application "Spotify" to previous track'`;
  ACTION_MAP["spotify-search"] = `osascript -e 'tell application "Spotify" to activate' -e 'delay 0.3' -e 'tell application "System Events" to tell process "Spotify" to keystroke "f" using command down'`;

  // Safari shortcuts
  ACTION_MAP["safari-new-tab"] = appShortcut("Safari", "t", "command down");
  ACTION_MAP["safari-close-tab"] = appShortcut("Safari", "w", "command down");
  ACTION_MAP["safari-reopen-tab"] = appShortcut("Safari", "t", "command down, shift down");
  ACTION_MAP["safari-address-bar"] = appShortcut("Safari", "l", "command down");
  ACTION_MAP["safari-refresh"] = appShortcut("Safari", "r", "command down");
  ACTION_MAP["safari-private"] = appShortcut("Safari", "n", "command down, shift down");
  ACTION_MAP["safari-bookmark"] = appShortcut("Safari", "d", "command down");

  // Obsidian shortcuts
  ACTION_MAP["obsidian-quick-switcher"] = appShortcut("Obsidian", "o", "command down");
  ACTION_MAP["obsidian-palette"] = appShortcut("Obsidian", "p", "command down");
  ACTION_MAP["obsidian-new-note"] = appShortcut("Obsidian", "n", "command down");
  ACTION_MAP["obsidian-search"] = appShortcut("Obsidian", "f", "command down, shift down");
  ACTION_MAP["obsidian-daily"] = appShortcut("Obsidian", "d", "command down, shift down");

  // ChatGPT shortcuts
  ACTION_MAP["chatgpt-new-chat"] = appShortcut("ChatGPT", "n", "command down, shift down");
  ACTION_MAP["chatgpt-search"] = appShortcut("ChatGPT", "o", "command down, shift down");
  ACTION_MAP["chatgpt-sidebar"] = appShortcut("ChatGPT", "s", "command down, shift down");
  ACTION_MAP["chatgpt-shortcuts"] = appShortcut("ChatGPT", "/", "command down");

  // Calendar shortcuts
  ACTION_MAP["calendar-today"] = appShortcut("Calendar", "t", "command down");
  ACTION_MAP["calendar-day"] = appShortcut("Calendar", "1", "command down");
  ACTION_MAP["calendar-week"] = appShortcut("Calendar", "2", "command down");
  ACTION_MAP["calendar-month"] = appShortcut("Calendar", "3", "command down");
  ACTION_MAP["calendar-new-event"] = appShortcut("Calendar", "n", "command down");

  // iTerm2 shortcuts
  ACTION_MAP["iterm-new-tab"] = appShortcut("iTerm", "t", "command down");
  ACTION_MAP["iterm-split-vertical"] = appShortcut("iTerm", "d", "command down");
  ACTION_MAP["iterm-split-horizontal"] = appShortcut("iTerm", "d", "command down, shift down");
  ACTION_MAP["iterm-close-pane"] = appShortcut("iTerm", "w", "command down");
  ACTION_MAP["iterm-broadcast"] = appShortcut("iTerm", "i", "command down, shift down");
  ACTION_MAP["iterm-search"] = appShortcut("iTerm", "f", "command down");
}
loadActionMap();

function warpExec(shellCommand) {
  return [
    `osascript`,
    `-e 'tell application "Warp" to activate'`,
    `-e 'delay 0.9'`,
    `-e 'tell application "System Events" to tell process "Warp" to keystroke "n" using command down'`,
    `-e 'delay 0.7'`,
    `-e 'tell application "System Events" to tell process "Warp" to keystroke "${shellCommand}"'`,
    `-e 'delay 0.1'`,
    `-e 'tell application "System Events" to tell process "Warp" to key code 36'`
  ].join(" ");
}

function warpInline(shellCommand) {
  return [
    `osascript`,
    `-e 'tell application "Warp" to activate'`,
    `-e 'delay 0.5'`,
    `-e 'tell application "System Events" to tell process "Warp" to keystroke "${shellCommand}"'`,
    `-e 'delay 0.1'`,
    `-e 'tell application "System Events" to tell process "Warp" to key code 36'`
  ].join(" ");
}

function warpShortcut(keystroke, modifiers) {
  return [
    `osascript`,
    `-e 'tell application "Warp" to activate'`,
    `-e 'delay 0.3'`,
    `-e 'tell application "System Events" to tell process "Warp" to keystroke "${keystroke}" using {${modifiers}}'`
  ].join(" ");
}

function appShortcut(appName, keystroke, modifiers) {
  const mods = modifiers || "";
  return [
    `osascript`,
    `-e 'tell application "System Events" to set frontApp to name of first application process whose frontmost is true'`,
    `-e 'if frontApp is not "${appName}" then tell application "${appName}" to activate'`,
    `-e 'delay 0.15'`
  ].join(" ") + " " + (
    mods
      ? `-e 'tell application "System Events" to tell process "${appName}" to keystroke "${keystroke}" using {${mods}}'`
      : `-e 'tell application "System Events" to tell process "${appName}" to keystroke "${keystroke}"'`
  );
}

function chromeTab(url) {
  return `open -na "Google Chrome" --args --profile-directory="Default" "${url}"`;
}

function finderGo(folder) {
  return `osascript -e 'tell application "Finder" to activate' -e 'delay 0.3' -e 'tell application "Finder" to open folder "${folder}" of home'`;
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; if (body.length > 1_000_000) { req.destroy(); reject(new Error("Body too large")); } });
    req.on("end", () => { try { resolve(JSON.parse(body || "{}")); } catch (e) { reject(new Error("Invalid JSON")); } });
    req.on("error", reject);
  });
}

function execAction(command, action, res) {
  const start = Date.now();
  logInfo(`Dispatching action: ${action}`);
  logDebug(`execAction: command=${command.substring(0, 200)}`);
  exec(command, { timeout: 15_000 }, (error) => {
    const elapsed = Date.now() - start;
    if (error) {
      logErr(`Action failed: ${action} (${elapsed}ms)`, error);
      sendJson(res, 500, { ok: false, action, error: "Execution failed" });
      return;
    }
    logInfo(`Action OK: ${action} (${elapsed}ms)`);
    sendJson(res, 200, { ok: true, action });
  });
}

function handleActionDispatch(req, res) {
  const start = Date.now();
  readJsonBody(req)
    .then((payload) => {
      const action = String(payload.action || "");
      logDebug(`handleActionDispatch: action="${action}" body_size=${JSON.stringify(payload).length}`);
      if (action.startsWith("open-k9s:")) {
        const parts = action.split(":");
        if (parts.length !== 4) { logErr(`Bad K9s action: ${action}`); sendJson(res, 400, { ok: false, error: "Expected open-k9s:profile:region:cluster" }); return; }
        const [, profile, region, cluster] = parts;
        if (!/^[\w-]+$/.test(profile) || !/^[\w-]+$/.test(region) || !/^[\w-]+$/.test(cluster)) {
          logErr(`K9s invalid chars: ${action}`);
          sendJson(res, 400, { ok: false, error: "Invalid characters" }); return;
        }
        logDebug(`K9s: profile=${profile} region=${region} cluster=${cluster}`);
        execAction(warpExec(`aws eks update-kubeconfig --profile ${profile} --region ${region} --name ${cluster} && k9s`), action, res);
        return;
      }
      if (action.startsWith("open-github-repo:")) {
        const repo = action.slice("open-github-repo:".length);
        if (!/^[\w.-]+$/.test(repo)) { logErr(`Bad GitHub repo: ${repo}`); sendJson(res, 400, { ok: false, error: "Invalid repo name" }); return; }
        logDebug(`GitHub repo: ${GITHUB_ORG}/${repo}`);
        execAction(`open -na "Google Chrome" --args --profile-directory="${CHROME_PROFILES.work}" "https://github.com/${GITHUB_ORG}/${repo}"`, action, res);
        return;
      }
      if (action.startsWith("open-vscode-folder:")) {
        const folderPath = action.slice("open-vscode-folder:".length);
        if (!folderPath || folderPath.includes("..")) { logErr(`Bad VS Code folder: ${folderPath}`); sendJson(res, 400, { ok: false, error: "Invalid folder path" }); return; }
        logDebug(`VS Code folder: ${folderPath}`);
        execAction(`open -a "Visual Studio Code" "${folderPath}"`, action, res);
        return;
      }
      if (action.startsWith("warp-cd-repo:")) {
        const repo = action.slice("warp-cd-repo:".length);
        if (!repo || !/^[\w.-]+$/.test(repo)) { sendJson(res, 400, { ok: false, error: "Invalid repo name" }); return; }
        const workspace = process.env.DCC_GIT_WORKSPACE || "";
        if (!workspace) { sendJson(res, 400, { ok: false, error: "DCC_GIT_WORKSPACE not set" }); return; }
        const repoPath = path.join(workspace, repo);
        logDebug(`Warp cd repo: ${repoPath}`);
        execAction(warpInline(`cd "${repoPath}" && clear`), action, res);
        return;
      }
      if (action.startsWith("warp-cluster:")) {
        const parts = action.split(":");
        if (parts.length !== 4) { sendJson(res, 400, { ok: false, error: "Expected warp-cluster:profile:region:name" }); return; }
        const [, profile, region, cluster] = parts;
        if (!/^[\w-]+$/.test(profile) || !/^[\w-]+$/.test(region) || !/^[\w-]+$/.test(cluster)) {
          sendJson(res, 400, { ok: false, error: "Invalid characters" }); return;
        }
        logDebug(`Warp cluster kubeconfig: ${profile}/${region}/${cluster}`);
        execAction(warpInline(`aws eks update-kubeconfig --profile ${profile} --region ${region} --name ${cluster} && echo "kubeconfig updated: ${cluster} (${profile}/${region})"`), action, res);
        return;
      }
      const command = ACTION_MAP[action];
      if (!command) {
        const elapsed = Date.now() - start;
        logErr(`Unknown action: ${action} (${elapsed}ms)`);
        sendJson(res, 400, { ok: false, error: "Unknown action" }); return;
      }
      logDebug(`Mapped action: ${action} → ${command.substring(0, 120)}`);
      execAction(command, action, res);
    })
    .catch((err) => {
      logErr(`Action parse error`, err);
      sendJson(res, 400, { ok: false, error: err.message });
    });
}

function fetchGithubRepos() {
  return new Promise((resolve) => {
    exec(`gh repo list ${GITHUB_ORG} --json name,description --limit 60`, { timeout: 12_000 }, (err, stdout) => {
      if (err) { resolve([]); return; }
      try {
        resolve(JSON.parse(stdout).map((r) => ({ name: r.name, description: r.description || "", action: `open-github-repo:${r.name}` })));
      } catch (e) { resolve([]); }
    });
  });
}

//
//  Main request handler
//

async function handleRequest(req, res, refreshClusters) {
  const method = req.method || "GET";
  const url = req.url || "/";
  const reqId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const start = Date.now();

  logDebug(`→ ${method} ${url} [${reqId}]`);

  if (method === "GET" && url === "/api/health") {
    logDebug(`  ↳ route: /api/health [${reqId}]`);
    sendJson(res, 200, { ok: true, service: "dcc-control", dev: DEV_MODE });
    logDebug(`← ${method} ${url} 200 (${Date.now() - start}ms) [${reqId}]`);
    return;
  }
  if (DEV_MODE && method === "GET" && url === "/api/dev-events") {
    logDebug(`  ↳ route: /api/dev-events (SSE) [${reqId}]`);
    devHandleSse(req, res);
    return;
  }
  if (DEV_MODE && method === "POST" && url === "/api/dev-reload") {
    logDebug(`  ↳ route: /api/dev-reload [${reqId}]`);
    devBroadcastReload(); sendJson(res, 200, { ok: true });
    logDebug(`← ${method} ${url} 200 (${Date.now() - start}ms) [${reqId}]`);
    return;
  }
  if (method === "GET" && url === "/api/config") {
    logDebug(`  ↳ route: /api/config [${reqId}]`);
    sendJson(res, 200, {
      incidentio: !!(process.env.DCC_INCIDENT_IO_API_KEY && process.env.DCC_INCIDENT_IO_SCHEDULE_ID),
      focusMs: parseInt(process.env.DCC_FOCUS_MS, 10) || 3000
    });
    logDebug(`← ${method} ${url} 200 (${Date.now() - start}ms) [${reqId}]`);
    return;
  }
  if (method === "GET" && url === "/api/clusters") {
    logDebug(`  ↳ route: /api/clusters (items=${(clusterCache.items || []).length}) [${reqId}]`);
    sendJson(res, 200, clusterCache);
    logDebug(`← ${method} ${url} 200 (${Date.now() - start}ms) [${reqId}]`);
    return;
  }
  if (method === "POST" && url === "/api/clusters/refresh") {
    logDebug(`  ↳ route: /api/clusters/refresh [${reqId}]`);
    refreshClusters(logInfo).then((cache) => {
      logDebug(`  ↳ clusters refreshed: ${(cache.items || []).length} items [${reqId}]`);
      sendJson(res, 200, cache);
    }).catch((err) => {
      logErr(`Cluster refresh failed [${reqId}]`, err);
      sendJson(res, 200, clusterCache);
    });
    logDebug(`← ${method} ${url} (${Date.now() - start}ms) [${reqId}]`);
    return;
  }
  if (method === "GET" && url === "/api/github-repos") {
    logDebug(`  ↳ route: /api/github-repos [${reqId}]`);
    fetchGithubRepos().then((repos) => {
      logDebug(`  ↳ github repos: ${repos.length} found [${reqId}]`);
      sendJson(res, 200, repos);
    }).catch((err) => {
      logErr(`GitHub repos failed [${reqId}]`, err);
      sendJson(res, 200, []);
    });
    logDebug(`← ${method} ${url} (${Date.now() - start}ms) [${reqId}]`);
    return;
  }
  if (method === "GET" && url === "/api/vscode-folders") {
    logDebug(`  ↳ route: /api/vscode-folders [${reqId}]`);
    const workspace = process.env.DCC_GIT_WORKSPACE || "";
    if (!workspace) { sendJson(res, 200, []); return; }
    try {
      const entries = fs.readdirSync(workspace, { withFileTypes: true });
      const folders = entries.filter((e) => e.isDirectory() && !e.name.startsWith(".")).map((e) => ({ name: e.name, path: path.join(workspace, e.name) }));
      logDebug(`  ↳ vscode folders: ${folders.length} found in ${workspace} [${reqId}]`);
      sendJson(res, 200, folders);
    } catch (e) {
      logErr(`vscode-folders error [${reqId}]`, e);
      sendJson(res, 200, []);
    }
    logDebug(`← ${method} ${url} (${Date.now() - start}ms) [${reqId}]`);
    return;
  }
if (method === "GET" && url === "/api/focus") {
    logDebug(`  ↳ route: /api/focus [${reqId}]`);
    exec(
      `osascript -e 'tell application "System Events" to set p to first application process whose frontmost is true' -e 'tell application "System Events" to return {name of p, bundle identifier of p}'`,
      { timeout: 2_000 },
      (err, stdout) => {
        let app = "", bundleId = "";
        if (!err && stdout) {
          const parts = stdout.trim().split(", ");
          app = parts[0] || "";
          bundleId = parts[1] || "";
        }
        logDebug(`  ↳ focus app: "${app}" bundleId: "${bundleId}" [${reqId}]`);
        sendJson(res, 200, { app, bundleId });
      }
    );
    logDebug(`← ${method} ${url} (${Date.now() - start}ms) [${reqId}]`);
    return;
  }
  if (method === "POST" && (url === "/api/actions/dispatch" || url === "/action")) {
    logDebug(`  ↳ route: /api/actions/dispatch [${reqId}]`);
    handleActionDispatch(req, res);
    return;
  }
  if (method === "GET" && url === "/api/media") {
    logDebug(`  ↳ route: /api/media [${reqId}]`);
    handleMediaStatus(req, res, reqId, start);
    return;
  }
  if (method === "POST" && url === "/api/media/control") {
    logDebug(`  ↳ route: /api/media/control [${reqId}]`);
    handleMediaControl(req, res, reqId, start);
    return;
  }
  if (method === "GET" && url === "/api/volume") {
    logDebug(`  ↳ route: /api/volume [${reqId}]`);
    handleVolumeStatus(req, res, reqId, start);
    return;
  }
  if (method === "POST" && url === "/api/volume") {
    logDebug(`  ↳ route: /api/volume (POST) [${reqId}]`);
    handleVolumeSet(req, res, reqId, start);
    return;
  }
  if (method === "GET" && url === "/api/audio-devices") {
    logDebug(`  ↳ route: /api/audio-devices [${reqId}]`);
    handleAudioDevices(req, res, reqId, start);
    return;
  }
  if (method === "POST" && url === "/api/audio-devices") {
    logDebug(`  ↳ route: /api/audio-devices (POST) [${reqId}]`);
    handleAudioDeviceSet(req, res, reqId, start);
    return;
  }
  if (method === "GET" && url === "/api/notifications") {
    logDebug(`  ↳ route: /api/notifications [${reqId}]`);
    handleNotifications(req, res, reqId, start);
    return;
  }
  if (method === "GET" && url === "/api/workspaces") {
    logDebug(`  ↳ route: /api/workspaces [${reqId}]`);
    handleWorkspaces(req, res, reqId, start);
    return;
  }
  // Admin CRUD
  if (url.startsWith("/api/admin/")) {
    handleAdmin(req, res, reqId, start);
    return;
  }

  logDebug(`  ↳ route: serveStatic [${reqId}]`);
  await serveStatic(req, res);
  logDebug(`← ${method} ${url} ${res.statusCode || "?"} (${Date.now() - start}ms) [${reqId}]`);
}

//
//  Media control
//

function handleMediaStatus(req, res, reqId, start) {
  exec(`nowplaying-cli get title artist album duration playbackRate elapsedTime 2>/dev/null`, { timeout: 3_000 }, (err, sysOut) => {
    let sysTitle = "", sysArtist = "", sysAlbum = "", sysDuration = 0, sysPlaying = false, sysPosition = 0;
    if (!err && sysOut) {
      const lines = sysOut.trim().split("\n");
      sysTitle = lines[0] || "";
      sysArtist = lines[1] || "";
      sysAlbum = lines[2] || "";
      sysDuration = parseFloat(lines[3] || "0") || 0;
      sysPlaying = lines[4] === "1";
      sysPosition = Math.floor(parseFloat((lines[5] || "0").replace(",", ".")) * 1000) || 0;
    }

    if (!sysTitle) {
      sendJson(res, 200, { player: "none", state: "stopped", track: "", artist: "", album: "", duration: 0, position: 0, artwork: "" });
      return;
    }

    // Try to get more accurate position + artwork from Spotify if it's the active player
    exec(`osascript -e '
      try
        tell application "Spotify"
          if player state is not stopped then
            set pos to player position
            try
              set art to artwork url of current track
            on error
              set art to ""
            end try
            return "" & pos & "|" & art
          end if
        end tell
      end try
    ' 2>/dev/null`, { timeout: 2_000 }, (spotErr, spotOut) => {
      let artwork = "";
      if (!spotErr && spotOut && spotOut.trim()) {
        const sp = spotOut.trim().split("|");
        const posStr = (sp[0] || "0").replace(",", ".");
        sysPosition = Math.floor(parseFloat(posStr) * 1000) || sysPosition;
        artwork = sp[1] || "";
      }

      sendJson(res, 200, {
        player: "system",
        state: sysPlaying ? "playing" : "paused",
        track: sysTitle,
        artist: sysArtist,
        album: sysAlbum,
        duration: Math.floor(sysDuration * 1000),
        position: sysPosition,
        artwork: artwork
      });
    });
  });
  logDebug(`← GET /api/media (${Date.now() - start}ms) [${reqId}]`);
}

function handleMediaControl(req, res, reqId, start) {
  readJsonBody(req).then((payload) => {
    const cmd = String(payload.command || "");
    let script = "";
    switch (cmd) {
      case "playpause":
        script = `nowplaying-cli togglePlayPause 2>/dev/null || osascript -e 'tell application "Spotify" to playpause'`;
        break;
      case "next":
        script = `nowplaying-cli next 2>/dev/null || osascript -e 'tell application "Spotify" to next track'`;
        break;
      case "previous":
        script = `nowplaying-cli previous 2>/dev/null || osascript -e 'tell application "Spotify" to previous track'`;
        break;
      default:
        sendJson(res, 400, { ok: false, error: "Unknown command" });
        return;
    }
    exec(script, { timeout: 3_000 }, (err) => {
      sendJson(res, err ? 500 : 200, { ok: !err, command: cmd });
    });
  }).catch(() => sendJson(res, 400, { ok: false, error: "Invalid body" }));
  logDebug(`← POST /api/media/control (${Date.now() - start}ms) [${reqId}]`);
}

//
//  Volume control
//

function handleVolumeStatus(req, res, reqId, start) {
  exec(`osascript -e 'get volume settings'`, { timeout: 2_000 }, (err, stdout) => {
    if (err || !stdout) { sendJson(res, 200, { volume: 0, muted: false, micMuted: false }); return; }
    const volMatch = stdout.match(/output volume:(\d+)/);
    const muted = stdout.includes("output muted:true");
    const micMatch = stdout.match(/input volume:(\d+)/);
    const micMuted = micMatch ? parseInt(micMatch[1], 10) === 0 : false;
    sendJson(res, 200, { volume: volMatch ? parseInt(volMatch[1], 10) : 50, muted, micMuted });
  });
  logDebug(`← GET /api/volume (${Date.now() - start}ms) [${reqId}]`);
}

function handleVolumeSet(req, res, reqId, start) {
  readJsonBody(req).then((payload) => {
    const action = String(payload.action || "");
    let script = "";
    switch (action) {
      case "mute":
        script = `osascript -e 'set volume with output muted'`;
        break;
      case "up":
        script = `osascript -e 'set volume output volume (output volume of (get volume settings) + 6.25)'`;
        break;
      case "down":
        script = `osascript -e 'set volume output volume (output volume of (get volume settings) - 6.25)'`;
        break;
      case "mic-mute":
        script = `osascript -e 'set currentInput to input volume of (get volume settings)' -e 'if currentInput > 0 then set volume input volume 0 else set volume input volume 75'`;
        break;
      default:
        sendJson(res, 400, { ok: false, error: "Unknown action" });
        return;
    }
    exec(script, { timeout: 2_000 }, (err) => {
      sendJson(res, err ? 500 : 200, { ok: !err });
    });
  }).catch(() => sendJson(res, 400, { ok: false, error: "Invalid body" }));
  logDebug(`← POST /api/volume (${Date.now() - start}ms) [${reqId}]`);
}

//
//  Audio device switching
//

function handleAudioDevices(req, res, reqId, start) {
  exec(
    `SwitchAudioSource -a -t output 2>/dev/null; echo "---SPLIT---"; SwitchAudioSource -a -t input 2>/dev/null; echo "---SPLIT---"; SwitchAudioSource -c -t output 2>/dev/null; echo "---SPLIT---"; SwitchAudioSource -c -t input 2>/dev/null`,
    { timeout: 3_000 },
    (err, stdout) => {
      const parts = (stdout || "").split("---SPLIT---");
      const outputs = (parts[0] || "").split("\n").filter(Boolean);
      const inputs = (parts[1] || "").split("\n").filter(Boolean);
      const currentOutput = (parts[2] || "").trim();
      const currentInput = (parts[3] || "").trim();
      sendJson(res, 200, {
        outputs: outputs.map((d) => ({ name: d, current: d === currentOutput })),
        inputs: inputs.map((d) => ({ name: d, current: d === currentInput }))
      });
    }
  );
  logDebug(`← GET /api/audio-devices (${Date.now() - start}ms) [${reqId}]`);
}

function handleAudioDeviceSet(req, res, reqId, start) {
  readJsonBody(req).then((payload) => {
    const type = String(payload.type || "output");
    const device = String(payload.device || "");
    if (!device) { sendJson(res, 400, { ok: false, error: "Missing device name" }); return; }
    exec(`SwitchAudioSource -t ${type} -s "${device}"`, { timeout: 2_000 }, (err) => {
      sendJson(res, err ? 500 : 200, { ok: !err });
    });
  }).catch(() => sendJson(res, 400, { ok: false, error: "Invalid body" }));
  logDebug(`← POST /api/audio-devices (${Date.now() - start}ms) [${reqId}]`);
}

//
//  Notifications (Slack badge)
//

function handleNotifications(req, res, reqId, start) {
  exec(`osascript -e '
    try
      tell application "System Events"
        tell process "Dock"
          set slackCount to value of attribute "AXStatusDescription" of UI element "Slack" of list 1
          return slackCount
        end tell
      end tell
    on error
      return "0"
    end try
  ' 2>/dev/null || echo "0"`, { timeout: 2_000 }, (err, stdout) => {
    const count = parseInt((stdout || "0").trim(), 10) || 0;
    sendJson(res, 200, { slack: count });
  });
  logDebug(`← GET /api/notifications (${Date.now() - start}ms) [${reqId}]`);
}

//
//  Workspace configs
//

function handleWorkspaces(req, res, reqId, start) {
  const wsDir = path.join(ROOT, "workspaces");
  try {
    const files = fs.readdirSync(wsDir).filter(function (f) { return f.endsWith(".json"); }).sort();
    const order = [];
    const configs = {};
    files.forEach(function (f) {
      const key = f.replace(".json", "");
      const file = path.join(wsDir, f);
      try {
        configs[key] = JSON.parse(fs.readFileSync(file, "utf8"));
        order.push(key);
      } catch (e) { /* skip unparseable files */ }
    });
    sendJson(res, 200, { order, configs });
  } catch (e) {
    logErr("workspaces error", e);
    sendJson(res, 200, { order: [], configs: {} });
  }
  logDebug(`← GET /api/workspaces (${Date.now() - start}ms) [${reqId}]`);
}

//
//  Admin CRUD
//

function getAdminResource(url) {
  const m = url.match(/^\/api\/admin\/(workspaces|actions|env|focus|logs)(\/[\w.-]+)?/);
  if (!m) return null;
  return { type: m[1], name: m[2] ? m[2].slice(1) : null };
}

function adminListWorkspaces(res) {
  const wsDir = path.join(ROOT, "workspaces");
  try {
    const files = fs.readdirSync(wsDir).filter(f => f.endsWith(".json")).sort();
    const items = files.map(f => {
      const key = f.replace(".json", "");
      try { return { name: key, ...JSON.parse(fs.readFileSync(path.join(wsDir, f), "utf8")) }; }
      catch (e) { return { name: key, title: key, cards: [] }; }
    });
    sendJson(res, 200, items);
  } catch (e) { sendJson(res, 200, []); }
}

function adminGetWorkspace(res, name) {
  const file = path.join(ROOT, "workspaces", name + ".json");
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    sendJson(res, 200, { name, ...data });
  } catch (e) { sendJson(res, 404, { error: "Not found" }); }
}

function adminSaveWorkspace(res, name, body) {
  const file = path.join(ROOT, "workspaces", name + ".json");
  try {
    const data = { title: body.title || name, subtitle: body.subtitle || "", cards: body.cards || [] };
    fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
    sendJson(res, 200, { ok: true, name });
  } catch (e) { sendJson(res, 500, { error: e.message }); }
}

function adminDeleteWorkspace(res, name) {
  const file = path.join(ROOT, "workspaces", name + ".json");
  try { fs.unlinkSync(file); sendJson(res, 200, { ok: true }); }
  catch (e) { sendJson(res, 404, { error: "Not found" }); }
}

function adminListActions(res) {
  const file = path.join(ROOT, "actions", "actions.json");
  try { sendJson(res, 200, JSON.parse(fs.readFileSync(file, "utf8"))); }
  catch (e) { sendJson(res, 200, []); }
}

function adminSaveActions(res, body) {
  const file = path.join(ROOT, "actions", "actions.json");
  try {
    if (!Array.isArray(body)) { sendJson(res, 400, { error: "Expected array" }); return; }
    fs.writeFileSync(file, JSON.stringify(body, null, 2) + "\n");
    // reload action map
    loadActionMap();
    sendJson(res, 200, { ok: true, count: body.length });
  } catch (e) { sendJson(res, 500, { error: e.message }); }
}

function adminGetEnv(res) {
  const envFile = path.join(ROOT, ".env");
  try {
    const raw = fs.readFileSync(envFile, "utf8");
    const vars = {};
    raw.split("\n").forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const idx = trimmed.indexOf("=");
      if (idx > 0) vars[trimmed.slice(0, idx)] = trimmed.slice(idx + 1);
    });
    sendJson(res, 200, vars);
  } catch (e) { sendJson(res, 200, {}); }
}

function adminSaveEnv(res, body) {
  const envFile = path.join(ROOT, ".env");
  try {
    let raw = "";
    try { raw = fs.readFileSync(envFile, "utf8"); } catch (e) {}
    const lines = raw.split("\n");
    Object.keys(body).forEach(key => {
      const val = String(body[key] || "");
      let found = false;
      for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        if (trimmed.startsWith(key + "=")) { lines[i] = key + "=" + val; found = true; break; }
      }
      if (!found) lines.push(key + "=" + val);
    });
    fs.writeFileSync(envFile, lines.join("\n"));
    sendJson(res, 200, { ok: true });
  } catch (e) { sendJson(res, 500, { error: e.message }); }
}

function adminGetLogs(req, res) {
  const logPath = "/tmp/dcc-server.log";
  try {
    if (!fs.existsSync(logPath)) { sendJson(res, 200, { lines: [] }); return; }
    const url = new URL(req.url, "http://localhost");
    const maxLines = parseInt(url.searchParams.get("lines") || "100", 10);
    const raw = fs.readFileSync(logPath, "utf8");
    const lines = raw.split("\n").filter(Boolean);
    sendJson(res, 200, { lines: lines.slice(-maxLines) });
  } catch (e) { sendJson(res, 200, { lines: [] }); }
}

function adminListFocus(res) {
  try {
    const configPath = path.join(ROOT, "public", "js", "config.js");
    const raw = fs.readFileSync(configPath, "utf8");
    const match = raw.match(/const FOCUS_CONTEXTS\s*=\s*({[\s\S]*?});\s*\/\//);
    if (!match) { sendJson(res, 200, []); return; }
    const contexts = eval("(" + match[1] + ")");
    const items = Object.keys(contexts).map(k => ({ bundleId: k, ...contexts[k] }));
    sendJson(res, 200, items);
  } catch (e) { sendJson(res, 500, { error: e.message }); }
}

function adminGetFocus(res, name) {
  try {
    const configPath = path.join(ROOT, "public", "js", "config.js");
    const raw = fs.readFileSync(configPath, "utf8");
    const match = raw.match(/const FOCUS_CONTEXTS\s*=\s*({[\s\S]*?});\s*\/\//);
    if (!match) { sendJson(res, 404, { error: "Not found" }); return; }
    const contexts = eval("(" + match[1] + ")");
    if (!contexts[name]) { sendJson(res, 404, { error: "Not found" }); return; }
    sendJson(res, 200, { bundleId: name, ...contexts[name] });
  } catch (e) { sendJson(res, 500, { error: e.message }); }
}

function adminSaveFocus(res, name, body) {
  try {
    const configPath = path.join(ROOT, "public", "js", "config.js");
    let raw = fs.readFileSync(configPath, "utf8");
    const match = raw.match(/(const FOCUS_CONTEXTS\s*=\s*{)([\s\S]*?)(};)/);
    if (!match) { sendJson(res, 500, { error: "Could not parse config.js" }); return; }
    const prefix = match[1];
    const block = match[2];
    const suffix = match[3];

    // find the entry for this bundleId
    const entryRegex = new RegExp('(\\s*)"' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"\\s*:\\s*\\{[\\s\\S]*?\\}\\s*\\}\\s*(,\\s*)?');
    const entryMatch = block.match(entryRegex);

    const newEntry = '\n  "' + name + '": {\n    app: "' + (body.app || name) + '",\n    actions: ' + JSON.stringify(body.actions || []) + '\n  }';

    let newBlock;
    if (entryMatch) {
      newBlock = block.replace(entryRegex, newEntry + (entryMatch[2] || ""));
    } else {
      // append before closing
      newBlock = block.replace(/\s*$/, ",\n" + newEntry);
    }

    const newRaw = raw.replace(/(const FOCUS_CONTEXTS\s*=\s*{)([\s\S]*?)(};)/, prefix + newBlock + suffix);
    fs.writeFileSync(configPath, newRaw);
    sendJson(res, 200, { ok: true });
  } catch (e) { sendJson(res, 500, { error: e.message }); }
}

function handleAdmin(req, res, reqId, start) {
  const resource = getAdminResource(req.url || "");
  if (!resource) { sendJson(res, 404, { error: "Invalid admin path" }); return; }
  const method = req.method || "GET";

  if (resource.type === "workspaces") {
    if (method === "GET" && !resource.name) { adminListWorkspaces(res); return; }
    if (method === "GET" && resource.name) { adminGetWorkspace(res, resource.name); return; }
    if (method === "PUT" && resource.name) {
      readJsonBody(req).then(body => adminSaveWorkspace(res, resource.name, body)).catch(() => sendJson(res, 400, { error: "Invalid body" }));
      return;
    }
    if (method === "DELETE" && resource.name) { adminDeleteWorkspace(res, resource.name); return; }
  }
  if (resource.type === "actions") {
    if (method === "GET") { adminListActions(res); return; }
    if (method === "PUT") {
      readJsonBody(req).then(body => adminSaveActions(res, body)).catch(() => sendJson(res, 400, { error: "Invalid body" }));
      return;
    }
  }
  if (resource.type === "env") {
    if (method === "GET") { adminGetEnv(res); return; }
    if (method === "PUT") {
      readJsonBody(req).then(body => adminSaveEnv(res, body)).catch(() => sendJson(res, 400, { error: "Invalid body" }));
      return;
    }
  }
  if (resource.type === "logs") {
    if (method === "GET") { adminGetLogs(req, res); return; }
  }
  if (resource.type === "focus") {
    if (method === "GET" && !resource.name) { adminListFocus(res); return; }
    if (method === "GET" && resource.name) { adminGetFocus(res, resource.name); return; }
    if (method === "PUT" && resource.name) {
      readJsonBody(req).then(body => adminSaveFocus(res, resource.name, body)).catch(() => sendJson(res, 400, { error: "Invalid body" }));
      return;
    }
  }
  sendJson(res, 405, { error: "Method not allowed" });
}

module.exports = { handleRequest, logInfo, devBroadcastReload, loadActionMap };
