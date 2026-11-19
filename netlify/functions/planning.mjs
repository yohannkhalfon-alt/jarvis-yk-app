// JARVIS PLANNING — relais lecture/écriture des plannings Excel Dropbox.
// Demande Yohann (19/11) : pouvoir écrire le nom d'un ophtalmo directement
// dans le planning quand une date est validée, avec exactement la même mise
// en forme (l'édition se fait hors Netlify, ce relais ne fait que transporter
// les octets ; l'upload écrase le fichier en conservant son chemin).
// Protégé par le code admin CDD (header x-cdd-code). Identifiants Dropbox :
// les mêmes que MAJ VAC (variables d'environnement ou blobs "majvac").
import { getStore } from "@netlify/blobs";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const adminOk = (req) => {
  const code = process.env.CDD_ADMIN_CODE;
  return !code || req.headers.get("x-cdd-code") === code;
};

async function getCreds() {
  let key = process.env.DROPBOX_APP_KEY;
  let secret = process.env.DROPBOX_APP_SECRET;
  let refresh = process.env.DROPBOX_REFRESH_TOKEN;
  if (key && secret && refresh) return { key, secret, refresh };
  try {
    const store = getStore("majvac");
    key = key || (await store.get("app_key"));
    secret = secret || (await store.get("app_secret"));
    refresh = refresh || (await store.get("refresh_token"));
    if (key && secret && refresh) return { key, secret, refresh };
  } catch (e) {}
  return null;
}

let tokenCache = { value: null, exp: 0 };

async function lireJson(res, contexte) {
  const txt = await res.text();
  if (!res.ok) throw new Error(`${contexte} (${res.status}) : ${txt.slice(0, 180)}`);
  try { return JSON.parse(txt); } catch { throw new Error(`${contexte} : réponse inattendue : ${txt.slice(0, 180)}`); }
}

async function dropboxToken(creds) {
  if (tokenCache.value && Date.now() < tokenCache.exp - 60_000) return tokenCache.value;
  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token", refresh_token: creds.refresh,
      client_id: creds.key, client_secret: creds.secret,
    }),
  });
  const data = await lireJson(res, "Token Dropbox");
  tokenCache = { value: data.access_token, exp: Date.now() + (data.expires_in || 14400) * 1000 };
  return data.access_token;
}

export default async (req) => {
  if (!adminOk(req)) return json({ error: "code admin invalide" }, 401);
  const creds = await getCreds();
  if (!creds) return json({ error: "identifiants Dropbox absents (voir MAJ VAC)" }, 500);
  const token = await dropboxToken(creds);
  const url = new URL(req.url);

  // Téléchargement : GET /api/planning?dl=id:xxxx — renvoie les octets du fichier.
  const dl = url.searchParams.get("dl");
  if (req.method === "GET" && dl) {
    const res = await fetch("https://content.dropboxapi.com/2/files/download", {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "Dropbox-API-Arg": JSON.stringify({ path: dl }) },
    });
    if (!res.ok) return json({ error: `Dropbox download (${res.status}) : ${(await res.text()).slice(0, 180)}` }, 502);
    const meta = res.headers.get("dropbox-api-result") || "{}";
    return new Response(await res.arrayBuffer(), {
      headers: { "content-type": "application/octet-stream", "x-dropbox-meta": meta },
    });
  }

  // Écriture : POST {action:"upload", path:"id:xxxx"|"ns:…//…", contenuB64:"…"}
  // Écrase le fichier existant (mode overwrite) — Dropbox garde l'historique
  // des versions, donc toute écriture reste réversible depuis Dropbox.
  if (req.method === "POST") {
    let body;
    try { body = await req.json(); } catch { return json({ error: "JSON invalide" }, 400); }
    if (body.action !== "upload") return json({ error: "action inconnue" }, 400);
    const path = String(body.path || "");
    if (!/^(id:[A-Za-z0-9_-]+|ns:\d+\/\/.+|\/.+)$/.test(path)) return json({ error: "chemin invalide" }, 400);
    const contenu = Buffer.from(String(body.contenuB64 || ""), "base64");
    if (!contenu.length || contenu.length > 8 * 1024 * 1024) return json({ error: "contenu vide ou trop gros" }, 400);
    const res = await fetch("https://content.dropboxapi.com/2/files/upload", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/octet-stream",
        "Dropbox-API-Arg": JSON.stringify({ path, mode: "overwrite", autorename: false, mute: true }),
      },
      body: contenu,
    });
    const data = await lireJson(res, "Dropbox upload");
    return json({ ok: true, name: data.name, path_display: data.path_display, rev: data.rev, size: data.size, server_modified: data.server_modified });
  }

  return json({ error: "requête inconnue" }, 400);
};

export const config = { path: "/api/planning" };
