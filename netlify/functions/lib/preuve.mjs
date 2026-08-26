// JARVIS SIGN — bibliothèque du dossier de preuve légal.
//
// Regroupe les briques probatoires utilisées par /api/sign et le cron :
//   - chiffrement applicatif AES-256-GCM (clé PREUVE_CLE_AES, séparée des données)
//   - journal d'événements en UTC, en append-only (evt/{id})
//   - OTP SMS : génération cryptographique, hash bcrypt, envoi via Brevo
//   - horodatage RFC 3161 : requête DER, appel de l'autorité, jeton + chaîne
//   - clauses d'acceptation expresse versionnées, substitution côté serveur
//   - alertes email au gestionnaire (Brevo)
//   - construction déterministe du dossier de preuve PDF
//
// Endpoints externes surchargables par variables d'environnement pour les
// tests (BREVO_API_BASE, TSA_URL, TSA_URL_SECOURS, TSA_CHAIN_URL).
import { createHash, createCipheriv, createDecipheriv, randomBytes, randomInt, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export const BREVO_BASE = () => process.env.BREVO_API_BASE || "https://api.brevo.com";
export const TSA_URL = () => process.env.TSA_URL || "http://zeitstempel.dfn.de";
export const TSA_URL_SECOURS = () => process.env.TSA_URL_SECOURS || "https://freetsa.org/tsr";
export const TSA_CHAIN_URL = () => process.env.TSA_CHAIN_URL || "https://pki.pca.dfn.de/dfn-ca-global-g2/pub/cacert/chain.txt";

// ---------- empreintes et chiffrement ----------
export const sha256hex = (buf) => createHash("sha256").update(Buffer.from(buf)).digest("hex");

// AES-256-GCM : sortie = iv(12) | tag(16) | chiffré. La clé (32 octets hex)
// vit dans la variable d'environnement PREUVE_CLE_AES, jamais avec les données.
export function chiffrer(buf, cleHex = process.env.PREUVE_CLE_AES) {
  if (!cleHex) throw new Error("PREUVE_CLE_AES non configurée");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", Buffer.from(cleHex, "hex"), iv);
  const chiffre = Buffer.concat([c.update(Buffer.from(buf)), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), chiffre]);
}
export function dechiffrer(buf, cleHex = process.env.PREUVE_CLE_AES) {
  if (!cleHex) throw new Error("PREUVE_CLE_AES non configurée");
  const b = Buffer.from(buf);
  const d = createDecipheriv("aes-256-gcm", Buffer.from(cleHex, "hex"), b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]);
}

const versArrayBuffer = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
export const ecrireBlobChiffre = async (store, cle, buf) => store.set(cle, versArrayBuffer(chiffrer(buf)));
export async function lireBlobChiffre(store, cle) {
  const b = await store.get(cle, { type: "arrayBuffer" });
  return b ? dechiffrer(Buffer.from(b)) : null;
}

// ---------- journal d'événements (append-only, UTC) ----------
export async function journaliser(store, id, type, data = {}) {
  const cle = `evt/${id}`;
  const journal = (await store.get(cle, { type: "json" })) || [];
  journal.push({ t: new Date().toISOString(), type, ...data });
  await store.setJSON(cle, journal);
  return journal;
}
export const lireJournal = async (store, id) => (await store.get(`evt/${id}`, { type: "json" })) || [];

// Journal d'accès aux dossiers de preuve (RGPD : qui a consulté quoi, quand)
export async function journaliserAcces(store, id, quoi, ip, ua) {
  await journaliser(store, id, "acces_preuve", { quoi, ip: ip || "", ua: (ua || "").slice(0, 160) });
}

// ---------- téléphone E.164 ----------
export function normaliserTel(brut) {
  let t = String(brut || "").replace(/[\s.\-()]/g, "");
  if (/^0[67]\d{8}$/.test(t)) t = "+33" + t.slice(1);
  return /^\+[1-9]\d{7,14}$/.test(t) ? t : null;
}
export const masquerTel = (t) => (t ? t.slice(0, 4) + "******" + t.slice(-2) : "");

