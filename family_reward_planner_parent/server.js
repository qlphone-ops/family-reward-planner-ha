const http = require("node:http");

const PORT = Number(process.env.PORT || 8098);

function normalizedPath(requestUrl) {
  const rawPath = String(requestUrl || "/").split("?")[0] || "/";
  return rawPath.replace(/^\/+/, "/") || "/";
}

function parentTarget(requestUrl) {
  const pathname = normalizedPath(requestUrl);
  const parts = pathname.split("/").filter(Boolean);
  const appIndex = parts[0] === "app" ? 1 : 0;
  const segment = parts[appIndex] || "";

  if (segment.endsWith("_family_reward_planner_parent")) {
    const parentPrefix = segment.replace(/_parent$/, "");
    const prefix = appIndex === 1 ? `/app/${parentPrefix}` : `/${parentPrefix}`;
    return `${prefix}/?module=parent`;
  }

  return "/?module=parent";
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

const server = http.createServer((req, res) => {
  const location = parentTarget(req.url);
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
