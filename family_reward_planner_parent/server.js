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

const server = http.createServer((req, res) => {
  const location = parentTarget(req.url);
  res.writeHead(302, {
    location,
    "cache-control": "no-store",
  });
  res.end();
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Family Reward Planner parent shortcut listening on ${PORT}`);
});
