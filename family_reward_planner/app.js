const STORE_KEY = "domowy-planner-prototype-v2";
const PENDING_STORE_KEY = `${STORE_KEY}-pending`;

const initialState = {
  view: "home",
  activeChildId: "",
  toast: "",
  settings: {
    theme: "light",
  },
  dayExcuses: {},
  dayOverrides: {},
  vacationRanges: [],
  children: {},
  rewards: [
    { id: "movie", title: "Wybór bajki", cost: 1, icon: "play", color: "#f3b33d", childIds: [] },
    { id: "game20", title: "20 minut grania", cost: 2, icon: "pad", color: "#2a9254", childIds: [] },
    { id: "game30", title: "30 minut grania", cost: 3, icon: "pad", color: "#7055ca", childIds: [] },
    { id: "weekend", title: "Nagroda weekendowa", cost: 5, icon: "calendar", color: "#315aa8", childIds: [] },
    { id: "trip", title: "Duża wyprawa", cost: 10, icon: "compass", color: "#9aa3af", childIds: [] },
  ],
  coupons: [],
  history: [],
  completions: {},
  dailyStars: {},
  couponEvents: [],
};

const runtimeWindow = typeof window !== "undefined" ? window : {};
const urlParams = new URLSearchParams(runtimeWindow.location?.search || "");
const pathModule = runtimeWindow.location?.pathname?.endsWith("/parent") ? "parent" : "";
const queryModule = urlParams.get("module") === "parent" ? "parent" : "";
const appModule = queryModule || pathModule || runtimeWindow.__PLANNER_MODULE__ || "child";
const isParentModule = appModule === "parent";

let recoveredServerPayload = "";
let state = loadState();
let redeemConfirmId = "";
let parentUnlocked = isParentModule;
let parentTargetView = "parent";
let lastSavedPayload = recoveredServerPayload || JSON.stringify(persistedStateFrom(state));
let lastQueuedPayload = lastSavedPayload;
let saveQueue = Promise.resolve();
let saveErrorVisible = false;
let historyFilterDays = "7";
let homeAssistantUsers = runtimeWindow.__PLANNER_OPTIONS__?.ha_users || [];
let homeAssistantUsersError = runtimeWindow.__PLANNER_OPTIONS__?.ha_users_error || "";
let usersSource = runtimeWindow.__PLANNER_OPTIONS__?.users_source || "";
let observedUsers = runtimeWindow.__PLANNER_OPTIONS__?.observed_users || [];
let selectedParentUsers = runtimeWindow.__PLANNER_OPTIONS__?.parent_users || [];
let currentUser = runtimeWindow.__PLANNER_OPTIONS__?.current_user || null;
const app = document.querySelector("#app");
const PERIOD_IDS = ["morning", "after", "evening"];

function childDesign(gender = "boy") {
  if (gender === "girl") {
    return {
      gender: "girl",
      accent: "#d5554d",
      soft: "#ffecea",
      avatarBg: "#ffe1dc",
      hair: "#d86a43",
    };
  }
  return {
    gender: "boy",
    accent: "#315aa8",
    soft: "#e8f2ff",
    avatarBg: "#dbeaff",
    hair: "#4d81e5",
  };
}

function emptyTasks() {
  return {
    morning: [],
    after: [],
    evening: [],
  };
}

function loadState() {
  try {
    if (runtimeWindow.__PLANNER_API__) {
      const serverState = normalizeState(structuredClone(runtimeWindow.__PLANNER_STATE__ || initialState));
      recoveredServerPayload = JSON.stringify(persistedStateFrom(serverState));
      clearPendingPayload(readPendingPayload());
      return serverState;
    }
    if (runtimeWindow.__PLANNER_STATE__) {
      return normalizeState(structuredClone(runtimeWindow.__PLANNER_STATE__));
    }
    const raw = localStorage.getItem(STORE_KEY);
    return normalizeState(raw ? JSON.parse(raw) : structuredClone(initialState));
  } catch {
    return normalizeState(structuredClone(initialState));
  }
}

function readPendingPayload() {
  try {
    const payload = localStorage.getItem(PENDING_STORE_KEY);
    if (!payload) return "";
    JSON.parse(payload);
    return payload;
  } catch {
    try {
      localStorage.removeItem(PENDING_STORE_KEY);
    } catch {}
    return "";
  }
}

function writePendingPayload(payload) {
  try {
    localStorage.setItem(PENDING_STORE_KEY, payload);
  } catch {}
}

function clearPendingPayload(payload) {
  try {
    if (localStorage.getItem(PENDING_STORE_KEY) === payload) {
      localStorage.removeItem(PENDING_STORE_KEY);
    }
  } catch {}
}

function saveState() {
  const payload = JSON.stringify(persistedState());
  if (payload === lastSavedPayload) return saveQueue;

  if (!runtimeWindow.__PLANNER_API__) {
    localStorage.setItem(STORE_KEY, payload);
    lastSavedPayload = payload;
    lastQueuedPayload = payload;
    return Promise.resolve();
  }

  lastSavedPayload = payload;
  lastQueuedPayload = payload;
  return saveQueue;
}

function flushStateBeforeLeave() {
  const payload = JSON.stringify(persistedState());
  if (payload === lastSavedPayload) return;

  if (!runtimeWindow.__PLANNER_API__) {
    localStorage.setItem(STORE_KEY, payload);
    lastSavedPayload = payload;
    lastQueuedPayload = payload;
    return;
  }

  lastSavedPayload = payload;
  lastQueuedPayload = payload;
}

function parentPin() {
  return String(runtimeWindow.__PLANNER_OPTIONS__?.parent_pin || "1234");
}

function persistedState() {
  return persistedStateFrom(state);
}

function persistedStateFrom(source) {
  return {
    ...source,
    view: "home",
    toast: "",
  };
}

function apiUrl(name) {
  const ingressBase = String(runtimeWindow.__PLANNER_API_BASE__ || "").replace(/\/+$/, "");
  if (ingressBase) return `${ingressBase}/api/${name}`;
  const pathname = runtimeWindow.location?.pathname || "/";
  const base = pathname.endsWith("/parent") || pathname.endsWith("/child")
    ? pathname.replace(/\/(parent|child)$/, "")
    : pathname.replace(/\/$/, "");
  return `${base || ""}/api/${name}`;
}

function uid(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char]));
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function actionErrorLabel(error) {
  return ({
    parent_action_forbidden: "Brak dostępu do panelu rodzica",
    reward_not_available: "Ta nagroda nie jest dostępna",
    not_enough_stars: "Za mało gwiazdek",
    coupon_exists: "Taki kupon jest już w szufladzie",
    coupon_not_ready: "Kupon nie jest gotowy do odbioru",
    coupon_not_pending: "Kupon nie czeka na akceptację",
    child_not_found: "Nie znaleziono dziecka",
    task_not_found: "Nie znaleziono obowiązku na dziś",
    invalid_chore: "Uzupełnij nazwę, dzieci i dni",
    invalid_reward: "Uzupełnij nazwę i dzieci",
    invalid_vacation_range: "Data końca musi być po dacie początku",
    http_404: "Nie znaleziono akcji zapisu. Odśwież aplikację i spróbuj ponownie.",
    http_502: "Aplikacja właśnie się uruchamia. Spróbuj ponownie za chwilę.",
    http_503: "Aplikacja jest chwilowo niedostępna. Spróbuj ponownie za chwilę.",
    network_error: "Nie udało się połączyć z aplikacją. Odśwież widok i spróbuj ponownie.",
  }[error] || "Nie udało się zapisać zmiany");
}

function applyServerState(nextState, options = {}) {
  const currentView = options.view || state.view;
  const currentChildId = options.childId || state.activeChildId;
  const currentToast = state.toast;
  state = normalizeState(nextState);
  state.view = currentView;
  state.activeChildId = currentChildId || state.activeChildId;
  state.toast = options.message || currentToast;
  const payload = JSON.stringify(persistedStateFrom(state));
  lastSavedPayload = payload;
  lastQueuedPayload = payload;
  clearPendingPayload(payload);
  render();
}

function runAction(type, payload = {}, options = {}) {
  if (!runtimeWindow.__PLANNER_API__) {
    return Promise.resolve(false);
  }
  const body = JSON.stringify({ type, payload });
  return fetch(apiUrl("action"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    keepalive: body.length < 60000,
  })
    .then(async (response) => {
      const raw = await response.text();
      let responseBody = {};
      try {
        responseBody = raw ? JSON.parse(raw) : {};
      } catch {}
      return { response, body: responseBody };
    })
    .then(({ response, body }) => {
      if (!response.ok) throw new Error(body.error || `http_${response.status}`);
      applyServerState(body.state, {
        view: options.view || state.view,
        childId: options.childId || state.activeChildId,
        message: options.message === false ? "" : (body.message || options.message || state.toast),
      });
      return true;
    })
    .catch((error) => {
      const code = error instanceof TypeError && /fetch/i.test(error.message) ? "network_error" : error.message;
      console.warn("Planner action failed", { type, url: apiUrl("action"), code });
      showToast(actionErrorLabel(code));
      return false;
    });
}

function refreshStateFromServer() {
  if (!runtimeWindow.__PLANNER_API__ || lastQueuedPayload !== lastSavedPayload) return;
  clearPendingPayload(readPendingPayload());
  fetch(apiUrl("state"))
    .then((response) => (response.ok ? response.json() : null))
    .then((payload) => {
      if (!payload) return;
      const currentView = state.view;
      const currentChildId = state.activeChildId;
      const currentToast = state.toast;
      const nextState = normalizeState(payload);
      const nextPayload = JSON.stringify(persistedStateFrom(nextState));
      if (nextPayload === lastSavedPayload) return;
      state = nextState;
      state.view = currentView;
      state.activeChildId = currentChildId || state.activeChildId;
      state.toast = currentToast;
      lastSavedPayload = nextPayload;
      lastQueuedPayload = nextPayload;
      render();
    })
    .catch(() => {});
}

function applyTheme() {
  const theme = state.settings?.theme === "dark" ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
}

