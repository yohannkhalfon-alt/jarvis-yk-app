import makeWASocket, { useMultiFileAuthState, fetchLatestBaileysVersion, DisconnectReason, downloadMediaMessage } from "@whiskeysockets/baileys";
import pino from "pino";
import fs from "fs";
import path from "path";
import { Archive } from "./archive.js";
import { buildDigest } from "./digest.js";
import { draftReply } from "./autoreply.js";

const HOUR = 3600 * 1000;
const REPLY_COOLDOWN_MS = 90 * 1000;

const bare = (jid) => String(jid || "").split(":")[0].split("@")[0];
const toJid = (num) => bare(num) + "@s.whatsapp.net";

function extractText(msg) {
  const m = msg.message || {};
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    (m.audioMessage ? "[note vocale]" : "") ||
    (m.imageMessage ? "[image]" : "") ||
    (m.videoMessage ? "[vidéo]" : "") ||
    (m.documentMessage ? `[document] ${m.documentMessage.fileName || ""}` : "") ||
    (m.stickerMessage ? "[sticker]" : "") ||
    ""
  );
}

const MIME_EXT = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif",
  "video/mp4": "mp4", "video/3gpp": "3gp", "video/quicktime": "mov",
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac",
  "application/pdf": "pdf"
};
function mediaKind(m) {
  if (m.imageMessage) return "image";
  if (m.videoMessage) return "video";
  if (m.stickerMessage) return "sticker";
  if (m.audioMessage) return "audio";
  if (m.documentMessage) return "document";
  return null;
}
function mediaNode(m) {
  return m.imageMessage || m.videoMessage || m.stickerMessage || m.audioMessage || m.documentMessage || null;
}

