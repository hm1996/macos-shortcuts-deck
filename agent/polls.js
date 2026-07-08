//
//  DCC Agent — Poll functions
//

const path = require("path");
const fs = require("fs");
const { run, writeState, log, getEksRegions, STATE_DIR, AWS_PROFILES } = require("./lib");

const GIT_ORG = process.env.DCC_GIT_ORG || "";
const GIT_WORKSPACE = process.env.DCC_GIT_WORKSPACE || "";
const GIT_REPOS = process.env.DCC_GIT_REPOS ? process.env.DCC_GIT_REPOS.split(",").map((p) => p.trim()).filter(Boolean) : [];
const INCIDENT_IO_KEY = process.env.DCC_INCIDENT_IO_API_KEY || "";
const INCIDENT_IO_SCHEDULE_ID = process.env.DCC_INCIDENT_IO_SCHEDULE_ID || "";

//
//  AWS
//

async function pollAws() {
  const instances = await Promise.all(AWS_PROFILES.map(async (profile) => {
    const { ok, stdout } = await run(`aws sts get-caller-identity --profile ${profile} --output json`);
    if (!ok) return { name: profile, status: "error", label: "Auth Error" };
    try { JSON.parse(stdout); return { name: profile, status: "ok", label: "Active" }; }
    catch (e) { return { name: profile, status: "ok", label: "Active" }; }
  }));
  writeState("aws.json", { instances });
  log(`AWS: ${instances.map((i) => `${i.name}=${i.label}`).join(", ")}`);
}

//
//  Kubernetes
//

async function pollKubernetes() {
  const regions = await getEksRegions();
  const tasks = AWS_PROFILES.flatMap((profile) =>
    regions.map(async (region) => {
      const { ok, stdout } = await run(`aws eks list-clusters --profile ${profile} --region ${region} --output json`);
      if (!ok) return [];
      try { return (JSON.parse(stdout).clusters || []).map((name) => ({ name, profile, region })); }
      catch (e) { return []; }
    })
  );
  const all = (await Promise.all(tasks)).flat();
  if (all.length === 0) { writeState("kubernetes.json", { instances: [] }); log("K8s: no clusters found"); return; }

  const instances = await Promise.all(all.map(async ({ name, profile, region }) => {
    const { ok, stdout } = await run(`aws eks describe-cluster --profile ${profile} --region ${region} --name ${name} --query cluster.status --output text`);
    if (!ok) return { name, status: "error", label: "Unknown" };
    const eksStatus = stdout.toUpperCase();
    return { name, profile, region, status: eksStatus === "ACTIVE" ? "ok" : eksStatus === "FAILED" ? "error" : "warn", label: eksStatus };
  }));
  writeState("kubernetes.json", { instances });
  log(`K8s: ${instances.map((i) => `${i.name}=${i.label}`).join(", ")}`);
}

//
//  Git (auto-discover)
//

async function discoverGitRepos() {
  if (GIT_REPOS.length > 0) return GIT_REPOS;
  if (!GIT_ORG || !GIT_WORKSPACE) return [];
  log(`Discovering repos from ${GIT_ORG} org under ${GIT_WORKSPACE}...`);
  const { ok, stdout } = await run(`gh repo list ${GIT_ORG} --json name --limit 100`);
  if (!ok) { log("gh repo list failed"); return []; }
  try {
    return JSON.parse(stdout)
      .map((r) => path.join(GIT_WORKSPACE, r.name))
      .filter((p) => { try { return fs.statSync(path.join(p, ".git")).isDirectory(); } catch (e) { return false; } });
  } catch (e) { return []; }
}

let _gitRepos = null;

async function getGitRepos() {
  if (_gitRepos) return _gitRepos;
  _gitRepos = await discoverGitRepos();
  return _gitRepos;
}

async function pollGit() {
  const repos = await getGitRepos();
  if (repos.length === 0) {
    if (!fs.existsSync(path.join(STATE_DIR, "git.json"))) writeState("git.json", { instances: [] });
    return;
  }
  const instances = await Promise.all(repos.map(async (repoPath) => {
    const name = path.basename(repoPath);
    const dirty = await run(`git -C "${repoPath}" status --porcelain`);
    if (!dirty.ok) return { name, status: "warn", label: "Not found" };
    const isDirty = dirty.stdout.length > 0;
    const ahead = await run(`git -C "${repoPath}" rev-list --count @{u}..HEAD 2>/dev/null`);
    const aheadCount = ahead.ok ? parseInt(ahead.stdout, 10) || 0 : 0;
    if (isDirty) return { name, status: "warn", label: "Dirty" };
    if (aheadCount > 0) return { name, status: "warn", label: `${aheadCount} ahead` };
    return { name, status: "ok", label: "Clean" };
  }));
  writeState("git.json", { instances });
  log(`Git: ${instances.map((i) => `${i.name}=${i.label}`).join(", ")}`);
}

//
//  VPN
//

