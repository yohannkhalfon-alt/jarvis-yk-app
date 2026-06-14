// Proxy securise vers l'API Anthropic — la cle reste cote serveur Netlify
export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY manquante" }), { status: 503, headers: { "content-type": "application/json" } });
  const body = await req.json();
  const payload = { model: body.model || "claude-sonnet-4-5", max_tokens: body.max_tokens || 1024, ...body };
  const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" }, body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) return new Response(JSON.stringify({ error: (data.error && data.error.message) || "Erreur API" }), { status: res.status, headers: { "content-type": "application/json" } });
  const text = Array.isArray(data.content) ? data.content.filter(b => b.type === "text").map(b => b.text).join("\n") : "";
  return new Response(JSON.stringify({ ...data, text }), { headers: { "content-type": "application/json" } });
};
export const config = { path: "/api/claude" };