export async function startAccount(account, config) {
  const dataDir = path.join(process.cwd(), "data", account.id);
  const archive = new Archive(path.join(dataDir, "archive"));
  const stateFile = path.join(dataDir, "state.json");
  const persisted = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, "utf8")) : {};

  const ctx = {
    paused: persisted.paused || false,
    lastDigestTs: persisted.lastDigestTs || Date.now(),
    pending: new Map(),
    pendingSeq: 0,
    lastReplyAt: new Map(),
    groupNames: new Map(),
    sock: null,
    connected: false,
    qr: null,
    pairingCode: null
  };
  const webPort = process.env.PORT || config.port || 8787;
  const saveState = () =>
    fs.writeFileSync(stateFile, JSON.stringify({ paused: ctx.paused, lastDigestTs: ctx.lastDigestTs }));

  const notifyJid = toJid(account.notify);
  const displayName = account.label || account.id;
  const log = (...a) => console.log(`[${displayName}]`, ...a);
  const handle = {
    account, archive,
    getQr: () => ctx.qr,
    getPairing: () => ctx.pairingCode,
    status: () => ({ connected: ctx.connected, paused: ctx.paused }),
    // Liaison a distance : genere un code a taper dans WhatsApp (sans QR)
    requestPairing: async (rawNumber) => {
      const num = String(rawNumber || "").replace(/[^\d]/g, "");
      if (ctx.connected) throw new Error("Deja connecte.");
      if (!ctx.sock) throw new Error("Serveur pas encore pret, reessaie dans 5s.");
      if (num.length < 8) throw new Error("Numero invalide (format international, ex 573106224524).");
      const code = await ctx.sock.requestPairingCode(num);
      ctx.pairingCode = code;
      return code;
    }
  };

  async function connect() {
    const { state, saveCreds } = await useMultiFileAuthState(path.join(dataDir, "auth"));
    const { version } = await fetchLatestBaileysVersion();
    const sock = makeWASocket({ version, auth: state, logger: pino({ level: "warn" }), syncFullHistory: true });
    ctx.sock = sock;

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        ctx.qr = qr;
        log(`QR pret. Ouvre cette page pour le scanner (image nette, se met a jour toute seule) :`);
        log(`   >>> http://localhost:${webPort}/connexion`);
      }
      if (connection === "open") { ctx.qr = null; ctx.pairingCode = null; ctx.connected = true; log("Connecte."); }
      if (connection === "close") {
        ctx.connected = false;
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          log(`Deconnecte definitivement. Supprime data/${account.id}/auth et relance pour re-scanner.`);
        } else {
          log("Connexion perdue, reconnexion dans 5s...");
          setTimeout(() => connect().catch((e) => log("reconnexion:", e.message)), 5000);
        }
      }
    });

    // Backfill de l'historique fourni par WhatsApp a la premiere liaison
    sock.ev.on("messaging-history.set", async ({ messages }) => {
      if (!Array.isArray(messages)) return;
      let n = 0;
      for (const msg of messages) {
        const rec = await toRecord(sock, msg);
        if (rec) { archive.add(rec); n++; }
      }
      if (n) log(`Historique importe : ${n} messages.`);
    });

    sock.ev.on("messages.upsert", async ({ messages, type }) => {
      if (type !== "notify") return;
      for (const msg of messages) {
        try { await onMessage(sock, msg); } catch (e) { log("message:", e.message); }
      }
    });
  }

  async function chatDisplayName(sock, jid, pushName) {
    if (!jid.endsWith("@g.us")) return pushName || bare(jid);
    if (!ctx.groupNames.has(jid)) {
      try { ctx.groupNames.set(jid, (await sock.groupMetadata(jid)).subject); }
      catch { ctx.groupNames.set(jid, "Groupe " + bare(jid)); }
    }
    return ctx.groupNames.get(jid);
  }

  async function saveMedia(sock, msg) {
    const m = msg.message || {};
    const kind = mediaKind(m);
    if (!kind) return null;
    const node = mediaNode(m);
    const mime = (node?.mimetype || "").split(";")[0];
    const ext = MIME_EXT[mime] || (kind === "image" || kind === "sticker" ? "jpg" : kind === "video" ? "mp4" : kind === "audio" ? "ogg" : "bin");
    const name = ((msg.key?.id || "m" + (Number(msg.messageTimestamp) || "")).replace(/[^\w-]/g, "")) + "." + ext;
    const dest = archive.mediaPath(name);
    const info = { file: name, mime, kind, name: node?.fileName || null };
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) return info;
    try {
      const buf = await downloadMediaMessage(msg, "buffer", {}, { logger: pino({ level: "silent" }), reuploadRequest: sock.updateMediaMessage });
      fs.writeFileSync(dest, buf);
      return info;
    } catch (e) {
      return { file: null, mime, kind, name: node?.fileName || null }; // média expiré/indisponible
    }
  }

  async function toRecord(sock, msg, downloadM = false) {
    const jid = msg.key?.remoteJid;
    if (!jid || jid === "status@broadcast" || !msg.message) return null;
    const text = extractText(msg);
    if (!text) return null;
    const isGroup = jid.endsWith("@g.us");
    const fromMe = !!msg.key.fromMe;
    const senderJid = fromMe ? sock.user?.id : (msg.key.participant || jid);
    const senderName = fromMe ? "moi" : (msg.pushName || bare(senderJid));
    const chatName = await chatDisplayName(sock, jid, msg.pushName);
    const ts = Number(msg.messageTimestamp) * 1000 || Date.now();
    const kind = mediaKind(msg.message);
    let media = null;
    if (kind) media = downloadM ? await saveMedia(sock, msg) : { file: null, kind, mime: (mediaNode(msg.message)?.mimetype || "").split(";")[0] };
    return { id: msg.key.id, ts, chat: jid, chatName, sender: senderName, fromMe, text, isGroup, media };
  }

  async function onMessage(sock, msg) {
    const jid = msg.key.remoteJid;
    if (!jid || jid === "status@broadcast" || !msg.message) return;
    const text = extractText(msg);
    const isGroup = jid.endsWith("@g.us");
    const fromMe = !!msg.key.fromMe;
    const senderJid = fromMe ? sock.user.id : (msg.key.participant || jid);

    // Commandes de pilotage (depuis le numero notify, en 1-a-1)
    const isController = bare(senderJid) === bare(account.notify) && !isGroup;
    if (isController) {
      const t = text.trim();
      const word = t.replace(/^!/, "").split(/\s+/)[0].toLowerCase();
      if (["ok", "non", "no", "pause", "go", "aide", "help", "digest"].includes(word)) { await handleCommand(sock, t.replace(/^!/, "")); return; }
      const h = digestHours(t);
      if (h) { await sock.sendMessage(notifyJid, { text: `⏳ Je prépare ta veille sur ${h % 24 === 0 ? h / 24 + " jour(s)" : h + "h"}…` }); await runDigest(true, h); return; }
    }

    const rec = await toRecord(sock, msg, true);
    if (rec) archive.add(rec);

    // Reponse assistee : 1-a-1 entrant uniquement, hors chat de pilotage
    if (fromMe || isGroup || !text || bare(jid) === bare(account.notify)) return;
    const ar = account.autoReply || {};
    if (ctx.paused || !ar.mode || ar.mode === "off") return;
    if (!isAllowed(ar.allowFrom, jid)) return;

    const last = ctx.lastReplyAt.get(jid) || 0;
    if (Date.now() - last < REPLY_COOLDOWN_MS) return;
    ctx.lastReplyAt.set(jid, Date.now());

    const chatName = rec?.chatName || bare(jid);
    const history = archive.messages(jid, { limit: 20 }).map((m) => `${m.fromMe ? "moi" : m.sender}: ${m.text}`);
    const draft = await draftReply(ar.persona || `Tu reponds au nom de ${displayName}.`, chatName, history);
    if (!draft) return;

    if (ar.mode === "auto") {
      await sock.sendMessage(jid, { text: draft });
      await sock.sendMessage(notifyJid, { text: `🤖 Réponse envoyée à *${chatName}* :\n${draft}` });
    } else {
      const id = (++ctx.pendingSeq).toString(36);
      ctx.pending.set(id, { jid, chatName, draft });
      await sock.sendMessage(notifyJid, {
        text: `✉️ *${chatName}* t'a écrit\n_Réponse proposée_ 👇\n\n${draft}\n\n▸ *ok ${id}*  envoyer\n▸ *ok ${id} ton texte*  corriger puis envoyer\n▸ *non ${id}*  ignorer`
      });
    }
  }

  async function handleCommand(sock, text) {
    const [cmd, id, ...rest] = text.split(/\s+/);
    const c = (cmd || "").toLowerCase();
    const reply = (t) => sock.sendMessage(notifyJid, { text: t });
    if (c === "aide" || c === "help") return reply(
      `👋 *Assistant ${displayName}*\n\n📊 *Résumés* — tape une période :\n• *24h*  (aujourd'hui)\n• *48h*  (2 jours)\n• *semaine*  (7 jours)\n• *mois*  (30 jours)\n\n✉️ *Brouillons de réponse* :\n• *ok <n>*  envoyer\n• *ok <n> ton texte*  corriger\n• *non <n>*  ignorer\n\n⏯️ *pause* / *go*  couper / relancer les brouillons`
    );
    if (c === "pause") { ctx.paused = true; saveState(); return reply(`⏸️ Brouillons en pause. Tape *go* pour relancer.`); }
    if (c === "go") { ctx.paused = false; saveState(); return reply(`▶️ Brouillons réactivés.`); }
    if (c === "digest") return runDigest(true);
    if (c === "ok" || c === "non" || c === "no") {
      const p = ctx.pending.get(id);
      if (!p) return reply(`Brouillon *${id || "?"}* introuvable (déjà traité, peut-être ?).`);
      ctx.pending.delete(id);
      if (c === "non" || c === "no") return reply(`✖️ Brouillon *${id}* ignoré.`);
      const finalText = rest.length ? rest.join(" ") : p.draft;
      await sock.sendMessage(p.jid, { text: finalText });
      return reply(`✅ Envoyé à *${p.chatName}*.`);
    }
  }

  async function runDigest(forced = false, lookbackHours = null) {
    const sock = ctx.sock;
    if (!sock) return;
    // Digest force (mot-cle ou !digest) : fenetre recente choisie (defaut 48h).
    // Digest automatique : on repart du dernier resume (incremental).
    const hours = lookbackHours || config.digestLookbackHours || 48;
    const sinceTs = forced ? (Date.now() - hours * HOUR) : ctx.lastDigestTs;
    const scope = account.digest?.scope || "all";
    const byChat = new Map();
    for (const c of archive.listChats()) {
      if (scope === "groups" && !c.isGroup) continue;
      if (bare(c.jid) === bare(account.notify)) continue;
      const msgs = archive.messages(c.jid, { limit: 300 }).filter((m) => m.ts >= sinceTs);
      if (!msgs.length) continue;
      byChat.set(c.jid, {
        jid: c.jid, name: c.name,
        lines: msgs.map((m) => `[${new Date(m.ts).toTimeString().slice(0, 5)}] ${m.fromMe ? "moi" : m.sender}: ${m.text}`)
      });
    }
    const periodeLabel = hours % 24 === 0 ? `${hours / 24} jour(s)` : `${hours}h`;
    const chats = [...byChat.values()].filter((c) => c.lines.length >= (forced ? 1 : 3));
    if (!chats.length) {
      if (forced) await sock.sendMessage(notifyJid, { text: `📭 [${displayName}] Rien à résumer sur ${periodeLabel}.` });
    } else {
      const now = new Date();
      const p2 = (n) => String(n).padStart(2, "0");
      const todayStr = `${now.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: config.timezone || "Europe/Paris" })} (${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())})`;
      const sections = await buildDigest(displayName, chats, todayStr);
      const periode = forced ? ` · ${periodeLabel}` : "";
      const header = `📋 *Veille ${displayName}${periode}* — ${new Date().toLocaleString("fr-FR", { timeZone: config.timezone || "Europe/Paris" })}`;
      const full = header + "\n\n" + (sections.length ? sections.join("\n\n") : "RAS.");
      for (let i = 0; i < full.length; i += 3500) await sock.sendMessage(notifyJid, { text: full.slice(i, i + 3500) });
    }
    // Un résumé ad-hoc (mot-clé / !digest) ne perturbe pas le cycle automatique.
    if (!forced) { ctx.lastDigestTs = Date.now(); saveState(); }
  }

  const everyHours = account.digest?.everyHours || 4;
  if (account.digest?.enabled !== false) {
    setInterval(() => runDigest(false).catch((e) => log("digest:", e.message)), everyHours * HOUR);
  }

  await connect();
  log(`Demarre — archive complete, digest ${account.digest?.enabled === false ? "off" : everyHours + "h"}, reponses: ${account.autoReply?.mode || "off"}.`);
  return handle;
}

// Reconnait un mot-cle de periode tape directement (sans "!") -> nombre d'heures.
// Ex : "24h", "48h", "2j", "semaine", "mois", "digest".
function digestHours(text) {
  const t = String(text).trim().toLowerCase().replace(/^!/, "");
  let m;
  if (["digest", "resume", "résumé", "veille"].includes(t)) return 48;
  if (["jour", "1jour", "aujourdhui", "aujourd'hui"].includes(t)) return 24;
  if (["semaine", "1semaine", "1sem", "sem"].includes(t)) return 168;
  if (["mois", "1mois"].includes(t)) return 720;
  if ((m = t.match(/^(\d{1,4})\s*h$/))) return Math.min(parseInt(m[1], 10), 24 * 90);
  if ((m = t.match(/^(\d{1,3})\s*j(ours?)?$/))) return Math.min(parseInt(m[1], 10) * 24, 24 * 90);
  return null;
}

function isAllowed(allowFrom, jid) {
  if (!Array.isArray(allowFrom) || !allowFrom.length) return false;
  if (allowFrom.includes("*")) return true;
  const num = bare(jid);
  return allowFrom.some((a) => bare(a) === num);
}