// ---------- OTP SMS ----------
export const genererOtp = () => String(randomInt(0, 1_000_000)).padStart(6, "0"); // CSPRNG (node:crypto)
export const hasherOtp = (code) => bcrypt.hashSync(code, 10); // jamais stocké en clair
export const verifierOtp = (code, hash) => bcrypt.compareSync(String(code || ""), hash || ""); // comparaison bcrypt (non sensible au timing sur le code)

export async function envoyerSms(tel, contenu) {
  const cle = process.env.BREVO_API_KEY;
  if (!cle) throw new Error("BREVO_API_KEY non configurée (SMS indisponible)");
  const res = await fetch(BREVO_BASE() + "/v3/transactionalSMS/sms", {
    method: "POST",
    headers: { "api-key": cle, "content-type": "application/json" },
    body: JSON.stringify({ type: "transactional", sender: "JARVISSIGN", recipient: tel, content: contenu }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Envoi SMS refusé (" + res.status + ") : " + JSON.stringify(data).slice(0, 160));
  return { messageId: String(data.messageId || data.reference || ""), statut: "envoye" };
}

// ---------- alerte email au gestionnaire ----------
export async function alerter(destinataire, sujet, html) {
  const cle = process.env.BREVO_API_KEY;
  if (!cle || !destinataire) return false;
  try {
    const res = await fetch(BREVO_BASE() + "/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": cle, "content-type": "application/json" },
      body: JSON.stringify({
        sender: { name: "JARVIS SIGN — Alerte", email: process.env.BREVO_FROM || destinataire },
        to: [{ email: destinataire }],
        subject: "⚠ " + sujet,
        htmlContent: html + '<p style="color:#888;font-size:12px;">JARVIS SIGN — module probatoire</p>',
      }),
    });
    return res.ok;
  } catch { return false; }
}

// ---------- RFC 3161 : requête d'horodatage ----------
// Construction DER manuelle de TimeStampReq (version 1, SHA-256, certReq=true).
const derLen = (n) => n < 0x80 ? Buffer.from([n]) : n < 0x100 ? Buffer.from([0x81, n]) : Buffer.from([0x82, n >> 8, n & 0xff]);
const derTlv = (tag, contenu) => Buffer.concat([Buffer.from([tag]), derLen(contenu.length), contenu]);
const OID_SHA256 = Buffer.from([0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01]);

export function construireRequeteTsa(hashHex) {
  const hash = Buffer.from(hashHex, "hex");
  if (hash.length !== 32) throw new Error("hash SHA-256 attendu (32 octets)");
  const algo = derTlv(0x30, Buffer.concat([OID_SHA256, Buffer.from([0x05, 0x00])])); // AlgorithmIdentifier + NULL
  const imprint = derTlv(0x30, Buffer.concat([algo, derTlv(0x04, hash)]));           // MessageImprint
  return derTlv(0x30, Buffer.concat([
    derTlv(0x02, Buffer.from([0x01])), // version 1
    imprint,
    derTlv(0x01, Buffer.from([0xff])), // certReq TRUE : le jeton embarque le certificat du signataire TSA
  ]));
}

// Lecture DER minimale : {tag, longueurEntete, longueurContenu}
function lireTlv(buf, off) {
  const tag = buf[off];
  let l = buf[off + 1], entete = 2;
  if (l & 0x80) {
    const n = l & 0x7f;
    l = 0;
    for (let i = 0; i < n; i++) l = (l << 8) | buf[off + 2 + i];
    entete = 2 + n;
  }
  return { tag, entete, longueur: l };
}

// Extrait le TimeStampToken de la TimeStampResp et vérifie le statut PKI (0 ou 1).
export function extraireJeton(repDer) {
  const rep = Buffer.from(repDer);
  const ext = lireTlv(rep, 0);
  if (ext.tag !== 0x30) throw new Error("réponse TSA invalide");
  let off = ext.entete;
  const statutSeq = lireTlv(rep, off);
  const statutInt = lireTlv(rep, off + statutSeq.entete);
  const statut = rep[off + statutSeq.entete + statutInt.entete];
  if (statut !== 0 && statut !== 1) throw new Error("horodatage refusé par l'autorité (statut PKI " + statut + ")");
  off += statutSeq.entete + statutSeq.longueur;
  if (off >= ext.entete + ext.longueur) throw new Error("réponse TSA sans jeton");
  const jeton = lireTlv(rep, off);
  return rep.subarray(off, off + jeton.entete + jeton.longueur);
}

// Demande un jeton à l'autorité (principale puis secours). Retourne aussi la
// chaîne de confiance publiée par l'autorité pour vérification hors ligne.
export async function demanderHorodatage(hashHex) {
  const requete = construireRequeteTsa(hashHex);
  const urls = [TSA_URL(), TSA_URL_SECOURS()].filter(Boolean);
  let derniereErreur = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/timestamp-query" },
        body: requete,
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error("TSA " + url + " : HTTP " + res.status);
      const reponse = Buffer.from(await res.arrayBuffer());
      const jeton = extraireJeton(reponse);
      let chaine = "";
      try {
        const rc = await fetch(TSA_CHAIN_URL(), { signal: AbortSignal.timeout(10000) });
        if (rc.ok) chaine = await rc.text();
      } catch {}
      return { jetonDer: jeton, reponseDer: reponse, tsaUrl: url, chainePem: chaine };
    } catch (e) { derniereErreur = e; }
  }
  throw new Error("Autorité d'horodatage injoignable : " + String(derniereErreur?.message || derniereErreur).slice(0, 160));
}

