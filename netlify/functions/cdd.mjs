// JARVIS CDD — réservation de vacations ophtalmologue + demande de contrat automatique.
//
// Deux volets côté praticien (/cdd/) :
//  - CDD : des dates de vacation à réserver (premier arrivé, premier servi) ;
//  - CDI : des offres à jours fixes (ex. « Lundi et jeudi » à Sartrouville).
// Dans les deux cas : formulaire (nom, prénom, RPPS, n° sécu, adresse, contact),
// documents photographiés/importés, puis validation par la direction dans
// /cdd/admin.html → email à LK Gestion DEPUIS la boîte direction du centre
// (via Brevo, comme SIGN) : « Merci de créer le CDD/CDI pour Docteur X ».
//
// GET  /api/cdd                        → vue publique : dates + offres CDI + conditions
// GET  /api/cdd?list=1                 → (admin) tout : créneaux, offres, réservations, config
// GET  /api/cdd?doc=RESA/CLE           → (admin) télécharger un document importé
// POST /api/cdd {action:"book"}        → réserver une date (slotId) ou postuler CDI (cdiId)
// POST /api/cdd {action:"upload-doc"}  → ajouter un document à sa réservation (token)
// POST /api/cdd {action:"add-slots"}   → (admin) ajouter des dates
// POST /api/cdd {action:"remove-slot"} → (admin) retirer une date libre
// POST /api/cdd {action:"add-cdi"}     → (admin) ajouter une offre CDI (centre + jours)
// POST /api/cdd {action:"remove-cdi"}  → (admin) retirer une offre CDI
// POST /api/cdd {action:"confirm"}     → (admin) confirmer → email à LK Gestion
// POST /api/cdd {action:"reject"}      → (admin) refuser → libère la date ou l'offre
// POST /api/cdd {action:"config"}      → (admin) boîtes d'envoi par centre, destinataire
//
// Stockage Netlify Blobs (store "cdd") :
//   slots.json        dates [{id,date,centre,type,status,resaId}]
//   cdi.json          offres CDI [{id,centre,jours,status,resaId}]
//   config.json       { to, fromByCentre: {argenteuil:"direction@...", ...} }
//   resa/{id}.json    réservation (praticien, statut, docs, audit)
//   doc/{id}/{cle}    documents importés (JPEG compressé côté client ou PDF)
//
// Variables Netlify : CDD_ADMIN_CODE (code du tableau de bord, comme SIGN),
// BREVO_API_KEY + BREVO_FROM (déjà en place pour JARVIS SIGN).
import { getStore } from "@netlify/blobs";
import { randomBytes, createHash, webcrypto } from "node:crypto";
import { SEED_SLOTS, SEED_CDI } from "./cdd-seed.mjs";
import { genererContratPdf } from "./cdd-contrat.mjs";

const CENTRES = {
  argenteuil:   "ARGENTEUIL",
  sartrouville: "SARTROUVILLE",
  tremblay:     "TREMBLAY",
  antony:       "ANTONY",
  annecy:       "ANNECY",
};

// Conditions affichées telles quelles au praticien.
const CONDITIONS = {
  remuneration: "1 300 € net la journée",
  horaires: "9h00 à 19h00 (centre fermé de 13h à 14h)",
};

// Documents demandés au praticien (cle, libellé, obligatoire).
const DOCS = [
  { cle: "cni",     label: "Pièce d'identité",                       requis: true },
  { cle: "diplome", label: "Diplôme de docteur en médecine",         requis: true },
  { cle: "ordre",   label: "Attestation d'inscription à l'Ordre",    requis: true },
  { cle: "rpps",    label: "Carte / attestation RPPS",               requis: false },
  { cle: "rib",     label: "RIB",                                    requis: true },
  { cle: "secu",    label: "Attestation de sécurité sociale",        requis: false },
];

const DEST_DEFAUT = "gestionpro.lk@gmail.com"; // Laura, LK Gestion
const MAX_DOC = 4 * 1024 * 1024;   // par document (base64 ≈ 5,3 Mo, sous la limite Netlify)
const MAX_PJ_MAIL = 7_000_000;     // au-delà : liens de téléchargement au lieu de pièces jointes

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const adminOk = (req) => {
  const code = process.env.CDD_ADMIN_CODE;
  return !code || req.headers.get("x-cdd-code") === code;
};

const champ = (v, max = 200) => String(v ?? "").trim().slice(0, max);
const echapHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const dateFr = (iso) => {
  const [a, m, j] = iso.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1, j));
  const s = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

// Premier démarrage : charge les dates et offres issues des trous de
// couverture MAJ VAC, puis pose un marqueur pour ne plus jamais le refaire
// (l'admin reste seule maîtresse des données ensuite).
async function amorcer(store) {
  if (await store.get("seed.done")) return;
  if (!(await store.get("slots.json"))) await store.setJSON("slots.json", SEED_SLOTS);
  if (!(await store.get("cdi.json"))) await store.setJSON("cdi.json", SEED_CDI);
  await store.set("seed.done", "1");
}

