//
//  DCC Agent — Main loop
//

const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "..", ".env") });

const { log, STATE_DIR } = require("./lib");
const { pollAws, pollKubernetes, pollGit, pollVpn, pollIncidents, pollOnCall } = require("./polls");

const POLL_MS = Number(process.env.DCC_POLL_MS || 30_000);
const GIT_ORG = process.env.DCC_GIT_ORG || "";
const GIT_WORKSPACE = process.env.DCC_GIT_WORKSPACE || "";
const GIT_REPOS = process.env.DCC_GIT_REPOS ? process.env.DCC_GIT_REPOS.split(",").map((p) => p.trim()).filter(Boolean) : [];

async function poll() {
  log(`Polling... (${new Date().toISOString()})`);
  await Promise.allSettled([pollAws(), pollKubernetes(), pollGit(), pollVpn(), pollIncidents(), pollOnCall()]);
}

log(`Starting. State dir: ${STATE_DIR}`);
log(`Poll interval: ${POLL_MS / 1000}s`);
if (GIT_REPOS.length) log(`Git repos (explicit): ${GIT_REPOS.join(", ")}`);
else if (GIT_ORG && GIT_WORKSPACE) log(`Git repos: auto-discover from ${GIT_ORG} org under ${GIT_WORKSPACE}`);
else log("Git repos: none configured");

poll();
setInterval(poll, POLL_MS);
