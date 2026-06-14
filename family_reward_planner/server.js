const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT || 8099);
const ROOT = __dirname;
const DATA_DIR = process.env.PLANNER_DATA_DIR || "/data";
const STATE_FILE = path.join(DATA_DIR, "planner-state.json");
const OPTIONS_FILE = "/data/options.json";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tmp, filePath);
}

async function options() {
  const configured = await readJson(OPTIONS_FILE, {});
  return {
    parent_users: Array.isArray(configured.parent_users) ? configured.parent_users : [],
    child_module_title: configured.child_module_title || "Domowy Planner Nagród",
    parent_module_title: configured.parent_module_title || "Panel rodzica",
  };
}

function userCandidates(req) {
  return [
    req.headers["x-hass-user-id"],
    req.headers["x-hass-user"],
    req.headers["x-ha-user-id"],
    req.headers["x-ha-user"],
    req.headers["remote-user"],
    req.headers["x-forwarded-user"],
  ].filter(Boolean).map((value) => String(value).toLowerCase());
}

function canAccessParent(req, appOptions) {
  const allowed = appOptions.parent_users.map((user) => String(user).trim().toLowerCase()).filter(Boolean);
  if (!allowed.length) return true;
  const candidates = userCandidates(req);
  return candidates.some((candidate) => allowed.includes(candidate));
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(payload);
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

async function serveIndex(req, res, moduleName, appOptions) {
  if (moduleName === "parent" && !canAccessParent(req, appOptions)) {
    return json(res, 403, { error: "parent_module_forbidden" });
  }
  const state = await readJson(STATE_FILE, null);
  const html = await fs.readFile(path.join(ROOT, "index.html"), "utf8");
  const bootstrap = [
    "<script>",
    `window.__PLANNER_API__ = true;`,
    `window.__PLANNER_MODULE__ = ${JSON.stringify(moduleName)};`,
    `window.__PLANNER_OPTIONS__ = ${JSON.stringify({
      child_module_title: appOptions.child_module_title,
      parent_module_title: appOptions.parent_module_title,
    })};`,
    `window.__PLANNER_STATE__ = ${JSON.stringify(state)};`,
    "</script>",
  ].join("");
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(html.replace("</head>", `${bootstrap}</head>`));
}

function ingressPrefix(pathname) {
  const firstSegment = pathname.split("/").filter(Boolean)[0] || "";
  if (firstSegment === "family_reward_planner") return `/${firstSegment}`;
  if (firstSegment.endsWith("_family_reward_planner")) return `/${firstSegment}`;
  return "";
}

function stripIngressPrefix(pathname) {
  const prefix = ingressPrefix(pathname);
  if (!prefix) return pathname;
  const stripped = pathname.slice(prefix.length);
  return stripped || "/";
}

function redirect(res, location) {
  res.writeHead(302, {
    location,
    "cache-control": "no-store",
  });
  res.end();
}

async function serveStatic(req, res, pathname) {
  const cleaned = pathname.replace(/^\/+/, "") || "index.html";
  const filePath = path.normalize(path.join(ROOT, cleaned));
  if (!filePath.startsWith(ROOT)) return json(res, 400, { error: "bad_path" });
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "content-type": MIME_TYPES[ext] || "application/octet-stream",
      "cache-control": ext === ".html" ? "no-store" : "public, max-age=60",
    });
    res.end(data);
  } catch {
    json(res, 404, { error: "not_found" });
  }
}

async function handle(req, res) {
  const appOptions = await options();
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const prefix = ingressPrefix(url.pathname);
  if (prefix && url.pathname === prefix) {
    const query = url.search || "";
    return redirect(res, `${prefix}/${query}`);
  }
  const pathname = stripIngressPrefix(url.pathname).replace(/\/+$/, "") || "/";

  if (pathname === "/healthz") return json(res, 200, { ok: true });
  if (pathname === "/api/options") return json(res, 200, appOptions);

  if (pathname === "/api/state") {
    if (req.method === "GET") {
      return json(res, 200, await readJson(STATE_FILE, null));
    }
    if (req.method === "PUT") {
      const incoming = JSON.parse(await readBody(req));
      await writeJson(STATE_FILE, incoming);
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { error: "method_not_allowed" });
  }

  if (pathname === "/" || pathname === "/child") return serveIndex(req, res, "child", appOptions);
  if (pathname === "/parent") return serveIndex(req, res, "parent", appOptions);

  return serveStatic(req, res, pathname);
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    console.error(error);
    json(res, 500, { error: "internal_error" });
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Family Reward Planner listening on ${PORT}`);
});

function shutdown(signal) {
  console.log(`Family Reward Planner received ${signal}, shutting down`);
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
