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
const HA_USERS_CACHE_MS = 60_000;

let haUsersCache = {
  at: 0,
  users: [],
  error: "",
};

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

function safeRequestUrl(req) {
  const base = `http://${req.headers.host || "localhost"}`;
  const raw = String(req.url || "/");
  try {
    return new URL(raw, base);
  } catch {
    const queryIndex = raw.indexOf("?");
    const rawPath = queryIndex === -1 ? raw : raw.slice(0, queryIndex);
    const search = queryIndex === -1 ? "" : raw.slice(queryIndex);
    const pathname = rawPath.replace(/^\/+/, "/") || "/";
    return new URL(`${pathname}${search}`, base);
  }
}

function normalizeHaUser(user) {
  const id = normalizeUserId(user.id);
  return {
    id,
    label: user.name || user.username || id,
    name: user.name || "",
    username: user.username || "",
    isAdmin: Boolean(user.is_admin),
    isOwner: Boolean(user.is_owner),
    isActive: user.is_active !== false,
    source: "home_assistant",
  };
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
    "x-remote-user-id",
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
    "x-remote-user-display-name",
    "x-remote-user-name",
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

async function fetchHomeAssistantUsers(force = false) {
  if (!force && Date.now() - haUsersCache.at < HA_USERS_CACHE_MS) return haUsersCache;

  const token = process.env.SUPERVISOR_TOKEN;
  if (!token) {
    haUsersCache = { at: Date.now(), users: [], error: "Brak SUPERVISOR_TOKEN" };
    return haUsersCache;
  }

  if (typeof WebSocket === "undefined") {
    haUsersCache = { at: Date.now(), users: [], error: "Runtime Node nie ma klienta WebSocket" };
    return haUsersCache;
  }

  return new Promise((resolve) => {
    let settled = false;
    let commandSent = false;
    const finish = (users, error = "") => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try {
        ws.close();
      } catch {
        // The socket may already be closed by Home Assistant.
      }
      haUsersCache = { at: Date.now(), users, error };
      resolve(haUsersCache);
    };

    let ws;
    const timeout = setTimeout(() => finish([], "Timeout podczas pobierania użytkowników Home Assistant"), 4500);
    try {
      ws = new WebSocket("ws://supervisor/core/websocket");
    } catch {
      finish([], "Runtime Node nie może utworzyć połączenia WebSocket do Home Assistant");
      return;
    }

    ws.addEventListener("message", (event) => {
      let message;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }

      if (message.type === "auth_required") {
        ws.send(JSON.stringify({ type: "auth", access_token: token }));
        return;
      }

      if (message.type === "auth_invalid") {
        finish([], "Home Assistant odrzucił token Supervisora");
        return;
      }

      if (message.type === "auth_ok" && !commandSent) {
        commandSent = true;
        ws.send(JSON.stringify({ id: 1, type: "config/auth/list" }));
        return;
      }

      if (message.id !== 1) return;
      if (message.success === false) {
        finish([], message.error?.message || "Home Assistant nie zwrócił listy użytkowników");
        return;
      }

      const users = Array.isArray(message.result)
        ? message.result
            .filter((user) => user && user.id && user.system_generated !== true && user.is_active !== false)
            .map(normalizeHaUser)
            .sort((a, b) => a.label.localeCompare(b.label, "pl"))
        : [];
      finish(users);
    });

    ws.addEventListener("error", () => finish([], "Nie udało się połączyć z Home Assistant WebSocket"));
    ws.addEventListener("close", () => {
      if (!settled) finish([], "Home Assistant zamknął połączenie przed zwróceniem użytkowników");
    });
  });
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
  const haUsers = await fetchHomeAssistantUsers();
  const enrichedCurrentUser = currentUser ? {
    ...currentUser,
    ...(haUsers.users.find((user) => user.id === normalizeUserId(currentUser.id)) || {}),
  } : null;
  return {
    parent_users: unique([...configuredParents, ...(Array.isArray(selectedParents) ? selectedParents : [])]),
    observed_users: Array.isArray(observedUsers) ? observedUsers : [],
    ha_users: haUsers.users,
    ha_users_error: haUsers.error,
    users_source: haUsers.users.length ? "home_assistant" : "ingress_seen",
    configured_parent_users: configuredParents,
    current_user: enrichedCurrentUser,
    child_module_title: configured.child_module_title || "Obowiązki dzieci",
    parent_module_title: configured.parent_module_title || "Panel rodzica",
  };
}

function userCandidates(req) {
  return [
    req.headers["x-remote-user-id"],
    req.headers["x-hass-user-id"],
    req.headers["x-hass-user"],
    req.headers["x-ha-user-id"],
    req.headers["x-ha-user"],
    req.headers["remote-user"],
    req.headers["x-forwarded-user"],
  ].filter(Boolean).map((value) => normalizeUserId(value));
}

function isAdminCandidate(req, appOptions) {
  const candidates = userCandidates(req);
  return (appOptions.ha_users || []).some((user) => (
    candidates.includes(normalizeUserId(user.id)) && (user.isAdmin || user.isOwner)
  ));
}

function canAccessParent(req, appOptions) {
  const allowed = appOptions.parent_users.map(normalizeUserId).filter(Boolean);
  if (!allowed.length) {
    return appOptions.ha_users?.length ? isAdminCandidate(req, appOptions) : true;
  }
  const candidates = userCandidates(req);
  return candidates.some((candidate) => allowed.includes(candidate)) || isAdminCandidate(req, appOptions);
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
      ha_users: appOptions.ha_users,
      ha_users_error: appOptions.ha_users_error,
      users_source: appOptions.users_source,
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
  const url = safeRequestUrl(req);
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
      users: appOptions.ha_users.length ? appOptions.ha_users : appOptions.observed_users,
      ha_users: appOptions.ha_users,
      ha_users_error: appOptions.ha_users_error,
      users_source: appOptions.users_source,
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
    if (req.method === "PUT" || req.method === "POST") {
      const incoming = JSON.parse(await readBody(req));
      await writeJson(STATE_FILE, incoming);
      console.log(`Planner state saved: ${Object.keys(incoming.children || {}).length} children, ${(incoming.coupons || []).length} coupons, ${(incoming.history || []).length} history entries`);
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
