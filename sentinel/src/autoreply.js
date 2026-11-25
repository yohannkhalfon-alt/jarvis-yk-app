import { ask } from "./claude.js";

// Redige un brouillon de reponse pour une conversation 1-a-1.
// Retourne null si aucune reponse n'est attendue.
export async function draftReply(persona, chatName, lines) {
  const out = await ask(
    `${persona}\nOn te donne les derniers messages d'une conversation WhatsApp 1-a-1. Redige la reponse a envoyer, naturelle et breve (style WhatsApp, pas de formules pompeuses). Reponds UNIQUEMENT avec le texte du message, sans guillemets ni commentaire. Si aucune reponse n'est attendue (simple accuse de reception, conversation terminee), reponds exactement SKIP.`,
    `Conversation avec ${chatName} :\n${lines.join("\n")}`,
    { maxTokens: 400 }
  );
  if (!out || out.toUpperCase() === "SKIP") return null;
  return out;
}
