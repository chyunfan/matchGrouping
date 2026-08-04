import { loadState } from "./_lib/store.mjs";

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method Not Allowed" });
  const s = await loadState();
  res.status(200).json(s);
}
