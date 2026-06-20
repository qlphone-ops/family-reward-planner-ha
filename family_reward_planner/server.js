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
const MEDIA_DIR = path.join(DATA_DIR, "media");
const BACKUP_DIR = process.env.PLANNER_BACKUP_DIR || "/config/family-reward-planner";
const AUTO_BACKUP_FILE = path.join(BACKUP_DIR, "latest-backup.json");
const AUTO_MEDIA_DIR = path.join(BACKUP_DIR, "media");
const BACKUP_VERSION = 1;
const MAX_MEDIA_BYTES = 4 * 1024 * 1024;
const MAX_BACKUP_MEDIA_BYTES = 20 * 1024 * 1024;
const APP_VERSION = require("./package.json").version;
const HA_USERS_CACHE_MS = 60_000;
const PERIOD_IDS = ["morning", "after", "evening"];
const DEFAULT_REWARDS = [
  { id: "movie", title: "Wybór bajki", cost: 1, icon: "play", color: "#f3b33d", imageKey: "movie-night", childIds: [] },
  { id: "game20", title: "20 minut grania", cost: 2, icon: "pad", color: "#2a9254", imageKey: "gaming-timer", childIds: [] },
  { id: "game30", title: "30 minut grania", cost: 3, icon: "pad", color: "#7055ca", imageKey: "gaming-desk", childIds: [] },
  { id: "weekend", title: "Nagroda weekendowa", cost: 5, icon: "calendar", color: "#315aa8", imageKey: "weekend-outing", childIds: [] },
  { id: "trip", title: "Duża wyprawa", cost: 10, icon: "compass", color: "#9aa3af", imageKey: "big-trip", childIds: [] },
];
const REWARD_IMAGE_KEYS = new Set(["movie-night", "gaming-timer", "gaming-desk", "weekend-outing", "big-trip"]);
const PARENT_ACTIONS = new Set([
  "set_theme",
  "add_child",
  "save_child",
  "delete_child",
  "add_chore",
  "save_chore_group",
  "delete_chore_group",
  "move_chore_group",
  "add_reward",
  "save_reward",
  "delete_reward",
  "approve_coupon",
  "reject_coupon",
  "toggle_excuse",
  "save_school_day_override",
  "delete_school_day_override",
  "save_vacation_range",
  "delete_vacation_range",
]);
const CHILD_ACTIONS = new Set(["toggle_task", "request_reward", "redeem_coupon"]);

let haUsersCache = {
  at: 0,
  users: [],
  error: "",
};
let actionQueue = Promise.resolve();

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
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

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function safeMediaPath(value) {
  const candidate = String(value || "");
  return /^\/media\/[a-zA-Z0-9._-]+$/.test(candidate) ? candidate : "";
}

function safeImageKey(value) {
  return REWARD_IMAGE_KEYS.has(String(value || "")) ? String(value) : "";
}

function defaultImageKey(icon) {
  return ({ play: "movie-night", pad: "gaming-desk", calendar: "weekend-outing", compass: "big-trip" })[String(icon || "")] || "";
}

function unique(values) {
  return Array.from(new Set(values.map((value) => String(value || "").trim()).filter(Boolean)));
}

function emptyTasks() {
  return { morning: [], after: [], evening: [] };
}

function todayDateKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function safeDateKey(value) {
  const key = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : todayDateKey();
}

