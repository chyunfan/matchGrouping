// 2026 富阳农商银行篮球 · 远程抽签接口（A1-A5 编号版）
// 路由：GET  /api/fbb            → 返回状态
//       POST /api/fbb            → body.action = "draw" | "setup" | "reset"
// 与主页面状态隔离：本接口使用 draw_state 表的 id=2 行（store.mjs 支持多 id）
import { loadState, saveState } from "./_lib/store.mjs";
import { ORG_KEY } from "./_lib/draw.mjs";
import { readBody } from "./_lib/util.mjs";

const STATE_ID = 2;
const LABELS = ["A1", "A2", "A3", "A4", "A5"];
const DEFAULT_TEAMS = ["一队", "二队", "三队", "四队", "五队"];

function normalize(s) {
  if (!s || !Array.isArray(s.teams)) {
    s = { teams: DEFAULT_TEAMS.slice(), drawn: {}, allDrawn: false, schedule: null };
  }
  if (!s.drawn) s.drawn = {};
  if (!s.schedule || typeof s.schedule !== "object") s.schedule = { autoTeams: [] };
  if (!Array.isArray(s.schedule.autoTeams)) s.schedule.autoTeams = [];
  return s;
}

// 富阳页专属默认状态（与主页面默认队名区分开）
function fbbDefault() {
  return { teams: DEFAULT_TEAMS.slice(), drawn: {}, allDrawn: false, schedule: { autoTeams: [] } };
}

function remainingLabels(s) {
  const used = new Set(Object.values(s.drawn));
  return LABELS.filter(l => !used.has(l));
}

// 预生成整组分配计划：随机排列 A1-A5，排除“全部队伍次序==编号”全对上（一队=A1、二队=A2…）的情况
function generatePlan(teams) {
  const labels = LABELS.slice();
  for (let attempt = 0; attempt < 100; attempt++) {
    // Fisher–Yates 洗牌
    for (let i = labels.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [labels[i], labels[j]] = [labels[j], labels[i]];
    }
    const allMatch = teams.every((t, idx) => labels[idx] === "A" + (idx + 1));
    if (!allMatch) break;
  }
  const plan = {};
  teams.forEach((t, idx) => { plan[t] = labels[idx]; });
  return plan;
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const s = normalize(await loadState(STATE_ID, fbbDefault));
    return res.status(200).json({
      teams: s.teams,
      drawn: s.drawn,
      allDrawn: s.allDrawn,
      autoTeams: s.schedule.autoTeams,
    });
  }

  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });

  const raw = await readBody(req);
  let body = {};
  try { body = JSON.parse(raw || "{}"); } catch {}

  const action = body.action || "";
  const s = normalize(await loadState(STATE_ID, fbbDefault));

  // ---- 抽签 ----
  if (action === "draw") {
    const team = String(body.team || "").trim();
    if (!s.teams.includes(team)) return res.status(400).json({ error: "队伍不存在" });
    if (s.drawn[team] !== undefined) {
      return res.status(409).json({ error: "该队伍已抽签", label: s.drawn[team] });
    }

    let label;
    const before = Object.keys(s.drawn).length;
    // 首次抽签：预生成整组随机分配计划（排除“全部队伍次序==编号”的全对上情况，保证公平且避免顺序感）
    if (before === 0 && (!s.schedule.plan || Object.keys(s.schedule.plan).length !== 5)) {
      s.schedule.plan = generatePlan(s.teams);
    }
    if (before >= 4) {
      // 最后 1 队：自动分配剩余编号（不随机，属于“已分配”）
      label = remainingLabels(s)[0] || null;
    } else {
      // 前 4 队：按“预生成计划”揭示编号
      label = (s.schedule.plan && s.schedule.plan[team]) || null;
    }
    if (!label) return res.status(409).json({ error: "编号已抽完" });

    s.drawn[team] = label;
    if (Object.keys(s.drawn).length === 5) {
      s.allDrawn = true;
    }
    // 第 4 队抽完 → 立即给最后一队自动落盘（看板 5/5，符合“抽签结束”）
    if (Object.keys(s.drawn).length === 4) {
      const lastTeam = s.teams.find(t => s.drawn[t] === undefined);
      const lastLabel = (s.schedule.plan && s.schedule.plan[lastTeam]) || remainingLabels(s)[0];
      if (lastTeam && lastLabel) {
        s.drawn[lastTeam] = lastLabel;
        s.schedule.autoTeams.push(lastTeam);
        s.allDrawn = true;
      }
    }
    await saveState(s, STATE_ID);
    return res.status(200).json({
      team,
      label,
      autoAssigned: s.schedule.autoTeams.includes(team),
      teams: s.teams,
      drawn: s.drawn,
      allDrawn: s.allDrawn,
      autoTeams: s.schedule.autoTeams,
    });
  }

  // ---- 保存队名（组织者，需密钥）----
  if (action === "setup") {
    const key = String(body.key || "").trim();
    if (key !== ORG_KEY) return res.status(403).json({ error: "密钥错误" });
    const names = (Array.isArray(body.teams) ? body.teams : [])
      .map(t => String(t).trim()).filter(Boolean);
    if (names.length !== 5) {
      return res.status(400).json({ error: `需要正好 5 个队名，当前 ${names.length} 个` });
    }
    const ns = { teams: names, drawn: {}, allDrawn: false, schedule: { autoTeams: [] } };
    await saveState(ns, STATE_ID);
    return res.status(200).json(ns);
  }

  // ---- 重置抽签（组织者，需密钥）----
  if (action === "reset") {
    const key = String(body.key || "").trim();
    if (key !== ORG_KEY) return res.status(403).json({ error: "密钥错误" });
    const ns = { teams: s.teams.slice(), drawn: {}, allDrawn: false, schedule: { autoTeams: [] } };
    await saveState(ns, STATE_ID);
    return res.status(200).json({ ok: true, teams: ns.teams });
  }

  return res.status(400).json({ error: "未知操作" });
}
