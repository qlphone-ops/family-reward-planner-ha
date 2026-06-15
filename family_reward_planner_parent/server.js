const http = require("node:http");

const PORT = Number(process.env.PORT || 8098);

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

function parentTargetFromPath(pathname) {
  const parts = safePath(pathname).split("/").filter(Boolean);
  const appIndex = parts[0] === "app" ? 1 : 0;
  const segment = parts[appIndex] || "";

  if (segment.endsWith("_family_reward_planner_parent")) {
    const parentPrefix = segment.replace(/_parent$/, "");
    const prefix = appIndex === 1 ? `/app/${parentPrefix}` : `/${parentPrefix}`;
    return `${prefix}/?module=parent`;
  }

  return "";
}

function parentTarget(req) {
  const candidates = [
    firstHeader(req, ["x-ingress-path", "x-forwarded-prefix", "x-forwarded-uri"]),
    firstHeader(req, ["referer", "referrer"]),
    req.url,
  ];

  for (const candidate of candidates) {
    const target = parentTargetFromPath(candidate);
    if (target) return target;
  }

  return "";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const server = http.createServer((req, res) => {
  const location = parentTarget(req);
  if (!location) {
    const ingressPath = firstHeader(req, ["x-ingress-path", "x-forwarded-prefix", "x-forwarded-uri"]);
    console.error("Unable to resolve parent panel target", {
      url: req.url,
      ingressPath,
      referer: firstHeader(req, ["referer", "referrer"]),
    });
    res.writeHead(500, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    });
    res.end(`<!doctype html>
<html lang="pl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Panel rodzica</title>
    <style>
      body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fbf8f1;color:#20252d}
      main{max-width:520px;padding:32px}
      p{color:#68707e;font-weight:700;line-height:1.45}
      code{display:block;margin-top:14px;padding:12px;border-radius:12px;background:#fff;border:1px solid #e4d9c8;white-space:pre-wrap}
    </style>
  </head>
  <body>
    <main>
      <h1>Nie mogę otworzyć panelu rodzica</h1>
      <p>Home Assistant nie przekazał ścieżki ingress potrzebnej do odnalezienia głównej aplikacji.</p>
      <code>X-Ingress-Path: ${escapeHtml(ingressPath || "brak")}</code>
    </main>
  </body>
</html>`);
    return;
  }

  const html = `<!doctype html>
<html lang="pl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Panel rodzica</title>
    <style>
      body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#fbf8f1;color:#20252d}
      main{max-width:420px;padding:32px;text-align:center}
      a{display:inline-flex;min-height:44px;align-items:center;justify-content:center;margin-top:18px;padding:0 22px;border-radius:22px;background:#315aa8;color:#fff;text-decoration:none;font-weight:800}
      p{color:#68707e;font-weight:700}
    </style>
    <script>
      const target = ${JSON.stringify(location)};
      try {
        window.top.location.replace(target);
      } catch (error) {
        window.location.replace(target);
      }
    </script>
  </head>
  <body>
    <main>
      <h1>Otwieram panel rodzica</h1>
      <p>Jeśli przekierowanie nie nastąpi automatycznie, użyj przycisku poniżej.</p>
      <a href="${escapeHtml(location)}" target="_top" rel="noreferrer">Przejdź do panelu rodzica</a>
    </main>
  </body>
</html>`;
  res.writeHead(200, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(html);
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Family Reward Planner parent shortcut listening on ${PORT}`);
});