function starAccusative(count) {
  const value = Math.abs(Number(count) || 0);
  const last = value % 10;
  const lastTwo = value % 100;
  if (value === 1) return "gwiazdkę";
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return "gwiazdki";
  return "gwiazdek";
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "item";
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function childDesign(gender = "boy") {
  if (gender === "girl") {
    return { gender: "girl", accent: "#d5554d", soft: "#ffecea", avatarBg: "#ffe1dc", hair: "#d86a43" };
  }
  return { gender: "boy", accent: "#315aa8", soft: "#e8f2ff", avatarBg: "#dbeaff", hair: "#4d81e5" };
}

function periodIndex(id) {
  return Math.max(0, PERIOD_IDS.indexOf(id));
}

function weekDays() {
  return [1, 2, 3, 4, 5];
}

function currentDayIndex(dateKey = todayDateKey()) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

function isVacationWeekday(state, key) {
  const day = currentDayIndex(key);
  return day !== 0 && day !== 6 && (state.vacationRanges || []).some((range) => key >= range.start && key <= range.end);
}

function effectiveTaskDayIndex(state, key) {
  if (isVacationWeekday(state, key)) return 7;
  if (state.dayOverrides?.[key]?.type === "schoolFree") return 6;
  return currentDayIndex(key);
}

function excuseKey(childId, key) {
  return `${childId}:${key}`;
}

function taskAppliesOnDate(state, task, key) {
  return (task.days || weekDays()).includes(effectiveTaskDayIndex(state, key));
}

function completionKey(childId, taskId, key) {
  return `${childId}:${key}:${taskId}`;
}

function dailyStarKey(childId, key) {
  return `${childId}:${key}`;
}

function isTaskDone(state, childId, task, key) {
  return Boolean(state.completions?.[completionKey(childId, task.id, key)]);
}

function rewardAppliesToChild(reward, childId) {
  return Boolean(reward) && (reward.childIds || []).includes(childId);
}

function normalizeState(value) {
  const state = value && typeof value === "object" ? value : {};
  state.settings = { theme: state.settings?.theme === "dark" ? "dark" : "light" };
  state.dayExcuses = state.dayExcuses && typeof state.dayExcuses === "object" ? state.dayExcuses : {};
  state.dayOverrides = state.dayOverrides && typeof state.dayOverrides === "object" ? state.dayOverrides : {};
  state.vacationRanges = Array.isArray(state.vacationRanges) ? state.vacationRanges : [];
  state.children = state.children && typeof state.children === "object" ? state.children : {};
  state.rewards = Array.isArray(state.rewards) && state.rewards.length ? state.rewards : DEFAULT_REWARDS.map((reward) => ({ ...reward }));
  state.coupons = Array.isArray(state.coupons) ? state.coupons : [];
  state.history = Array.isArray(state.history) ? state.history : [];
  state.completions = state.completions && typeof state.completions === "object" ? state.completions : {};
  state.dailyStars = state.dailyStars && typeof state.dailyStars === "object" ? state.dailyStars : {};
  state.couponEvents = Array.isArray(state.couponEvents) ? state.couponEvents : [];

  const todayKey = todayDateKey();
  Object.entries(state.children).forEach(([childId, child]) => {
    const inferredGender = child.gender || (String(child.name || "").toLowerCase().endsWith("a") ? "girl" : "boy");
    const design = childDesign(inferredGender);
    child.id = child.id || childId;
    child.name = String(child.name || "Dziecko");
    Object.assign(child, design);
    child.avatarImage = safeMediaPath(child.avatarImage);
    child.stars = Number.isFinite(Number(child.stars)) ? Math.max(0, Number(child.stars)) : 0;
    child.tasks = { ...emptyTasks(), ...(child.tasks || {}) };
    PERIOD_IDS.forEach((periodId) => {
      child.tasks[periodId] = Array.isArray(child.tasks[periodId]) ? child.tasks[periodId] : [];
      child.tasks[periodId].forEach((task, index) => {
        task.id = task.id || uid(`${child.id}-${periodId}`);
        task.label = String(task.label || "Obowiązek");
        task.days = Array.isArray(task.days) && task.days.length ? task.days.map(Number) : weekDays();
        task.groupId = task.groupId || `chore-${periodId}-${slugify(task.label)}`;
        task.order = Number.isFinite(Number(task.order)) ? Number(task.order) : periodIndex(periodId) * 100 + index;
        if (task.done) {
          state.completions[completionKey(child.id, task.id, todayKey)] = {
            childId: child.id,
            taskId: task.id,
            groupId: task.groupId,
            date: todayKey,
            doneAt: Date.now(),
          };
        }
        delete task.done;
      });
    });
    if (child.starAwardedToday) {
      state.dailyStars[dailyStarKey(child.id, todayKey)] = { childId: child.id, date: todayKey, awardedAt: Date.now() };
    }
    delete child.starAwardedToday;
  });

  const childIds = Object.keys(state.children);
  state.rewards = state.rewards.map((reward) => ({
    ...reward,
    id: String(reward.id || uid("reward")),
    title: String(reward.title || "Nagroda"),
    cost: Math.max(1, Number.isFinite(Number(reward.cost)) ? Number(reward.cost) : 1),
    icon: String(reward.icon || "play"),
    color: String(reward.color || "#315aa8"),
    imageKey: safeImageKey(reward.imageKey),
    imagePath: safeMediaPath(reward.imagePath),
    childIds: Array.isArray(reward.childIds) && reward.childIds.length ? reward.childIds.filter((id) => childIds.includes(id)) : childIds,
  }));
  state.coupons = state.coupons.map((coupon) => ({
    ...coupon,
    id: String(coupon.id || uid("coupon")),
    status: ["pending", "ready", "used", "rejected"].includes(coupon.status) ? coupon.status : "pending",
    createdAt: Number(coupon.createdAt || Date.now()),
  }));
  state.history = state.history.slice(0, 250);
  state.couponEvents = state.couponEvents.slice(0, 250);
  state.view = "home";
  state.activeChildId = childIds.includes(state.activeChildId) ? state.activeChildId : (childIds[0] || "");
  state.toast = "";
  return state;
}

async function copyDirectory(source, destination) {
  if (!(await pathExists(source))) return;
  await fs.mkdir(destination, { recursive: true });
  const entries = await fs.readdir(source, { withFileTypes: true });
  await Promise.all(entries.filter((entry) => entry.isFile()).map((entry) => fs.copyFile(path.join(source, entry.name), path.join(destination, entry.name))));
}

async function mediaBackupEntries() {
  if (!(await pathExists(MEDIA_DIR))) return [];
  const entries = await fs.readdir(MEDIA_DIR, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile() && /^[-a-zA-Z0-9_.]+\.(png|jpe?g|webp)$/i.test(entry.name));
  let total = 0;
  const media = [];
  for (const entry of files) {
    const filePath = path.join(MEDIA_DIR, entry.name);
    const data = await fs.readFile(filePath);
    total += data.length;
    if (total > MAX_BACKUP_MEDIA_BYTES) throw new Error("backup_media_too_large");
    media.push({ name: entry.name, data: data.toString("base64") });
  }
  return media;
}

async function writeAutomaticBackup(state) {
  const [parentUsers, appOptions] = await Promise.all([
    readJson(PARENTS_FILE, []),
    readJson(OPTIONS_FILE, {}),
  ]);
  const snapshot = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    state: normalizeState(state),
    parentUsers: Array.isArray(parentUsers) ? parentUsers : [],
    options: appOptions && typeof appOptions === "object" ? appOptions : {},
  };
  await writeJson(AUTO_BACKUP_FILE, snapshot);
  await copyDirectory(MEDIA_DIR, AUTO_MEDIA_DIR);
}

