import { loadState, saveState } from "./_lib/store.mjs";
import { ORG_KEY, defaultState } from "./_lib/draw.mjs";
import { readBody } from "./_lib/util.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
  const raw = await readBody(req);
  let body = {};
  try { body = JSON.parse(raw || "{}"); } catch {}
  const key = String(body.key || "").trim();
  if (key !== ORG_KEY) return res.status(403).json({ error: "密钥错误" });

  const s = await loadState();
  const ns = defaultState(s.teams); // 保留队名，仅清空抽签
  await saveState(ns);
  res.status(200).json({ ok: true });
}