async function lireSlots(store) {
  return (await store.get("slots.json", { type: "json" })) || [];
}
async function lireCdi(store) {
  return (await store.get("cdi.json", { type: "json" })) || [];
}
// Clé Brevo : variable Netlify en priorité, sinon la clé collée dans l'admin
// (stockée dans un blob privé séparé, jamais renvoyée au navigateur).
async function cleBrevo(store) {
  return process.env.BREVO_API_KEY || (await store.get("secret/brevo")) || "";
}

async function lireConfig(store) {
  const c = (await store.get("config.json", { type: "json" })) || {};
  return { to: c.to || DEST_DEFAUT, fromByCentre: c.fromByCentre || {}, notif: c.notif || "", remplaceByCentre: c.remplaceByCentre || {}, remplaceByCentreJour: c.remplaceByCentreJour || {}, medecinsCdi: c.medecinsCdi || {} };
}

// Centres suspendus (CDI en pourparlers, etc.) : les dates libres de ces
// centres sont masquées de la page publique et non réservables, sans rien
// supprimer. Blob suspendus.json : { "argenteuil": true, ... }
async function lireSuspendus(store) {
  return (await store.get("suspendus.json", { type: "json" })) || {};
}

// Alerte direction : email immédiat quand une réservation attend validation
// (adresse saisie dans l'admin, champ « email d'alerte »). Jamais bloquant.
async function alerterDirection(store, resa, origin) {
  try {
    const key = await cleBrevo(store);
    const cfg = await lireConfig(store);
    // Destinataires : les adresses d'alerte configurées + la boîte direction
    // du centre concerné, sans doublon.
    const dests = new Set(String(cfg.notif || "").split(/[,;\s]+/).filter((x) => x.includes("@")));
    if (cfg.fromByCentre[resa.centre]) dests.add(cfg.fromByCentre[resa.centre]);
    if (!key || !dests.size) return;
    const centreLabel = CENTRES[resa.centre] || resa.centre;
    const quand = resa.type === "CDI" ? resa.jours : dateFr(resa.date);
    const expediteur = cfg.fromByCentre[resa.centre] || process.env.BREVO_FROM;
    if (!expediteur) return;
    await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": key, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { name: "JARVIS CDD", email: expediteur },
        to: [...dests].map((email) => ({ email })),
        subject: `🩺 À valider : Dr ${resa.prenom} ${resa.nom}, ${quand} (${centreLabel})`,
        htmlContent:
          `<p><b>Dr ${echapHtml(resa.prenom)} ${echapHtml(resa.nom)}</b> vient de réserver : ` +
          `<b>${echapHtml(quand)}</b> au centre de <b>${echapHtml(centreLabel)}</b> (${echapHtml(resa.type || "CDD")}).</p>` +
          `<p>Documents importés : ${(resa.docs || []).length}.</p>` +
          `<p><a href="${origin}/cdd/admin.html" style="background:#1B6FD8;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:700;">Valider ou refuser →</a></p>` +
          `<p style="color:#888;font-size:12px;">Rien ne part chez la gestionnaire tant que tu n'as pas validé.</p>`,
      }),
    });
  } catch {}
}