async function pollVpn() {
  const { ok, stdout } = await run("scutil --nc list 2>/dev/null");
  if (ok && stdout) {
    const lines = stdout.split("\n").filter(Boolean);
    const vpnLines = lines.filter((l) => !l.includes("(None)"));
    if (vpnLines.length > 0) {
      const connected = vpnLines.filter((l) => l.includes("Connected")).map((l) => { const m = l.match(/"([^"]+)"\s*\[/); return m ? m[1] : "VPN"; });
      const disconnected = vpnLines.filter((l) => !l.includes("Connected")).map((l) => { const m = l.match(/"([^"]+)"\s*\[/); return m ? m[1] : "VPN"; });
      let instances = [
        ...connected.map((n) => ({ name: n, status: "ok", label: "Connected" })),
        ...disconnected.map((n) => ({ name: n, status: "warn", label: "Disconnected" }))
      ];
      const nordNames = instances.filter((i) => i.name.startsWith("NordLayer"));
      if (nordNames.length > 1) instances = instances.filter((i) => !i.name.startsWith("NordLayer") || i === nordNames.find((n) => n.name.includes("NordLynx")));
      if (instances.length > 0) { writeState("vpn.json", { instances }); log(`VPN: ${instances.map((i) => `${i.name}=${i.label}`).join(", ")}`); return; }
    }
  }

  // Pritunl check — look for the process + active utun with an inet address
  const { ok: pritunlRunning } = await run("pgrep -x Pritunl 2>/dev/null");
  if (pritunlRunning) {
    const { stdout: utun } = await run("ifconfig 2>/dev/null | grep -A1 '^utun' | grep -o 'inet [0-9.]*' | head -1");
    if (utun && utun.trim()) {
      writeState("vpn.json", { instances: [{ name: "Pritunl", status: "ok", label: "Connected" }] });
      log("VPN: Pritunl=Connected (via utun)");
      return;
    }
    writeState("vpn.json", { instances: [{ name: "Pritunl", status: "warn", label: "Disconnected" }] });
    log("VPN: Pritunl=Disconnected (process running, no active tunnel)");
    return;
  }

  const { stdout: ifaces } = await run("ifconfig 2>/dev/null | grep -E '^(utun[0-9]+|wg[0-9]+|tun[0-9]+)' | awk -F: '{print $1}'");
  const tunnels = ifaces.split("\n").filter(Boolean);
  if (tunnels.length === 0) { writeState("vpn.json", { instances: [{ name: "vpn", status: "warn", label: "Disconnected" }] }); log("VPN: no active tunnels"); return; }
  writeState("vpn.json", { instances: tunnels.map((t) => ({ name: t, status: "ok", label: "Connected" })) });
  log(`VPN: ${tunnels.join(", ")} active`);
}

//
//  incident.io
//

async function incidentioFetch(apiPath) {
  if (!INCIDENT_IO_KEY) return null;
  return new Promise((resolve) => {
    const https = require("https");
    https.get(`https://api.incident.io/v2/${apiPath}`, {
      headers: { Authorization: `Bearer ${INCIDENT_IO_KEY}`, Accept: "application/json" }, timeout: 10_000
    }, (res) => {
      let body = "";
      res.on("data", (d) => { body += d; });
      res.on("end", () => { try { resolve({ ok: res.statusCode === 200, data: JSON.parse(body) }); } catch (e) { resolve({ ok: false }); } });
    }).on("error", () => resolve({ ok: false }));
  });
}

async function pollIncidents() {
  if (!INCIDENT_IO_KEY) return;
  const result = await incidentioFetch("incidents?status_category[one_of]=live&page_size=50");
  if (!result?.ok) { log("incident.io: failed to fetch incidents"); return; }
  writeState("incidents.json", {
    active: (result.data.incidents || []).map((i) => ({ id: i.id, name: i.name, severity: i.severity?.name || "?", type: i.incident_type?.name || "", permalink: i.permalink || "" }))
  });
  log(`Incidents: ${(result.data.incidents || []).length} live`);
}

async function pollOnCall() {
  if (!INCIDENT_IO_KEY || !INCIDENT_IO_SCHEDULE_ID) return;
  const now = new Date().toISOString();
  const weekOut = new Date(Date.now() + 7 * 86400000).toISOString();
  const result = await incidentioFetch(`schedule_entries?schedule_id=${INCIDENT_IO_SCHEDULE_ID}&entry_window_start=${encodeURIComponent(now)}&entry_window_end=${encodeURIComponent(weekOut)}`);
  if (!result?.ok) { log("incident.io: failed to fetch on-call"); return; }
  const entries = result.data.schedule_entries?.final || [];
  const current = entries.find((e) => new Date(e.start_at) <= new Date() && new Date() <= new Date(e.end_at));
  if (!current) { writeState("communicate.json", { oncall: null }); log("On-call: nobody"); return; }
  writeState("communicate.json", { oncall: { name: current.user?.name || "?", email: current.user?.email || "", until: current.end_at } });
  log(`On-call: ${current.user?.name || "?"}`);
}

module.exports = { pollAws, pollKubernetes, pollGit, pollVpn, pollIncidents, pollOnCall };
