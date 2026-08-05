// 纯逻辑模块：与 server.js 中的对阵/抽签算法保持一致（FIBA 单循环轮转编排）
// 供 Vercel Serverless Function 复用（ESM）

// 组织者密钥：Vercel 上可用环境变量 ORG_KEY 覆盖
export const ORG_KEY = process.env.ORG_KEY || "11";

// 默认队名（与 server.js 一致；实际以组织者设置的为准）
export const DEFAULT_TEAMS = [
  "一队（金皓明）", "二队（骆沸）", "三队（金世源）", "四队（吕挺）", "五队（郑景）"
];

export function defaultState(teams = DEFAULT_TEAMS) {
  return {
    teams: [...teams],
    drawn: {},        // { 队名: 定位号 }
    allDrawn: false,
    schedule: null,   // 5 天赛程
    version: 2
  };
}

// 贝格尔/单循环轮转：输入 posToTeam = { 1:队, 2:队, ...5:队 }，返回 5 天赛程
export function buildSchedule(posToTeam) {
  const N = 6;
  let arr = [1, 2, 3, 4, 5, 6];
  const days = [];
  for (let r = 0; r < 5; r++) {
    const matches = [];
    let bye = null;
    for (let i = 0; i < 3; i++) {
      const a = arr[i], b = arr[N - 1 - i];
      if (a === 6) bye = posToTeam[b];
      else if (b === 6) bye = posToTeam[a];
      else matches.push([posToTeam[a], posToTeam[b]]);
    }
    days.push({ matches, bye });
    // 轮转：末位移到第2位，其余右移
    const last = arr[N - 1];
    for (let i = N - 1; i > 1; i--) arr[i] = arr[i - 1];
    arr[1] = last;
  }
  return days;
}

// 分配一个尚未被使用的定位号（随机抽取，避免按 1-2-3-4-5 顺序发放）
export function assignNumber(state) {
  const used = new Set(Object.values(state.drawn));
  const avail = [];
  for (let n = 1; n <= state.teams.length; n++) {
    if (!used.has(n)) avail.push(n);
  }
  if (avail.length === 0) return null;
  return avail[Math.floor(Math.random() * avail.length)];
}

// 全部抽完则生成赛程
export function maybeFinalize(state) {
  if (Object.keys(state.drawn).length === state.teams.length) {
    state.allDrawn = true;
    const posToTeam = {};
    for (const [team, num] of Object.entries(state.drawn)) posToTeam[num] = team;
    state.schedule = buildSchedule(posToTeam);
  }
  return state;
}