let restoreAttempt;
async function restoreAutomaticBackupIfNeeded() {
  if (restoreAttempt) return restoreAttempt;
  restoreAttempt = (async () => {
    if (await pathExists(STATE_FILE)) return false;
    const backup = await readJson(AUTO_BACKUP_FILE, null);
    if (!backup?.state || typeof backup.state !== "object") return false;
    const restored = normalizeState(backup.state);
    await writeJson(STATE_FILE, restored);
    if (Array.isArray(backup.parentUsers)) await writeJson(PARENTS_FILE, backup.parentUsers);
    if (backup.options && typeof backup.options === "object") await writeJson(OPTIONS_FILE, backup.options);
    await copyDirectory(AUTO_MEDIA_DIR, MEDIA_DIR);
    console.log("Family Reward Planner restored state from automatic backup");
    return true;
  })();
  return restoreAttempt;
}

function parseMediaDataUrl(value) {
  const match = /^data:(image\/(png|jpeg|webp));base64,([a-zA-Z0-9+/=]+)$/.exec(String(value || ""));
  if (!match) throw new Error("invalid_image");
  const mime = match[1];
  const extension = match[2] === "jpeg" ? "jpg" : match[2];
  const data = Buffer.from(match[3], "base64");
  if (!data.length || data.length > MAX_MEDIA_BYTES) throw new Error("image_too_large");
  return { mime, extension, data };
}

async function saveMediaUpload(payload = {}) {
  const kind = ["child", "reward"].includes(payload.kind) ? payload.kind : "image";
  const { extension, data } = parseMediaDataUrl(payload.dataUrl);
  const filename = `${kind}-${Date.now()}-${Math.random().toString(16).slice(2)}.${extension}`;
  await Promise.all([
    fs.mkdir(MEDIA_DIR, { recursive: true }),
    fs.mkdir(AUTO_MEDIA_DIR, { recursive: true }),
  ]);
  await Promise.all([
    fs.writeFile(path.join(MEDIA_DIR, filename), data),
    fs.writeFile(path.join(AUTO_MEDIA_DIR, filename), data),
  ]);
  return `/media/${filename}`;
}

async function importBackup(payload) {
  if (!payload?.state || typeof payload.state !== "object") throw new Error("invalid_backup");
  const restored = normalizeState(payload.state);
  const media = Array.isArray(payload.media) ? payload.media : [];
  let total = 0;
  await Promise.all([fs.mkdir(MEDIA_DIR, { recursive: true }), fs.mkdir(AUTO_MEDIA_DIR, { recursive: true })]);
  for (const item of media) {
    if (!item || !/^[-a-zA-Z0-9_.]+\.(png|jpe?g|webp)$/i.test(String(item.name || ""))) throw new Error("invalid_backup_media");
    const data = Buffer.from(String(item.data || ""), "base64");
    total += data.length;
    if (!data.length || total > MAX_BACKUP_MEDIA_BYTES) throw new Error("backup_media_too_large");
    await Promise.all([
      fs.writeFile(path.join(MEDIA_DIR, item.name), data),
      fs.writeFile(path.join(AUTO_MEDIA_DIR, item.name), data),
    ]);
  }
  await writeJson(STATE_FILE, restored);
  if (Array.isArray(payload.parentUsers)) await writeJson(PARENTS_FILE, payload.parentUsers);
  if (payload.options && typeof payload.options === "object") await writeJson(OPTIONS_FILE, payload.options);
  await writeAutomaticBackup(restored);
  return restored;
}

