// JARVIS SIGN — signature électronique maison (clone DocuSign, zéro abonnement).
//
// GET  /api/sign                      → config (code admin requis ou non)
// GET  /api/sign?list=1               → liste des demandes (admin)
// GET  /api/sign?id=&token=           → vue signataire (infos de la demande)
// GET  /api/sign?id=&token=&pdf=1     → le PDF (version signée en cours, sinon original)
// POST /api/sign {action:"create"}    → créer une demande (admin) : titre + PDF base64 + signataires
// POST /api/sign {action:"sign"}      → signer : image PNG de la signature + consentement
// POST /api/sign {action:"delete"}    → supprimer une demande et tous ses fichiers (admin)
//
// Stockage Netlify Blobs (store "sign") :
//   env/{id}.json   métadonnées de la demande (signataires, statuts, audit)
//   pdf/{id}        PDF original
//   sig/{id}/{i}    PNG de la signature du signataire i
//   signed/{id}     PDF reconstruit après chaque signature (+ certificat quand complet)
//
// Retour automatique au centre : chaque demande porte une "boîte d'envoi"
// (fromEmail — la boîte de la direction du centre qui envoie le contrat).
// Quand tous les signataires ont signé, le PDF signé est renvoyé en pièce
// jointe sur cette boîte via l'API Brevo (gratuit jusqu'à 300 emails/jour).
// Variables Netlify : BREVO_API_KEY (obligatoire pour l'envoi) et BREVO_FROM
// (adresse expéditrice validée chez Brevo). Sans clé, tout fonctionne pareil,
// simplement sans email automatique.
//
// Signature électronique "simple" au sens eIDAS : le document final embarque
// les signatures dessinées + une page de certificat (horodatage, IP, empreinte
// SHA-256 de l'original) qui constitue la piste d'audit.
import { getStore } from "@netlify/blobs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createHash, randomBytes } from "node:crypto";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

// Un PDF > ~3 Mo dépasse la limite de 6 Mo par requête Netlify (base64 inclus) :
// le tableau de bord l'envoie alors en morceaux (upload-start / upload-chunk,
// stockés sous up/{uploadId}/{i}) que "create" réassemble. Limite globale :
const MAX_PDF = 10 * 1024 * 1024;

const sha256 = (buf) => createHash("sha256").update(Buffer.from(buf)).digest("hex");

// Autorisation admin : si SIGN_ADMIN_CODE est défini sur Netlify, le tableau de
// bord doit envoyer ce code dans l'en-tête x-sign-code. Sinon accès libre
// (même modèle que le reste de l'app).
const adminOk = (req) => {
  const code = process.env.SIGN_ADMIN_CODE;
  return !code || req.headers.get("x-sign-code") === code;
};

// Les polices standard PDF n'acceptent que le Latin-1 : on remplace le reste.
const txt = (s) => String(s ?? "").replace(/[^\x20-\x7E -ÿ]/g, "?");

const dateParis = (iso) =>
  new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "medium" });

