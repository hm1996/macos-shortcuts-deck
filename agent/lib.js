//
//  DCC Agent — Poll helpers & region cache
//

const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const STATE_DIR = process.env.DCC_STATE_DIR || path.resolve(__dirname, "..", "state");
const EKS_REGIONS_CACHE_FILE = path.join(STATE_DIR, "eks-regions.json");
const REGION_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const AWS_PROFILES = process.env.DCC_AWS_PROFILES
  ? process.env.DCC_AWS_PROFILES.split(",").map(p => p.trim()).filter(Boolean)
  : [];

const ALL_AWS_REGIONS = [
  "af-south-1", "ap-east-1", "ap-northeast-1", "ap-northeast-2", "ap-northeast-3",
  "ap-south-1", "ap-south-2", "ap-southeast-1", "ap-southeast-2", "ap-southeast-3",
  "ap-southeast-4", "ap-southeast-5", "ap-southeast-7", "ca-central-1", "ca-west-1",
  "eu-central-1", "eu-central-2", "eu-north-1", "eu-south-1", "eu-south-2",
  "eu-west-1", "eu-west-2", "eu-west-3", "il-central-1", "me-central-1",
  "me-south-1", "mx-central-1", "sa-east-1", "us-east-1", "us-east-2",
  "us-west-1", "us-west-2"
];

function run(cmd) {
  return new Promise((resolve) => {
    exec(cmd, { timeout: 10_000 }, (err, stdout) => {
      resolve({ ok: !err, stdout: (stdout || "").trim() });
    });
  });
}

function writeState(filename, data) {
  data.updatedAt = new Date().toISOString();
  fs.writeFileSync(path.join(STATE_DIR, filename), JSON.stringify(data, null, 2) + "\n");
}

function log(msg) {
  process.stdout.write(`[dcc-agent] ${msg}\n`);
}

function loadRegionCache() {
  try {
    if (!fs.existsSync(EKS_REGIONS_CACHE_FILE)) return null;
    const data = JSON.parse(fs.readFileSync(EKS_REGIONS_CACHE_FILE, "utf8"));
    if (!data.cachedAt || !Array.isArray(data.regions)) return null;
    return data;
  } catch (e) { return null; }
}

function saveRegionCache(regions) {
  fs.writeFileSync(EKS_REGIONS_CACHE_FILE, JSON.stringify({
    regions, cachedAt: new Date().toISOString()
  }, null, 2) + "\n");
}

async function discoverRegions() {
  const cache = loadRegionCache();
  if (cache) {
    const age = Date.now() - new Date(cache.cachedAt).getTime();
    if (age < REGION_CACHE_TTL && cache.regions.length > 0) {
      log(`Region cache: ${cache.regions.length} regions (${Math.round(age / 3600000)}h old)`);
      return cache.regions;
    }
  }
  log(`Scanning all ${ALL_AWS_REGIONS.length} AWS regions for EKS clusters...`);
  const found = new Set();
  for (const profile of AWS_PROFILES) {
    const tasks = ALL_AWS_REGIONS.map(async (region) => {
      const { ok, stdout } = await run(`aws eks list-clusters --profile ${profile} --region ${region} --output json 2>/dev/null`);
      if (!ok) return;
      try { if ((JSON.parse(stdout).clusters || []).length > 0) found.add(region); } catch (e) {}
    });
    await Promise.allSettled(tasks);
  }
  const regions = [...found].sort();
  log(`Discovered ${regions.length} regions with EKS clusters: ${regions.join(", ")}`);
  saveRegionCache(regions);
  return regions;
}

let _eksRegions = null;

async function getEksRegions() {
  if (_eksRegions) return _eksRegions;
  _eksRegions = await discoverRegions();
  return _eksRegions;
}

module.exports = { run, writeState, log, getEksRegions, STATE_DIR, AWS_PROFILES };