function applicableTasks(state, child, key) {
  if (state.dayExcuses?.[excuseKey(child.id, key)]) return [];
  return Object.values(child.tasks || {})
    .flat()
    .filter((task) => taskAppliesOnDate(state, task, key))
    .sort((a, b) => (a.order || 0) - (b.order || 0));
}

function taskStats(state, child, key) {
  const tasks = applicableTasks(state, child, key);
  const done = tasks.filter((task) => isTaskDone(state, child.id, task, key)).length;
  return { done, total: tasks.length, remaining: Math.max(0, tasks.length - done) };
}

function addHistory(state, childId, title, note, type = "event") {
  state.history.unshift({ id: uid("history"), childId, title, note, type, happenedAt: Date.now() });
  state.history = state.history.slice(0, 250);
}

function addCouponEvent(state, coupon, action, note = "") {
  state.couponEvents.unshift({
    id: uid("coupon-event"),
    couponId: coupon.id,
    childId: coupon.childId,
    rewardId: coupon.rewardId,
    action,
    note,
    happenedAt: Date.now(),
  });
  state.couponEvents = state.couponEvents.slice(0, 250);
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
    if (appOptions.ha_users?.length) return isAdminCandidate(req, appOptions);
    return firstHeader(req, ["x-family-reward-parent-shortcut"]) === "1";
  }
  const candidates = userCandidates(req);
  return candidates.some((candidate) => allowed.includes(candidate)) || isAdminCandidate(req, appOptions);
}

function childById(state, childId) {
  return state.children?.[childId] || null;
}

function rewardById(state, rewardId) {
  return (state.rewards || []).find((reward) => reward.id === rewardId) || null;
}

function findTask(state, child, periodId, taskId) {
  const periodTasks = child.tasks?.[periodId] || [];
  return periodTasks.find((task) => task.id === taskId) || null;
}

function choreGroups(state) {
  const groups = new Map();
  Object.values(state.children).forEach((child) => {
    Object.entries(child.tasks || {}).forEach(([periodId, tasks]) => {
      tasks.forEach((task) => {
        const groupId = task.groupId || `chore-${periodId}-${slugify(task.label)}`;
        if (!groups.has(groupId)) {
          groups.set(groupId, {
            id: groupId,
            label: task.label,
            periodId,
            days: task.days || weekDays(),
            order: Number.isFinite(Number(task.order)) ? Number(task.order) : periodIndex(periodId) * 100,
            childIds: [],
          });
        }
        const group = groups.get(groupId);
        group.order = Math.min(group.order, Number.isFinite(Number(task.order)) ? Number(task.order) : group.order);
        if (!group.childIds.includes(child.id)) group.childIds.push(child.id);
      });
    });
  });
  return Array.from(groups.values()).sort((a, b) => a.order - b.order || periodIndex(a.periodId) - periodIndex(b.periodId));
}

function nextChoreOrder(state) {
  const orders = choreGroups(state).map((group) => group.order);
  return orders.length ? Math.max(...orders) + 10 : 10;
}

function findTaskByGroup(child, groupId) {
  for (const periodId of PERIOD_IDS) {
    const task = (child.tasks[periodId] || []).find((item) => item.groupId === groupId);
    if (task) return { task, periodId };
  }
  return null;
}

function removeTaskByGroup(child, groupId) {
  PERIOD_IDS.forEach((periodId) => {
    child.tasks[periodId] = (child.tasks[periodId] || []).filter((task) => task.groupId !== groupId);
  });
}

function sortTasksByOrder(state) {
  Object.values(state.children).forEach((child) => {
    PERIOD_IDS.forEach((periodId) => {
      child.tasks[periodId].sort((a, b) => (a.order || 0) - (b.order || 0));
    });
  });
}

function setChoreOrder(state, groupId, order) {
  Object.values(state.children).forEach((child) => {
    Object.values(child.tasks).flat().forEach((task) => {
      if (task.groupId === groupId) task.order = order;
    });
  });
}

