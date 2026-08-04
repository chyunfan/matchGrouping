import { saveState } from "./_lib/store.mjs";
import { ORG_KEY, defaultState } from "./_lib/draw.mjs";
import { readBody } from "./_lib/util.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
  const raw = await readBody(req);
  let body = {};
  try { body = JSON.parse(raw || "{}"); } catch {}
  const key = String(body.key || "").trim();
  const teams = (Array.isArray(body.teams) ? body.teams : [])
    .map((t) => String(t).trim()).filter(Boolean);

  if (key !== ORG_KEY) return res.status(403).json({ error: "密钥错误" });
  if (teams.length !== 5) {
    return res.status(400).json({ error: `需要正好 5 个队名，当前 ${teams.length} 个` });
  }
  const s = defaultState(teams); // 设置队名会重置抽签
  await saveState(s);
  res.status(200).json(s);
}
