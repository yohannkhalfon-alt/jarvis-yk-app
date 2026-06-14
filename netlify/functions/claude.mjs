// Proxy securise vers l'API Anthropic — la cle reste cote serveur Netlify
export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: "ANTHROPIC_API_KEY manquante dans les variables Netlify" }), { status: 503, headers: { "content-type": "application/json" } });
  const body = await req.json();
  const payload = { model: body.model || "claude-sonnet-4-5", max_tokens: body.max_tokens || 1024, ...body };
  const res = await fetch("https://api.anthropic.com/v1/messages", { method: "POST", headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" }, body: JSON.stringify(payload) });
  return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
};
export const config = { path: "/api/claude" };