// Back-off de reprise : minutes après l'échec initial (spec Module 2)
export const BACKOFF_MINUTES = [1, 5, 15, 60, 360];

// ---------- clauses d'acceptation expresse (Module 6) ----------
export const TYPES_DOCUMENT = {
  renouvellement_essai: "Renouvellement de période d'essai",
  avenant: "Avenant au contrat de travail",
  contrat_travail: "Contrat de travail",
  rupture_conventionnelle: "Rupture conventionnelle",
  note_service: "Note de service / document informatif",
};

export const CLAUSES_DEFAUT = {
  renouvellement_essai: "Je soussigné(e) [NOM PRÉNOM] déclare avoir pris connaissance de la présente lettre et accepter expressément le renouvellement de ma période d'essai pour une durée de [DURÉE], soit jusqu'au [DATE FIN].",
  avenant: "Je soussigné(e) [NOM PRÉNOM] déclare avoir pris connaissance du présent avenant et en accepter expressément l'ensemble des termes, qui prendront effet au [DATE EFFET].",
  contrat_travail: "Je soussigné(e) [NOM PRÉNOM] déclare avoir pris connaissance de l'intégralité du présent contrat, en accepter expressément les termes, et reconnaître en avoir reçu un exemplaire.",
  rupture_conventionnelle: "Je soussigné(e) [NOM PRÉNOM] déclare avoir pris connaissance de la présente convention, en accepter expressément les termes, reconnaître en avoir reçu un exemplaire, et avoir été informé(e) de mon droit de rétractation de quinze jours calendaires courant à compter de ce jour.",
  note_service: "Je soussigné(e) [NOM PRÉNOM] reconnais avoir pris connaissance du présent document.",
};

export const MENTION_ATTENDUE = "Bon pour accord";
export const mentionConforme = (saisie) =>
  String(saisie || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "") ===
  MENTION_ATTENDUE.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Clause versionnée : lit la version en base (éditable admin), sinon défaut v1.
export async function clauseCourante(store, typeDoc) {
  const enBase = await store.get(`clauses/${typeDoc}`, { type: "json" });
  if (enBase && enBase.texte) return enBase; // {version, texte}
  return { version: 1, texte: CLAUSES_DEFAUT[typeDoc] || CLAUSES_DEFAUT.note_service };
}

