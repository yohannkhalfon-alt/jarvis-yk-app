// Archive complete et persistante des messages (jamais purgee).
// Un fichier JSONL append-only par conversation + un index chats.json.
import fs from "fs";
import path from "path";

export class Archive {
  constructor(dir) {
    this.dir = dir;
    this.msgDir = path.join(dir, "chats");
    fs.mkdirSync(this.msgDir, { recursive: true });
    this.indexPath = path.join(dir, "chats.json");
    this.index = this.#loadIndex();
  }

  #loadIndex() {
    try { return JSON.parse(fs.readFileSync(this.indexPath, "utf8")); } catch { return {}; }
  }
  #saveIndex() {
    fs.writeFileSync(this.indexPath, JSON.stringify(this.index));
  }
  #file(jid) {
    return path.join(this.msgDir, jid.replace(/[^\w.-]/g, "_") + ".jsonl");
  }

  // msg: { id, ts, chat, chatName, sender, fromMe, text, isGroup }
  add(msg) {
    if (!msg.chat) return;
    fs.appendFileSync(this.#file(msg.chat), JSON.stringify(msg) + "\n");
    const cur = this.index[msg.chat] || { jid: msg.chat, count: 0, firstTs: msg.ts, lastTs: 0 };
    cur.name = msg.chatName || cur.name || msg.chat;
    cur.isGroup = msg.isGroup ?? cur.isGroup ?? msg.chat.endsWith("@g.us");
    cur.count += 1;
    cur.lastTs = Math.max(cur.lastTs || 0, msg.ts);
    cur.firstTs = Math.min(cur.firstTs || msg.ts, msg.ts);
    cur.lastText = (msg.text || "").slice(0, 120);
    cur.lastSender = msg.fromMe ? "moi" : msg.sender;
    this.index[msg.chat] = cur;
    this.#saveIndex();
  }

  listChats() {
    return Object.values(this.index).sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0));
  }

  #readChat(jid) {
    let raw;
    try { raw = fs.readFileSync(this.#file(jid), "utf8"); } catch { return []; }
    const seen = new Set();
    const out = [];
    for (const line of raw.split("\n")) {
      if (!line) continue;
      let m; try { m = JSON.parse(line); } catch { continue; }
      const key = m.id || `${m.ts}:${m.sender}:${m.text}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(m);
    }
    return out.sort((a, b) => a.ts - b.ts);
  }

  messages(jid, { limit = 200, before } = {}) {
    let all = this.#readChat(jid);
    if (before) all = all.filter((m) => m.ts < before);
    return all.slice(-limit);
  }

  search(q, limit = 100) {
    const needle = q.toLowerCase();
    const hits = [];
    for (const c of this.listChats()) {
      for (const m of this.#readChat(c.jid)) {
        if ((m.text || "").toLowerCase().includes(needle)) {
          hits.push({ ...m, chatName: c.name });
          if (hits.length >= limit) return hits;
        }
      }
    }
    return hits.sort((a, b) => b.ts - a.ts);
  }
}
