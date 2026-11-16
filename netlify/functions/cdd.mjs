// JARVIS CDD — réservation de vacations ophtalmologue + demande de CDD automatique.
//
// Parcours : le praticien ouvre /cdd/, choisit une date libre, remplit ses
// informations (nom, prénom, RPPS, n° sécu, adresse postale, contact) et
// photographie / importe ses documents. Le créneau passe "en attente".
// Yohann confirme depuis /cdd/admin.html → un email part À Laura (LK Gestion)
// DEPUIS la boîte de la direction du centre concerné (via Brevo, comme SIGN),
// avec toutes les informations et les documents en pièces jointes :
// « Merci de créer le CDD pour Docteur X ».
//
// GET  /api/cdd                        → vue publique : créneaux ouverts + conditions
// GET  /api/cdd?list=1                 → (admin) créneaux + réservations complètes + config
// GET  /api/cdd?doc=RESA/CLE           → (admin) télécharger un document importé
// POST /api/cdd {action:"book"}        → réserver un créneau (public)
// POST /api/cdd {action:"upload-doc"}  → ajouter un document à sa réservation (token)
// POST /api/cdd {action:"add-slots"}   → (admin) ajouter des dates
// POST /api/cdd {action:"remove-slot"} → (admin) retirer une date libre
// POST /api/cdd {action:"confirm"}     → (admin) confirmer → email à LK Gestion
// POST /api/cdd {action:"reject"}      → (admin) refuser → libère le créneau
// POST /api/cdd {action:"config"}      → (admin) boîtes d'envoi par centre, destinataire
//
// Stockage Netlify Blobs (store "cdd") :
//   slots.json        liste des créneaux [{id,date,centre,type,status,resaId}]
//   config.json       { to, fromByCentre: {argenteuil:"direction@...", ...} }
//   resa/{id}.json    réservation (praticien, statut, docs, audit)
//   doc/{id}/{cle}    documents importés (JPEG compressé côté client ou PDF)
//
// Variables Netlify : CDD_ADMIN_CODE (code du tableau de bord, comme SIGN),
// BREVO_API_KEY + BREVO_FROM (déjà en place pour JARVIS SIGN).
import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";

const CENTRES = {
  argenteuil:   "ARGENTEUIL",
  sartrouville: "SARTROUVILLE",
  tremblay:     "TREMBLAY",
  antony:       "ANTONY",
  annecy:       "ANNECY",
};

