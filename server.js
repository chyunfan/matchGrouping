// 5队篮球远程抽签服务器（零依赖，纯 Node）
// 运行： node server.js   然后浏览器/手机打开 http://<本机IP>:3000
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3000;
const ORG_KEY = "11"; // 组织者密钥（可改），用于设置队名 / 重置
const STATE_FILE = path.join(__dirname, "draw_state.json");
const DEFAULT_TEAMS = ["一队（金皓明）", "二队（骆沸）", "三队（金世源）", "四队（吕挺）", "五队（郑景）"];

// ---- 共享状态 ----
function loadState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      if (Array.isArray(s.teams) && s.teams.length === 5 && s.drawn) return s;
    }
  } catch (e) {}
  return { teams: DEFAULT_TEAMS.slice(), drawn: {} };
}
let state = loadState();
function saveState() {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ---- 工具 ----
function send(res, code, obj) {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => {
      try { resolve(d ? JSON.parse(d) : {}); } catch { resolve({}); }
    });
  });
}
function allDrawn() {
  return state.teams.length === 5 && state.teams.every((t) => state.drawn[t] !== undefined);
}

// 单循环轮转编排：5队+虚拟轮空位(6)
function buildSchedule() {
  const posToTeam = {};
  state.teams.forEach((t) => (posToTeam[state.drawn[t]] = t));
  const N = 6;
  let arr = [1, 2, 3, 4, 5, 6];
  const days = [];
  for (let r = 0; r < 5; r++) {
    const matches = []; let bye = null;
    for (let i = 0; i < 3; i++) {
      const a = arr[i], b = arr[N - 1 - i];
      if (a === 6) bye = posToTeam[b];
      else if (b === 6) bye = posToTeam[a];
      else matches.push([posToTeam[a], posToTeam[b]]);
    }
    days.push({ matches, bye });
    const last = arr[N - 1];
    for (let i = N - 1; i > 1; i--) arr[i] = arr[i - 1];
    arr[1] = last;
  }
  return days;
}

// ---- 路由 ----
const server = http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];

  // 页面
  if (req.method === "GET" && (url === "/" || url === "/index.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(fs.readFileSync(path.join(__dirname, "index.html"), "utf8"));
    return;
  }

  // 状态
  if (req.method === "GET" && url === "/api/state") {
    return send(res, 200, {
      teams: state.teams,
      drawn: state.drawn,
      allDrawn: allDrawn(),
      schedule: allDrawn() ? buildSchedule() : null,
    });
  }

  // 抽签
  if (req.method === "POST" && url === "/api/draw") {
    const body = await readBody(req);
    const team = body.team;
    if (!state.teams.includes(team)) return send(res, 400, { error: "队伍不存在" });
    if (state.drawn[team] !== undefined)
      return send(res, 409, { error: "该队伍已抽签", number: state.drawn[team] });
    const used = new Set(Object.values(state.drawn));
    const avail = [1, 2, 3, 4, 5].filter((n) => !used.has(n));
    if (avail.length === 0) return send(res, 409, { error: "号码已抽完" });
    const number = avail[Math.floor(Math.random() * avail.length)];
    state.drawn[team] = number;
    saveState();
    return send(res, 200, {
      team, number,
      teams: state.teams, drawn: state.drawn,
      allDrawn: allDrawn(),
      schedule: allDrawn() ? buildSchedule() : null,
    });
  }

  // 设置队名（组织者，抽签前）
  if (req.method === "POST" && url === "/api/setup") {
    const body = await readBody(req);
    if (body.key !== ORG_KEY) return send(res, 403, { error: "密钥错误" });
    if (allDrawn() || Object.keys(state.drawn).length > 0)
      return send(res, 409, { error: "抽签已开始，无法修改队名" });
    const names = (body.teams || []).map((s) => String(s).trim()).filter(Boolean);
    if (names.length !== 5) return send(res, 400, { error: "需要正好 5 个队名" });
    state.teams = names; state.drawn = {}; saveState();
    return send(res, 200, { ok: true, teams: state.teams });
  }

  // 重置（组织者）
  if (req.method === "POST" && url === "/api/reset") {
    const body = await readBody(req);
    if (body.key !== ORG_KEY) return send(res, 403, { error: "密钥错误" });
    state = { teams: state.teams.slice(), drawn: {} };
    saveState();
    return send(res, 200, { ok: true });
  }

  send(res, 404, { error: "not found" });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("抽签服务器已启动: http://localhost:" + PORT);
});