function normalizeState(value) {
  value = value && typeof value === "object" ? value : structuredClone(initialState);
  value.settings = {
    theme: value.settings?.theme === "dark" ? "dark" : "light",
  };
  value.children = value.children || {};
  value.completions = value.completions && typeof value.completions === "object" ? value.completions : {};
  value.dailyStars = value.dailyStars && typeof value.dailyStars === "object" ? value.dailyStars : {};
  value.couponEvents = Array.isArray(value.couponEvents) ? value.couponEvents : [];
  const todayKey = dateKey();
  Object.entries(value.children).forEach(([childId, child]) => {
    const inferredGender = child.gender || (String(child.name || "").toLowerCase().endsWith("a") ? "girl" : "boy");
    const design = childDesign(inferredGender);
    child.id = child.id || childId;
    child.name = String(child.name || "Dziecko");
    child.gender = design.gender;
    child.accent = design.accent;
    child.soft = design.soft;
    child.avatarBg = design.avatarBg;
    child.hair = design.hair;
    child.stars = Number.isFinite(Number(child.stars)) ? Math.max(0, Number(child.stars)) : 0;
    child.tasks = { ...emptyTasks(), ...(child.tasks || {}) };
  });
  const childIds = Object.keys(value.children);
  value.view = value.view || "home";
  value.activeChildId = childIds.includes(value.activeChildId) ? value.activeChildId : (childIds[0] || "");
  value.toast = "";
  value.dayExcuses = value.dayExcuses || {};
  value.dayOverrides = value.dayOverrides || {};
  value.vacationRanges = value.vacationRanges || [];
  value.history = value.history || [];
  Object.values(value.children || {}).forEach((child) => {
    Object.entries(child.tasks || {}).forEach(([period, tasks]) => {
      tasks.forEach((task, index) => {
        task.id = task.id || uid(`${child.id}-${period}`);
        task.label = String(task.label || "Obowiązek");
        task.days = task.days?.length ? task.days : [1, 2, 3, 4, 5];
        task.groupId = task.groupId || stableTaskGroupId(period, task.label);
        task.order = Number.isFinite(task.order) ? task.order : periodIndex(period) * 100 + index;
        if (task.done) {
          value.completions[completionKey(child.id, task.id, todayKey)] = {
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
      value.dailyStars[dailyStarKey(child.id, todayKey)] = {
        childId: child.id,
        date: todayKey,
        awardedAt: Date.now(),
      };
    }
    delete child.starAwardedToday;
  });
  value.rewards = (value.rewards || initialState.rewards).map((reward) => ({
    ...reward,
    id: String(reward.id || uid("reward")),
    title: String(reward.title || "Nagroda"),
    cost: Math.max(1, Number.isFinite(Number(reward.cost)) ? Number(reward.cost) : 1),
    icon: String(reward.icon || "play"),
    color: String(reward.color || "#315aa8"),
    childIds: reward.childIds?.length ? reward.childIds : childIds,
  }));
  value.coupons = value.coupons || [];
  value.history = value.history.slice(0, 250);
  value.couponEvents = value.couponEvents.slice(0, 250);
  return value;
}

function periods() {
  return [
    { id: "morning", title: "Rano", art: "sun", accent: "#2a9254", soft: "#eef9f1" },
    { id: "after", title: "Po szkole", art: "home", accent: "#315aa8", soft: "#eef4ff" },
    { id: "evening", title: "Wieczór", art: "moon", accent: "#7055ca", soft: "#f4f0ff" },
  ];
}

function periodById(id) {
  return periods().find((period) => period.id === id) || periods()[0];
}

function periodIndex(id) {
  return Math.max(0, periods().findIndex((period) => period.id === id));
}

function slugify(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "obowiazek";
}

function stableTaskGroupId(period, label) {
  return `chore-${period}-${slugify(label)}`;
}

function nextChoreOrder() {
  const orders = choreGroups().map((group) => group.order);
  return orders.length ? Math.max(...orders) + 10 : 10;
}

function findTaskByGroup(child, groupId) {
  for (const period of periods()) {
    const task = (child.tasks[period.id] || []).find((item) => item.groupId === groupId);
    if (task) return { task, periodId: period.id };
  }
  return null;
}

function removeTaskByGroup(child, groupId) {
  Object.keys(child.tasks).forEach((periodId) => {
    child.tasks[periodId] = child.tasks[periodId].filter((task) => task.groupId !== groupId);
  });
}

function choreGroups() {
  const groups = new Map();
  Object.values(state.children).forEach((child) => {
    Object.entries(child.tasks || {}).forEach(([periodId, tasks]) => {
      tasks.forEach((task) => {
        const groupId = task.groupId || stableTaskGroupId(periodId, task.label);
        if (!groups.has(groupId)) {
          groups.set(groupId, {
            id: groupId,
            label: task.label,
            periodId,
            days: task.days || weekDays(),
            order: Number.isFinite(task.order) ? task.order : periodIndex(periodId) * 100,
            childIds: [],
          });
        }
        const group = groups.get(groupId);
        group.order = Math.min(group.order, Number.isFinite(task.order) ? task.order : group.order);
        if (!group.childIds.includes(child.id)) group.childIds.push(child.id);
      });
    });
  });
  return Array.from(groups.values()).sort((a, b) => a.order - b.order || periodIndex(a.periodId) - periodIndex(b.periodId) || a.label.localeCompare(b.label));
}

function today() {
  return new Date();
}

function dateKey(date = today()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function currentDayIndex() {
  return today().getDay();
}

function dayName(index = currentDayIndex()) {
  return ["niedziela", "poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota"][index];
}

function dayShortName(index) {
  if (index === 7) return "Wakacje";
  return ["Nd", "Pn", "Wt", "Śr", "Cz", "Pt", "So"][index];
}

function weekDays() {
  return [1, 2, 3, 4, 5];
}

function weekendDays() {
  return [0, 6];
}

function allWeekDays() {
  return [1, 2, 3, 4, 5, 6, 0, 7];
}

function daysLabel(days = []) {
  const sorted = [...days].sort((a, b) => allWeekDays().indexOf(a) - allWeekDays().indexOf(b));
  if (sorted.length === 8) return "codziennie + wakacje";
  if (sorted.length === 7 && !sorted.includes(7)) return "codziennie";
  if (weekDays().every((day) => sorted.includes(day)) && sorted.length === 5) return "dni szkolne";
  if (weekendDays().every((day) => sorted.includes(day)) && sorted.length === 2) return "weekend";
  if (sorted.length === 1 && sorted[0] === 7) return "wakacje";
  return sorted.map(dayShortName).join(", ");
}

function schoolDayOverride(key = dateKey()) {
  return state.dayOverrides?.[key] || null;
}

function isSchoolFreeDay(key = dateKey()) {
  return schoolDayOverride(key)?.type === "schoolFree";
}

function parseDateKey(key) {
  const [year, month, day] = String(key || "").split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isDateKeyInRange(key, range) {
  return key >= range.start && key <= range.end;
}

function activeVacationRange(date = today()) {
  const key = dateKey(date);
  return (state.vacationRanges || []).find((range) => isDateKeyInRange(key, range));
}

function isVacationWeekday(date = today()) {
  return Boolean(activeVacationRange(date)) && ![0, 6].includes(date.getDay());
}

function systemDayTypeLabel(date = today()) {
  const key = dateKey(date);
  if (isSchoolFreeDay(key)) return "dzień wolny";
  if (isVacationWeekday(date)) return "wakacje";
  return [0, 6].includes(date.getDay()) ? "weekend" : "dzień szkolny";
}

function effectiveTaskDayIndex(date = today()) {
  if (isVacationWeekday(date)) return 7;
  return isSchoolFreeDay(dateKey(date)) ? 6 : date.getDay();
}

function excuseKey(childId, key = dateKey()) {
  return `${childId}:${key}`;
}

function completionKey(childId, taskId, key = dateKey()) {
  return `${childId}:${key}:${taskId}`;
}

function dailyStarKey(childId, key = dateKey()) {
  return `${childId}:${key}`;
}

function isTaskDone(child, task, key = dateKey()) {
  return Boolean(state.completions?.[completionKey(child.id, task.id, key)]);
}

function hasDailyStar(child, key = dateKey()) {
  return Boolean(state.dailyStars?.[dailyStarKey(child.id, key)]);
}

function isExcused(child) {
  return Boolean(state.dayExcuses?.[excuseKey(child.id)]);
}

function childDayLabel(child) {
  return isExcused(child) ? "usprawiedliwiony" : systemDayTypeLabel();
}

function taskAppliesToday(task) {
  return (task.days || weekDays()).includes(effectiveTaskDayIndex());
}

function allTasks(child, options = {}) {
  const tasks = Object.values(child.tasks || {}).flat();
  if (options.includeAll) return tasks;
  if (isExcused(child)) return [];
  return tasks.filter(taskAppliesToday).sort((a, b) => (a.order || 0) - (b.order || 0));
}

function taskStats(child) {
  const tasks = allTasks(child);
  const done = tasks.filter((task) => isTaskDone(child, task)).length;
  return { done, total: tasks.length, remaining: Math.max(0, tasks.length - done) };
}

function periodStats(child, periodId) {
  const tasks = (child.tasks[periodId] || []).filter((task) => !isExcused(child) && taskAppliesToday(task));
  const done = tasks.filter((task) => isTaskDone(child, task)).length;
  return { done, total: tasks.length };
}

function activeChild() {
  return childById(state.activeChildId);
}

function childById(id) {
  return state.children[id] || Object.values(state.children)[0] || null;
}

function rewardById(id) {
  return state.rewards.find((reward) => reward.id === id) || state.rewards[0] || null;
}

function rewardAppliesToChild(reward, childId) {
  return Boolean(reward) && (reward.childIds || []).includes(childId);
}

function starWord(count) {
  if (count === 1) return "gwiazdka";
  if (count >= 2 && count <= 4) return "gwiazdki";
  return "gwiazdek";
}

function remainingPhrase(count) {
  if (count === 1) return "zostało 1 zadanie";
  if (count >= 2 && count <= 4) return `zostały ${count} zadania`;
  return `zostało ${count} zadań`;
}

function toStarPhrase(count) {
  if (count === 1) return "Zostało 1 zadanie do gwiazdki";
  if (count >= 2 && count <= 4) return `Zostały ${count} zadania do gwiazdki`;
  return `Zostało ${count} zadań do gwiazdki`;
}

function earnedPhrase(child) {
  return `${escapeHtml(child.name)} ${child.gender === "girl" ? "zdobyła" : "zdobył"} gwiazdkę`;
}

function styleVars(child, extra = "") {
  return `style="--accent:${child.accent};--soft:${child.soft};--avatar-bg:${child.avatarBg};--hair:${child.hair};${extra}"`;
}

function icon(name) {
  if (name === "play") return "▶";
  if (name === "pad") return "+";
  if (name === "calendar") return "▣";
  if (name === "compass") return "◇";
  return "✓";
}

function setView(view, childId = state.activeChildId) {
  if (isParentView(view) && !isParentModule) {
    state.view = "home";
    redeemConfirmId = "";
    render();
    return;
  }
  if (isParentView(view) && !parentUnlocked) {
    parentTargetView = view;
    state.view = "parentGate";
    state.activeChildId = childId;
    redeemConfirmId = "";
    render();
    return;
  }
  state.view = view;
  state.activeChildId = childId;
  redeemConfirmId = "";
  render();
}

function isParentView(view) {
  return ["parent", "childrenAdmin", "edit", "rewardsAdmin", "dayAdmin", "accessAdmin"].includes(view);
}

function showToast(message) {
  state.toast = message;
  render();
  setTimeout(() => {
    if (state.toast === message) {
      state.toast = "";
      render();
    }
  }, 2200);
}

function addHistory(childId, title, note, type = "event") {
  state.history = state.history || [];
  state.history.unshift({
    id: `history-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    childId,
    title,
    note,
    type,
    happenedAt: Date.now(),
  });
  state.history = state.history.slice(0, 250);
}

function render() {
  if (state.view === "history") state.view = "parent";
  if (!activeChild() && ["child", "shop"].includes(state.view)) {
    state.view = "home";
  }
  if (isParentModule && !isParentView(state.view)) {
    state.view = "parent";
  }
  if (!isParentModule && isParentView(state.view)) {
    state.view = "home";
  }
  applyTheme();
  saveState();
  if (state.view === "home") app.innerHTML = renderHome();
  if (state.view === "child") app.innerHTML = renderChild(activeChild());
  if (state.view === "shop") app.innerHTML = renderShop(activeChild());
  if (state.view === "parentGate") app.innerHTML = isParentModule ? renderParentGate() : renderHome();
  if (state.view === "parent") app.innerHTML = parentUnlocked ? renderParent() : renderParentGate();
  if (state.view === "childrenAdmin") app.innerHTML = parentUnlocked ? renderChildrenAdmin() : renderParentGate();
  if (state.view === "edit") app.innerHTML = parentUnlocked ? renderEdit() : renderParentGate();
  if (state.view === "rewardsAdmin") app.innerHTML = parentUnlocked ? renderRewardsAdmin() : renderParentGate();
  if (state.view === "dayAdmin") app.innerHTML = parentUnlocked ? renderDayAdmin() : renderParentGate();
  if (state.view === "accessAdmin") app.innerHTML = parentUnlocked ? renderAccessAdmin() : renderParentGate();
  bindEvents();
}

function renderTopBadges(child) {
  return `
    <div class="top-actions">
      ${renderDayBadge(child)}
      <div class="badge balance-badge">
        <span><small>Dostępne saldo</small></span>
        ${renderStarToken(child, "star-token-compact")}
      </div>
    </div>
  `;
}

function renderDayBadge(child = null) {
  const dayLabel = child ? childDayLabel(child) : systemDayTypeLabel();
  return `
    <div class="badge day-badge">
      <span class="icon-box day-icon ${dayIconClass(child)}" aria-label="${dayIconLabel(child)}"><span></span></span>
      <span><small>${dayName()}</small><strong>${dayLabel}</strong></span>
    </div>
  `;
}

function dayIconClass(child) {
  if (child && isExcused(child)) return "day-icon-excused";
  if (systemDayTypeLabel() === "wakacje") return "day-icon-vacation";
  return systemDayTypeLabel() === "dzień szkolny" ? "day-icon-school" : "day-icon-free";
}

function dayIconLabel(child) {
  if (child && isExcused(child)) return "Dzień usprawiedliwiony";
  if (systemDayTypeLabel() === "wakacje") return "Wakacje";
  return systemDayTypeLabel() === "dzień szkolny" ? "Dzień szkolny" : "Dzień wolny od szkoły";
}

function renderStarToken(child, className = "") {
  return `
    <div class="star-token ${className}" aria-label="${child.stars} ${starWord(child.stars)}">
      <span class="star-token-icon">★</span>
      <strong>${child.stars}</strong>
    </div>
  `;
}

function renderHome() {
  const children = Object.values(state.children);
  const cards = children.length ? children.map(renderHomeChildCard).join("") : renderNoChildrenHome();
  return `
    <section class="screen">
      <div class="topbar">
        <div class="title-block">
          <h1>Obowiązki dzieci</h1>
          <p>Wybierz swoją kartę i domknij dzień po swojemu.</p>
        </div>
        <div class="top-actions home-top-actions">
          ${renderDayBadge()}
        </div>
      </div>
      <div class="grid-2">${cards}</div>
      ${toast()}
    </section>
  `;
}

function renderNoChildrenHome() {
  return `
    <div class="empty-family-card">
      <h2>Dodaj pierwsze dziecko</h2>
      <p>Rodzic może utworzyć karty dzieci w panelu rodzica. Potem tutaj pojawią się ich codzienne obowiązki i gwiazdki.</p>
    </div>
  `;
}

function renderHomeChildCard(child) {
  const stats = taskStats(child);
  const excused = isExcused(child);
  const emptyToday = !excused && stats.total === 0;
  const ready = stats.total > 0 && stats.remaining === 0;
  const childName = escapeHtml(child.name);
  const childId = escapeAttr(child.id);
  return `
    <article class="child-card ${ready ? "child-card-complete" : ""}" ${styleVars(child)} data-card-child="${childId}" tabindex="0" role="button" aria-label="Otwórz kartę ${escapeAttr(child.name)}">
      <div class="child-head">
        <div class="avatar"><div class="profile-mark">${escapeHtml(child.name.charAt(0))}</div></div>
        <div>
          <h2 class="child-name">${childName}</h2>
          <div class="child-meta">${excused ? "usprawiedliwiony" : ready ? "gwiazdka zdobyta" : "w trakcie"}</div>
        </div>
        ${renderStarToken(child)}
      </div>
      <div class="mission-card">
        <div>
          <h3>${excused ? "Dzień usprawiedliwiony" : emptyToday ? "Brak obowiązków na dziś" : ready ? "Dzisiejsza gwiazdka zdobyta" : toStarPhrase(stats.remaining)}</h3>
          <div class="progress-track"><div class="progress-fill" style="width:${stats.total ? (stats.done / stats.total) * 100 : 100}%"></div></div>
          <div class="child-meta">${stats.done}/${stats.total} zrobione dzisiaj</div>
        </div>
        <strong>${excused ? "✓" : emptyToday ? "•" : ready ? "★" : "→"}</strong>
      </div>
      <div class="period-summary">
        ${periods().map((period) => {
          const p = periodStats(child, period.id);
          return `<button class="period-row" data-child="${childId}">
            <span class="period-mini period-${period.art}" style="--accent:${period.accent}"><span></span></span>
            <span>${period.title}</span>
            <span class="count-pill">${p.done}/${p.total}</span>
          </button>`;
        }).join("")}
      </div>
      <div class="card-affordance">Dotknij kartę</div>
    </article>
  `;
}

function renderChildMenu(active) {
  return `
    <nav class="app-menu-bar" aria-label="Nawigacja dziecka">
      <button class="${active === "child" ? "active" : ""}" data-view="child">Karta</button>
      <button class="${active === "shop" ? "active" : ""}" data-view="shop">Sklep</button>
      <button data-view="home">Panel główny</button>
    </nav>
  `;
}

function renderChild(child) {
  const stats = taskStats(child);
  const excused = isExcused(child);
  const emptyToday = !excused && stats.total === 0;
  const complete = stats.total > 0 && stats.remaining === 0;
  const childName = escapeHtml(child.name);
  const hero = excused ? `${childName} ma dzień usprawiedliwiony` : emptyToday ? `${childName} nie ma dziś obowiązków` : complete ? earnedPhrase(child) : `${childName}, ${remainingPhrase(stats.remaining)}`;
  return `
    <section class="screen">
      <div class="topbar">
        <div class="child-page-title">
          <button class="back-button" data-view="home">‹</button>
          <div class="title-block">
            <h1>Karta: ${childName}</h1>
            <p>Dzisiaj: ${stats.done} z ${stats.total} obowiązków</p>
          </div>
        </div>
        ${renderTopBadges(child)}
      </div>
      ${renderChildMenu("child")}
      <div class="hero-card ${complete ? "hero-card-complete" : ""}" ${styleVars(child)}>
        <div class="avatar"><div class="profile-mark">${escapeHtml(child.name.charAt(0))}</div></div>
        <div class="hero-copy">
          <h2>${hero}</h2>
          <p>${excused ? "Dzisiaj nie liczymy obowiązków ani gwiazdki." : emptyToday ? "Rodzic może dodać obowiązki na ten dzień tygodnia." : complete ? "Wszystkie obowiązki są zrobione." : "Po skończeniu całego dnia wpada jedna gwiazdka."}</p>
          <div class="hero-progress">
            <div class="progress-track"><div class="progress-fill" style="width:${stats.total ? (stats.done / stats.total) * 100 : 100}%"></div></div>
            <span class="hero-score">${stats.done}/${stats.total}</span>
          </div>
        </div>
        <div class="hero-side">
          ${complete ? `<div class="hero-earned-badge"><span>★</span><strong>Gwiazdka dodana</strong><small>do salda</small></div>` : `<div class="drawer-icon">→</div>`}
        </div>
      </div>
      <div class="section-grid">
        ${periods().map((period) => renderTaskSection(child, period)).join("")}
      </div>
      ${renderChildHistory(child)}
      <div class="bottom-strip child-day-note">
        <span>${excused ? "Dzień jest usprawiedliwiony przez rodzica." : emptyToday ? "Na dziś nie ma przypisanych obowiązków." : complete ? `Brawo ${childName}. Dzisiejsza gwiazdka jest zdobyta.` : "Dobra robota. Zostały jeszcze drobiazgi."}</span>
      </div>
      ${toast()}
    </section>
  `;
}

function renderChildHistory(child) {
  const entries = filteredHistory(child.id, ["task", "star"]);
  return `
    <section class="child-history-panel">
      <div class="section-title child-history-title">
        <span>Historia obowiązków</span>
        <span class="count-pill">${entries.length}</span>
      </div>
      ${renderHistoryFilter()}
      <div class="child-history-list">
        ${entries.length ? entries.map((entry) => `
          <div class="child-history-row history-${entry.type || "event"}">
            <span class="history-dot">${historyIcon(entry.type)}</span>
            <span>
              <strong>${escapeHtml(entry.title)}</strong>
              <small>${formatDateTime(entry.happenedAt)} · ${escapeHtml(entry.note)}</small>
            </span>
          </div>
        `).join("") : `<div class="empty-row">Historia pojawi się po odznaczeniu obowiązków i zdobyciu gwiazdek.</div>`}
      </div>
    </section>
  `;
}

function renderRewardHistory(child) {
  const entries = filteredCouponEvents(child.id);
  return `
    <section class="child-history-panel reward-history-panel">
      <div class="section-title child-history-title">
        <span>Historia kuponów</span>
        <span class="count-pill">${entries.length}</span>
      </div>
      ${renderHistoryFilter()}
      <div class="child-history-list">
        ${entries.length ? entries.map((entry) => `
          <div class="child-history-row history-reward">
            <span class="history-dot">${historyIcon("reward")}</span>
            <span>
              <strong>${escapeHtml(entry.title)}</strong>
              <small>${formatDateTime(entry.happenedAt)} · ${escapeHtml(entry.note)}</small>
            </span>
          </div>
        `).join("") : `<div class="empty-row">Historia kuponów pojawi się po zamówieniu lub odebraniu nagrody.</div>`}
      </div>
    </section>
  `;
}

function renderHistoryFilter() {
  return `
    <label class="history-filter">
      <span>Pokaż</span>
      <select data-history-filter>
        <option value="1" ${historyFilterDays === "1" ? "selected" : ""}>dzisiaj</option>
        <option value="7" ${historyFilterDays === "7" ? "selected" : ""}>7 dni</option>
        <option value="30" ${historyFilterDays === "30" ? "selected" : ""}>30 dni</option>
        <option value="all" ${historyFilterDays === "all" ? "selected" : ""}>wszystko</option>
      </select>
    </label>
  `;
}

function filteredHistory(childId, types) {
  const now = Date.now();
  const maxAge = historyFilterDays === "all" ? Infinity : Number(historyFilterDays) * 24 * 60 * 60 * 1000;
  return (state.history || [])
    .filter((entry) => entry.childId === childId)
    .filter((entry) => types.includes(entry.type || "event"))
    .filter((entry) => Number.isFinite(maxAge) ? now - Number(entry.happenedAt || 0) <= maxAge : true);
}

function filteredCouponEvents(childId) {
  const now = Date.now();
  const maxAge = historyFilterDays === "all" ? Infinity : Number(historyFilterDays) * 24 * 60 * 60 * 1000;
  return (state.couponEvents || [])
    .filter((entry) => entry.childId === childId)
    .filter((entry) => Number.isFinite(maxAge) ? now - Number(entry.happenedAt || 0) <= maxAge : true)
    .map((entry) => {
      const reward = rewardById(entry.rewardId);
      const label = {
        requested: "Kupon zamówiony",
        approved: "Kupon zatwierdzony",
        rejected: "Kupon odrzucony",
        redeemed: "Kupon odebrany",
      }[entry.action] || "Zdarzenie kuponu";
      return {
        ...entry,
        title: reward ? `${label}: ${reward.title}` : label,
        note: entry.note || "",
      };
    });
}

function historyIcon(type) {
  if (type === "task") return "✓";
  if (type === "star") return "★";
  if (type === "reward") return "▤";
  return "•";
}

function renderTaskSection(child, period) {
  const stats = periodStats(child, period.id);
  const tasks = (child.tasks[period.id] || []).filter((task) => !isExcused(child) && taskAppliesToday(task)).sort((a, b) => (a.order || 0) - (b.order || 0));
  return `
    <section class="task-section" data-art="${period.art}" style="--accent:${period.accent};--soft:${period.soft}">
      <div class="section-title">
        <span class="section-label"><span class="period-mini period-${period.art}"><span></span></span>${period.title}</span>
        <span class="count-pill">${stats.done}/${stats.total}</span>
      </div>
      <div class="task-list">
        ${tasks.length ? tasks.map((task) => {
          const done = isTaskDone(child, task);
          return `
          <button class="task-row ${done ? "done" : ""}" data-task="${escapeAttr(task.id)}" data-period="${escapeAttr(period.id)}">
            <span class="check">${done ? "✓" : ""}</span>
            <span>${escapeHtml(task.label)}</span>
          </button>
        `;
        }).join("") : `<div class="empty-row">${isExcused(child) ? "Dzień usprawiedliwiony" : "Brak obowiązków na dziś"}</div>`}
      </div>
    </section>
  `;
}

function renderShop(child) {
  const coupons = state.coupons.filter((coupon) => coupon.childId === child.id && !["rejected", "used"].includes(coupon.status));
  const rewards = state.rewards.filter((reward) => rewardAppliesToChild(reward, child.id));
  const childName = escapeHtml(child.name);
  return `
    <section class="screen">
      <div class="topbar">
        <div class="title-block">
          <h1>Sklep nagród: ${childName}</h1>
          <p>Wybierz nagrodę</p>
        </div>
        <div class="badge balance-badge">
          <span><small>Dostępne saldo</small></span>
          ${renderStarToken(child, "star-token-compact")}
        </div>
      </div>
      ${renderChildMenu("shop")}
      <div class="shop-grid">
        ${rewards.map((reward) => renderReward(child, reward)).join("")}
      </div>
      <section class="coupon-drawer">
        <div class="drawer-icon">▤</div>
        <div>
          <h2>Szuflada kuponów</h2>
          <p>Tu trafiają nagrody po wyborze. Rodzic zatwierdza, a kupon można odebrać teraz albo później.</p>
          <div class="coupon-list">
            ${coupons.length ? coupons.map(renderCoupon).join("") : `<div class="coupon"><span></span><div><h4>Brak kuponów</h4><small>Wybierz nagrodę ze sklepu.</small></div></div>`}
          </div>
        </div>
      </section>
      ${renderRewardHistory(child)}
      <div class="bottom-strip shop-hint"><span>${bigTripHint(child)}</span></div>
      ${renderRedeemConfirm()}
      ${toast()}
    </section>
  `;
}

function renderReward(child, reward) {
  const canBuy = child.stars >= reward.cost;
  const pending = state.coupons.some((coupon) => coupon.childId === child.id && coupon.rewardId === reward.id && coupon.status === "pending");
  const ready = state.coupons.some((coupon) => coupon.childId === child.id && coupon.rewardId === reward.id && coupon.status === "ready");
  let status = { label: canBuy ? "Dostępne" : "Za mało", tone: canBuy ? "available" : "unavailable" };
  if (pending) status = { label: "Czeka na rodzica", tone: "pending" };
  if (ready) status = { label: "Gotowe do odebrania", tone: "ready" };
  return `
    <button class="reward-card ${canBuy || pending || ready ? "" : "disabled"}" style="--accent:${escapeAttr(reward.color)};--soft:${reward.id === "game30" ? "#f2edff" : "#eef9f1"}" data-reward="${escapeAttr(reward.id)}">
      <span class="price-badge">${reward.cost} ★</span>
      <div class="reward-art">${icon(reward.icon)}</div>
      <h3>${escapeHtml(reward.title)}</h3>
      <span class="status-badge status-${status.tone}">${status.label}</span>
    </button>
  `;
}

function renderCoupon(coupon) {
  const reward = rewardById(coupon.rewardId);
  if (!reward) return "";
  const statusLabel = coupon.status === "pending" ? "Czeka na rodzica" : coupon.status === "ready" ? "Gotowe do odebrania" : "Wykorzystane";
  const statusTone = coupon.status === "pending" ? "pending" : coupon.status === "ready" ? "ready" : "used";
  const note = coupon.status === "pending" ? "Czeka na decyzje rodzica" : coupon.status === "ready" ? "Gotowe do odebrania" : "Trafiło do historii";
  return `
    <button class="coupon ${coupon.status === "ready" ? "ready" : ""}" data-coupon="${escapeAttr(coupon.id)}">
      <span class="coupon-icon">${icon(reward.icon)}</span>
      <span><h4>${escapeHtml(reward.title)}</h4><small>${note}</small></span>
      <span class="price-badge">${reward.cost} ★</span>
      <span class="status-badge status-${statusTone}">${statusLabel}</span>
    </button>
  `;
}

function bigTripHint(child) {
  const trip = rewardById("trip");
  if (!trip) return "Rodzic może dodać nagrody w panelu rodzica";
  const missing = Math.max(0, trip.cost - child.stars);
  return missing ? `Do dużej wyprawy brakuje jeszcze ${missing} ${starWord(missing)}` : "Duża wyprawa jest dostępna";
}

function renderRedeemConfirm() {
  const coupon = state.coupons.find((item) => item.id === redeemConfirmId);
  if (!coupon) return "";
  const reward = rewardById(coupon.rewardId);
  if (!reward) return "";
  return `
    <div class="confirm-backdrop">
      <div class="confirm-card">
        <span class="coupon-icon">${icon(reward.icon)}</span>
        <div>
          <h2>Odebrać kupon?</h2>
          <p>${escapeHtml(reward.title)} zostanie przeniesione do historii.</p>
          <div class="confirm-actions">
            <button class="secondary" data-cancel-redeem>Anuluj</button>
            <button class="primary" data-confirm-redeem="${escapeAttr(coupon.id)}">Potwierdź odbiór</button>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderParentGate() {
  return `
    <section class="parent-shell">
      <div class="parent-card">
        <h1>Panel rodzica</h1>
        <p class="child-meta">Wpisz PIN, aby zarządzać nagrodami, obowiązkami i dniami wolnymi.</p>
        <form class="stack" data-parent-login>
          <input name="pin" type="password" inputmode="numeric" placeholder="PIN rodzica" autocomplete="off" />
          <button class="primary">Odblokuj</button>
          <button class="secondary" type="button" data-view="home">Wróć</button>
        </form>
      </div>
      ${toast()}
    </section>
  `;
}

function renderParent() {
  const pending = state.coupons.filter((coupon) => coupon.status === "pending");
  const children = Object.values(state.children);
  const completedToday = children.filter((child) => {
    const stats = taskStats(child);
    return stats.total > 0 && stats.remaining === 0;
  }).length;
  const totalStars = children.reduce((sum, child) => sum + Number(child.stars || 0), 0);
  return `
    <section class="parent-shell">
      <div class="parent-dashboard-hero">
        <div class="title-block">
          <h1>Panel rodzica</h1>
          <p>Nagrody, obowiązki, dni wolne i ustawienia domu.</p>
        </div>
        ${renderThemeSwitch()}
      </div>
      <div class="parent-dashboard-grid">
        <div class="parent-stat-card stat-pending">
          <span>Do decyzji</span>
          <strong>${pending.length}</strong>
          <small>${pending.length === 1 ? "kupon czeka" : "kuponów czeka"}</small>
        </div>
        <div class="parent-stat-card stat-children">
          <span>Dzieci</span>
          <strong>${children.length}</strong>
          <small>${completedToday}/${children.length || 0} z gwiazdką dzisiaj</small>
        </div>
        <div class="parent-stat-card stat-stars">
          <span>Saldo domu</span>
          <strong>${totalStars}</strong>
          <small>${starWord(totalStars)} razem</small>
        </div>
      </div>
      <div class="parent-dashboard-layout">
        <section class="parent-card parent-requests-card">
          <div class="admin-list-head">
            <div>
              <h2>Akceptacje</h2>
              <p class="child-meta">Kupony zamówione przez dzieci.</p>
            </div>
            <span class="status-badge status-pending">${pending.length}</span>
          </div>
          <div class="parent-request-list">
            ${pending.length ? pending.map(renderParentRequest).join("") : `<div class="empty-row">Aktualnie żaden kupon nie czeka na akceptację.</div>`}
          </div>
        </section>
        <section class="parent-card parent-menu-card">
          <div class="admin-list-head">
            <div>
              <h2>Zarządzanie</h2>
              <p class="child-meta">Najważniejsze moduły konfiguracyjne.</p>
            </div>
          </div>
          <div class="parent-menu-grid">
            ${renderParentMenuButton("childrenAdmin", "Dzieci", "Karty, saldo i styl", "👤")}
            ${renderParentMenuButton("edit", "Obowiązki", "Lista, dni i kolejność", "✓")}
            ${renderParentMenuButton("rewardsAdmin", "Nagrody", "Sklep i dostępność", "★")}
            ${renderParentMenuButton("dayAdmin", "Kalendarz", "Wolne, choroba, wakacje", "⌂")}
            ${renderParentMenuButton("accessAdmin", "Dostęp", "Konta rodziców", "🔒")}
          </div>
        </section>
      </div>
      ${toast()}
    </section>
  `;
}

function renderThemeSwitch() {
  const dark = state.settings?.theme === "dark";
  return `
    <div class="theme-card" aria-label="Tryb wyglądu">
      <span>Wygląd</span>
      <div class="theme-switch">
        <button class="${dark ? "" : "active"}" data-theme="light" type="button">Jasny</button>
        <button class="${dark ? "active" : ""}" data-theme="dark" type="button">Ciemny</button>
      </div>
    </div>
  `;
}

function renderParentMenuButton(view, title, note, symbol) {
  return `
    <button class="parent-menu-tile" data-view="${view}">
      <span>${symbol}</span>
      <strong>${title}</strong>
      <small>${note}</small>
    </button>
  `;
}

function setTheme(theme) {
  if (runtimeWindow.__PLANNER_API__) {
    runAction("set_theme", { theme }, { view: state.view });
    return;
  }
  state.settings = state.settings || {};
  state.settings.theme = theme === "dark" ? "dark" : "light";
  showToast(state.settings.theme === "dark" ? "Tryb ciemny włączony" : "Tryb jasny włączony");
}

function renderChildrenAdmin() {
  const children = Object.values(state.children);
  return `
    <section class="parent-shell children-admin-shell">
      <button class="back-button" data-view="parent">‹</button>
      <div class="title-block"><h1>Dzieci</h1><p>Dodawaj dzieci i wybieraj styl karty.</p></div>
      <div class="children-admin-layout">
        <div class="parent-card form-card">
          <h2>Dodaj dziecko</h2>
          <form class="stack" data-child-form>
            <div class="field"><label>Imię</label><input name="name" required placeholder="Imię dziecka" /></div>
            <div class="field">
              <label>Styl</label>
              <select name="gender">
                <option value="boy">Chłopiec</option>
                <option value="girl">Dziewczynka</option>
              </select>
            </div>
            <button class="primary">Dodaj dziecko</button>
          </form>
        </div>
        <div class="parent-card child-list-card">
          <div class="admin-list-head">
            <div><h2>Lista dzieci</h2><p class="child-meta">Każde dziecko ma własną kartę, obowiązki, saldo i historię.</p></div>
            <span class="status-badge">${children.length} ${children.length === 1 ? "dziecko" : "dzieci"}</span>
          </div>
          <div class="child-admin-list">
            ${children.length ? children.map(renderChildAdminRow).join("") : `<div class="empty-row">Nie ma jeszcze dzieci. Dodaj pierwszą kartę.</div>`}
          </div>
        </div>
      </div>
      ${toast()}
    </section>
  `;
}

function renderChildAdminRow(child) {
  const childId = escapeAttr(child.id);
  const childName = escapeHtml(child.name);
  return `
    <div class="child-admin-row" ${styleVars(child)}>
      <div class="avatar compact-avatar"><div class="profile-mark">${escapeHtml(child.name.charAt(0))}</div></div>
      <div class="child-admin-main">
        <div class="reward-row-top child-row-top">
          <div class="field compact-field"><label>Imię</label><input data-child-name="${childId}" value="${escapeAttr(child.name)}" /></div>
          <div class="field compact-field">
            <label>Styl</label>
            <select data-child-gender="${childId}">
              <option value="boy" ${child.gender === "boy" ? "selected" : ""}>Chłopiec</option>
              <option value="girl" ${child.gender === "girl" ? "selected" : ""}>Dziewczynka</option>
            </select>
          </div>
          <div class="field compact-field"><label>Gwiazdki</label><input data-child-stars="${childId}" type="number" min="0" value="${child.stars}" /></div>
        </div>
        <p class="child-meta">${childName} · styl karty: ${child.gender === "girl" ? "dziewczynka" : "chłopiec"}</p>
      </div>
      <div class="reward-row-actions">
        <button class="primary" data-save-child="${childId}">Zapisz</button>
        <button class="danger" data-delete-child="${childId}">Usuń</button>
      </div>
    </div>
  `;
}

function renderAccessAdmin() {
  const selected = new Set(selectedParentUsers.map((id) => String(id).toLowerCase()));
  const users = homeAssistantUsers.length ? homeAssistantUsers : (observedUsers.length ? observedUsers : (currentUser ? [currentUser] : []));
  const sourceLabel = homeAssistantUsers.length ? "Lista kont Home Assistant" : "Tryb awaryjny";
  return `
    <section class="parent-shell access-admin-shell">
      <button class="back-button" data-view="parent">‹</button>
      <div class="title-block"><h1>Dostęp rodziców</h1><p>Wybierz użytkowników Home Assistant, którzy mogą otwierać panel rodzica.</p></div>
      <div class="parent-card access-card">
        <div class="access-summary">
          <span>${sourceLabel}</span>
          ${homeAssistantUsers.length ? `<strong>${homeAssistantUsers.length} kont</strong>` : `<strong>Brak listy HA</strong>`}
        </div>
        <form class="stack" data-parent-users-form>
          <div class="access-user-list">
            ${users.length ? users.map((user) => `
              <label class="access-user-row">
                <input type="checkbox" name="parentUsers" value="${escapeAttr(user.id)}" ${selected.has(String(user.id).toLowerCase()) ? "checked" : ""} />
                <span>
                  <strong>${escapeHtml(user.label || user.id)}</strong>
                  <small>
                    ${escapeHtml([
                      currentUser?.id === user.id ? "bieżący użytkownik" : "",
                      user.isOwner ? "właściciel HA" : "",
                      user.isAdmin ? "administrator HA" : "",
                      user.username ? `login: ${user.username}` : "",
                      !homeAssistantUsers.length && user.lastSeenAt ? `ostatnio widziany: ${formatDateTime(user.lastSeenAt)}` : "",
                    ].filter(Boolean).join(" · ") || "konto Home Assistant")}
                  </small>
                </span>
              </label>
            `).join("") : `<div class="empty-row">Nie udało się pobrać listy użytkowników Home Assistant. ${escapeHtml(homeAssistantUsersError || "Sprawdź uprawnienie homeassistant_api i odśwież aplikację po aktualizacji.")}</div>`}
          </div>
          <button class="primary">Zapisz rodziców</button>
        </form>
        <p class="hint">${homeAssistantUsers.length ? "Pierwszą konfigurację mogą wykonać administratorzy Home Assistant. Po wybraniu rodziców panel pozostaje dostępny dla wskazanych kont oraz administratorów HA jako awaryjne wejście." : `Nie widzę jeszcze listy kont HA. Szczegóły: ${homeAssistantUsersError || usersSource || "brak informacji"}.`}</p>
      </div>
      ${toast()}
    </section>
  `;
}

function renderParentRequest(coupon) {
  const child = childById(coupon.childId);
  const reward = rewardById(coupon.rewardId);
  if (!child || !reward) return "";
  return `
    <div class="parent-card request-card">
      <span class="coupon-icon">${icon(reward.icon)}</span>
      <div>
        <h2>${escapeHtml(child.name)}: ${escapeHtml(reward.title)}</h2>
        <p class="child-meta">${reward.cost} ${starWord(reward.cost)} · ${formatDateTime(coupon.createdAt)}</p>
        <span class="status-badge status-pending">Czeka na rodzica</span>
      </div>
      <div class="confirm-actions">
        <button class="secondary" data-reject="${escapeAttr(coupon.id)}">Odrzuć</button>
        <button class="primary" data-approve="${escapeAttr(coupon.id)}">Zatwierdz</button>
      </div>
    </div>
  `;
}

function renderEdit() {
  const groups = choreGroups();
  return `
    <section class="parent-shell">
      <button class="back-button" data-view="parent">‹</button>
      <div class="title-block"><h1>Obowiązki</h1><p>Jedna lista, przypisanie dzieci, dni tygodnia i kolejność na kartach.</p></div>
      <div class="chore-admin-layout">
        <div class="parent-card form-card">
          <h2>Dodaj obowiązek</h2>
          <form class="stack" data-edit-form>
            <input name="label" required placeholder="Nazwa obowiązku" />
            <select name="period">${periods().map((period) => `<option value="${escapeAttr(period.id)}">${period.title}</option>`).join("")}</select>
            <div class="child-picker">${Object.values(state.children).map((child) => `<label><input type="checkbox" name="children" value="${escapeAttr(child.id)}" checked /> ${escapeHtml(child.name)}</label>`).join("")}</div>
            ${renderDayCheckboxes(weekDays())}
            <button class="primary">Dodaj</button>
          </form>
        </div>
        <div class="parent-card chore-list-card">
          <div class="admin-list-head">
            <div>
              <h2>Lista obowiązków</h2>
              <p class="child-meta">Kolejność tutaj decyduje o kolejności na kartach dzieci.</p>
            </div>
            <span class="status-badge status-used">${groups.length} pozycji</span>
          </div>
          <div class="chore-admin-list">
            ${groups.map((group, index) => renderChoreAdminRow(group, index, groups.length)).join("")}
          </div>
        </div>
      </div>
      ${toast()}
    </section>
  `;
}

function renderChoreAdminRow(group, index, total) {
  const groupId = escapeAttr(group.id);
  return `
    <div class="chore-admin-row" data-chore-row="${groupId}">
      <div class="chore-order-tools">
        <button class="ghost icon-action" data-move-chore="${groupId}" data-direction="-1" ${index === 0 ? "disabled" : ""} aria-label="Przesuń wyżej">↑</button>
        <button class="ghost icon-action" data-move-chore="${groupId}" data-direction="1" ${index === total - 1 ? "disabled" : ""} aria-label="Przesuń niżej">↓</button>
      </div>
      <div class="chore-admin-main">
        <div class="chore-row-top">
          <input value="${escapeAttr(group.label)}" data-chore-label="${groupId}" />
          <select data-chore-period="${groupId}">
            ${periods().map((period) => `<option value="${escapeAttr(period.id)}" ${period.id === group.periodId ? "selected" : ""}>${period.title}</option>`).join("")}
          </select>
        </div>
        <div class="chore-admin-meta">
          <span class="status-badge status-used">${periodById(group.periodId).title}</span>
          <span class="child-meta">${daysLabel(group.days)}</span>
        </div>
        <div class="child-picker chore-child-picker">
          ${Object.values(state.children).map((child) => `<label><input type="checkbox" data-chore-child="${groupId}" value="${escapeAttr(child.id)}" ${group.childIds.includes(child.id) ? "checked" : ""} /> ${escapeHtml(child.name)}</label>`).join("")}
        </div>
        ${renderChoreDayCheckboxes(group)}
      </div>
      <div class="chore-row-actions">
        <button class="primary" data-save-chore-group="${groupId}">Zapisz</button>
        <button class="danger" data-delete-chore-group="${groupId}">Usuń</button>
      </div>
    </div>
  `;
}

function renderRewardsAdmin() {
  return `
    <section class="parent-shell reward-admin-shell">
      <button class="back-button" data-view="parent">‹</button>
      <div class="title-block"><h1>Nagrody</h1><p>Dodawaj nagrody i wybieraj dzieci, których dotyczą</p></div>
      <div class="reward-admin-layout">
        <div class="parent-card reward-create-card">
          <h2>Dodaj nagrodę</h2>
          <p class="child-meta">Nowa pozycja pojawi się w sklepie wybranych dzieci.</p>
          <form class="stack" data-reward-form>
            <div class="field"><label>Nazwa</label><input name="title" required placeholder="Nazwa nagrody" /></div>
            <div class="reward-form-grid">
              <div class="field"><label>Koszt</label><input name="cost" required type="number" min="1" value="1" /></div>
              <div class="field"><label>Typ</label>${renderRewardIconSelect("icon")}</div>
            </div>
            <div class="child-picker">${Object.values(state.children).map((child) => `<label><input type="checkbox" name="children" value="${escapeAttr(child.id)}" checked /> ${escapeHtml(child.name)}</label>`).join("")}</div>
            <button class="primary">Dodaj nagrodę</button>
          </form>
        </div>
        <div class="parent-card reward-list-card">
          <div class="admin-list-head">
            <div><h2>Lista nagród</h2><p class="child-meta">Edytuj cenę, nazwę i dostępność dla dzieci.</p></div>
            <span class="status-badge">${state.rewards.length} pozycji</span>
          </div>
          <div class="reward-admin-list">${state.rewards.map(renderRewardAdminRow).join("")}</div>
        </div>
      </div>
      ${toast()}
    </section>
  `;
}

function renderRewardIconSelect(name, selected = "play", dataAttr = "") {
  const options = [
    ["play", "Bajka"],
    ["pad", "Granie"],
    ["calendar", "Weekend"],
    ["compass", "Wyprawa"],
  ];
  return `<select name="${name}" ${dataAttr}>${options.map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`).join("")}</select>`;
}

function renderRewardAdminRow(reward) {
  const rewardId = escapeAttr(reward.id);
  return `
    <div class="reward-admin-row">
      <span class="coupon-icon">${icon(reward.icon)}</span>
      <div class="reward-admin-main">
        <div class="reward-row-top">
          <div class="field compact-field"><label>Nazwa</label><input data-reward-title="${rewardId}" value="${escapeAttr(reward.title)}" aria-label="Nazwa nagrody" /></div>
          <div class="field compact-field"><label>Koszt</label><input data-reward-cost="${rewardId}" type="number" min="1" value="${reward.cost}" aria-label="Koszt nagrody" /></div>
          <div class="field compact-field"><label>Typ</label>${renderRewardIconSelect("reward-icon", reward.icon, `data-reward-icon="${rewardId}" aria-label="Typ nagrody"`)}</div>
        </div>
        <div class="reward-admin-meta">
          <span class="status-badge">${reward.cost} ${starWord(reward.cost)}</span>
          <div class="child-picker reward-child-picker">${Object.values(state.children).map((child) => `<label><input type="checkbox" data-reward-child="${rewardId}" value="${escapeAttr(child.id)}" ${rewardAppliesToChild(reward, child.id) ? "checked" : ""} /> ${escapeHtml(child.name)}</label>`).join("")}</div>
        </div>
      </div>
      <div class="reward-row-actions">
        <button class="primary" data-save-reward-children="${rewardId}">Zapisz</button>
        <button class="danger" data-delete-reward="${rewardId}">Usuń</button>
      </div>
    </div>
  `;
}

function renderDayAdmin() {
  const overrides = Object.entries(state.dayOverrides || {}).sort(([a], [b]) => a.localeCompare(b));
  const vacations = [...(state.vacationRanges || [])].sort((a, b) => a.start.localeCompare(b.start));
  return `
    <section class="parent-shell">
      <button class="back-button" data-view="parent">‹</button>
      <div class="title-block"><h1>Dni i wolne od szkoły</h1><p>Weekend rozpoznaje system. Święta, egzaminy, dni dyrektorskie i wakacje dodaje rodzic.</p></div>
      <div class="day-admin-layout">
        <div class="parent-card">
          <h2>Kalendarz szkoły</h2>
          <p class="child-meta">Dzisiaj: ${dayName()}, ${systemDayTypeLabel()}</p>
          <form class="stack" data-school-day-form>
            <input name="date" type="date" value="${dateKey()}" />
            <input name="note" placeholder="Powód, np. święto, egzamin, dzień dyrektorski" />
            <button class="primary">Oznacz jako dzień wolny od szkoły</button>
          </form>
          <p class="hint">Dzień wolny w tygodniu korzysta z obowiązków ustawionych na weekend/dni wolne.</p>
        </div>
        <div class="parent-card">
          <h2>Tryb wakacji</h2>
          <p class="child-meta">W dni robocze wakacji można ustawić osobne obowiązki.</p>
          <form class="stack" data-vacation-form>
            <div class="vacation-date-grid">
              <div class="field"><label>Od</label><input name="start" type="date" value="${dateKey()}" /></div>
              <div class="field"><label>Do</label><input name="end" type="date" value="${dateKey()}" /></div>
            </div>
            <input name="note" placeholder="Nazwa, np. wakacje letnie" />
            <button class="primary">Dodaj okres wakacji</button>
          </form>
          <p class="hint">W weekend wakacyjny nadal działają obowiązki weekendowe. Osobny tryb dotyczy poniedziałku-piątku.</p>
        </div>
        <div class="parent-card">
          <h2>Zapisane wyjątki</h2>
          <div class="school-free-list">
            ${overrides.length ? overrides.map(([key, item]) => `
              <div class="school-free-row">
                <div>
                  <strong>${formatDateLabel(key)}</strong>
                  <small>${escapeHtml(item.note || "dzień wolny od szkoły")}</small>
                </div>
                <button class="ghost" data-delete-school-day="${escapeAttr(key)}">Usuń</button>
              </div>
            `).join("") : `<div class="empty-row">Brak ręcznie oznaczonych dni wolnych.</div>`}
          </div>
        </div>
        <div class="parent-card">
          <h2>Okresy wakacji</h2>
          <div class="school-free-list">
            ${vacations.length ? vacations.map((range) => `
              <div class="school-free-row">
                <div>
                  <strong>${formatDateLabel(range.start)} - ${formatDateLabel(range.end)}</strong>
                  <small>${escapeHtml(range.note || "wakacje")}</small>
                </div>
                <button class="ghost" data-delete-vacation="${escapeAttr(range.id)}">Usuń</button>
              </div>
            `).join("") : `<div class="empty-row">Brak zapisanych okresów wakacji.</div>`}
          </div>
        </div>
      </div>
      <div class="grid-2" style="margin-top:24px">
        ${Object.values(state.children).map((child) => `
          <div class="parent-card">
            <h2>${escapeHtml(child.name)}</h2>
            <p class="child-meta">Dzisiaj: ${dayName()}, ${childDayLabel(child)}</p>
            <button class="${isExcused(child) ? "danger" : "primary"}" data-toggle-excuse="${escapeAttr(child.id)}">
              ${isExcused(child) ? "Cofnij usprawiedliwienie" : "Usprawiedliw dzień"}
            </button>
          </div>
        `).join("")}
      </div>
      ${toast()}
    </section>
  `;
}

function renderHistory() {
  return `
    <section class="parent-shell">
      <button class="back-button" data-view="parent">‹</button>
      <div class="title-block"><h1>Historia</h1><p>Daty, godziny i decyzje rodzica</p></div>
      <div class="stack" style="margin-top:24px">
        ${state.history.length ? state.history.map((entry) => `
          <div class="parent-card">
            <h2>${escapeHtml(entry.title)}</h2>
            <p class="child-meta">${formatDateTime(entry.happenedAt)}</p>
            <p>${escapeHtml(entry.note)}</p>
          </div>
        `).join("") : `<div class="parent-card"><h2>Brak historii</h2><p class="child-meta">Akcje pojawią się po odbiórze kuponów lub decyzjach rodzica.</p></div>`}
      </div>
      ${toast()}
    </section>
  `;
}

function renderDayCheckboxes(selectedDays = weekDays()) {
  const selected = new Set(selectedDays);
  return `
    <div class="day-pills">
      <div class="day-pills-main">
        ${allWeekDays().filter((day) => day !== 7).map((day) => `
          <label class="day-pill">
            <input type="checkbox" name="days" value="${day}" ${selected.has(day) ? "checked" : ""} />
            <span>${dayShortName(day)}</span>
          </label>
        `).join("")}
      </div>
      <div class="vacation-pill-row">
        <label class="day-pill vacation-day-pill">
          <input type="checkbox" name="days" value="7" ${selected.has(7) ? "checked" : ""} />
          <span>Wakacje</span>
        </label>
      </div>
    </div>
  `;
}

function renderChoreDayCheckboxes(group) {
  const selected = new Set(group.days || weekDays());
  return `
    <div class="day-pills chore-day-pills">
      <div class="day-pills-main">
        ${allWeekDays().filter((day) => day !== 7).map((day) => `
          <label class="day-pill">
            <input type="checkbox" value="${day}" data-chore-day="${escapeAttr(group.id)}" ${selected.has(day) ? "checked" : ""} />
            <span>${dayShortName(day)}</span>
          </label>
        `).join("")}
      </div>
      <div class="vacation-pill-row">
        <label class="day-pill vacation-day-pill">
          <input type="checkbox" value="7" data-chore-day="${escapeAttr(group.id)}" ${selected.has(7) ? "checked" : ""} />
          <span>Wakacje</span>
        </label>
      </div>
    </div>
  `;
}

function toast() {
  return state.toast ? `<div class="toast">${state.toast}</div>` : "";
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("pl-PL", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function formatDateLabel(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("pl-PL", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(year, month - 1, day));
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });
  document.querySelectorAll("[data-theme]").forEach((button) => {
    button.addEventListener("click", () => setTheme(button.dataset.theme));
  });
  document.querySelectorAll("[data-card-child], [data-child]").forEach((card) => {
    card.addEventListener("click", () => setView("child", card.dataset.cardChild || card.dataset.child));
  });
  document.querySelectorAll("[data-task]").forEach((button) => {
    button.addEventListener("click", () => toggleTask(button.dataset.period, button.dataset.task));
  });
  document.querySelectorAll("[data-reward]").forEach((button) => {
    button.addEventListener("click", () => requestReward(button.dataset.reward));
  });
  document.querySelectorAll("[data-coupon]").forEach((button) => {
    button.addEventListener("click", () => handleCoupon(button.dataset.coupon));
  });
  document.querySelectorAll("[data-approve]").forEach((button) => {
    button.addEventListener("click", () => approveCoupon(button.dataset.approve));
  });
  document.querySelectorAll("[data-reject]").forEach((button) => {
    button.addEventListener("click", () => rejectCoupon(button.dataset.reject));
  });
  document.querySelectorAll("[data-confirm-redeem]").forEach((button) => {
    button.addEventListener("click", () => redeemCoupon(button.dataset.confirmRedeem));
  });
  document.querySelector("[data-cancel-redeem]")?.addEventListener("click", () => {
    redeemConfirmId = "";
    render();
  });
  document.querySelector("[data-parent-login]")?.addEventListener("submit", unlockParent);
  document.querySelector("[data-child-form]")?.addEventListener("submit", saveChild);
  document.querySelectorAll("[data-save-child]").forEach((button) => {
    button.addEventListener("click", () => saveChildSettings(button.dataset.saveChild));
  });
  document.querySelectorAll("[data-delete-child]").forEach((button) => {
    button.addEventListener("click", () => deleteChild(button.dataset.deleteChild));
  });
  document.querySelector("[data-parent-users-form]")?.addEventListener("submit", saveParentUsers);
  document.querySelectorAll("[data-history-filter]").forEach((select) => {
    select.addEventListener("change", () => {
      historyFilterDays = select.value;
      render();
    });
  });
  document.querySelector("[data-edit-form]")?.addEventListener("submit", saveChore);
  document.querySelector("[data-reward-form]")?.addEventListener("submit", saveReward);
  document.querySelector("[data-parent-lock]")?.addEventListener("click", () => {
    parentUnlocked = false;
    setView("home");
    showToast("Panel rodzica zablokowany");
  });
  document.querySelectorAll("[data-save-chore-group]").forEach((button) => {
    button.addEventListener("click", () => saveChoreGroup(button.dataset.saveChoreGroup));
  });
  document.querySelectorAll("[data-delete-chore-group]").forEach((button) => {
    button.addEventListener("click", () => deleteChoreGroup(button.dataset.deleteChoreGroup));
  });
  document.querySelectorAll("[data-move-chore]").forEach((button) => {
    button.addEventListener("click", () => moveChoreGroup(button.dataset.moveChore, Number(button.dataset.direction)));
  });
  document.querySelectorAll("[data-delete-reward]").forEach((button) => {
    button.addEventListener("click", () => deleteReward(button.dataset.deleteReward));
  });
  document.querySelectorAll("[data-save-reward-children]").forEach((button) => {
    button.addEventListener("click", () => saveRewardChildren(button.dataset.saveRewardChildren));
  });
  document.querySelectorAll("[data-toggle-excuse]").forEach((button) => {
    button.addEventListener("click", () => toggleExcuse(button.dataset.toggleExcuse));
  });
  document.querySelector("[data-school-day-form]")?.addEventListener("submit", saveSchoolDayOverride);
  document.querySelector("[data-vacation-form]")?.addEventListener("submit", saveVacationRange);
  document.querySelectorAll("[data-delete-school-day]").forEach((button) => {
    button.addEventListener("click", () => deleteSchoolDayOverride(button.dataset.deleteSchoolDay));
  });
  document.querySelectorAll("[data-delete-vacation]").forEach((button) => {
    button.addEventListener("click", () => deleteVacationRange(button.dataset.deleteVacation));
  });
}

function unlockParent(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  if (String(data.get("pin") || "").trim() !== "1234") {
    showToast("Nieprawidłowy PIN");
    return;
  }
  parentUnlocked = true;
  state.view = parentTargetView || "parent";
  showToast("Panel rodzica odblokowany");
}

function toggleTask(period, taskId) {
  const child = activeChild();
  if (!child) return;
  if (runtimeWindow.__PLANNER_API__) {
    runAction("toggle_task", { childId: child.id, period, taskId, date: dateKey() }, { view: "child", childId: child.id });
    return;
  }
  const task = child.tasks[period].find((item) => item.id === taskId);
  if (!task) return;
  const key = completionKey(child.id, task.id);
  const wasDone = Boolean(state.completions[key]);
  if (wasDone) delete state.completions[key];
  else state.completions[key] = { childId: child.id, taskId: task.id, groupId: task.groupId, date: dateKey(), doneAt: Date.now() };
  addHistory(child.id, wasDone ? "Obowiązek cofnięty" : "Obowiązek wykonany", task.label, "task");
  const stats = taskStats(child);
  const sKey = dailyStarKey(child.id);
  if (stats.remaining === 0 && !state.dailyStars[sKey] && stats.total > 0) {
    child.stars += 1;
    state.dailyStars[sKey] = { childId: child.id, date: dateKey(), awardedAt: Date.now() };
    addHistory(child.id, "Gwiazdka przyznana", "Wszystkie dzisiejsze obowiązki są wykonane", "star");
    showToast(`${child.name} zdobywa gwiazdkę za cały dzień`);
    return;
  }
  if (stats.remaining > 0 && state.dailyStars[sKey]) {
    child.stars = Math.max(0, child.stars - 1);
    delete state.dailyStars[sKey];
    addHistory(child.id, "Gwiazdka cofnięta", "Dzień nie jest już kompletny", "star");
    showToast("Gwiazdka cofnięta, bo dzień nie jest już kompletny");
    return;
  }
  render();
}

function requestReward(rewardId) {
  const child = activeChild();
  if (!child) return;
  if (runtimeWindow.__PLANNER_API__) {
    runAction("request_reward", { childId: child.id, rewardId }, { view: "shop", childId: child.id });
    return;
  }
  const reward = rewardById(rewardId);
  if (!reward) return showToast("Nie znaleziono nagrody");
  if (!rewardAppliesToChild(reward, child.id)) return showToast("Ta nagroda nie jest dostępna dla tego dziecka");
  if (child.stars < reward.cost) return showToast("Za mało gwiazdek na te nagrodę");
  const existing = state.coupons.find((coupon) => coupon.childId === child.id && coupon.rewardId === reward.id && coupon.status !== "used");
  if (existing) return showToast("Taki kupon jest już w szufladzie");
  state.coupons.push({ id: `coupon-${Date.now()}`, childId: child.id, rewardId: reward.id, status: "pending", createdAt: Date.now() });
  addHistory(child.id, "Nagroda zamówiona", `${reward.title} czeka na akceptację rodzica`, "reward");
  showToast("Kupon czeka na akceptację rodzica");
}

function approveCoupon(couponId) {
  if (runtimeWindow.__PLANNER_API__) {
    runAction("approve_coupon", { couponId }, { view: "parent" });
    return;
  }
  const coupon = state.coupons.find((item) => item.id === couponId);
  if (!coupon || coupon.status !== "pending") return;
  const child = childById(coupon.childId);
  const reward = rewardById(coupon.rewardId);
  if (!child || !reward) return showToast("Nie znaleziono kuponu");
  if (child.stars < reward.cost) return showToast("Saldo dziecka jest już za niskie");
  child.stars -= reward.cost;
  coupon.status = "ready";
  addHistory(child.id, "Nagroda zatwierdzona", `${reward.title} za ${reward.cost} ${starWord(reward.cost)}`, "reward");
  state.activeChildId = child.id;
  state.view = "shop";
  showToast("Rodzic zatwierdził kupon");
}

function rejectCoupon(couponId) {
  if (runtimeWindow.__PLANNER_API__) {
    runAction("reject_coupon", { couponId }, { view: "parent" });
    return;
  }
  const coupon = state.coupons.find((item) => item.id === couponId);
  if (!coupon) return;
  const child = childById(coupon.childId);
  const reward = rewardById(coupon.rewardId);
  state.history.unshift({
    id: `history-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    childId: coupon.childId,
    title: "Nagroda odrzucona",
    note: `${child?.name || "Dziecko"}: ${reward?.title || "nagroda"}`,
    type: "reward",
    happenedAt: Date.now(),
  });
  state.coupons = state.coupons.filter((item) => item.id !== couponId);
  showToast("Prośba została odrzucona");
}

function handleCoupon(couponId) {
  const coupon = state.coupons.find((item) => item.id === couponId);
  if (!coupon) return;
  if (coupon.status === "pending") {
    state.view = "parent";
    showToast("Kupon czeka na rodzica");
    return;
  }
  if (coupon.status === "ready") {
    redeemConfirmId = coupon.id;
    render();
  }
}

function redeemCoupon(couponId) {
  if (runtimeWindow.__PLANNER_API__) {
    runAction("redeem_coupon", { couponId }, { view: "shop", childId: state.activeChildId }).then(() => {
      redeemConfirmId = "";
    });
    return;
  }
  const coupon = state.coupons.find((item) => item.id === couponId);
  if (!coupon || coupon.status !== "ready") return;
  const reward = rewardById(coupon.rewardId);
  const child = childById(coupon.childId);
  if (!child || !reward) return showToast("Nie znaleziono kuponu");
  coupon.status = "used";
  state.history.unshift({
    id: `history-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    childId: child.id,
    title: "Kupon odebrany",
    note: `${child.name}: ${reward.title}`,
    type: "reward",
    happenedAt: Date.now(),
  });
  redeemConfirmId = "";
  showToast("Kupon wykorzystany");
}

function createChild(name, gender) {
  const id = `child-${Date.now()}-${slugify(name)}`;
  const design = childDesign(gender);
  return {
    id,
    name,
    ...design,
    stars: 0,
    tasks: emptyTasks(),
  };
}

function saveChild(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const name = String(data.get("name") || "").trim();
  const gender = String(data.get("gender") || "boy");
  if (!name) return showToast("Podaj imię dziecka");
  if (runtimeWindow.__PLANNER_API__) {
    runAction("add_child", { name, gender }, { view: "childrenAdmin" });
    return;
  }
  const child = createChild(name, gender);
  state.children[child.id] = child;
  state.activeChildId = state.activeChildId || child.id;
  state.rewards.forEach((reward) => {
    reward.childIds = reward.childIds || [];
    if (!reward.childIds.includes(child.id)) reward.childIds.push(child.id);
  });
  showToast("Dziecko dodane");
}

function saveChildSettings(childId) {
  const child = childById(childId);
  if (!child) return;
  const name = String(document.querySelector(`[data-child-name="${childId}"]`)?.value || "").trim();
  const gender = String(document.querySelector(`[data-child-gender="${childId}"]`)?.value || "boy");
  const stars = Math.max(0, Number(document.querySelector(`[data-child-stars="${childId}"]`)?.value || 0));
  if (!name) return showToast("Podaj imię dziecka");
  if (runtimeWindow.__PLANNER_API__) {
    runAction("save_child", { childId, name, gender, stars }, { view: "childrenAdmin", childId: state.activeChildId });
    return;
  }
  const design = childDesign(gender);
  Object.assign(child, design, { name, stars });
  showToast("Dziecko zapisane");
}

function deleteChild(childId) {
  const child = childById(childId);
  if (!child) return;
  if (runtimeWindow.__PLANNER_API__) {
    runAction("delete_child", { childId }, { view: "childrenAdmin" });
    return;
  }
  delete state.children[childId];
  state.rewards.forEach((reward) => {
    reward.childIds = (reward.childIds || []).filter((id) => id !== childId);
  });
  state.coupons = state.coupons.filter((coupon) => coupon.childId !== childId);
  Object.keys(state.dayExcuses || {}).forEach((key) => {
    if (key.startsWith(`${childId}:`)) delete state.dayExcuses[key];
  });
  if (state.activeChildId === childId) state.activeChildId = Object.keys(state.children)[0] || "";
  showToast(`Usunięto kartę: ${child.name}`);
}

function saveParentUsers(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const parentUsers = data.getAll("parentUsers").map((id) => String(id).trim().toLowerCase()).filter(Boolean);
  selectedParentUsers = parentUsers;
  if (!runtimeWindow.__PLANNER_API__) {
    showToast("Rodzice zapisani lokalnie");
    return;
  }
  fetch(apiUrl("parents"), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ parent_users: parentUsers }),
  })
    .then((response) => {
      if (!response.ok) throw new Error("save failed");
      return response.json();
    })
    .then((payload) => {
      selectedParentUsers = payload.parent_users || parentUsers;
      showToast("Dostęp rodziców zapisany");
    })
    .catch(() => showToast("Nie udało się zapisać rodziców"));
}

function saveChore(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const label = String(data.get("label") || "").trim();
  const period = String(data.get("period") || "morning");
  const childIds = data.getAll("children");
  const days = data.getAll("days").map(Number);
  if (!label || !childIds.length || !days.length) return showToast("Uzupełnij nazwę, dzieci i dni");
  if (runtimeWindow.__PLANNER_API__) {
    runAction("add_chore", { label, period, childIds, days }, { view: "edit" });
    return;
  }
  const groupId = `chore-${Date.now()}-${slugify(label)}`;
  const order = nextChoreOrder();
  childIds.forEach((childId) => {
    const child = childById(childId);
    child.tasks[period].push({ id: `${childId}-${period}-${Date.now()}-${Math.random().toString(16).slice(2)}`, groupId, order, label, done: false, days });
  });
  showToast("Obowiązek dodany");
}

function saveReward(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const title = String(data.get("title") || "").trim();
  const cost = Math.max(1, Number(data.get("cost") || 1));
  const childIds = data.getAll("children");
  if (!title || !childIds.length) return showToast("Uzupełnij nazwę i dzieci");
  if (runtimeWindow.__PLANNER_API__) {
    runAction("add_reward", { title, cost, icon: String(data.get("icon") || "play"), childIds }, { view: "rewardsAdmin" });
    return;
  }
  state.rewards.push({
    id: `reward-${Date.now()}`,
    title,
    cost,
    icon: String(data.get("icon") || "play"),
    color: "#315aa8",
    childIds,
  });
  showToast("Nagroda dodana");
}

function saveChoreGroup(groupId) {
  const label = String(document.querySelector(`[data-chore-label="${groupId}"]`)?.value || "").trim();
  const period = String(document.querySelector(`[data-chore-period="${groupId}"]`)?.value || "morning");
  const childIds = Array.from(document.querySelectorAll(`[data-chore-child="${groupId}"]:checked`)).map((input) => input.value);
  const days = Array.from(document.querySelectorAll(`[data-chore-day="${groupId}"]:checked`)).map((input) => Number(input.value));
  const current = choreGroups().find((group) => group.id === groupId);
  if (!label || !childIds.length || !days.length || !current) return showToast("Uzupełnij nazwę, dzieci i dni");
  if (runtimeWindow.__PLANNER_API__) {
    runAction("save_chore_group", { groupId, label, period, childIds, days }, { view: "edit" });
    return;
  }

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
    child.tasks[period].push({
      id: `${child.id}-${period}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      groupId,
      order: current.order,
      label,
      done: false,
      days,
    });
  });
  sortTasksByOrder();
  showToast("Obowiązek zapisany");
}

function deleteChoreGroup(groupId) {
  if (runtimeWindow.__PLANNER_API__) {
    runAction("delete_chore_group", { groupId }, { view: "edit" });
    return;
  }
  Object.values(state.children).forEach((child) => removeTaskByGroup(child, groupId));
  showToast("Obowiązek usunięty");
}

function moveChoreGroup(groupId, direction) {
  if (runtimeWindow.__PLANNER_API__) {
    runAction("move_chore_group", { groupId, direction }, { view: "edit" });
    return;
  }
  const groups = choreGroups();
  const index = groups.findIndex((group) => group.id === groupId);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= groups.length) return;
  const currentOrder = groups[index].order;
  setChoreOrder(groups[index].id, groups[next].order);
  setChoreOrder(groups[next].id, currentOrder);
  sortTasksByOrder();
  showToast("Kolejność zmieniona");
}

function setChoreOrder(groupId, order) {
  Object.values(state.children).forEach((child) => {
    Object.values(child.tasks).flat().forEach((task) => {
      if (task.groupId === groupId) task.order = order;
    });
  });
}

function sortTasksByOrder() {
  Object.values(state.children).forEach((child) => {
    Object.keys(child.tasks).forEach((periodId) => {
      child.tasks[periodId].sort((a, b) => (a.order || 0) - (b.order || 0));
    });
  });
}

function deleteReward(rewardId) {
  if (runtimeWindow.__PLANNER_API__) {
    runAction("delete_reward", { rewardId }, { view: "rewardsAdmin" });
    return;
  }
  state.rewards = state.rewards.filter((reward) => reward.id !== rewardId);
  state.coupons = state.coupons.filter((coupon) => coupon.rewardId !== rewardId);
  showToast("Nagroda usunięta");
}

function saveRewardChildren(rewardId) {
  const reward = rewardById(rewardId);
  if (!reward) return showToast("Nie znaleziono nagrody");
  const title = String(document.querySelector(`[data-reward-title="${rewardId}"]`)?.value || "").trim();
  const cost = Math.max(1, Number(document.querySelector(`[data-reward-cost="${rewardId}"]`)?.value || 1));
  const iconName = String(document.querySelector(`[data-reward-icon="${rewardId}"]`)?.value || reward.icon || "play");
  if (!title) return showToast("Uzupełnij nazwę nagrody");
  const childIds = Array.from(document.querySelectorAll(`[data-reward-child="${rewardId}"]:checked`)).map((input) => input.value);
  if (runtimeWindow.__PLANNER_API__) {
    runAction("save_reward", { rewardId, title, cost, icon: iconName, childIds }, { view: "rewardsAdmin" });
    return;
  }
  reward.title = title;
  reward.cost = cost;
  reward.icon = iconName;
  reward.childIds = childIds;
  if (!reward.childIds.length) reward.childIds = Object.keys(state.children);
  showToast("Nagroda zapisana");
}

function toggleExcuse(childId) {
  if (runtimeWindow.__PLANNER_API__) {
    runAction("toggle_excuse", { childId, date: dateKey() }, { view: "dayAdmin" });
    return;
  }
  const key = excuseKey(childId);
  if (state.dayExcuses[key]) delete state.dayExcuses[key];
  else state.dayExcuses[key] = { childId, date: dateKey(), createdAt: Date.now() };
  showToast(state.dayExcuses[key] ? "Dzień usprawiedliwiony" : "Usprawiedliwienie cofnięte");
}

function saveSchoolDayOverride(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const key = String(data.get("date") || "").trim();
  const note = String(data.get("note") || "").trim();
  if (!key) return showToast("Wybierz datę");
  if (runtimeWindow.__PLANNER_API__) {
    runAction("save_school_day_override", { date: key, note }, { view: "dayAdmin" });
    return;
  }
  state.dayOverrides[key] = {
    type: "schoolFree",
    note,
    createdAt: Date.now(),
  };
  showToast("Dzień wolny od szkoły zapisany");
}

function deleteSchoolDayOverride(key) {
  if (runtimeWindow.__PLANNER_API__) {
    runAction("delete_school_day_override", { date: key }, { view: "dayAdmin" });
    return;
  }
  delete state.dayOverrides[key];
  showToast("Wyjątek szkolny usunięty");
}

function saveVacationRange(event) {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const start = String(data.get("start") || "").trim();
  const end = String(data.get("end") || "").trim();
  const note = String(data.get("note") || "").trim();
  if (!start || !end) return showToast("Wybierz datę początku i końca");
  if (end < start) return showToast("Data końca musi być po dacie początku");
  if (runtimeWindow.__PLANNER_API__) {
    runAction("save_vacation_range", { start, end, note }, { view: "dayAdmin" });
    return;
  }
  state.vacationRanges.push({
    id: `vacation-${Date.now()}`,
    start,
    end,
    note,
    createdAt: Date.now(),
  });
  showToast("Okres wakacji zapisany");
}

function deleteVacationRange(rangeId) {
  if (runtimeWindow.__PLANNER_API__) {
    runAction("delete_vacation_range", { rangeId }, { view: "dayAdmin" });
    return;
  }
  state.vacationRanges = (state.vacationRanges || []).filter((range) => range.id !== rangeId);
  showToast("Okres wakacji usunięty");
}

if (runtimeWindow.__PLANNER_API__) {
  runtimeWindow.addEventListener?.("pagehide", flushStateBeforeLeave);
  runtimeWindow.addEventListener?.("beforeunload", flushStateBeforeLeave);
  runtimeWindow.addEventListener?.("focus", refreshStateFromServer);
  document.addEventListener?.("visibilitychange", () => {
    if (document.hidden) flushStateBeforeLeave();
    if (!document.hidden) refreshStateFromServer();
  });
}

render();