// Reconstruit le PDF signé à partir de l'original + toutes les signatures déjà
// recueillies. Idempotent : on repart de l'original à chaque fois.
async function construirePdfSigne(store, env) {
  const orig = await store.get(`pdf/${env.id}`, { type: "arrayBuffer" });
  const doc = await PDFDocument.load(orig);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const derniere = doc.getPage(doc.getPageCount() - 1);

  // Signatures : soit aux emplacements choisis à la création (posées sans
  // cadre, dans les encadrés existants du document), soit en cartouches
  // automatiques en bas de la dernière page.
  const pagesDoc = doc.getPages();
  const larg = 170, haut = 64, marge = 24;
  const parLigne = Math.max(1, Math.floor((derniere.getWidth() - marge * 2) / (larg + 12)));
  for (let i = 0; i < env.signers.length; i++) {
    const s = env.signers[i];
    if (s.status !== "signe") continue;
    const png = await store.get(`sig/${env.id}/${i}`, { type: "arrayBuffer" });
    if (!png) continue;
    const img = await doc.embedPng(png);
    const posMoi = (env.positions || []).filter((p) => p.s === i);

    if (posMoi.length) {
      // placement manuel : (x, y) en fractions de page, origine en haut à gauche
      for (const p of posMoi) {
        const pg = pagesDoc[Math.min(p.page, pagesDoc.length - 1)];
        const dims = img.scaleToFit(140, 44);
        const cx = pg.getWidth() * p.x, cy = pg.getHeight() * (1 - p.y);
        pg.drawImage(img, { x: cx - dims.width / 2, y: cy - dims.height / 2, width: dims.width, height: dims.height });
        let ty = cy - dims.height / 2 - 6;
        if ((s.mentions || []).length) {
          pg.drawText(txt(s.mentions.join(" — ")), { x: cx - 70, y: ty, size: 6, font: fontBold, color: rgb(0.18, 0.22, 0.3) });
          ty -= 7;
        }
        pg.drawText(txt(`${s.name} — ${dateParis(s.signedAt)}`), { x: cx - 70, y: ty, size: 6.5, font, color: rgb(0.25, 0.28, 0.35) });
      }
      continue;
    }

    // cartouche automatique (aucun emplacement choisi pour ce signataire)
    const col = i % parLigne, ligne = Math.floor(i / parLigne);
    const x = marge + col * (larg + 12);
    const y = marge + ligne * (haut + 26);
    const dims = img.scaleToFit(larg - 10, haut - 32);
    derniere.drawRectangle({ x, y, width: larg, height: haut, borderColor: rgb(0.55, 0.6, 0.68), borderWidth: 0.8 });
    derniere.drawImage(img, { x: x + 5, y: y + 26, width: dims.width, height: dims.height });
    if ((s.mentions || []).length)
      derniere.drawText(txt(s.mentions.join(" — ")), { x: x + 5, y: y + 15, size: 6, font: fontBold, color: rgb(0.18, 0.22, 0.3) });
    derniere.drawText(txt(`${s.name} — ${dateParis(s.signedAt)}`), { x: x + 5, y: y + 5, size: 6.5, font, color: rgb(0.25, 0.28, 0.35) });
  }

  // Paraphe : initiales de chaque signataire en bas à droite de toutes les
  // pages sauf la dernière (qui porte les signatures complètes).
  if (env.paraphe && doc.getPageCount() > 1) {
    const pages = doc.getPages();
    for (let i = 0; i < env.signers.length; i++) {
      if (env.signers[i].status !== "signe") continue;
      const png = await store.get(`par/${env.id}/${i}`, { type: "arrayBuffer" });
      if (!png) continue;
      const ini = await doc.embedPng(png);
      const d = ini.scaleToFit(46, 24);
      for (let p = 0; p < pages.length - 1; p++) {
        pages[p].drawImage(ini, {
          x: pages[p].getWidth() - 20 - 54 * (i + 1) + (54 - d.width) / 2,
          y: 14, width: d.width, height: d.height,
        });
      }
    }
  }

  // Quand tout le monde a signé : page de certificat (piste d'audit).
  if (env.signers.every((s) => s.status === "signe")) {
    const page = doc.addPage([595, 842]); // A4
    const bleu = rgb(0.05, 0.32, 0.68);
    let y = 780;
    const ligne = (label, valeur, gap = 18) => {
      page.drawText(txt(label), { x: 60, y, size: 9, font: fontBold, color: rgb(0.3, 0.34, 0.42) });
      page.drawText(txt(valeur), { x: 200, y, size: 9, font, color: rgb(0.1, 0.12, 0.16), maxWidth: 340 });
      y -= gap;
    };
    page.drawText("CERTIFICAT DE SIGNATURE ELECTRONIQUE", { x: 60, y, size: 16, font: fontBold, color: bleu });
    y -= 14;
    page.drawText("JARVIS SIGN", { x: 60, y, size: 9, font, color: rgb(0.45, 0.5, 0.58) });
    y -= 30;
    ligne("Document", env.title);
    ligne("Identifiant", env.id);
    ligne("Empreinte SHA-256", env.hashOriginal.slice(0, 32));
    ligne("(original)", env.hashOriginal.slice(32), env.paraphe ? 18 : 24);
    if (env.paraphe) ligne("Paraphe", "initiales apposées en bas de chaque page", 24);
    for (const s of env.signers) {
      page.drawText(txt(`Signataire : ${s.name}`), { x: 60, y, size: 11, font: fontBold, color: bleu });
      y -= 18;
      if (s.email) ligne("Email", s.email);
      if ((s.mentions || []).length) ligne("Mentions cochées", s.mentions.join(", "));
      ligne("Signé le", dateParis(s.signedAt));
      ligne("Adresse IP", s.ip || "inconnue");
      ligne("Navigateur", (s.ua || "inconnu").slice(0, 90), 26);
    }
    page.drawText("Signature electronique simple (eIDAS). Chaque signataire a consenti explicitement", { x: 60, y: 80, size: 8, font, color: rgb(0.45, 0.5, 0.58) });
    page.drawText("a signer ce document via un lien nominatif securise. L'empreinte SHA-256 ci-dessus", { x: 60, y: 69, size: 8, font, color: rgb(0.45, 0.5, 0.58) });
    page.drawText("permet de verifier l'integrite du document original.", { x: 60, y: 58, size: 8, font, color: rgb(0.45, 0.5, 0.58) });
    env.status = "complet";
  } else {
    env.status = env.signers.some((s) => s.status === "signe") ? "partiel" : "attente";
  }

  const octets = await doc.save();
  await store.set(`signed/${env.id}`, octets.buffer.slice(octets.byteOffset, octets.byteOffset + octets.byteLength));
  return env;
}

const echapHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Renvoie le PDF signé en pièce jointe sur la boîte d'envoi du centre.
// Ne fait jamais échouer la signature : le résultat est consigné dans env.notif.
async function notifierCompletion(store, env, origin) {
  if (!env.fromEmail) return;
  const key = process.env.BREVO_API_KEY;
  if (!key) { env.notif = { skipped: "BREVO_API_KEY non configurée sur Netlify" }; return; }
  try {
    const pdf = await store.get(`signed/${env.id}`, { type: "arrayBuffer" });
    const b64 = Buffer.from(pdf).toString("base64");
    const lien = `${origin}/api/sign?id=${env.id}&token=${env.dlToken}&pdf=1`;
    const noms = env.signers.map((s) => s.name).join(", ");
    const res = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { name: "JARVIS SIGN", email: process.env.BREVO_FROM || env.fromEmail },
        to: [{ email: env.fromEmail }],
        subject: `Document signé : ${env.title}`,
        htmlContent:
          `<p>Le document <b>${echapHtml(env.title)}</b> a été signé par tous les signataires (${echapHtml(noms)}).</p>` +
          `<p>Le PDF signé (avec certificat) est en pièce jointe. Lien de secours : <a href="${lien}">télécharger</a>.</p>` +
          `<p style="color:#888;font-size:12px;">JARVIS SIGN — signature électronique</p>`,
        attachment: b64.length < 7_000_000
          ? [{ name: env.title.replace(/[^\w. -]/g, "_") + "-signe.pdf", content: b64 }]
          : undefined,
      }),
    });
    if (!res.ok) throw new Error((await res.text()).slice(0, 200));
    env.notif = { sent: true, to: env.fromEmail, at: new Date().toISOString() };
  } catch (e) {
    env.notif = { error: String(e.message || e).slice(0, 200) };
  }
}

const vueSignataire = (env, idx) => ({
  id: env.id,
  title: env.title,
  status: env.status,
  createdAt: env.createdAt,
  mentions: env.mentions || [],
  paraphe: Boolean(env.paraphe),
  moi: { name: env.signers[idx].name, status: env.signers[idx].status, signedAt: env.signers[idx].signedAt || null },
  autres: env.signers.filter((_, i) => i !== idx).map((s) => ({ name: s.name, status: s.status })),
});