function applyToggleTask(state, payload) {
  const key = safeDateKey(payload.date);
  const child = childById(state, String(payload.childId || ""));
  if (!child) throw new Error("child_not_found");
  const periodId = PERIOD_IDS.includes(payload.period) ? payload.period : "morning";
  const task = findTask(state, child, periodId, String(payload.taskId || ""));
  if (!task || !taskAppliesOnDate(state, task, key)) throw new Error("task_not_found");
  const cKey = completionKey(child.id, task.id, key);
  if (state.completions[cKey]) {
    delete state.completions[cKey];
    addHistory(state, child.id, "Obowiązek cofnięty", task.label, "task");
  } else {
    state.completions[cKey] = { childId: child.id, taskId: task.id, groupId: task.groupId, date: key, doneAt: Date.now() };
    addHistory(state, child.id, "Obowiązek wykonany", task.label, "task");
  }

  const stats = taskStats(state, child, key);
  const sKey = dailyStarKey(child.id, key);
  if (stats.remaining === 0 && stats.total > 0 && !state.dailyStars[sKey]) {
    child.stars += 1;
    state.dailyStars[sKey] = { childId: child.id, date: key, awardedAt: Date.now() };
    addHistory(state, child.id, "Gwiazdka przyznana", "Wszystkie obowiązki z dnia są wykonane", "star");
    return `${child.name} zdobywa gwiazdkę za cały dzień`;
  }
  if (stats.remaining > 0 && state.dailyStars[sKey]) {
    child.stars = Math.max(0, child.stars - 1);
    delete state.dailyStars[sKey];
    addHistory(state, child.id, "Gwiazdka cofnięta", "Dzień nie jest już kompletny", "star");
    return "Gwiazdka cofnięta, bo dzień nie jest już kompletny";
  }
  return "";
}

