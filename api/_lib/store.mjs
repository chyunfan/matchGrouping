// 状态存储：优先用 Upstash Redis（Vercel 官方推荐，跨请求/跨实例持久化）；
// 未配置 Redis 时降级到 /tmp 文件（仅同实例有效，便于先跑通本地）
import fs from "fs";
import { defaultState } from "./draw.mjs";

const KEY = "draw_state";
const FALLBACK = "/tmp/draw_state.json";
let _redis = null;

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
  const redis = await getRedis();
  if (redis) {
    try {
      const s = await redis.get(KEY);
      if (s) return s;
    } catch (e) {
      console.error("[store] Redis get failed:", e?.message);
    }
  }
  try {
    if (fs.existsSync(FALLBACK)) return JSON.parse(fs.readFileSync(FALLBACK, "utf8"));
  } catch {}
  return null;
}

export async function saveState(s) {
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
