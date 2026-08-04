// 状态存储：优先用 Vercel KV（跨请求持久化）；未配置 KV 时降级到 /tmp 文件（仅同实例有效，便于先跑通）
import fs from "fs";
import { defaultState } from "./draw.mjs";

const KEY = "draw_state";
const FALLBACK = "/tmp/draw_state.json";
let _kv = null;

function hasKV() {
  return !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN);
}

async function getKV() {
  if (!hasKV()) return null;
  if (!_kv) {
    const m = await import("@vercel/kv"); // 动态 import，未配置 KV 时不报错
    _kv = m.kv;
  }
  return _kv;
}

export async function getState() {
  const kv = await getKV();
  if (kv) {
    try {
      const s = await kv.get(KEY);
      if (s) return s;
    } catch (e) {
      console.error("[store] KV get failed:", e?.message);
    }
  }
  try {
    if (fs.existsSync(FALLBACK)) return JSON.parse(fs.readFileSync(FALLBACK, "utf8"));
  } catch {}
  return null;
}

export async function saveState(s) {
  const kv = await getKV();
  if (kv) {
    try { await kv.set(KEY, s); return; }
    catch (e) { console.error("[store] KV set failed:", e?.message); }
  }
  try { fs.writeFileSync(FALLBACK, JSON.stringify(s)); }
  catch (e) { console.error("[store] fallback write failed:", e?.message); }
}

export async function loadState() {
  let s = await getState();
  if (!s) { s = defaultState(); await saveState(s); }
  return s;
}
