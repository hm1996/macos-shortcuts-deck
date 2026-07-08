const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const HOST = process.env.DCC_HOST || undefined;
const PORT = Number(process.env.DCC_PORT || 8721);
const TLS_KEY_PATH = process.env.DCC_TLS_KEY || path.resolve(__dirname, "certs/dcc-local.key");
const TLS_CERT_PATH = process.env.DCC_TLS_CERT || path.resolve(__dirname, "certs/dcc-local.fullchain.crt");
const TLS_REQUIRED = process.env.DCC_TLS_REQUIRED === "1";
const DEV_MODE = process.env.DCC_DEV === "1";

const { handleRequest, logInfo, devBroadcastReload } = require("./server/routes");
const { refreshClusters } = require("./server/eks");

const VERBOSE = process.env.DCC_VERBOSE === "1";

function createServer() {
  const hasTlsFiles = fs.existsSync(TLS_KEY_PATH) && fs.existsSync(TLS_CERT_PATH);
  if (hasTlsFiles) {
    logInfo(`TLS certs found: key=${TLS_KEY_PATH} cert=${TLS_CERT_PATH}`);
    const key = fs.readFileSync(TLS_KEY_PATH, "utf8");
    const cert = fs.readFileSync(TLS_CERT_PATH, "utf8");
    return { server: https.createServer({ key, cert }, requestHandler), protocol: "https" };
  }
  logInfo("TLS certs not found");
  if (TLS_REQUIRED) throw new Error("TLS required but cert/key files were not found.");
  return { server: http.createServer(requestHandler), protocol: "http" };
}

const requestHandler = (req, res) => {
  handleRequest(req, res, refreshClusters);
};

const { server, protocol } = createServer();

// Warm the EKS cluster cache
refreshClusters(logInfo);
setInterval(() => refreshClusters(logInfo), 10 * 60 * 1000);

server.listen(PORT, HOST, () => {
  logInfo(`Server listening on ${protocol}://${HOST || "0.0.0.0"}:${PORT}`);
  logInfo(`Mode: ${DEV_MODE ? "development" : "production"}, TLS: ${protocol === "https" ? "enabled" : "disabled"}, Verbose: ${VERBOSE ? "on" : "off"}`);
  if (protocol === "http") logInfo("TLS not enabled. Generate certs for secure-context features.");

  logInfo(`Static root: ${path.resolve(__dirname, "public")}`);
  logInfo(`State files: ${path.resolve(__dirname, "state")}`);

  if (DEV_MODE) {
    logInfo("Dev reload: SSE endpoint enabled at /api/dev-events");
    const RESTART_FLAG = "/tmp/dcc-dev-restart";
    if (fs.existsSync(RESTART_FLAG)) {
      try { fs.unlinkSync(RESTART_FLAG); } catch (e) {}
      logInfo("Dev reload: restart flag detected — broadcasting to SSE clients in 600ms");
      setTimeout(() => { logInfo("Dev reload: broadcasting to SSE clients"); devBroadcastReload(); }, 600);
    }
  }
});