function applyAction(state, type, payload = {}) {
  const action = String(type || "");
  switch (action) {
    case "toggle_task":
      return applyToggleTask(state, payload);

    case "request_reward": {
      const child = childById(state, String(payload.childId || ""));
      const reward = rewardById(state, String(payload.rewardId || ""));
      if (!child || !reward || !rewardAppliesToChild(reward, child.id)) throw new Error("reward_not_available");
      if (child.stars < reward.cost) throw new Error("not_enough_stars");
      const existing = state.coupons.find((coupon) => coupon.childId === child.id && coupon.rewardId === reward.id && coupon.status !== "used" && coupon.status !== "rejected");
      if (existing) throw new Error("coupon_exists");
      const coupon = { id: uid("coupon"), childId: child.id, rewardId: reward.id, status: "pending", createdAt: Date.now() };
      state.coupons.push(coupon);
      addHistory(state, child.id, "Nagroda zamówiona", `${reward.title} czeka na akceptację rodzica`, "reward");
      addCouponEvent(state, coupon, "requested", "Czeka na akceptację rodzica");
      return "Kupon czeka na akceptację rodzica";
    }

    case "redeem_coupon": {
      const coupon = state.coupons.find((item) => item.id === String(payload.couponId || ""));
      if (!coupon || coupon.status !== "ready") throw new Error("coupon_not_ready");
      const child = childById(state, coupon.childId);
      const reward = rewardById(state, coupon.rewardId);
      if (!child || !reward) throw new Error("coupon_not_found");
      coupon.status = "used";
      coupon.usedAt = Date.now();
      addHistory(state, child.id, "Kupon odebrany", `${child.name}: ${reward.title}`, "reward");
      addCouponEvent(state, coupon, "redeemed", "Kupon odebrany przez dziecko");
      return "Kupon wykorzystany";
    }

    case "set_theme":
      state.settings.theme = payload.theme === "dark" ? "dark" : "light";
      return state.settings.theme === "dark" ? "Tryb ciemny włączony" : "Tryb jasny włączony";

    case "add_child": {
      const name = String(payload.name || "").trim();
      if (!name) throw new Error("missing_child_name");
      const id = uid(`child-${slugify(name)}`);
      state.children[id] = { id, name, ...childDesign(payload.gender), avatarImage: "", stars: 0, tasks: emptyTasks() };
      state.rewards.forEach((reward) => {
        reward.childIds = reward.childIds || [];
        if (!reward.childIds.includes(id)) reward.childIds.push(id);
      });
      return "Dziecko dodane";
    }

    case "save_child": {
      const child = childById(state, String(payload.childId || ""));
      if (!child) throw new Error("child_not_found");
      const name = String(payload.name || "").trim();
      if (!name) throw new Error("missing_child_name");
      Object.assign(child, childDesign(payload.gender), {
        name,
        stars: Math.max(0, Number.isFinite(Number(payload.stars)) ? Number(payload.stars) : 0),
        avatarImage: safeMediaPath(payload.avatarImage),
      });
      return "Dziecko zapisane";
    }

    case "delete_child": {
      const childId = String(payload.childId || "");
      if (!state.children[childId]) throw new Error("child_not_found");
      delete state.children[childId];
      state.rewards.forEach((reward) => {
        reward.childIds = (reward.childIds || []).filter((id) => id !== childId);
      });
      state.coupons = state.coupons.filter((coupon) => coupon.childId !== childId);
      Object.keys(state.completions).forEach((key) => key.startsWith(`${childId}:`) && delete state.completions[key]);
      Object.keys(state.dailyStars).forEach((key) => key.startsWith(`${childId}:`) && delete state.dailyStars[key]);
      Object.keys(state.dayExcuses).forEach((key) => key.startsWith(`${childId}:`) && delete state.dayExcuses[key]);
      return "Karta dziecka usunięta";
    }

    case "add_chore": {
      const label = String(payload.label || "").trim();
      const period = PERIOD_IDS.includes(payload.period) ? payload.period : "morning";
      const childIds = Array.isArray(payload.childIds) ? payload.childIds.filter((id) => state.children[id]) : [];
      const days = Array.isArray(payload.days) ? payload.days.map(Number).filter((day) => [0, 1, 2, 3, 4, 5, 6, 7].includes(day)) : [];
      if (!label || !childIds.length || !days.length) throw new Error("invalid_chore");
      const groupId = uid(`chore-${slugify(label)}`);
      const order = nextChoreOrder(state);
      childIds.forEach((childId) => {
        state.children[childId].tasks[period].push({ id: uid(`${childId}-${period}`), groupId, order, label, days });
      });
      sortTasksByOrder(state);
      return "Obowiązek dodany";
    }

    case "save_chore_group": {
      const groupId = String(payload.groupId || "");
      const current = choreGroups(state).find((group) => group.id === groupId);
      if (!current) throw new Error("chore_not_found");
      const label = String(payload.label || "").trim();
      const period = PERIOD_IDS.includes(payload.period) ? payload.period : current.periodId;
      const childIds = Array.isArray(payload.childIds) ? payload.childIds.filter((id) => state.children[id]) : [];
      const days = Array.isArray(payload.days) ? payload.days.map(Number).filter((day) => [0, 1, 2, 3, 4, 5, 6, 7].includes(day)) : [];
      if (!label || !childIds.length || !days.length) throw new Error("invalid_chore");
      Object.values(state.children).forEach((child) => {
        const existing = findTaskByGroup(child, groupId);
        if (!childIds.includes(child.id)) {
          removeTaskByGroup(child, groupId);
          return;
        }
        if (existing) {
          removeTaskByGroup(child, groupId);
          child.tasks[period].push({ ...existing.task, label, days, order: current.order, groupId });
          return;
        }
        child.tasks[period].push({ id: uid(`${child.id}-${period}`), groupId, order: current.order, label, days });
      });
      sortTasksByOrder(state);
      return "Obowiązek zapisany";
    }

    case "delete_chore_group":
      Object.values(state.children).forEach((child) => removeTaskByGroup(child, String(payload.groupId || "")));
      return "Obowiązek usunięty";

    case "move_chore_group": {
      const groups = choreGroups(state);
      const index = groups.findIndex((group) => group.id === String(payload.groupId || ""));
      const next = index + Number(payload.direction || 0);
      if (index < 0 || next < 0 || next >= groups.length) return "";
      const currentOrder = groups[index].order;
      setChoreOrder(state, groups[index].id, groups[next].order);
      setChoreOrder(state, groups[next].id, currentOrder);
      sortTasksByOrder(state);
      return "Kolejność zmieniona";
    }

    case "add_reward": {
      const title = String(payload.title || "").trim();
      const childIds = Array.isArray(payload.childIds) ? payload.childIds.filter((id) => state.children[id]) : [];
      if (!title || !childIds.length) throw new Error("invalid_reward");
      state.rewards.push({
        id: uid("reward"),
        title,
        cost: Math.max(1, Number.isFinite(Number(payload.cost)) ? Number(payload.cost) : 1),
        icon: String(payload.icon || "play"),
        color: "#315aa8",
        imageKey: safeImageKey(payload.imageKey) || defaultImageKey(payload.icon),
        imagePath: safeMediaPath(payload.imagePath),
        childIds,
      });
      return "Nagroda dodana";
    }

    case "save_reward": {
      const reward = rewardById(state, String(payload.rewardId || ""));
      if (!reward) throw new Error("reward_not_found");
      const title = String(payload.title || "").trim();
      if (!title) throw new Error("invalid_reward");
      const childIds = Array.isArray(payload.childIds) ? payload.childIds.filter((id) => state.children[id]) : [];
      reward.title = title;
      reward.cost = Math.max(1, Number.isFinite(Number(payload.cost)) ? Number(payload.cost) : 1);
      reward.icon = String(payload.icon || reward.icon || "play");
      reward.imageKey = safeImageKey(payload.imageKey) || defaultImageKey(payload.icon || reward.icon);
      reward.imagePath = safeMediaPath(payload.imagePath);
      reward.childIds = childIds.length ? childIds : Object.keys(state.children);
      return "Nagroda zapisana";
    }

    case "delete_reward":
      state.rewards = state.rewards.filter((reward) => reward.id !== String(payload.rewardId || ""));
      state.coupons = state.coupons.filter((coupon) => coupon.rewardId !== String(payload.rewardId || ""));
      return "Nagroda usunięta";

    case "approve_coupon": {
      const coupon = state.coupons.find((item) => item.id === String(payload.couponId || ""));
      if (!coupon || coupon.status !== "pending") throw new Error("coupon_not_pending");
      const child = childById(state, coupon.childId);
      const reward = rewardById(state, coupon.rewardId);
      if (!child || !reward) throw new Error("coupon_not_found");
      if (child.stars < reward.cost) throw new Error("not_enough_stars");
      child.stars -= reward.cost;
      coupon.status = "ready";
      coupon.approvedAt = Date.now();
      addHistory(state, child.id, "Nagroda zatwierdzona", `${reward.title} za ${reward.cost} ${starAccusative(reward.cost)}`, "reward");
      addCouponEvent(state, coupon, "approved", "Rodzic zatwierdził kupon");
      return "Rodzic zatwierdził kupon";
    }

    case "reject_coupon": {
      const coupon = state.coupons.find((item) => item.id === String(payload.couponId || ""));
      if (!coupon) throw new Error("coupon_not_found");
      const child = childById(state, coupon.childId);
      const reward = rewardById(state, coupon.rewardId);
      coupon.status = "rejected";
      coupon.rejectedAt = Date.now();
      addHistory(state, coupon.childId, "Nagroda odrzucona", `${child?.name || "Dziecko"}: ${reward?.title || "nagroda"}`, "reward");
      addCouponEvent(state, coupon, "rejected", "Rodzic odrzucił prośbę");
      return "Prośba została odrzucona";
    }

    case "toggle_excuse": {
      const childId = String(payload.childId || "");
      if (!state.children[childId]) throw new Error("child_not_found");
      const key = excuseKey(childId, safeDateKey(payload.date));
      if (state.dayExcuses[key]) {
        delete state.dayExcuses[key];
        return "Usprawiedliwienie cofnięte";
      }
      state.dayExcuses[key] = { childId, date: safeDateKey(payload.date), createdAt: Date.now() };
      return "Dzień usprawiedliwiony";
    }

    case "save_school_day_override": {
      const key = safeDateKey(payload.date);
      state.dayOverrides[key] = { type: "schoolFree", note: String(payload.note || "").trim(), createdAt: Date.now() };
      return "Dzień wolny od szkoły zapisany";
    }

    case "delete_school_day_override":
      delete state.dayOverrides[safeDateKey(payload.date)];
      return "Wyjątek szkolny usunięty";

    case "save_vacation_range": {
      const start = safeDateKey(payload.start);
      const end = safeDateKey(payload.end);
      if (end < start) throw new Error("invalid_vacation_range");
      state.vacationRanges.push({ id: uid("vacation"), start, end, note: String(payload.note || "").trim(), createdAt: Date.now() });
      return "Okres wakacji zapisany";
    }

    case "delete_vacation_range":
      state.vacationRanges = (state.vacationRanges || []).filter((range) => range.id !== String(payload.rangeId || ""));
      return "Okres wakacji usunięty";

    default:
      throw new Error("unknown_action");
  }
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(payload);
}