// Construit le sujet et le corps HTML du mail « Merci de créer le CDD… »
// à LK Gestion. `objet` décrit ce qui a été réservé : {centre, type, date?, jours?}.
// Partagé entre l'envoi réel (envoyerDemandeContrat) et l'aperçu admin (?mail=).
function construireMailDemande(resa, objet, cfg, origin, docsEnPJ) {
  const centreLabel = CENTRES[objet.centre] || objet.centre.toUpperCase();
  const estCdi = objet.type === "CDI";
  const contrat = estCdi ? "CDI" : (objet.type || "CDD");
  const quand = estCdi ? (objet.jours || "jours à préciser") : dateFr(objet.date);

  const docte = `Docteur ${resa.prenom} ${resa.nom}`;
  const lignes = [
    ["Praticien", docte],
    ["RPPS", resa.rpps],
    ["N° de sécurité sociale", resa.secu || "non communiqué"],
    ["Adresse postale", resa.adresse],
    ["Téléphone", resa.tel || "non renseigné"],
    ["Email", resa.email || "non renseigné"],
    ["Centre", centreLabel],
    estCdi ? ["Jours fixes", quand] : ["Date de la vacation", quand],
    ["Type de contrat", contrat],
    ["Rémunération", CONDITIONS.remuneration + " (fixe)"],
    ["Horaires", CONDITIONS.horaires],
  ];
  const tableau = lignes
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#667;white-space:nowrap;">${echapHtml(k)}</td><td style="padding:4px 0;"><b>${echapHtml(v)}</b></td></tr>`)
    .join("");
  const listeDocs = (resa.docs || []).length
    ? `<p>Documents du praticien ${docsEnPJ ? "en pièces jointes" : `(volumineux, à télécharger depuis le tableau de bord JARVIS CDD : ${origin}/cdd/admin.html)`} : ${resa.docs.map((d) => echapHtml(DOCS.find((x) => x.cle === d.cle)?.label || d.cle)).join(", ")}.</p>`
    : `<p style="color:#a60;">Aucun document importé par le praticien, à réclamer.</p>`;

  const confirmeLe = resa.confirmedAt ? new Date(resa.confirmedAt) : new Date();
  // Règle Yohann (19/11) : un médecin déjà en CDI dans la structure ne signe
  // PAS de CDD pour une vacation — le mail à LK Gestion le dit clairement.
  const dejaCdi = Boolean((cfg.medecinsCdi || {})[resa.rpps]);
  if (dejaCdi) {
    const sujetCdi = `${docte} prend ${quand} (${centreLabel}) — déjà en CDI, PAS de CDD`;
    const htmlCdi =
      `<p>Bonjour Laura,</p>` +
      `<p><b>${echapHtml(docte)}</b> a pris ${estCdi ? `les jours « ${echapHtml(quand)} »` : `la journée du ${echapHtml(quand)}`} au centre de ${echapHtml(centreLabel)}.</p>` +
      `<p style="background:#E8F6EC;border:1px solid #7CC48F;border-radius:8px;padding:10px 12px;">✅ <b>Il est déjà en CDI dans la structure : aucun CDD à établir</b>, aucune démarche contrat. Simple note pour information.</p>` +
      `<p style="background:#FFF6E0;border:1px solid #E8C66B;border-radius:8px;padding:10px 12px;">⚠️ <b>Pensez à mettre à jour le planning Excel</b> (Dropbox) si ce n'est pas déjà fait.</p>` +
      `<p style="color:#888;font-size:12px;">JARVIS CDD : réservation confirmée par la direction le ${confirmeLe.toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}.</p>`;
    return { sujet: sujetCdi, html: htmlCdi, centreLabel, dejaCdi: true };
  }
  const sujet = `Merci de créer le ${contrat} pour ${docte} : ${quand} (${centreLabel})`;
  const html =
    `<p>Bonjour Laura,</p>` +
    `<p>Merci de créer le <b>${echapHtml(contrat)}</b> pour <b>${echapHtml(docte)}</b> :</p>` +
    `<table style="border-collapse:collapse;font-size:14px;">${tableau}</table>` +
    listeDocs +
    `<p style="background:#FFF6E0;border:1px solid #E8C66B;border-radius:8px;padding:10px 12px;">⚠️ <b>Pensez à mettre à jour le planning Excel</b> (Dropbox) : ${estCdi ? `les jours « ${echapHtml(quand)} »` : `la journée du ${echapHtml(quand)}`} au centre de ${echapHtml(centreLabel)} ${estCdi ? "sont désormais couverts" : "est désormais couverte"} par ${echapHtml(docte)}.</p>` +
    `<p style="color:#888;font-size:12px;">JARVIS CDD : réservation confirmée par la direction le ${confirmeLe.toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}.</p>`;
  return { sujet, html, centreLabel };
}

// Envoi réel à la validation, depuis la boîte du centre. Même mécanique que
// JARVIS SIGN : si Brevo refuse l'expéditeur (adresse non validée chez eux),
// repli sur BREVO_FROM. N'échoue jamais la confirmation : le résultat est
// consigné dans resa.notif.
async function envoyerDemandeContrat(store, resa, objet, origin) {
  const key = await cleBrevo(store);
  if (!key) { resa.notif = { skipped: "clé Brevo absente : colle-la dans l'admin (ou variable BREVO_API_KEY)" }; return; }
  const cfg = await lireConfig(store);
  const boiteCentre = cfg.fromByCentre[objet.centre];
  const secours = process.env.BREVO_FROM;

  // Pièces jointes : tous les documents importés, tant que le total tient
  // sous la limite Brevo ; sinon, liens de téléchargement (code admin requis).
  const attachment = [];
  let total = 0;
  for (const d of resa.docs || []) {
    const buf = await store.get(`doc/${resa.id}/${d.cle}`, { type: "arrayBuffer" });
    if (!buf) continue;
    const b64 = Buffer.from(buf).toString("base64");
    total += b64.length;
    if (total > MAX_PJ_MAIL) { attachment.length = 0; break; }
    attachment.push({ name: d.filename, content: b64 });
  }

  const { sujet, html, centreLabel } = construireMailDemande(resa, objet, cfg, origin, attachment.length > 0);

  const envoyer = (expediteur) => fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      sender: { name: `Direction ${centreLabel}`, email: expediteur },
      to: [{ email: cfg.to }],
      replyTo: boiteCentre ? { email: boiteCentre } : undefined,
      subject: sujet,
      htmlContent: html,
      attachment: attachment.length ? attachment : undefined,
    }),
  });

  try {
    let expediteur = boiteCentre || secours;
    if (!expediteur) { resa.notif = { skipped: "aucune boîte d'envoi : configure la boîte du centre dans l'admin ou BREVO_FROM" }; return; }
    let res = await envoyer(expediteur);
    if (!res.ok && secours && expediteur !== secours) { expediteur = secours; res = await envoyer(secours); }
    if (!res.ok) throw new Error((await res.text()).slice(0, 200));
    resa.notif = { sent: true, to: cfg.to, from: expediteur, at: new Date().toISOString() };
  } catch (e) {
    resa.notif = { error: String(e.message || e).slice(0, 200) };
  }
}

// ---------- Passkeys (Face ID / empreinte) ----------
// Enregistrement protégé par le code admin ; ensuite le navigateur prouve
// l'identité par signature (ECDSA P-256 ou RSA) et reçoit le code en retour.
const PASSKEYS_CLE = "passkeys.json";

