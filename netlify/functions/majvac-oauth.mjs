// Connexion Dropbox pour MAJ VAC — configuration en 2 clics, sans toucher à Netlify.
// 1. GET sans paramètre : formulaire App key / App secret (stockés dans Netlify Blobs).
// 2. POST : enregistre les clés puis redirige vers l'écran d'autorisation Dropbox.
// 3. Retour avec ?code= : échange le code, stocke le refresh token → scan temps réel actif.
import { getStore } from "@netlify/blobs";

const page = (titre, corps) =>
  new Response(
    `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titre}</title>
<style>body{background:#04060C;color:#C8D6E5;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px}
.card{max-width:560px;width:100%;background:rgba(10,16,28,.85);border:1px solid rgba(79,216,235,.25);border-radius:14px;padding:26px}
h1{color:#EAF4FF;font-size:19px;margin:0 0 14px}
p{line-height:1.55;font-size:15px;margin:0 0 12px}
label{display:block;font-size:12px;letter-spacing:1px;color:#6B7C93;text-transform:uppercase;margin:14px 0 6px}
input{width:100%;box-sizing:border-box;background:rgba(255,255,255,.06);border:1px solid rgba(79,216,235,.3);border-radius:9px;padding:12px;color:#EAF4FF;font-size:15px}
button{margin-top:18px;width:100%;background:#4FD8EB;color:#04121A;border:none;border-radius:10px;padding:14px 0;font-size:15px;font-weight:800;letter-spacing:1px;cursor:pointer}
.ok{color:#33d17a}.err{color:#FF5D6C}
a{color:#4FD8EB}</style></head><body><div class="card">${corps}</div></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );

export default async (req) => {
  const url = new URL(req.url);
  const redirectUri = `${url.origin}/api/majvac-oauth`;

  let store;
  try {
    store = getStore("majvac");
  } catch (e) {
    return page("MAJ VAC — erreur", `<h1 class="err">Stockage indisponible</h1><p>${e.message}</p>`);
  }

  // Étape 2 : réception du formulaire → redirection vers Dropbox
  if (req.method === "POST") {
    const form = await req.formData();
    const key = String(form.get("key") || "").trim();
    const secret = String(form.get("secret") || "").trim();
    if (!key || !secret)
      return page("MAJ VAC — erreur", `<h1 class="err">Champs manquants</h1><p>Il faut l'App key ET l'App secret. Reviens en arrière et réessaie.</p>`);
    await store.set("app_key", key);
    await store.set("app_secret", secret);
    const authorize =
      `https://www.dropbox.com/oauth2/authorize?client_id=${encodeURIComponent(key)}` +
      `&response_type=code&token_access_type=offline&redirect_uri=${encodeURIComponent(redirectUri)}`;
    return Response.redirect(authorize, 303);
  }

  // Étape 3 : retour de Dropbox avec le code → échange et stockage du refresh token
  const code = url.searchParams.get("code");
  if (code) {
    const key = process.env.DROPBOX_APP_KEY || (await store.get("app_key"));
    const secret = process.env.DROPBOX_APP_SECRET || (await store.get("app_secret"));
    if (!key || !secret)
      return page("MAJ VAC — erreur", `<h1 class="err">Clés introuvables</h1><p>Recommence depuis <a href="${redirectUri}">le formulaire</a>.</p>`);
    const res = await fetch("https://api.dropbox.com/oauth2/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
        client_id: key,
        client_secret: secret,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.refresh_token)
      return page("MAJ VAC — échec", `<h1 class="err">Échec de l'autorisation</h1><p>${data.error_description || data.error || "Erreur inconnue"}.</p><p>Le code Dropbox n'est valable qu'une fois : <a href="${redirectUri}">recommencer</a>.</p>`);
    await store.set("refresh_token", data.refresh_token);
    return page("MAJ VAC — connecté", `<h1 class="ok">✅ Dropbox connecté</h1><p>Le <b>scan temps réel</b> est maintenant actif.</p><p>Retourne sur l'app <a href="${url.origin}/vac/">MAJ VAC</a> et appuie sur le bouton : la lecture des plannings se fera en direct à chaque appui.</p><p>Tu peux fermer cette page.</p>`);
  }

  // Étape 1 : formulaire (protégé si déjà connecté)
  const dejaConnecte = !!(await store.get("refresh_token"));
  if (dejaConnecte && url.searchParams.get("reset") !== "1")
    return page("MAJ VAC — déjà connecté", `<h1 class="ok">✅ Déjà connecté</h1><p>Le scan temps réel est déjà configuré. L'app est prête : <a href="${url.origin}/vac/">ouvrir MAJ VAC</a>.</p><p>Pour reconnecter un autre compte Dropbox, ouvre <b>${redirectUri}?reset=1</b>.</p>`);

  return page("MAJ VAC — connexion Dropbox", `<h1>Connecter Dropbox</h1>
<p>Colle les deux clés de ton app Dropbox <b>jarvis-majvac</b> (onglet Settings sur dropbox.com/developers), puis clique : Dropbox te demandera simplement d'autoriser l'accès.</p>
<form method="POST">
  <label>App key</label><input name="key" autocomplete="off" required>
  <label>App secret</label><input name="secret" autocomplete="off" required>
  <button type="submit">Connecter et autoriser →</button>
</form>`);
};

export const config = { path: "/api/majvac-oauth" };