// Substitution des variables côté serveur, jamais côté client.
// Toute variable [X] non substituée est une erreur bloquante.
export function rendreClause(texte, variables) {
  let rendu = texte;
  for (const [cle, valeur] of Object.entries(variables || {})) {
    rendu = rendu.split("[" + cle + "]").join(String(valeur));
  }
  const restes = rendu.match(/\[[A-ZÀ-Ü ÉÈ_]{2,}\]/g);
  if (restes) throw new Error("Variables de clause non substituées : " + restes.join(", "));
  return rendu;
}

// Durées de conservation par défaut (jours), paramétrables à la création.
export const RETENTION_DEFAUT = {
  contrat_travail: 5 * 365, avenant: 5 * 365, renouvellement_essai: 5 * 365,
  rupture_conventionnelle: 5 * 365, note_service: 2 * 365,
};

// ---------- rendu des dates ----------
export const dateFrEtUtc = (iso) => {
  const local = new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "long", timeStyle: "medium" });
  return `${local} (heure de Paris) — ${iso} (UTC)`;
};

// ---------- dossier de preuve PDF (Module 4) ----------
// Fonction DÉTERMINISTE : ne dépend que de env + journal (aucune horloge, aucun aléa).
const LIBELLES_EVT = {
  creation: "Création de la demande de signature",
  envoi_notification: "Envoi de la notification au signataire",
  ouverture: "Ouverture du document par le signataire",
  document_servi: "Document transmis au signataire (empreinte contrôlée)",
  otp_envoi: "Envoi du code OTP par SMS",
  otp_livraison: "Statut de livraison du SMS",
  otp_tentative: "Tentative de saisie du code OTP",
  clause_acceptee: "Acceptation expresse de la clause",
  signature: "Validation de la signature",
  horodatage_obtenu: "Obtention du jeton d'horodatage RFC 3161",
  horodatage_echec: "Échec d'obtention du jeton d'horodatage",
  copie_envoyee: "Envoi de la copie signée au signataire",
  copie_relance: "Relance d'envoi de la copie signée",
  copie_telechargee: "Téléchargement de la copie via le lien de secours",
  incident: "INCIDENT DE SÉCURITÉ",
  annulation: "Annulation de la demande",
  acces_preuve: "Consultation du dossier de preuve",
  finalisation: "Finalisation du dossier de preuve",
};