export default async (req) => {
  const store = getStore("sign");
  const url = new URL(req.url);

  if (req.method === "GET") {
    const id = url.searchParams.get("id");
    const token = url.searchParams.get("token");

    // --- Vue signataire / téléchargement PDF ---
    if (id) {
      const env = await store.get(`env/${id}.json`, { type: "json" });
      if (!env) return json({ error: "Demande introuvable" }, 404);
      const idx = env.signers.findIndex((s) => s.token === token);
      // dlToken : lien de téléchargement direct (utilisé dans l'email au centre)
      const dlOk = Boolean(token) && token === env.dlToken;
      if (idx < 0 && !dlOk && !adminOk(req)) return json({ error: "Lien invalide" }, 403);

      if (url.searchParams.get("pdf")) {
        // stream : évite la limite de 6 Mo des réponses bufferisées
        const pdf = (await store.get(`signed/${id}`, { type: "stream" })) ||
                    (await store.get(`pdf/${id}`, { type: "stream" }));
        if (!pdf) return json({ error: "PDF introuvable" }, 404);
        return new Response(pdf, {
          headers: {
            "content-type": "application/pdf",
            "content-disposition": `inline; filename="${env.title.replace(/[^\w. -]/g, "_")}.pdf"`,
          },
        });
      }
      return json(idx >= 0 ? vueSignataire(env, idx) : env);
    }

    // --- Liste (admin) ---
    if (url.searchParams.get("list")) {
      if (!adminOk(req)) return json({ error: "Code admin invalide" }, 403);
      const { blobs } = await store.list({ prefix: "env/" });
      const envs = [];
      for (const b of blobs) {
        const e = await store.get(b.key, { type: "json" });
        if (e) envs.push(e);
      }
      envs.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return json({ envelopes: envs });
    }

    // --- Config pour le tableau de bord ---
    return json({ ok: true, adminRequired: Boolean(process.env.SIGN_ADMIN_CODE) });
  }

  if (req.method === "POST") {
    const body = await req.json().catch(() => null);
    if (!body) return json({ error: "JSON invalide" }, 400);

    // --- Téléversement en morceaux (PDF > ~2 Mo) ---
    if (body.action === "upload-start") {
      if (!adminOk(req)) return json({ error: "Code admin invalide" }, 403);
      const uploadId = randomBytes(8).toString("hex");
      const uploadToken = randomBytes(16).toString("hex");
      await store.setJSON(`up/${uploadId}/meta`, { token: uploadToken, at: new Date().toISOString() });
      return json({ uploadId, uploadToken });
    }
    if (body.action === "upload-chunk") {
      const meta = await store.get(`up/${body.uploadId}/meta`, { type: "json" });
      if (!meta || meta.token !== body.uploadToken) return json({ error: "Téléversement invalide" }, 403);
      const part = Buffer.from(String(body.dataBase64 || ""), "base64");
      if (!part.length || part.length > 4 * 1024 * 1024) return json({ error: "Morceau invalide" }, 400);
      await store.set(`up/${body.uploadId}/${Number(body.index) || 0}`, part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength));
      return json({ ok: true });
    }

    // --- Création d'une demande (admin) ---
    if (body.action === "create") {
      if (!adminOk(req)) return json({ error: "Code admin invalide" }, 403);
      const { title, pdfBase64, signers, fromEmail, mentions, paraphe, positions } = body;
      if (!title || (!pdfBase64 && !body.uploadId) || !Array.isArray(signers) || !signers.length)
        return json({ error: "Titre, PDF et au moins un signataire requis" }, 400);
      if (signers.some((s) => !s.name || !String(s.name).trim()))
        return json({ error: "Chaque signataire doit avoir un nom" }, 400);

      let pdf;
      if (body.uploadId) {
        // réassemblage des morceaux téléversés
        const meta = await store.get(`up/${body.uploadId}/meta`, { type: "json" });
        if (!meta || meta.token !== body.uploadToken) return json({ error: "Téléversement invalide" }, 403);
        const parts = [];
        const n = Math.min(Number(body.chunks) || 0, 40);
        for (let i = 0; i < n; i++) {
          const p = await store.get(`up/${body.uploadId}/${i}`, { type: "arrayBuffer" });
          if (!p) return json({ error: `Morceau ${i + 1}/${n} manquant, réessayez l'envoi` }, 400);
          parts.push(Buffer.from(p));
        }
        pdf = Buffer.concat(parts);
        for (let i = 0; i < n; i++) await store.delete(`up/${body.uploadId}/${i}`);
        await store.delete(`up/${body.uploadId}/meta`);
      } else {
        pdf = Buffer.from(pdfBase64, "base64");
      }
      if (!pdf.length || pdf.length > MAX_PDF)
        return json({ error: `PDF trop lourd (max ${Math.round(MAX_PDF / 1024 / 1024)} Mo)` }, 400);
      try {
        await PDFDocument.load(pdf); // vérifie que c'est bien un PDF lisible
      } catch {
        return json({ error: "Le fichier n'est pas un PDF valide" }, 400);
      }

      const id = randomBytes(8).toString("hex");
      const env = {
        id,
        title: String(title).slice(0, 120),
        createdAt: new Date().toISOString(),
        hashOriginal: sha256(pdf),
        fromEmail: String(fromEmail || "").slice(0, 120),
        // mentions manuscrites requises (ex : "Lu et approuvé") et paraphe de chaque page
        mentions: Array.isArray(mentions) ? mentions.slice(0, 3).map((m) => String(m).slice(0, 60)) : [],
        paraphe: Boolean(paraphe),
        // emplacements de signature choisis à la création : {s: index signataire,
        // page (0-based), x/y en fractions de page (origine haut-gauche)}
        positions: Array.isArray(positions)
          ? positions.slice(0, 32)
              .filter((p) => p && Number.isInteger(p.s) && p.s >= 0 && p.s < Math.min(signers.length, 8) && Number.isFinite(p.x) && Number.isFinite(p.y))
              .map((p) => ({ s: p.s, page: Math.max(0, Math.floor(p.page || 0)), x: Math.min(1, Math.max(0, p.x)), y: Math.min(1, Math.max(0, p.y)) }))
          : [],
        dlToken: randomBytes(16).toString("hex"),
        status: "attente",
        signers: signers.slice(0, 8).map((s) => ({
          name: String(s.name).slice(0, 80),
          email: String(s.email || "").slice(0, 120),
          token: randomBytes(16).toString("hex"),
          status: "attente",
        })),
      };
      await store.set(`pdf/${id}`, pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength));
      await store.setJSON(`env/${id}.json`, env);
      return json({ envelope: env });
    }

    // --- Signature ---
    if (body.action === "sign") {
      const { id, token, signaturePng, consent } = body;
      const env = await store.get(`env/${id}.json`, { type: "json" });
      if (!env) return json({ error: "Demande introuvable" }, 404);
      const idx = env.signers.findIndex((s) => s.token === token);
      if (idx < 0) return json({ error: "Lien invalide" }, 403);
      if (env.signers[idx].status === "signe") return json({ error: "Vous avez déjà signé ce document" }, 409);
      if (!consent) return json({ error: "Le consentement est obligatoire" }, 400);
      if ((env.mentions || []).length && body.mentionsAccepted !== true)
        return json({ error: "Vous devez cocher les mentions requises" }, 400);
      const m = /^data:image\/png;base64,(.+)$/.exec(signaturePng || "");
      if (!m) return json({ error: "Signature manquante" }, 400);
      let paraphePng = null;
      if (env.paraphe) {
        const mp = /^data:image\/png;base64,(.+)$/.exec(body.paraphePng || "");
        if (!mp) return json({ error: "Le paraphe (initiales) est requis" }, 400);
        paraphePng = Buffer.from(mp[1], "base64");
      }

      const png = Buffer.from(m[1], "base64");
      await store.set(`sig/${id}/${idx}`, png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength));
      if (paraphePng) await store.set(`par/${id}/${idx}`, paraphePng.buffer.slice(paraphePng.byteOffset, paraphePng.byteOffset + paraphePng.byteLength));
      env.signers[idx].mentions = env.mentions || [];
      env.signers[idx].status = "signe";
      env.signers[idx].signedAt = new Date().toISOString();
      env.signers[idx].ip = req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for") || "";
      env.signers[idx].ua = req.headers.get("user-agent") || "";

      await construirePdfSigne(store, env);
      if (env.status === "complet") await notifierCompletion(store, env, url.origin);
      await store.setJSON(`env/${id}.json`, env);
      return json(vueSignataire(env, idx));
    }

    // --- Suppression d'une demande (admin) ---
    if (body.action === "delete") {
      if (!adminOk(req)) return json({ error: "Code admin invalide" }, 403);
      const { id } = body;
      const env = await store.get(`env/${id}.json`, { type: "json" });
      if (!env) return json({ error: "Demande introuvable" }, 404);
      for (let i = 0; i < env.signers.length; i++) { await store.delete(`sig/${id}/${i}`); await store.delete(`par/${id}/${i}`); }
      await store.delete(`signed/${id}`);
      await store.delete(`pdf/${id}`);
      await store.delete(`env/${id}.json`);
      return json({ deleted: id });
    }

    return json({ error: "Action inconnue" }, 400);
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config = { path: "/api/sign" };