function jsonForScript(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (char) => {
    if (char === "<") return "\\u003c";
    if (char === ">") return "\\u003e";
    if (char === "&") return "\\u0026";
    if (char === "\u2028") return "\\u2028";
    return "\\u2029";
  });
}

function queueAction(action) {
  const queued = actionQueue.then(action, action);
  actionQueue = queued.catch(() => {});
  return queued;
}

function browserIngressBase(req) {
  const headerPath = firstHeader(req, ["x-ingress-path"]);
  if (headerPath.startsWith("/")) return headerPath.replace(/\/+$/, "");
  return ingressPrefix(safeRequestUrl(req).pathname);
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
  const rawState = await readJson(STATE_FILE, null);
  const rawStatePayload = JSON.stringify(rawState || null);
  const state = normalizeState(rawState);
  if (rawStatePayload !== JSON.stringify(state)) {
    await writeJson(STATE_FILE, state);
  }
  if (!(await pathExists(AUTO_BACKUP_FILE))) await writeAutomaticBackup(state);
  const [html, css, js] = await Promise.all([
    fs.readFile(path.join(ROOT, "index.html"), "utf8"),
    fs.readFile(path.join(ROOT, "styles.css"), "utf8"),
    fs.readFile(path.join(ROOT, "app.js"), "utf8"),
  ]);
  const bootstrap = [
    "<script>",
    `window.__PLANNER_API__ = true;`,
    `window.__PLANNER_API_BASE__ = ${jsonForScript(browserIngressBase(req))};`,
    `window.__PLANNER_MODULE__ = ${jsonForScript(moduleName)};`,
    `window.__PLANNER_OPTIONS__ = ${jsonForScript({
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
    `window.__PLANNER_STATE__ = ${jsonForScript(state)};`,
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
  const thirdSegment = segments[2] || "";
  if (firstSegment === "api" && secondSegment === "hassio_ingress" && (thirdSegment === "family_reward_planner" || thirdSegment.endsWith("_family_reward_planner"))) {
    return `/${firstSegment}/${secondSegment}/${thirdSegment}`;
  }
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

async function serveMedia(res, pathname) {
  const filename = path.basename(String(pathname || ""));
  if (!/^[-a-zA-Z0-9_.]+\.(png|jpe?g|webp)$/i.test(filename)) return json(res, 400, { error: "bad_media_path" });
  const filePath = path.join(MEDIA_DIR, filename);
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "content-type": MIME_TYPES[ext] || "application/octet-stream",
      "cache-control": "private, max-age=3600",
    });
    res.end(data);
  } catch {
    json(res, 404, { error: "media_not_found" });
  }
}

async function handle(req, res) {
  await restoreAutomaticBackupIfNeeded();
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
      await writeAutomaticBackup(normalizeState(await readJson(STATE_FILE, null)));
      return json(res, 200, { ok: true, parent_users: parentUsers });
    }
    if (req.method === "GET") return json(res, 200, { parent_users: appOptions.parent_users });
    return json(res, 405, { error: "method_not_allowed" });
  }

  if (pathname === "/api/media") {
    if (!canAccessParent(req, appOptions)) return json(res, 403, { error: "parent_module_forbidden" });
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    try {
      const incoming = JSON.parse(await readBody(req));
      const mediaPath = await saveMediaUpload(incoming);
      return json(res, 200, { ok: true, path: mediaPath });
    } catch (error) {
      return json(res, 400, { error: error.message || "media_upload_failed" });
    }
  }

  if (pathname === "/api/backup") {
    if (!canAccessParent(req, appOptions)) return json(res, 403, { error: "parent_module_forbidden" });
    if (req.method === "GET") {
      try {
        const [plannerState, parentUsers, appConfig, media] = await Promise.all([
          readJson(STATE_FILE, null),
          readJson(PARENTS_FILE, []),
          readJson(OPTIONS_FILE, {}),
          mediaBackupEntries(),
        ]);
        return json(res, 200, {
          version: BACKUP_VERSION,
          exportedAt: new Date().toISOString(),
          state: normalizeState(plannerState),
          parentUsers: Array.isArray(parentUsers) ? parentUsers : [],
          options: appConfig && typeof appConfig === "object" ? appConfig : {},
          media,
        });
      } catch (error) {
        return json(res, 400, { error: error.message || "backup_export_failed" });
      }
    }
    if (req.method === "PUT") {
      try {
        const restored = await importBackup(JSON.parse(await readBody(req)));
        return json(res, 200, { ok: true, state: restored, message: "Kopia zapasowa została odtworzona" });
      } catch (error) {
        return json(res, 400, { error: error.message || "backup_import_failed" });
      }
    }
    return json(res, 405, { error: "method_not_allowed" });
  }

  if (pathname === "/api/state") {
    if (req.method === "GET") {
      return json(res, 200, normalizeState(await readJson(STATE_FILE, null)));
    }
    if (req.method === "PUT" || req.method === "POST") {
      return json(res, 405, { error: "state_writes_disabled", message: "Use /api/action" });
    }
    return json(res, 405, { error: "method_not_allowed" });
  }

  if (pathname === "/api/action") {
    if (req.method !== "POST") return json(res, 405, { error: "method_not_allowed" });
    const incoming = JSON.parse(await readBody(req));
    const type = String(incoming.type || "");
    if (!CHILD_ACTIONS.has(type) && !PARENT_ACTIONS.has(type)) {
      return json(res, 400, { error: "unknown_action" });
    }
    if (PARENT_ACTIONS.has(type) && !canAccessParent(req, appOptions)) {
      return json(res, 403, { error: "parent_action_forbidden" });
    }
    try {
      const result = await queueAction(async () => {
        const state = normalizeState(await readJson(STATE_FILE, null));
        const message = applyAction(state, type, incoming.payload || {}) || "";
        const nextState = normalizeState(state);
        await writeJson(STATE_FILE, nextState);
        await writeAutomaticBackup(nextState);
        return { message, state: nextState };
      });
      console.log(`Planner action saved: ${type}`);
      return json(res, 200, { ok: true, state: result.state, message: result.message });
    } catch (error) {
      console.warn(`Planner action failed: ${type}`, error);
      return json(res, 400, { error: error.message || "action_failed" });
    }
  }

  const requestedModule = url.searchParams.get("module") === "parent" ? "parent" : "child";
  if (pathname === "/" || pathname === "/child") return serveIndex(req, res, requestedModule, appOptions);
  if (pathname === "/parent") return serveIndex(req, res, "parent", appOptions);

  if (pathname.startsWith("/media/")) return serveMedia(res, pathname);

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
