// Appel direct a l'API Anthropic — la cle vient de l'env du serveur
const API = "https://api.anthropic.com/v1/messages";

export async function ask(system, user, { model, maxTokens = 1024 } = {}) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: model || process.env.CLAUDE_MODEL || "claude-sonnet-5",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: user }]
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `Claude API ${res.status}`);
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
}