export async function construireDossierPreuve(store, env) {
  const journal = await lireJournal(store, env.id);
  const doc = await PDFDocument.create();
  const police = await doc.embedFont(StandardFonts.Helvetica);
  const gras = await doc.embedFont(StandardFonts.HelveticaBold);
  const bleu = rgb(0.05, 0.32, 0.68), noir = rgb(0.1, 0.12, 0.16), gris = rgb(0.4, 0.44, 0.52);
  // les polices standard PDF sont limitées au Latin-1 : on translittère
  // les signes typographiques plutôt que de les remplacer par « ? »
  const txt = (s) => String(s ?? "")
    .replace(/[—–]/g, "-").replace(/[«»""]/g, '"').replace(/['']/g, "'").replace(/…/g, "...")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "?");

  const nouvellePage = (titre) => {
    const p = doc.addPage([595, 842]);
    p.drawText("DOSSIER DE PREUVE - JARVIS SIGN", { x: 50, y: 806, size: 9, font: gras, color: gris });
    p.drawText(txt(titre), { x: 50, y: 780, size: 15, font: gras, color: bleu });
    p.drawText(txt("Dossier " + (env.preuve?.uuid || "")), { x: 340, y: 806, size: 8, font: police, color: gris });
    return { page: p, y: 750 };
  };
  const ligne = (ctx, label, valeur, taille = 9) => {
    ctx.page.drawText(txt(label), { x: 50, y: ctx.y, size: taille, font: gras, color: gris });
    const mots = txt(valeur).split(" ");
    let lig = "", lignes = [];
    for (const m of mots) { if ((lig + " " + m).length > 72) { lignes.push(lig); lig = m; } else lig = lig ? lig + " " + m : m; }
    lignes.push(lig);
    for (const l of lignes) { ctx.page.drawText(l, { x: 215, y: ctx.y, size: taille, font: police, color: noir }); ctx.y -= 13; }
    ctx.y -= 3;
  };

  // ----- Page 1 : synthèse -----
  let ctx = nouvellePage("Page 1 - Synthèse");
  ligne(ctx, "Identifiant du dossier", env.preuve?.uuid || "");
  ligne(ctx, "Nature du document", TYPES_DOCUMENT[env.preuve?.type] || env.preuve?.type || "");
  ligne(ctx, "Document signé", env.title);
  ligne(ctx, "Entité émettrice", env.preuve?.emetteur || "");
  ligne(ctx, "Gestionnaire", env.preuve?.gestionnaire || env.fromEmail || "");
  for (const s of env.signers) ligne(ctx, "Signataire", s.name + (s.email ? " <" + s.email + ">" : ""));
  const evtsSignature = journal.filter((e) => e.type === "signature");
  for (const e of evtsSignature) ligne(ctx, "Signature", (e.signataire || "") + " - " + dateFrEtUtc(e.t));
  ligne(ctx, "Statut", env.status === "complet" ? "Signature complète" : env.status === "annule" ? "Annulée" : "Signature partielle");
  ligne(ctx, "Empreinte SHA-256 finale", env.preuve?.hashFinal || "");
  ligne(ctx, "Horodatage qualifié", env.preuve?.tsa
    ? "Jeton RFC 3161 délivré par " + env.preuve.tsa.url + " sur l'empreinte finale (jeton en annexe)"
    : "NON OBTENU - dossier non finalisé");

  // ----- Page 2 : chronologie -----
  ctx = nouvellePage("Page 2 - Chronologie détaillée (UTC)");
  for (const e of journal) {
    if (ctx.y < 60) ctx = nouvellePage("Page 2 (suite) - Chronologie");
    const detail = [e.signataire, e.statut, e.resultat, e.messageId && "id:" + e.messageId, e.quoi, e.detail]
      .filter(Boolean).join(" - ");
    ctx.page.drawText(txt(e.t), { x: 50, y: ctx.y, size: 8, font: police, color: gris });
    ctx.page.drawText(txt((LIBELLES_EVT[e.type] || e.type) + (detail ? " (" + detail + ")" : "")).slice(0, 105), { x: 175, y: ctx.y, size: 8, font: e.type === "incident" ? gras : police, color: e.type === "incident" ? rgb(0.8, 0.1, 0.1) : noir });
    ctx.y -= 12;
  }
  const ouverture = journal.find((e) => e.type === "ouverture");
  const validation = evtsSignature[0];
  if (ouverture && validation) {
    ctx.y -= 8;
    const duree = Math.round((new Date(validation.t) - new Date(ouverture.t)) / 1000);
    ligne(ctx, "Durée de consultation", Math.floor(duree / 60) + " min " + (duree % 60) + " s (première ouverture -> première validation)");
  }

  // ----- Page 3 : éléments techniques -----
  ctx = nouvellePage("Page 3 - Éléments techniques");
  for (const s of env.signers) {
    ligne(ctx, "Signataire", s.name);
    if (s.ip) ligne(ctx, "Adresse IP (signature)", s.ip);
    if (s.ua) ligne(ctx, "Navigateur", s.ua.slice(0, 140));
    if (s.ecran) ligne(ctx, "Écran / appareil", s.ecran);
    if (s.email) ligne(ctx, "Email", s.email);
    if (s.tel) ligne(ctx, "Téléphone OTP", masquerTel(s.tel));
    if (s.otp?.messageId) ligne(ctx, "Livraison SMS", "identifiant " + s.otp.messageId + (s.otp.statutLivraison ? " - " + s.otp.statutLivraison : ""));
    if (s.clauseTexte) ligne(ctx, "Clause acceptée (v" + (s.clauseVersion || 1) + ")", s.clauseTexte);
    if (s.mentionTapee) ligne(ctx, "Mention saisie au clavier", '"' + s.mentionTapee + '"');
    if (s.hashApres) ligne(ctx, "Empreinte après sa signature", s.hashApres);
    ctx.y -= 6;
  }
  ligne(ctx, "Empreinte source", env.preuve?.hashSource || env.hashOriginal || "");
  ligne(ctx, "Empreinte présentée", env.preuve?.hashPresente || "");
  ligne(ctx, "Empreinte finale", env.preuve?.hashFinal || "");
  if (env.preuve?.tsa?.empreinteChaine) ligne(ctx, "Empreinte chaîne TSA", env.preuve.tsa.empreinteChaine);

  // ----- Page 4 : vérification indépendante -----
  ctx = nouvellePage("Page 4 - Vérification indépendante");
  const etapes = [
    "Ce dossier permet une vérification SANS accès à l'application JARVIS SIGN.",
    "",
    "1. Extraire les pièces jointes de ce PDF (icône trombone du lecteur, ou :",
    "   pdfdetach -saveall DossierPreuve.pdf) :",
    "   - document-signe.pdf : le document signé",
    "   - horodatage.tsr : le jeton RFC 3161",
    "   - chaine-tsa.pem : la chaîne de confiance de l'autorité",
    "",
    "2. Vérifier l'empreinte du document signé :",
    "   sha256sum document-signe.pdf",
    "   Le résultat doit être exactement :",
    "   " + (env.preuve?.hashFinal || ""),
    "",
    "3. Vérifier le jeton d'horodatage (OpenSSL) :",
    "   openssl ts -verify -digest " + (env.preuve?.hashFinal || "") + " \\",
    "     -in horodatage.tsr -token_in -CAfile chaine-tsa.pem -untrusted chaine-tsa.pem",
    "   La réponse attendue est : Verification: OK",
    "",
    "4. Lire la date certifiée par l'autorité :",
    "   openssl ts -reply -in horodatage.tsr -token_in -text",
    "   Le champ 'Time stamp' est la date opposable de l'empreinte finale.",
    "",
    "Toute modification d'un seul octet de document-signe.pdf fait échouer",
    "les étapes 2 et 3 : l'intégrité et la date sont ainsi démontrées",
    "indépendamment de l'application et de son exploitant.",
  ];
  for (const l of etapes) { ctx.page.drawText(txt(l), { x: 50, y: ctx.y, size: 9, font: l.startsWith("   ") ? police : police, color: noir }); ctx.y -= 13; }

  // ----- Annexes en pièces jointes embarquées -----
  const pdfFinal = env.preuve?.chiffre ? await lireBlobChiffre(store, `final/${env.id}`) : Buffer.from(await store.get(`signed/${env.id}`, { type: "arrayBuffer" }));
  if (pdfFinal) await doc.attach(new Uint8Array(pdfFinal), "document-signe.pdf", { mimeType: "application/pdf", description: "Document signé (empreinte en page 1)" });
  const jeton = await store.get(`tsa/${env.id}`, { type: "arrayBuffer" });
  if (jeton) await doc.attach(new Uint8Array(jeton), "horodatage.tsr", { mimeType: "application/timestamp-token", description: "Jeton RFC 3161" });
  if (env.preuve?.tsa?.chainePem) await doc.attach(new TextEncoder().encode(env.preuve.tsa.chainePem), "chaine-tsa.pem", { mimeType: "application/x-pem-file", description: "Chaîne de confiance de l'autorité d'horodatage" });

  // Déterminisme : dates du PDF fixées à la finalisation (pas d'horloge)
  const dateFixe = new Date(env.preuve?.finaliseLe || env.createdAt);
  doc.setCreationDate(dateFixe); doc.setModificationDate(dateFixe);
  doc.setTitle("Dossier de preuve " + (env.preuve?.uuid || env.id));
  return Buffer.from(await doc.save());
}

export const nomDossierPreuve = (env) => {
  const nom = (env.signers[0]?.name || "signataire").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").toUpperCase();
  const type = (env.preuve?.type || "document").toUpperCase();
  const date = (env.preuve?.finaliseLe || env.createdAt).slice(0, 10).replace(/-/g, "");
  return `DossierPreuve_${nom}_${type}_${date}.pdf`;
};

export { randomUUID };
