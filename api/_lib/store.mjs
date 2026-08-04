// 状态存储：优先 Supabase（Postgres，走官方 REST，无需额外依赖）；
// 其次 Upstash Redis；都未配置时降级 /tmp（仅本机单次运行有效，便于先跑通）
import fs from "fs";
import { defaultState } from "./draw.mjs";

const KEY = "draw_state";
const FALLBACK = "/tmp/draw_state.json";
let _redis = null;
let _supa = null;

function hasSupa() {
  return !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
function getSupa() {
  if (!hasSupa()) return null;
  if (!_supa) {
    _supa = {
      url: process.env.SUPABASE_URL.replace(/\/+$/, ""),
      key: process.env.SUPABASE_SERVICE_ROLE_KEY, // 服务端函数用 service_role key，绕开 RLS
    };
  }
  return _supa;
}

function hasRedis() {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}
async function getRedis() {
  if (!hasRedis()) return null;
  if (!_redis) {
    const m = await import("@upstash/redis"); // 动态 import，未配置时不报错
    _redis = new m.Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return _redis;
}

export async function getState() {
  const supa = getSupa();
  if (supa) {
    try {
      const r = await fetch(`${supa.url}/rest/v1/draw_state?id=eq.1&select=*`, {
        headers: { apikey: supa.key, Authorization: `Bearer ${supa.key}` },
      });
      if (r.ok) {
        const rows = await r.json();
        if (Array.isArray(rows) && rows[0]) {
          return {
            teams: rows[0].teams,
            drawn: rows[0].drawn,
            allDrawn: rows[0].all_drawn,
            schedule: rows[0].schedule,
          };
        }
      } else {
        console.error("[store] Supabase get failed:", r.status, await r.text());
      }
    } catch (e) { console.error("[store] Supabase get error:", e?.message); }
  }
  const redis = await getRedis();
  if (redis) {
    try {
      const s = await redis.get(KEY);
      if (s) return s;
    } catch (e) { console.error("[store] Redis get failed:", e?.message); }
  }
  try {
    if (fs.existsSync(FALLBACK)) return JSON.parse(fs.readFileSync(FALLBACK, "utf8"));
  } catch {}
  return null;
}

export async function saveState(s) {
  const supa = getSupa();
  if (supa) {
    try {
      const payload = {
        id: 1,
        teams: s.teams,
        drawn: s.drawn,
        all_drawn: s.allDrawn,
        schedule: s.schedule ?? null,
        updated_at: new Date().toISOString(),
      };
      const r = await fetch(`${supa.url}/rest/v1/draw_state`, {
        method: "POST",
        headers: {
          apikey: supa.key,
          Authorization: `Bearer ${supa.key}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates", // 按主键 id upsert
        },
        body: JSON.stringify(payload),
      });
      if (r.ok) return;
      console.error("[store] Supabase set failed:", r.status, await r.text());
    } catch (e) { console.error("[store] Supabase set error:", e?.message); }
  }
  const redis = await getRedis();
  if (redis) {
    try { await redis.set(KEY, s); return; }
    catch (e) { console.error("[store] Redis set failed:", e?.message); }
  }
  try { fs.writeFileSync(FALLBACK, JSON.stringify(s)); }
  catch (e) { console.error("[store] fallback write failed:", e?.message); }
}

export async function loadState() {
  let s = await getState();
  if (!s) { s = defaultState(); await saveState(s); }
  return s;
}
