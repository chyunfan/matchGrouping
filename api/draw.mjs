import { loadState, saveState } from "./_lib/store.mjs";
import { assignNumber, maybeFinalize } from "./_lib/draw.mjs";
import { readBody } from "./_lib/util.mjs";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method Not Allowed" });
  const raw = await readBody(req);
  let body = {};
  try { body = JSON.parse(raw || "{}"); } catch {}
  const team = String(body.team || "").trim();
  if (!team) return res.status(400).json({ error: "缺少队伍参数" });

  const s = await loadState();
  if (s.drawn[team] !== undefined) {
    return res.status(409).json({ error: "该队伍已抽签", number: s.drawn[team] });
  }
  const num = assignNumber(s);
  if (num === null) return res.status(409).json({ error: "号码已用完" });

  s.drawn[team] = num;
  maybeFinalize(s);
  await saveState(s);
  res.status(200).json({ team, number: num });
}
