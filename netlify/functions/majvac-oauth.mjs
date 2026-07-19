// Page d'autorisation Dropbox pour MAJ VAC — à utiliser UNE FOIS lors de la configuration.
// 1. Sans paramètre : redirige vers l'écran d'autorisation Dropbox.
// 2. Retour avec ?code= : échange le code contre le refresh token et l'affiche.
// À SUPPRIMER une fois DROPBOX_REFRESH_TOKEN configurée sur Netlify.

const page = (titre, corps) =>
  new Response(
    `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titre}</title>
<style>body{background:#04060C;color:#C8D6E5;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:20px}
.card{max-width:560px;background:rgba(10,16,28,.85);border:1px solid rgba(79,216,235,.25);border-radius:14px;padding:26px}
h1{color:#EAF4FF;font-size:19px;margin:0 0 14px}
p{line-height:1.55;font-size:15px;margin:0 0 12px}
code{display:block;background:rgba(255,255,255,.07);border-radius:8px;padding:12px;word-break:break-all;color:#4FD8EB;font-size:13px;margin:10px 0;user-select:all}
.ok{color:#33d17a}.err{color:#FF5D6C}</style></head><body><div class="card">${corps}</div></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );

export default async (req) => {
  const url = new URL(req.url);
  const key = process.env.DROPBOX_APP_KEY;
  const secret = process.env.DROPBOX_APP_SECRET;
  if (!key || !secret)
    return page("MAJ VAC — configuration", `<h1 class="err">Pas encore prêt</h1><p>Les variables <b>DROPBOX_APP_KEY</b> et <b>DROPBOX_APP_SECRET</b> ne sont pas encore configurées sur Netlify. Réessaie dans quelques minutes.</p>`);

  const redirectUri = `${url.origin}/api/majvac-oauth`;
  const code = url.searchParams.get("code");

  if (!code) {
    const authorize =
      `https://www.dropbox.com/oauth2/authorize?client_id=${encodeURIComponent(key)}` +
      `&response_type=code&token_access_type=offline&redirect_uri=${encodeURIComponent(redirectUri)}`;
    return Response.redirect(authorize, 302);
  }

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
    return page("MAJ VAC — erreur", `<h1 class="err">Échec de l'autorisation</h1><p>${data.error_description || data.error || "Erreur inconnue"}.</p><p>Recommence en rouvrant <b>${redirectUri}</b> (le code Dropbox n'est valable qu'une seule fois).</p>`);

  return page("MAJ VAC — connexion réussie", `<h1 class="ok">✅ Dropbox connecté</h1>
<p>Voici ton <b>refresh token</b>. Copie-le (appui long → tout sélectionner → copier) et colle-le dans la conversation avec Claude, qui terminera la configuration :</p>
<code>${data.refresh_token}</code>
<p>⚠️ Ce jeton donne accès en lecture à ta Dropbox : ne le partage avec personne d'autre.</p>`);
};

export const config = { path: "/api/majvac-oauth" };
