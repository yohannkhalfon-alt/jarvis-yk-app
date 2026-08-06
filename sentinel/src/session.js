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
  const log = (...a) => console.log(`[${account.id}]`, ...a);
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
    if (isController && text.startsWith("!")) { await handleCommand(sock, text.trim()); return; }

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
    const draft = await draftReply(ar.persona || `Tu reponds au nom de ${account.id}.`, chatName, history);
    if (!draft) return;

    if (ar.mode === "auto") {
      await sock.sendMessage(jid, { text: draft });
      await sock.sendMessage(notifyJid, { text: `🤖 [${account.id}] Reponse auto a ${chatName} :\n${draft}` });
    } else {
      const id = (++ctx.pendingSeq).toString(36);
      ctx.pending.set(id, { jid, chatName, draft });
      await sock.sendMessage(notifyJid, {
        text: `💬 [${account.id}] Brouillon ${id} pour ${chatName} :\n${draft}\n\n→ !ok ${id} (envoyer)  ·  !ok ${id} <texte> (corriger)  ·  !no ${id} (ignorer)`
      });
    }
  }

  async function handleCommand(sock, text) {
    const [cmd, id, ...rest] = text.split(/\s+/);
    const reply = (t) => sock.sendMessage(notifyJid, { text: t });
    if (cmd === "!aide") return reply(`Commandes [${account.id}] : !digest, !ok <id> [texte], !no <id>, !pause, !go, !aide`);
    if (cmd === "!pause") { ctx.paused = true; saveState(); return reply(`⏸️ [${account.id}] Reponses en pause.`); }
    if (cmd === "!go") { ctx.paused = false; saveState(); return reply(`▶️ [${account.id}] Reponses reactivees.`); }
    if (cmd === "!digest") return runDigest(true);
    if (cmd === "!ok" || cmd === "!no") {
      const p = ctx.pending.get(id);
      if (!p) return reply(`Brouillon ${id || "?"} introuvable.`);
      ctx.pending.delete(id);
      if (cmd === "!no") return reply(`🗑️ Brouillon ${id} ignore.`);
      const finalText = rest.length ? rest.join(" ") : p.draft;
      await sock.sendMessage(p.jid, { text: finalText });
      return reply(`✅ Envoye a ${p.chatName}.`);
    }
  }

  async function runDigest(forced = false) {
    const sock = ctx.sock;
    if (!sock) return;
    const sinceTs = ctx.lastDigestTs;
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
    const chats = [...byChat.values()].filter((c) => c.lines.length >= (forced ? 1 : 3));
    if (!chats.length) {
      if (forced) await sock.sendMessage(notifyJid, { text: `📭 [${account.id}] Rien a resumer.` });
    } else {
      const sections = await buildDigest(account.id, chats);
      const header = `📋 *Veille ${account.id}* — ${new Date().toLocaleString("fr-FR", { timeZone: config.timezone || "Europe/Paris" })}`;
      const full = header + "\n\n" + (sections.length ? sections.join("\n\n") : "RAS.");
      for (let i = 0; i < full.length; i += 3500) await sock.sendMessage(notifyJid, { text: full.slice(i, i + 3500) });
    }
    ctx.lastDigestTs = Date.now();
    saveState();
  }

  const everyHours = account.digest?.everyHours || 4;
  if (account.digest?.enabled !== false) {
    setInterval(() => runDigest(false).catch((e) => log("digest:", e.message)), everyHours * HOUR);
  }

  await connect();
  log(`Demarre — archive complete, digest ${account.digest?.enabled === false ? "off" : everyHours + "h"}, reponses: ${account.autoReply?.mode || "off"}.`);
  return handle;
}

function isAllowed(allowFrom, jid) {
  if (!Array.isArray(allowFrom) || !allowFrom.length) return false;
  if (allowFrom.includes("*")) return true;
  const num = bare(jid);
  return allowFrom.some((a) => bare(a) === num);
}