// Conditions fixes, non négociables — affichées telles quelles au praticien.
const CONDITIONS = {
  remuneration: "1 300 € la journée",
  horaires: "9h00 – 19h00 (centre fermé de 13h à 14h)",
  note: "Rémunération et horaires non négociables.",
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

const DEST_DEFAUT = "gestionpro.lk@gmail.com"; // Laura — LK Gestion
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

async function lireSlots(store) {
  return (await store.get("slots.json", { type: "json" })) || [];
}
async function lireConfig(store) {
  const c = (await store.get("config.json", { type: "json" })) || {};
  return { to: c.to || DEST_DEFAUT, fromByCentre: c.fromByCentre || {} };
}

// Email à LK Gestion, expédié depuis la boîte de la direction du centre.
// Même mécanique que JARVIS SIGN : si Brevo refuse l'expéditeur (adresse non
// validée chez eux), repli sur BREVO_FROM. N'échoue jamais la confirmation :
// le résultat est consigné dans resa.notif.
async function envoyerDemandeCdd(store, resa, slot, origin) {
  const key = process.env.BREVO_API_KEY;
  if (!key) { resa.notif = { skipped: "BREVO_API_KEY non configurée sur Netlify" }; return; }
  const cfg = await lireConfig(store);
  const centreLabel = CENTRES[slot.centre] || slot.centre.toUpperCase();
  const boiteCentre = cfg.fromByCentre[slot.centre];
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

  const docte = `Docteur ${resa.prenom} ${resa.nom}`;
  const lignes = [
    ["Praticien", docte],
    ["RPPS", resa.rpps],
    ["N° de sécurité sociale", resa.secu || "non communiqué"],
    ["Adresse postale", resa.adresse],
    ["Téléphone", resa.tel || "—"],
    ["Email", resa.email || "—"],
    ["Centre", centreLabel],
    ["Date de la vacation", dateFr(slot.date)],
    ["Type de contrat", slot.type || "CDD"],
    ["Rémunération", CONDITIONS.remuneration + " (fixe)"],
    ["Horaires", CONDITIONS.horaires],
  ];
  const tableau = lignes
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#667;white-space:nowrap;">${echapHtml(k)}</td><td style="padding:4px 0;"><b>${echapHtml(v)}</b></td></tr>`)
    .join("");
  const listeDocs = (resa.docs || []).length
    ? `<p>Documents du praticien ${attachment.length ? "en pièces jointes" : `(volumineux — à télécharger depuis le tableau de bord JARVIS CDD : ${origin}/cdd/admin.html)`} : ${resa.docs.map((d) => echapHtml(DOCS.find((x) => x.cle === d.cle)?.label || d.cle)).join(", ")}.</p>`
    : `<p style="color:#a60;">Aucun document importé par le praticien — à réclamer.</p>`;

  const envoyer = (expediteur) => fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      sender: { name: `Direction ${centreLabel}`, email: expediteur },
      to: [{ email: cfg.to }],
      replyTo: boiteCentre ? { email: boiteCentre } : undefined,
      subject: `Merci de créer le CDD pour ${docte} — ${dateFr(slot.date)} — ${centreLabel}`,
      htmlContent:
        `<p>Bonjour Laura,</p>` +
        `<p>Merci de créer le <b>${echapHtml(slot.type || "CDD")}</b> pour <b>${echapHtml(docte)}</b> :</p>` +
        `<table style="border-collapse:collapse;font-size:14px;">${tableau}</table>` +
        listeDocs +
        `<p style="color:#888;font-size:12px;">JARVIS CDD — réservation confirmée par la direction le ${new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}.</p>`,
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

export default async (req) => {
  const url = new URL(req.url);
  const store = getStore("cdd");

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

    const slots = await lireSlots(store);

    // Vue admin complète
    if (url.searchParams.get("list") === "1") {
      if (!adminOk(req)) return json({ error: "code admin invalide" }, 401);
      const resas = [];
      for (const s of slots) {
        if (!s.resaId) continue;
        const r = await store.get(`resa/${s.resaId}.json`, { type: "json" });
        if (r) { delete r.upToken; resas.push(r); }
      }
      return json({ slots, resas, config: await lireConfig(store), centres: CENTRES, docs: DOCS, conditions: CONDITIONS, adminProtege: Boolean(process.env.CDD_ADMIN_CODE) });
    }

    // Vue publique : jamais de données personnelles, uniquement les dates
    return json({
      conditions: CONDITIONS,
      centres: CENTRES,
      docs: DOCS,
      slots: slots
        .filter((s) => s.date >= new Date().toISOString().slice(0, 10))
        .map((s) => ({ id: s.id, date: s.date, centre: s.centre, type: s.type, libre: s.status === "libre" })),
    });
  }

  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: "JSON invalide" }, 400); }
  const action = body.action;

  // ---------- Public : réserver un créneau ----------
  if (action === "book") {
    const nom = champ(body.nom, 80), prenom = champ(body.prenom, 80);
    const rpps = champ(body.rpps, 20).replace(/\D/g, "");
    const secu = champ(body.secu, 30).replace(/[^\d AB]/gi, "");
    const adresse = champ(body.adresse, 300);
    const tel = champ(body.tel, 30), email = champ(body.email, 120);
    if (!nom || !prenom || !adresse) return json({ error: "Nom, prénom et adresse postale sont obligatoires." }, 400);
    if (!/^\d{11}$/.test(rpps)) return json({ error: "Le numéro RPPS doit comporter 11 chiffres." }, 400);
    if (!tel && !email) return json({ error: "Indique au moins un téléphone ou un email." }, 400);

    const slots = await lireSlots(store);
    const slot = slots.find((s) => s.id === body.slotId);
    if (!slot) return json({ error: "Créneau introuvable." }, 404);
    if (slot.status !== "libre") return json({ error: "Désolé, ce créneau vient d'être pris." }, 409);

    const id = randomBytes(8).toString("hex");
    const resa = {
      id, slotId: slot.id, date: slot.date, centre: slot.centre,
      nom, prenom, rpps, secu, adresse, tel, email,
      status: "en_attente", createdAt: new Date().toISOString(),
      upToken: randomBytes(12).toString("hex"), docs: [],
    };
    slot.status = "en_attente";
    slot.resaId = id;
    await store.setJSON(`resa/${id}.json`, resa);
    await store.setJSON("slots.json", slots);
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

  // ---------- Admin ----------
  if (!adminOk(req)) return json({ error: "code admin invalide" }, 401);

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

  if (action === "confirm" || action === "reject") {
    const slots = await lireSlots(store);
    const slot = slots.find((s) => s.resaId === body.resaId);
    const resa = await store.get(`resa/${champ(body.resaId, 40)}.json`, { type: "json" });
    if (!slot || !resa) return json({ error: "réservation introuvable" }, 404);
    if (resa.status !== "en_attente") return json({ error: "réservation déjà traitée" }, 409);

    if (action === "confirm") {
      resa.status = "confirmee";
      resa.confirmedAt = new Date().toISOString();
      slot.status = "confirme";
      await envoyerDemandeCdd(store, resa, slot, url.origin);
    } else {
      resa.status = "refusee";
      slot.status = "libre";   // la date redevient réservable
      slot.resaId = null;
    }
    await store.setJSON(`resa/${resa.id}.json`, resa);
    await store.setJSON("slots.json", slots);
    return json({ ok: true, notif: resa.notif || null });
  }

  if (action === "config") {
    const cfg = await lireConfig(store);
    if (body.to !== undefined) cfg.to = champ(body.to, 120) || DEST_DEFAUT;
    for (const [c, mail] of Object.entries(body.fromByCentre || {}))
      if (CENTRES[c]) cfg.fromByCentre[c] = champ(mail, 120);
    await store.setJSON("config.json", cfg);
    return json({ ok: true, config: cfg });
  }

  return json({ error: "action inconnue" }, 400);
};

export const config = { path: "/api/cdd" };
