import { ask } from "./claude.js";

const MAX_LINES_PER_CHAT = 200;
const MAX_CHATS = 40;

// chats: [{ jid, name, lines: ["[HH:MM] Untel: texte", ...] }]
// Retourne une section de digest par conversation ou il s'est passe quelque chose.
export async function buildDigest(accountId, chats) {
  const sections = [];
  for (const chat of chats.slice(0, MAX_CHATS)) {
    const lines = chat.lines.slice(-MAX_LINES_PER_CHAT);
    const out = await ask(
      `Tu es l'assistant de veille WhatsApp de ${accountId}. On te donne les derniers messages d'une conversation. Produis en francais : un resume en 2-3 phrases maximum, puis uniquement si presents dans la conversation : "Decisions:", "Taches:" (qui / quoi / echeance), "Dates:" (rendez-vous et echeances mentionnes). Sois bref et factuel. Si rien d'important (small talk uniquement), reponds exactement RAS.`,
      `Conversation « ${chat.name} » :\n${lines.join("\n")}`,
      { maxTokens: 700 }
    );
    if (out && out.toUpperCase() !== "RAS") sections.push(`*${chat.name}*\n${out}`);
  }
  return sections;
}
