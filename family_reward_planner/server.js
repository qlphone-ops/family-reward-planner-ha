const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT || 8099);
const ROOT = __dirname;
const DATA_DIR = process.env.PLANNER_DATA_DIR || "/data";
const STATE_FILE = path.join(DATA_DIR, "planner-state.json");
const OPTIONS_FILE = path.join(DATA_DIR, "options.json");
const USERS_FILE = path.join(DATA_DIR, "planner-users.json");
const PARENTS_FILE = path.join(DATA_DIR, "planner-parent-users.json");
const APP_VERSION = require("./package.json").version;

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

function unique(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function normalizeUserId(value) {
  return String(value || "").trim().toLowerCase();
}

function firstHeader(req, names) {
  for (const name of names) {
    const value = req.headers[name];
    if (Array.isArray(value) && value[0]) return String(value[0]);
    if (value) return String(value);
  }
  return "";
}

function userFromRequest(req) {
  const id = firstHeader(req, [
    "x-hass-user-id",
    "x-ha-user-id",
    "x-home-assistant-user-id",
    "x-forwarded-user",
    "remote-user",
    "x-hass-user",
    "x-ha-user",
  ]);
  if (!id) return null;
  const name = firstHeader(req, [
    "x-hass-user-name",
    "x-ha-user-name",
    "x-home-assistant-user-name",
    "x-hass-user",
    "x-ha-user",
    "x-forwarded-user",
    "remote-user",
  ]) || id;
  return {
    id: normalizeUserId(id),
    label: name,
    lastSeenAt: Date.now(),
  };
}

async function rememberUser(req) {
  const user = userFromRequest(req);
  if (!user) return null;
  const users = await readJson(USERS_FILE, []);
  const nextUsers = Array.isArray(users) ? users : [];
  const existing = nextUsers.find((item) => normalizeUserId(item.id) === user.id);
  if (existing) Object.assign(existing, user);
  else nextUsers.push(user);
  await writeJson(USERS_FILE, nextUsers.sort((a, b) => String(a.label).localeCompare(String(b.label), "pl")));
  return user;
}

async function options(currentUser = null) {
  const configured = await readJson(OPTIONS_FILE, {});
  const selectedParents = await readJson(PARENTS_FILE, []);
  const observedUsers = await readJson(USERS_FILE, []);
  const configuredParents = Array.isArray(configured.parent_users) ? configured.parent_users : [];
  return {
    parent_users: unique([...configuredParents, ...(Array.isArray(selectedParents) ? selectedParents : [])]),
    observed_users: Array.isArray(observedUsers) ? observedUsers : [],
    configured_parent_users: configuredParents,
    current_user: currentUser,
    child_module_title: configured.child_module_title || "Obowiązki dzieci",
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
  ].filter(Boolean).map((value) => normalizeUserId(value));
}

function canAccessParent(req, appOptions) {
  const allowed = appOptions.parent_users.map(normalizeUserId).filter(Boolean);
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
  const [html, css, js] = await Promise.all([
    fs.readFile(path.join(ROOT, "index.html"), "utf8"),
    fs.readFile(path.join(ROOT, "styles.css"), "utf8"),
    fs.readFile(path.join(ROOT, "app.js"), "utf8"),
  ]);
  const bootstrap = [
    "<script>",
    `window.__PLANNER_API__ = true;`,
    `window.__PLANNER_MODULE__ = ${JSON.stringify(moduleName)};`,
    `window.__PLANNER_OPTIONS__ = ${JSON.stringify({
      child_module_title: appOptions.child_module_title,
      parent_module_title: appOptions.parent_module_title,
      parent_users: appOptions.parent_users,
      configured_parent_users: appOptions.configured_parent_users,
      observed_users: appOptions.observed_users,
      current_user: appOptions.current_user,
    })};`,
    `window.__PLANNER_STATE__ = ${JSON.stringify(state)};`,
    "</script>",
  ].join("");
  const inlineHtml = html
    .replace(/<link rel="stylesheet" href="\.\/styles\.css[^"]*" \/>/, `<style>${css}</style>`)
    .replace(/<script src="\.\/app\.js[^"]*"><\/script>/, `<script>${js}</script>`);
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(inlineHtml.replace("</head>", `${bootstrap}</head>`));
}

function ingressPrefix(pathname) {
  const segments = pathname.split("/").filter(Boolean);
  const firstSegment = segments[0] || "";
  const secondSegment = segments[1] || "";
  if (firstSegment === "app" && secondSegment.endsWith("_family_reward_planner")) {
    return `/${firstSegment}/${secondSegment}`;
  }
  if (firstSegment === "app" && secondSegment === "family_reward_planner") {
    return `/${firstSegment}/${secondSegment}`;
  }
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
  const currentUser = await rememberUser(req);
  const appOptions = await options(currentUser);
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const prefix = ingressPrefix(url.pathname);
  if (prefix && url.pathname === prefix) {
    const query = url.search || "";
    return redirect(res, `${prefix}/${query}`);
  }
  const pathname = stripIngressPrefix(url.pathname).replace(/\/+$/, "") || "/";

  if (pathname === "/healthz") return json(res, 200, { ok: true, version: APP_VERSION });
  if (pathname === "/api/options") return json(res, 200, appOptions);
  if (pathname === "/api/users") {
    if (!canAccessParent(req, appOptions)) return json(res, 403, { error: "parent_module_forbidden" });
    return json(res, 200, {
      users: appOptions.observed_users,
      parent_users: appOptions.parent_users,
      configured_parent_users: appOptions.configured_parent_users,
      current_user: appOptions.current_user,
    });
  }
  if (pathname === "/api/parents") {
    if (!canAccessParent(req, appOptions)) return json(res, 403, { error: "parent_module_forbidden" });
    if (req.method === "PUT") {
      const incoming = JSON.parse(await readBody(req));
      const parentUsers = unique(Array.isArray(incoming.parent_users) ? incoming.parent_users : []);
      await writeJson(PARENTS_FILE, parentUsers);
      return json(res, 200, { ok: true, parent_users: parentUsers });
    }
    if (req.method === "GET") return json(res, 200, { parent_users: appOptions.parent_users });
    return json(res, 405, { error: "method_not_allowed" });
  }

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

  const requestedModule = url.searchParams.get("module") === "parent" ? "parent" : "child";
  if (pathname === "/" || pathname === "/child") return serveIndex(req, res, requestedModule, appOptions);
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
  console.log(`Family Reward Planner ${APP_VERSION} listening on ${PORT}`);
});

function shutdown(signal) {
  console.log(`Family Reward Planner received ${signal}, shutting down`);
  server.close(() => {
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
