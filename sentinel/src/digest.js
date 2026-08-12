import { ask } from "./claude.js";

const MAX_LINES_PER_CHAT = 200;
const MAX_CHATS = 40;

const SYSTEM = (name) => `Tu es l'assistant de veille WhatsApp de ${name}. On te donne les derniers messages d'une conversation. Analyse-les et renvoie UNIQUEMENT un objet JSON valide (aucun texte autour), en francais, au format exact :
{"resume":"1 a 2 phrases max, factuel","points":["point important court",...],"taches":[{"quoi":"","qui":"","echeance":"YYYY-MM-DD ou null"}],"evenements":[{"titre":"","date":"YYYY-MM-DD","heure":"HH:MM ou null","lieu":"ou null"}]}
Regles : n'invente rien. Resous les dates relatives (demain, mardi prochain, ce week-end...) en date reelle a partir de la date du jour fournie. Ne mets dans "evenements" que de vrais rendez-vous/echeances dates. Si rien d'important (que du small talk), renvoie {"resume":"","points":[],"taches":[],"evenements":[]}. Sois concis et factuel.`;

function extractJson(s) {
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a < 0 || b < 0) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}
const pad = (n) => String(n).padStart(2, "0");
const ok = (v) => v && v !== "null" && String(v).trim();

// Lien Google Agenda pre-rempli (1 clic pour ajouter l'evenement)
export function gcalLink(ev) {
  const m = ev?.date && String(ev.date).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const t = ok(ev.heure) && String(ev.heure).match(/^(\d{1,2}):(\d{2})$/);
  let dates;
  if (t) {
    const hh = pad(t[1]), mn = pad(t[2]), eh = pad((parseInt(t[1], 10) + 1) % 24);
    dates = `${y}${mo}${d}T${hh}${mn}00/${y}${mo}${d}T${eh}${mn}00`;
  } else {
    const nd = new Date(`${y}-${mo}-${d}T00:00:00`);
    nd.setDate(nd.getDate() + 1);
    dates = `${y}${mo}${d}/${nd.getFullYear()}${pad(nd.getMonth() + 1)}${pad(nd.getDate())}`;
  }
  const p = new URLSearchParams({ action: "TEMPLATE", text: ev.titre || "Rendez-vous", dates });
  if (ok(ev.lieu)) p.set("location", ev.lieu);
  return "https://calendar.google.com/calendar/render?" + p.toString();
}

function isEmpty(d) {
  return !ok(d.resume) && !(d.points || []).length && !(d.taches || []).length && !(d.evenements || []).length;
}

function fmtChat(name, d) {
  const L = [`*${name}*`];
  if (ok(d.resume)) L.push(d.resume.trim());
  for (const p of (d.points || [])) if (ok(p)) L.push(`• ${p}`);

  const taches = (d.taches || []).filter((t) => ok(t.quoi));
  if (taches.length) {
    L.push("", "✅ *À faire*");
    for (const t of taches) {
      let s = `   ◦ ${t.quoi}`;
      if (ok(t.qui)) s += ` — _${t.qui}_`;
      if (ok(t.echeance)) s += ` (${t.echeance})`;
      L.push(s);
    }
  }

  const evs = (d.evenements || []).filter((e) => ok(e.titre) && ok(e.date));
  if (evs.length) {
    L.push("", "📅 *Dates & RDV*");
    for (const e of evs) {
      let s = `   ◦ *${e.titre}* — ${e.date}`;
      if (ok(e.heure)) s += ` à ${e.heure}`;
      if (ok(e.lieu)) s += ` · ${e.lieu}`;
      L.push(s);
      const link = gcalLink(e);
      if (link) L.push(`   ➕ Ajouter à l'agenda : ${link}`);
    }
  }
  return L.join("\n");
}

// chats: [{ jid, name, lines }] ; todayStr : date du jour lisible + ISO pour resoudre les dates relatives
export async function buildDigest(accountName, chats, todayStr) {
  const sections = [];
  for (const chat of chats.slice(0, MAX_CHATS)) {
    const lines = chat.lines.slice(-MAX_LINES_PER_CHAT);
    let raw;
    try {
      raw = await ask(SYSTEM(accountName), `Date du jour : ${todayStr}\n\nConversation « ${chat.name} » :\n${lines.join("\n")}`, { maxTokens: 900 });
    } catch { continue; }
    const d = extractJson(raw);
    if (!d || isEmpty(d)) continue;
    sections.push(fmtChat(chat.name, d));
  }
  return sections;
}
