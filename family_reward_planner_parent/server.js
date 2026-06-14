const http = require("node:http");

const PORT = Number(process.env.PORT || 8098);

function parentTarget(pathname) {
  const parts = pathname.split("/").filter(Boolean);
  const appIndex = parts[0] === "app" ? 1 : 0;
  const segment = parts[appIndex] || "";

  if (segment.endsWith("_family_reward_planner_parent")) {
    const parentPrefix = segment.replace(/_parent$/, "");
    const prefix = appIndex === 1 ? `/app/${parentPrefix}` : `/${parentPrefix}`;
    return `${prefix}/parent`;
  }

  return "/parent";
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const location = parentTarget(url.pathname);
  res.writeHead(302, {
    location,
    "cache-control": "no-store",
  });
  res.end();
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Family Reward Planner parent shortcut listening on ${PORT}`);
});
