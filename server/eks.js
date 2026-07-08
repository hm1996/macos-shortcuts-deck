//
//  DCC Server — EKS cluster cache & region discovery
//

const { exec } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const VERBOSE = process.env.DCC_VERBOSE === "1";
const EKS_PROFILES = process.env.DCC_AWS_PROFILES
  ? process.env.DCC_AWS_PROFILES.split(",").map(p => p.trim()).filter(Boolean)
  : [];
const EKS_REGIONS_CACHE_FILE = path.join(ROOT, "state", "eks-regions.json");
const REGION_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 1 week

function logDebug(msg) { if (VERBOSE) console.log(`[dcc:debug] ${msg}`); }
function logErr(msg, err) { console.error(`[dcc:err] ${msg}`, err ? err.message || err : ""); }

const ALL_AWS_REGIONS = [
  "af-south-1", "ap-east-1", "ap-northeast-1", "ap-northeast-2", "ap-northeast-3",
  "ap-south-1", "ap-south-2", "ap-southeast-1", "ap-southeast-2", "ap-southeast-3",
  "ap-southeast-4", "ap-southeast-5", "ap-southeast-7", "ca-central-1", "ca-west-1",
  "eu-central-1", "eu-central-2", "eu-north-1", "eu-south-1", "eu-south-2",
  "eu-west-1", "eu-west-2", "eu-west-3", "il-central-1", "me-central-1",
  "me-south-1", "mx-central-1", "sa-east-1", "us-east-1", "us-east-2",
  "us-west-1", "us-west-2"
];

function loadRegionCache() {
  try {
    if (!fs.existsSync(EKS_REGIONS_CACHE_FILE)) return null;
    const raw = fs.readFileSync(EKS_REGIONS_CACHE_FILE, "utf8");
    const data = JSON.parse(raw);
    if (!data.cachedAt || !Array.isArray(data.regions)) return null;
    return data;
  } catch (e) { return null; }
}

function saveRegionCache(regions) {
  fs.writeFileSync(EKS_REGIONS_CACHE_FILE, JSON.stringify({
    regions: regions,
    cachedAt: new Date().toISOString()
  }, null, 2) + "\n");
}

function getEksRegions() {
  const cache = loadRegionCache();
  if (cache) {
    const age = Date.now() - new Date(cache.cachedAt).getTime();
    logDebug(`EKS region cache: age=${Math.round(age / 3600000)}h, ttl=${REGION_CACHE_TTL / 3600000}h, regions=${cache.regions.length}`);
    if (age < REGION_CACHE_TTL && cache.regions.length > 0) return cache.regions;
  }
  logDebug(`EKS: no valid region cache, scanning all ${ALL_AWS_REGIONS.length} regions`);
  return ALL_AWS_REGIONS;
}

const clusterCache = { items: [], refreshedAt: null };
let clusterRefreshPromise = null;

function listEksClusters(profile, region) {
  return new Promise((resolve) => {
    exec(
      `aws eks list-clusters --profile ${profile} --region ${region} --output json`,
      { timeout: 8_000 },
      (err, stdout) => {
        if (err) { resolve([]); return; }
        try {
          const data = JSON.parse(stdout);
          resolve((data.clusters || []).map((name) => ({
            name, profile, region,
            accountId: profile,
            id: `${profile}:${region}:${name}`
          })));
        } catch (e) { resolve([]); }
      }
    );
  });
}

async function fetchAllClusters() {
  const regions = getEksRegions();
  const tasks = EKS_PROFILES.flatMap((profile) =>
    regions.map((region) => listEksClusters(profile, region))
  );
  const results = await Promise.all(tasks);
  return results.flat();
}

function refreshClusters(logInfo) {
  if (clusterRefreshPromise) {
    logDebug("EKS refresh: already in progress, returning existing promise");
    return clusterRefreshPromise;
  }
  const start = Date.now();
  logDebug("EKS refresh: starting cluster discovery...");
  clusterRefreshPromise = fetchAllClusters()
    .then((items) => {
      clusterCache.items = items;
      clusterCache.refreshedAt = new Date().toISOString();
      const elapsed = Date.now() - start;
      logInfo(`Cluster cache refreshed: ${items.length} cluster(s) found in ${elapsed}ms.`);
      const regionsWithClusters = [...new Set(items.map((c) => c.region))];
      if (regionsWithClusters.length > 0) {
        logDebug(`EKS: saving region cache with ${regionsWithClusters.length} regions: ${regionsWithClusters.join(", ")}`);
        saveRegionCache(regionsWithClusters);
      }
      return clusterCache;
    })
    .catch((err) => {
      logErr("EKS refresh failed", err);
      return clusterCache;
    })
    .finally(() => { clusterRefreshPromise = null; });
  return clusterRefreshPromise;
}

module.exports = { clusterCache, refreshClusters };
