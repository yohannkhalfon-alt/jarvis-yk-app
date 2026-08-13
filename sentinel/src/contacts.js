// Carnet de noms : associe un numéro (bare JID) à un nom lisible.
// Stocké dans data/<compte>/contacts.json. Résolu à l'affichage (dashboard + résumés).
import fs from "fs";

const bare = (jid) => String(jid || "").split(":")[0].split("@")[0];

export class Contacts {
  constructor(file) {
    this.file = file;
    try { this.map = JSON.parse(fs.readFileSync(file, "utf8")); } catch { this.map = {}; }
  }
  get(jid) { return this.map[bare(jid)] || null; }
  all() { return this.map; }
  set(numberOrJid, name) {
    const k = bare(numberOrJid);
    if (!k) return;
    const n = String(name || "").trim().slice(0, 60);
    if (n) this.map[k] = n; else delete this.map[k];
    try { fs.writeFileSync(this.file, JSON.stringify(this.map)); } catch { /* ignore */ }
  }
}
