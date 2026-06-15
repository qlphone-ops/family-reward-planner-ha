const http = require("node:http");
const os = require("node:os");

const PORT = Number(process.env.PORT || 8098);
const MAIN_PORT = Number(process.env.PLANNER_MAIN_PORT || 8099);

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
]);

function firstHeader(req, names) {
  for (const name of names) {
    const value = req.headers[name];
    if (Array.isArray(value) && value[0]) return String(value[0]);
    if (value) return String(value);
  }
  return "";
}

function safePath(value) {
  const raw = String(value || "").trim();
  if (!raw || raw === "//") return "/";

  if (/^https?:\/\//i.test(raw)) {
    try {
      return new URL(raw).pathname || "/";
    } catch {
      return "/";
    }
  }

  const path = raw.split("?")[0] || "/";
  return path.replace(/^\/+/, "/") || "/";
}

function parentIngressPrefix(req) {
  const candidates = [
    firstHeader(req, ["x-ingress-path", "x-forwarded-prefix", "x-forwarded-uri"]),
    firstHeader(req, ["referer", "referrer"]),
    req.url,
  ];

  for (const candidate of candidates) {
    const path = safePath(candidate);
    const parts = path.split("/").filter(Boolean);
    const appIndex = parts[0] === "app" ? 1 : 0;
    const segment = parts[appIndex] || "";
    if (!segment.endsWith("_family_reward_planner_parent")) continue;
    return {
      path: `/${parts.slice(0, appIndex + 1).join("/")}`,
      segment,
    };
  }

  return { path: "", segment: "" };
}

function mainHost(req) {
  if (process.env.PLANNER_MAIN_HOST) return process.env.PLANNER_MAIN_HOST;

  const { segment } = parentIngressPrefix(req);
  if (segment) return segment.replace(/_parent$/, "").replaceAll("_", "-");

  const hostname = os.hostname();
  if (hostname.endsWith("-family-reward-planner-parent")) {
    return hostname.replace(/-parent$/, "");
  }

  return "";
}

function stripParentPrefix(req, pathname) {
  const { path: prefix } = parentIngressPrefix(req);
  if (prefix && pathname === prefix) return "/";
  if (prefix && pathname.startsWith(`${prefix}/`)) return pathname.slice(prefix.length) || "/";
  return pathname;
}

function requestPathAndSearch(req) {
  const raw = String(req.url || "/");
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      return { pathname: url.pathname || "/", search: url.search || "" };
    } catch {
      return { pathname: "/", search: "" };
    }
  }

  const queryIndex = raw.indexOf("?");
  if (queryIndex === -1) return { pathname: safePath(raw), search: "" };
  return {
    pathname: safePath(raw.slice(0, queryIndex)),
    search: raw.slice(queryIndex),
  };
}

function upstreamPath(req) {
  const parsed = requestPathAndSearch(req);
  const path = stripParentPrefix(req, parsed.pathname);
  if (path === "/" || path === "/child") return `/parent${parsed.search}`;
  return `${path}${parsed.search}`;
}

function proxyHeaders(req, host) {
  const headers = {};
  for (const [name, value] of Object.entries(req.headers)) {
    if (HOP_BY_HOP_HEADERS.has(name.toLowerCase())) continue;
    headers[name] = value;
  }
  headers.host = `${host}:${MAIN_PORT}`;
  headers["x-family-reward-parent-shortcut"] = "1";
  return headers;
}

function errorPage(res, status, title, message, details = "") {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(`<!doctype html>
<html lang="pl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fbf8f1;color:#20252d}
      main{max-width:560px;padding:32px}
      p{color:#68707e;font-weight:700;line-height:1.45}
      code{display:block;margin-top:14px;padding:12px;border-radius:12px;background:#fff;border:1px solid #e4d9c8;white-space:pre-wrap}
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      <p>${escapeHtml(message)}</p>
      ${details ? `<code>${escapeHtml(details)}</code>` : ""}
    </main>
  </body>
</html>`);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function proxyToMain(req, res) {
  const host = mainHost(req);
  if (!host) {
    return errorPage(
      res,
      500,
      "Nie mogę otworzyć panelu rodzica",
      "Nie udało się ustalić nazwy hosta głównej aplikacji.",
      `url: ${req.url}\nX-Ingress-Path: ${firstHeader(req, ["x-ingress-path"]) || "brak"}\nhostname: ${os.hostname()}`,
    );
  }

  const path = upstreamPath(req);
  const upstream = http.request(
    {
      hostname: host,
      port: MAIN_PORT,
      path,
      method: req.method,
      headers: proxyHeaders(req, host),
    },
    (upstreamRes) => {
      const headers = {};
      for (const [name, value] of Object.entries(upstreamRes.headers)) {
        if (HOP_BY_HOP_HEADERS.has(name.toLowerCase())) continue;
        headers[name] = value;
      }
      headers["cache-control"] = "no-store";
      res.writeHead(upstreamRes.statusCode || 502, headers);
      upstreamRes.pipe(res);
    },
  );

  upstream.on("error", (error) => {
    console.error("Parent panel proxy failed", { host, port: MAIN_PORT, path, error });
    errorPage(
      res,
      502,
      "Panel rodzica nie jest jeszcze gotowy",
      "Skrót rodzica nie może połączyć się z główną aplikacją Obowiązki dzieci.",
      `host: ${host}:${MAIN_PORT}\npath: ${path}\nerror: ${error.message}`,
    );
  });

  req.pipe(upstream);
}

const server = http.createServer((req, res) => {
  proxyToMain(req, res);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Family Reward Planner parent panel proxy listening on ${PORT}`);
});
