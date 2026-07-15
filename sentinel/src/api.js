// Serveur HTTP : sert l'interface de lecture + l'API JSON, protege par un token.
import http from "http";
import fs from "fs";
import path from "path";
import QRCode from "qrcode";
import { fileURLToPath } from "url";

const __dir = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(__dir, "..", "public");
const UI = path.join(PUB, "messagerie.html");
const CONNEXION = path.join(PUB, "connexion.html");

export function startApi(accounts, config) {
  const token = process.env.SENTINEL_TOKEN || config.accessToken;
  if (!token) { console.error("Aucun accessToken/SENTINEL_TOKEN : l'interface de lecture ne demarre pas."); return; }
  const port = Number(process.env.PORT || config.port || 8787);
  const byId = new Map(accounts.map((a) => [a.account.id, a]));

  const send = (res, code, data, type = "application/json") => {
    res.writeHead(code, { "content-type": type, "cache-control": "no-store" });
    res.end(Buffer.isBuffer(data) || typeof data === "string" ? data : JSON.stringify(data));
  };
  const STATIC = { ".png": "image/png", ".ico": "image/x-icon", ".svg": "image/svg+xml", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" };
  const authed = (url) => (url.searchParams.get("token") || "") === token;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    const p = url.pathname;

    if (p === "/" || p === "/messagerie") {
      try { return send(res, 200, fs.readFileSync(UI, "utf8"), "text/html; charset=utf-8"); }
      catch { return send(res, 500, "UI introuvable"); }
    }
    if (p === "/connexion") {
      try { return send(res, 200, fs.readFileSync(CONNEXION, "utf8"), "text/html; charset=utf-8"); }
      catch { return send(res, 500, "Page connexion introuvable"); }
    }
    const ext = path.extname(p).toLowerCase();
    if (STATIC[ext]) {
      try { return send(res, 200, fs.readFileSync(path.join(PUB, path.basename(p))), STATIC[ext]); }
      catch { return send(res, 404, "Not found", "text/plain"); }
    }
    if (p.startsWith("/api/")) {
      if (!authed(url)) return send(res, 401, { error: "token invalide" });
      const acc = byId.get(url.searchParams.get("account") || accounts[0]?.account.id);
      if (!acc) return send(res, 404, { error: "compte inconnu" });

      if (p === "/api/accounts") return send(res, 200, accounts.map((a) => ({ id: a.account.id, ...a.status() })));
      if (p === "/api/qr") {
        const st = acc.status();
        if (st.connected) return send(res, 200, { connected: true });
        const pairing = acc.getPairing && acc.getPairing();
        const raw = acc.getQr && acc.getQr();
        if (!raw) return send(res, 200, { connected: false, qr: null, pairing: pairing || null });
        return QRCode.toDataURL(raw, { margin: 1, width: 320 })
          .then((dataUrl) => send(res, 200, { connected: false, qr: dataUrl, pairing: pairing || null }))
          .catch(() => send(res, 200, { connected: false, qr: null, pairing: pairing || null }));
      }
      if (p === "/api/pair") {
        if (acc.status().connected) return send(res, 200, { connected: true });
        const number = url.searchParams.get("number");
        if (!acc.requestPairing) return send(res, 400, { error: "non supporte" });
        return acc.requestPairing(number)
          .then((code) => send(res, 200, { code }))
          .catch((e) => send(res, 200, { error: e.message }));
      }
      if (p === "/api/chats") return send(res, 200, acc.archive.listChats());
      if (p === "/api/messages") {
        const jid = url.searchParams.get("jid");
        if (!jid) return send(res, 400, { error: "jid requis" });
        const before = url.searchParams.get("before");
        return send(res, 200, acc.archive.messages(jid, { limit: 500, before: before ? Number(before) : undefined }));
      }
      if (p === "/api/search") {
        const q = (url.searchParams.get("q") || "").trim();
        if (q.length < 2) return send(res, 400, { error: "requete trop courte" });
        return send(res, 200, acc.archive.search(q));
      }
      return send(res, 404, { error: "route inconnue" });
    }
    return send(res, 404, "Not found", "text/plain");
  });

  server.listen(port, () => console.log(`Interface de lecture : http://localhost:${port}/  (token requis)`));
}