// Signature ECDSA : WebAuthn livre du DER, WebCrypto attend r||s brut (64 octets).
function derVersRaw(der) {
  let o = 2;
  if (der[1] & 0x80) o = 2 + (der[1] & 0x7f);
  const lireInt = () => {
    if (der[o++] !== 2) throw new Error("signature invalide");
    let l = der[o++];
    let v = der.slice(o, o + l);
    o += l;
    while (v.length > 32) v = v.slice(1);
    const sortie = Buffer.alloc(32);
    v.copy(sortie, 32 - v.length);
    return sortie;
  };
  return Buffer.concat([lireInt(), lireInt()]);
}

async function verifierAssertion(cle, body, origineAttendue) {
  const authData = Buffer.from(String(body.authenticatorData || ""), "base64url");
  const cdj = Buffer.from(String(body.clientDataJSON || ""), "base64url");
  const sig = Buffer.from(String(body.signature || ""), "base64url");
  let cd;
  try { cd = JSON.parse(cdj.toString()); } catch { return false; }
  if (cd.type !== "webauthn.get" || cd.challenge !== body.challenge) return false;
  if (cd.origin !== origineAttendue) return false;
  const donnees = Buffer.concat([authData, createHash("sha256").update(cdj).digest()]);
  const spki = Buffer.from(String(cle.publicKey), "base64");
  try {
    if (cle.alg === -7) {
      const k = await webcrypto.subtle.importKey("spki", spki, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
      return await webcrypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, k, derVersRaw(sig), donnees);
    }
    if (cle.alg === -257) {
      const k = await webcrypto.subtle.importKey("spki", spki, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
      return await webcrypto.subtle.verify("RSASSA-PKCS1-v1_5", k, sig, donnees);
    }
  } catch { return false; }
  return false;
}

export default async (req) => {
  const url = new URL(req.url);
  const store = getStore("cdd");
  await amorcer(store);

  if (req.method === "GET") {
    // Téléchargement d'un document (admin)
    const doc = url.searchParams.get("doc");
    if (doc) {
      if (!adminOk(req)) return json({ error: "code admin invalide" }, 401);
      const [resaId, cle] = doc.split("/");
      const resa = await store.get(`resa/${resaId}.json`, { type: "json" });
      const meta = resa?.docs?.find((d) => d.cle === cle);
      const buf = meta && (await store.get(`doc/${resaId}/${cle}`, { type: "arrayBuffer" }));
      if (!buf) return json({ error: "document introuvable" }, 404);
      return new Response(buf, { headers: { "content-type": meta.mime || "application/octet-stream", "content-disposition": `inline; filename="${meta.filename.replace(/[^\w. -]/g, "_")}"` } });
    }

    // Aperçu du mail « Merci de créer le CDD… » d'une réservation (brouillon
    // ou mail déjà parti — reconstruit à l'identique à la demande).
    const mailId = url.searchParams.get("mail");
    if (mailId) {
      if (!adminOk(req)) return json({ error: "code admin invalide" }, 401);
      const resa = await store.get(`resa/${champ(mailId, 40)}.json`, { type: "json" });
      if (!resa) return json({ error: "réservation introuvable" }, 404);
      const cfg = await lireConfig(store);
      const objet = resa.type === "CDI"
        ? { centre: resa.centre, type: "CDI", jours: resa.jours }
        : { centre: resa.centre, type: resa.type || "CDD", date: resa.date };
      const { sujet, html } = construireMailDemande(resa, objet, cfg, url.origin, (resa.docs || []).length > 0);
      const de = cfg.fromByCentre[resa.centre] || process.env.BREVO_FROM || "(boîte du centre non configurée)";
      const etat = resa.notif?.sent ? `✅ Envoyé le ${new Date(resa.notif.at).toLocaleString("fr-FR", { timeZone: "Europe/Paris" })} depuis ${resa.notif.from}`
        : resa.notif?.error ? `❌ Échec d'envoi : ${resa.notif.error}`
        : resa.notif?.skipped ? `⚠️ Non envoyé : ${resa.notif.skipped}`
        : "📝 Brouillon — partira automatiquement à la validation";
      const page = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mail CDD — Dr ${echapHtml(resa.nom)}</title></head>` +
        `<body style="font-family:system-ui,sans-serif;max-width:720px;margin:24px auto;padding:0 16px;color:#1b2430">` +
        `<div style="background:#F2F6FB;border:1px solid #D6E2F0;border-radius:10px;padding:12px 16px;font-size:14px;line-height:1.7">` +
        `<div><b>État :</b> ${echapHtml(etat)}</div>` +
        `<div><b>De :</b> Direction — ${echapHtml(de)}</div>` +
        `<div><b>À :</b> ${echapHtml(cfg.to)}</div>` +
        `<div><b>Objet :</b> ${echapHtml(sujet)}</div></div>` +
        `<hr style="border:none;border-top:1px solid #e3e8ef;margin:18px 0">` + html + `</body></html>`;
      return new Response(page, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    // Contrat pré-rempli (brouillon) — modèle avocate « CDD rempla ophta 1 jour »,
    // décliné pour les 5 associations (cdd-contrat.mjs → ASSOS)
    const contrat = url.searchParams.get("contrat");
    if (contrat) {
      if (!adminOk(req)) return json({ error: "code admin invalide" }, 401);
      const resa = await store.get(`resa/${champ(contrat, 40)}.json`, { type: "json" });
      if (!resa) return json({ error: "réservation introuvable" }, 404);
      if (resa.type === "CDI" || !resa.date) return json({ error: "Le modèle CDI n'est pas encore configuré — contrat CDD à la date uniquement pour l'instant." }, 400);
      const cfgCdi = await lireConfig(store);
      if ((cfgCdi.medecinsCdi || {})[resa.rpps]) return json({ error: `Dr ${resa.prenom} ${resa.nom} est déjà en CDI dans la structure : pas de CDD à établir pour une vacation.` }, 400);
      const cfg = await lireConfig(store);
      const tampon = await store.get(`asset/tampon-${resa.centre}`, { type: "json" });
      const pdf = await genererContratPdf(resa, { date: resa.date, centre: resa.centre }, cfg,
        tampon?.b64 ? Buffer.from(tampon.b64, "base64") : null, tampon?.mime);
      return new Response(pdf, { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="CDD ${resa.nom.toUpperCase()} ${resa.prenom} ${resa.date}.pdf"` } });
    }

    const slots = await lireSlots(store);
    const cdis = await lireCdi(store);

    // Vue admin complète
    if (url.searchParams.get("list") === "1") {
      if (!adminOk(req)) return json({ error: "code admin invalide" }, 401);
      const resas = [];
      for (const porteur of [...slots, ...cdis]) {
        if (!porteur.resaId) continue;
        const r = await store.get(`resa/${porteur.resaId}.json`, { type: "json" });
        if (r) { delete r.upToken; resas.push(r); }
      }
      const tampons = {};
      for (const c of Object.keys(CENTRES)) tampons[c] = Boolean(await store.get(`asset/tampon-${c}`));
      const brevoPret = Boolean(await cleBrevo(store));
      return json({ slots, cdis, resas, tampons, brevoPret, suspendus: await lireSuspendus(store), config: await lireConfig(store), centres: CENTRES, docs: DOCS, conditions: CONDITIONS, adminProtege: Boolean(process.env.CDD_ADMIN_CODE) });
    }

    // Vue publique : jamais de données personnelles, uniquement dates et offres.
    // Les centres suspendus n'exposent aucune date ni offre.
    const suspendus = await lireSuspendus(store);
    return json({
      conditions: CONDITIONS,
      centres: CENTRES,
      docs: DOCS,
      enAttente: slots.filter((s) => s.status === "en_attente").length + cdis.filter((o) => o.status === "en_attente").length,
      slots: slots
        .filter((s) => !suspendus[s.centre] && s.date >= new Date().toISOString().slice(0, 10))
        .map((s) => ({ id: s.id, date: s.date, centre: s.centre, type: s.type, libre: s.status === "libre" })),
      cdi: cdis.filter((o) => !suspendus[o.centre]).map((o) => ({ id: o.id, centre: o.centre, jours: o.jours, libre: o.status === "libre" })),
    });
  }

  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: "JSON invalide" }, 400); }
  const action = body.action;

  // ---------- Public : réserver une date (CDD) ou postuler à une offre (CDI) ----------
  if (action === "book") {
    const nom = champ(body.nom, 80), prenom = champ(body.prenom, 80);
    const rpps = champ(body.rpps, 20).replace(/\D/g, "");
    const secu = champ(body.secu, 30).replace(/[^\d AB]/gi, "");
    const adresse = champ(body.adresse, 300);
    const tel = champ(body.tel, 30), email = champ(body.email, 120);
    const civilite = body.civilite === "Mme" ? "Mme" : "M";
    const dateNaissance = /^\d{4}-\d{2}-\d{2}$/.test(body.dateNaissance || "") ? body.dateNaissance : "";
    const lieuNaissance = champ(body.lieuNaissance, 80);
    const nationalite = champ(body.nationalite, 60);
    if (!nom || !prenom || !adresse) return json({ error: "Nom, prénom et adresse postale sont obligatoires." }, 400);
    if (!/^\d{11}$/.test(rpps)) return json({ error: "Le numéro RPPS doit comporter 11 chiffres." }, 400);
    if (!tel && !email) return json({ error: "Indique au moins un téléphone ou un email." }, 400);

    const id = randomBytes(8).toString("hex");
    const base = {
      id, nom, prenom, rpps, secu, adresse, tel, email,
      civilite, dateNaissance, lieuNaissance, nationalite,
      status: "en_attente", createdAt: new Date().toISOString(),
      upToken: randomBytes(12).toString("hex"), docs: [],
    };

    const suspendus = await lireSuspendus(store);

    if (body.cdiId) {
      const cdis = await lireCdi(store);
      const offre = cdis.find((o) => o.id === body.cdiId);
      if (!offre) return json({ error: "Offre introuvable." }, 404);
      if (suspendus[offre.centre]) return json({ error: "Les réservations pour ce centre sont momentanément suspendues." }, 409);
      if (offre.status !== "libre") return json({ error: "Désolé, cette offre vient d'être prise." }, 409);
      const resa = { ...base, type: "CDI", cdiId: offre.id, jours: offre.jours, centre: offre.centre };
      offre.status = "en_attente";
      offre.resaId = id;
      await store.setJSON(`resa/${id}.json`, resa);
      await store.setJSON("cdi.json", cdis);
      await alerterDirection(store, resa, url.origin);
      return json({ ok: true, resaId: id, upToken: resa.upToken });
    }

    const slots = await lireSlots(store);
    const slot = slots.find((s) => s.id === body.slotId);
    if (!slot) return json({ error: "Créneau introuvable." }, 404);
    if (suspendus[slot.centre]) return json({ error: "Les réservations pour ce centre sont momentanément suspendues." }, 409);
    if (slot.status !== "libre") return json({ error: "Désolé, ce créneau vient d'être pris." }, 409);
    const resa = { ...base, type: slot.type || "CDD", slotId: slot.id, date: slot.date, centre: slot.centre };
    slot.status = "en_attente";
    slot.resaId = id;
    await store.setJSON(`resa/${id}.json`, resa);
    await store.setJSON("slots.json", slots);
    await alerterDirection(store, resa, url.origin);
    return json({ ok: true, resaId: id, upToken: resa.upToken });
  }

  // ---------- Public : importer un document (une requête par document) ----------
  if (action === "upload-doc") {
    const resa = await store.get(`resa/${champ(body.resaId, 40)}.json`, { type: "json" });
    if (!resa || resa.upToken !== body.upToken) return json({ error: "réservation introuvable" }, 403);
    if (resa.status !== "en_attente") return json({ error: "réservation déjà traitée" }, 409);
    const cle = champ(body.cle, 20);
    if (!DOCS.some((d) => d.cle === cle)) return json({ error: "type de document inconnu" }, 400);
    const buf = Buffer.from(String(body.dataBase64 || ""), "base64");
    if (!buf.length) return json({ error: "document vide" }, 400);
    if (buf.length > MAX_DOC) return json({ error: "document trop lourd (4 Mo max)" }, 413);
    await store.set(`doc/${resa.id}/${cle}`, buf);
    resa.docs = resa.docs.filter((d) => d.cle !== cle);
    resa.docs.push({ cle, filename: champ(body.filename, 120) || `${cle}.jpg`, mime: champ(body.mime, 60) || "image/jpeg", size: buf.length });
    await store.setJSON(`resa/${resa.id}.json`, resa);
    return json({ ok: true, docs: resa.docs.map((d) => d.cle) });
  }

  // ---------- Passkeys : défi commun (public pour le login) ----------
  if (action === "passkey-challenge") {
    const challenge = randomBytes(32).toString("base64url");
    await store.setJSON(`challenge/${challenge}`, { at: Date.now() });
    const cles = (await store.get(PASSKEYS_CLE, { type: "json" })) || [];
    return json({ challenge, credIds: cles.map((c) => c.credId) });
  }

  // ---------- Passkeys : connexion par Face ID / empreinte (public) ----------
  if (action === "passkey-login") {
    const defi = await store.get(`challenge/${champ(body.challenge, 64)}`, { type: "json" });
    if (!defi || Date.now() - defi.at > 10 * 60 * 1000) return json({ error: "défi expiré, réessaie" }, 403);
    await store.delete(`challenge/${body.challenge}`);
    const cles = (await store.get(PASSKEYS_CLE, { type: "json" })) || [];
    const cle = cles.find((c) => c.credId === body.credId);
    if (!cle) return json({ error: "appareil inconnu" }, 403);
    if (!(await verifierAssertion(cle, body, url.origin))) return json({ error: "vérification refusée" }, 403);
    return json({ ok: true, code: process.env.CDD_ADMIN_CODE || "" });
  }

  // ---------- Admin ----------
  if (!adminOk(req)) return json({ error: "code admin invalide" }, 401);

  // ---------- Passkeys : enregistrement d'un appareil (code admin requis) ----------
  if (action === "passkey-register") {
    const defi = await store.get(`challenge/${champ(body.challenge, 64)}`, { type: "json" });
    if (!defi || Date.now() - defi.at > 10 * 60 * 1000) return json({ error: "défi expiré, réessaie" }, 403);
    await store.delete(`challenge/${body.challenge}`);
    const credId = champ(body.credId, 400), publicKey = champ(body.publicKey, 2000);
    const alg = Number(body.alg);
    if (!credId || !publicKey || ![-7, -257].includes(alg)) return json({ error: "données d'enregistrement invalides" }, 400);
    const cles = ((await store.get(PASSKEYS_CLE, { type: "json" })) || []).filter((c) => c.credId !== credId);
    cles.push({ credId, publicKey, alg, label: champ(body.label, 80) || "appareil", at: new Date().toISOString() });
    await store.setJSON(PASSKEYS_CLE, cles);
    return json({ ok: true, total: cles.length });
  }

  if (action === "add-slots") {
    const slots = await lireSlots(store);
    let ajoutes = 0;
    for (const d of body.dates || []) {
      const date = champ(d.date, 10), centre = champ(d.centre, 20).toLowerCase();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !CENTRES[centre]) continue;
      if (slots.some((s) => s.date === date && s.centre === centre)) continue;
      slots.push({ id: randomBytes(6).toString("hex"), date, centre, type: champ(d.type, 30) || "CDD", status: "libre", resaId: null });
      ajoutes++;
    }
    slots.sort((a, b) => a.date.localeCompare(b.date));
    await store.setJSON("slots.json", slots);
    return json({ ok: true, ajoutes, slots });
  }

  if (action === "remove-slot") {
    let slots = await lireSlots(store);
    const slot = slots.find((s) => s.id === body.slotId);
    if (slot?.resaId) {
      const resa = await store.get(`resa/${slot.resaId}.json`, { type: "json" });
      if (resa) for (const d of resa.docs || []) await store.delete(`doc/${resa.id}/${d.cle}`);
      await store.delete(`resa/${slot.resaId}.json`);
    }
    slots = slots.filter((s) => s.id !== body.slotId);
    await store.setJSON("slots.json", slots);
    return json({ ok: true, slots });
  }

  // ---------- Admin : marquer une date « déjà couverte en CDI » ----------
  // Règle Yohann (19/11) : quand un médecin déjà en CDI dans la structure
  // prend la date, on ne fait PAS de CDD — la date sort de la réservation
  // avec une simple note. Réversible avec liberer-cdi.
  if (action === "marquer-cdi" || action === "liberer-cdi") {
    const slots = await lireSlots(store);
    const slot = slots.find((x) => x.id === champ(body.slotId, 20));
    if (!slot) return json({ error: "date introuvable" }, 404);
    if (action === "marquer-cdi") {
      if (slot.resaId) return json({ error: "cette date porte déjà une réservation — traite-la d'abord" }, 409);
      slot.status = "cdi";
      slot.medecin = champ(body.medecin, 80) || "médecin en CDI";
    } else {
      if (slot.status !== "cdi") return json({ error: "cette date n'est pas marquée CDI" }, 409);
      slot.status = "libre";
      delete slot.medecin;
    }
    await store.setJSON("slots.json", slots);
    return json({ ok: true, slot });
  }

  // ---------- Admin : suspendre / réactiver d'un coup toutes les dates d'un centre ----------
  if (action === "suspendre-centre" || action === "reactiver-centre") {
    const centre = champ(body.centre, 20).toLowerCase();
    if (!CENTRES[centre]) return json({ error: "centre inconnu" }, 400);
    const suspendus = await lireSuspendus(store);
    if (action === "suspendre-centre") suspendus[centre] = true;
    else delete suspendus[centre];
    await store.setJSON("suspendus.json", suspendus);
    return json({ ok: true, suspendus });
  }

  if (action === "add-cdi") {
    const cdis = await lireCdi(store);
    const centre = champ(body.centre, 20).toLowerCase();
    const jours = champ(body.jours, 120);
    if (!CENTRES[centre]) return json({ error: "centre inconnu" }, 400);
    if (!jours) return json({ error: "Indique les jours fixes (ex. « Lundi et jeudi »)." }, 400);
    cdis.push({ id: randomBytes(6).toString("hex"), centre, jours, status: "libre", resaId: null });
    await store.setJSON("cdi.json", cdis);
    return json({ ok: true, cdis });
  }

  if (action === "remove-cdi") {
    let cdis = await lireCdi(store);
    const offre = cdis.find((o) => o.id === body.cdiId);
    if (offre?.resaId) {
      const resa = await store.get(`resa/${offre.resaId}.json`, { type: "json" });
      if (resa) for (const d of resa.docs || []) await store.delete(`doc/${resa.id}/${d.cle}`);
      await store.delete(`resa/${offre.resaId}.json`);
    }
    cdis = cdis.filter((o) => o.id !== body.cdiId);
    await store.setJSON("cdi.json", cdis);
    return json({ ok: true, cdis });
  }

  if (action === "confirm" || action === "reject") {
    const resaId = champ(body.resaId, 40);
    const slots = await lireSlots(store);
    const cdis = await lireCdi(store);
    const slot = slots.find((s) => s.resaId === resaId);
    const offre = cdis.find((o) => o.resaId === resaId);
    const resa = await store.get(`resa/${resaId}.json`, { type: "json" });
    if ((!slot && !offre) || !resa) return json({ error: "réservation introuvable" }, 404);
    if (resa.status !== "en_attente") return json({ error: "réservation déjà traitée" }, 409);

    if (action === "confirm") {
      resa.status = "confirmee";
      resa.confirmedAt = new Date().toISOString();
      if (slot) slot.status = "confirme";
      if (offre) offre.status = "pourvu";
      const objet = slot
        ? { centre: slot.centre, type: slot.type || "CDD", date: slot.date }
        : { centre: offre.centre, type: "CDI", jours: offre.jours };
      await envoyerDemandeContrat(store, resa, objet, url.origin);
    } else {
      resa.status = "refusee";
      if (slot) { slot.status = "libre"; slot.resaId = null; }     // la date redevient réservable
      if (offre) { offre.status = "libre"; offre.resaId = null; }  // l'offre redevient ouverte
    }
    await store.setJSON(`resa/${resa.id}.json`, resa);
    if (slot) await store.setJSON("slots.json", slots);
    if (offre) await store.setJSON("cdi.json", cdis);
    return json({ ok: true, notif: resa.notif || null });
  }

  // Relais de lecture (admin) : rapatrie un fichier Dropbox (lien temporaire)
  // et le renvoie tel quel. Restreint aux hôtes de téléchargement Dropbox.
  if (action === "fetch-doc") {
    let u;
    try { u = new URL(String(body.url || "")); } catch { return json({ error: "URL invalide" }, 400); }
    if (!u.hostname.endsWith(".dropboxusercontent.com")) return json({ error: "hôte non autorisé" }, 400);
    const r = await fetch(u, { redirect: "follow" });
    if (!r.ok) return json({ error: `téléchargement refusé (${r.status})` }, 502);
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 10_000_000) return json({ error: "fichier trop lourd" }, 413);
    return new Response(buf, { headers: { "content-type": r.headers.get("content-type") || "application/octet-stream" } });
  }

  // Installe un tampon depuis une URL de téléchargement (lien Dropbox temporaire) :
  // c'est le serveur qui télécharge, l'image ne transite ni par le navigateur ni par le code.
  if (action === "config-tampon-url") {
    const centre = champ(body.centre, 20).toLowerCase();
    if (!CENTRES[centre]) return json({ error: "centre inconnu" }, 400);
    try {
      const r = await fetch(String(body.url || ""), { redirect: "follow" });
      if (!r.ok) return json({ error: `téléchargement refusé (${r.status})` }, 502);
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length || buf.length > 1_500_000) return json({ error: "image vide ou trop lourde" }, 400);
      const mime = r.headers.get("content-type") || (buf[0] === 0x89 ? "image/png" : "image/jpeg");
      if (!mime.startsWith("image/")) return json({ error: `type inattendu : ${mime}` }, 400);
      await store.setJSON(`asset/tampon-${centre}`, { b64: buf.toString("base64"), mime });
      return json({ ok: true, centre, octets: buf.length, mime });
    } catch (e) {
      return json({ error: String(e.message || e).slice(0, 150) }, 502);
    }
  }

  if (action === "config-tampon") {
    const centre = champ(body.centre, 20).toLowerCase();
    if (!CENTRES[centre]) return json({ error: "centre inconnu" }, 400);
    const b64 = String(body.dataBase64 || "");
    if (!b64) return json({ error: "image vide" }, 400);
    if (b64.length > 2_000_000) return json({ error: "image trop lourde (1,5 Mo max)" }, 413);
    await store.setJSON(`asset/tampon-${centre}`, { b64, mime: champ(body.mime, 60) || "image/jpeg" });
    return json({ ok: true });
  }

  // Teste chaque boîte expéditrice : un petit mail Brevo part de chaque centre
  // vers l'adresse donnée ; le résultat par centre est renvoyé (jamais destructif).
  if (action === "test-expediteurs") {
    const key = await cleBrevo(store);
    if (!key) return json({ error: "Clé Brevo absente : colle-la dans l'admin (champ « Clé API Brevo »)." }, 500);
    const vers = champ(body.vers, 120);
    if (!vers.includes("@")) return json({ error: "destinataire invalide" }, 400);
    const cfg = await lireConfig(store);
    const resultats = {};
    for (const [centre, expediteur] of Object.entries(cfg.fromByCentre)) {
      if (!expediteur) { resultats[centre] = "aucune adresse configurée"; continue; }
      try {
        const r = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": key, "content-type": "application/json" },
          body: JSON.stringify({
            sender: { name: `Direction ${CENTRES[centre] || centre}`, email: expediteur },
            to: [{ email: vers }],
            subject: `✅ Test expéditeur JARVIS CDD : ${CENTRES[centre] || centre}`,
            htmlContent: `<p>Mail de test envoyé depuis <b>${echapHtml(expediteur)}</b> (centre ${echapHtml(CENTRES[centre] || centre)}) par JARVIS CDD. Si tu le lis dans ta boîte de réception (pas en spam), tout est bon.</p>`,
          }),
        });
        resultats[centre] = r.ok ? `OK (${expediteur})` : `ÉCHEC ${r.status} : ${(await r.text()).slice(0, 120)}`;
      } catch (e) {
        resultats[centre] = "ÉCHEC : " + String(e.message || e).slice(0, 120);
      }
    }
    return json({ ok: true, resultats });
  }

  if (action === "config") {
    const cfg = await lireConfig(store);
    if (body.to !== undefined) cfg.to = champ(body.to, 120) || DEST_DEFAUT;
    if (body.notif !== undefined) cfg.notif = champ(body.notif, 300);
    if (body.brevoApiKey) await store.set("secret/brevo", champ(body.brevoApiKey, 200));
    for (const [c, mail] of Object.entries(body.fromByCentre || {}))
      if (CENTRES[c]) cfg.fromByCentre[c] = champ(mail, 120);
    for (const [c, nom] of Object.entries(body.remplaceByCentre || {}))
      if (CENTRES[c]) cfg.remplaceByCentre[c] = champ(nom, 120);
    await store.setJSON("config.json", cfg);
    return json({ ok: true, config: cfg });
  }

  return json({ error: "action inconnue" }, 400);
};

export const config = { path: "/api/cdd" };
