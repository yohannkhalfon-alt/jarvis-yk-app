// Récap paie mensuel — heures sup, récups, échanges et reports relevés dans
// les grilles des 5 centres (demande de Yohann du 27/11). Envoyé par mail à
// la gestionnaire (cfg.to, Laura) avec Audrey en copie, le 25 de chaque mois
// (le mois se termine : tout est posé, la paie se prépare).
// Lancement manuel : action admin "paie-recap-run" dans cdd.mjs.
import * as XLSX from "xlsx";
import { getStore } from "@netlify/blobs";
import { getCreds, dropboxToken, dropboxDownload, trouverPlanning } from "./majvac.mjs";

const CENTRES = {
  argenteuil:   { label: "ARGENTEUIL",   match: ["argenteuil", "cdsoa"], folders: ["/CDS Argenteuil/ASSOCIATION CDSOA/PLANNING ARGENTEUIL"] },
  annecy:       { label: "ANNECY",       match: ["annecy", "alery"], folders: ["/Centre ophta Annecy/ASSO CDS ALERY/PLANNING ANNECY"] },
  tremblay:     { label: "TREMBLAY",     match: ["tremblay", "gilbert berger"], folders: ["/Tremblay ophta/ASSO CDS GILBERT BERGER/PLANNING TREMBLAY"] },
  sartrouville: { label: "SARTROUVILLE", match: ["sartrouville", "general de gaulle", "cgg"], folders: ["/Centre ophta Sartrouville/ASSOCIATION CGG./ASSOCIATION CGG/PLANNING SARTROUVILLE"] },
  antony:       { label: "ANTONY",       match: ["antony", "haut de seine", "hauts de seine"], folders: ["/yk-brain et CDS 92/CDS des Hauts De Seine/ASSOCIATION/PLANNING ANTONY", "/PLANNING ANTONY"] },
};
const MOIS = ["JANVIER", "FEVRIER", "MARS", "AVRIL", "MAI", "JUIN", "JUILLET", "AOUT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DECEMBRE"];
const COPIE_DEFAUT = ["audreyelaich@gmail.com"]; // demande de Yohann du 27/11
const JOURS_RX = /^(LUNDI|MARDI|MERCREDI|JEUDI|VENDREDI|SAMEDI|DIMANCHE)/i;
// Mentions qui intéressent la paie : heures en plus/en moins, récups,
// échanges inter-jours/centres, reports, plages atypiques CPAM.
const MENTION_RX = /([+\-]\s?\d{1,2}\s?(H|MIN)\b|[+\-]\s?\d{1,2}H\d{2}|RECUP|RÉCUP|\bECH\b|REPORT|HEURES?\s+SUP|CPAM)/i;
const HORAIRE_SIMPLE_RX = /^\s*\d{1,2}\s?H(\s?\d{2})?\s*[- ]\s*\d{1,2}\s?H(\s?\d{2})?\s*$/i;
const echapHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function moisCourant() {
  const p = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  return { mois: p.getMonth() + 1, annee: p.getFullYear(), nom: MOIS[p.getMonth()] };
}

// Relève, feuille par feuille, les cellules à mention paie avec leur contexte
// (personne = colonne A de la ligne, jour = en-tête de colonne le plus récent).
function releverMentions(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const parPersonne = new Map();
  const notes = [];
  for (const nomFeuille of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[nomFeuille], { header: 1, raw: false, defval: "" });
    const estInfos = /INFOS/i.test(nomFeuille);
    let enTete = [];
    for (const r of rows) {
      const cells = r.map((c) => String(c == null ? "" : c).trim());
      if (cells.some((c) => JOURS_RX.test(c))) { enTete = cells; continue; }
      const nom = cells[0];
      for (let i = 0; i < cells.length; i++) {
        const v = cells[i];
        if (!v || !MENTION_RX.test(v) || HORAIRE_SIMPLE_RX.test(v)) continue;
        if (estInfos || !nom || i === 0) {
          const t = (nom && i > 0 ? nom + " — " : "") + v;
          if (!notes.includes(t)) notes.push(t);
          continue;
        }
        const jour = (enTete[i] || "").replace(/\s+/g, " ") || "(colonne " + (i + 1) + ")";
        if (!parPersonne.has(nom)) parPersonne.set(nom, []);
        parPersonne.get(nom).push(`${jour} : « ${v} »`);
      }
    }
  }
  return { parPersonne, notes };
}

export async function genererRecap() {
  const creds = await getCreds();
  if (!creds) throw new Error("Accès Dropbox non configuré");
  const token = await dropboxToken(creds);
  const m = moisCourant();
  const centres = [];
  for (const [id, c] of Object.entries(CENTRES)) {
    try {
      const f = await trouverPlanning(token, c, m);
      if (!f) { centres.push({ id, label: c.label, erreur: "planning introuvable" }); continue; }
      const buffer = await dropboxDownload(token, f.id);
      const { parPersonne, notes } = releverMentions(buffer);
      centres.push({ id, label: c.label, fichier: f.name, parPersonne, notes });
    } catch (e) {
      centres.push({ id, label: c.label, erreur: String(e.message || e).slice(0, 160) });
    }
  }
  return { mois: m, centres };
}

function htmlRecap({ mois, centres }) {
  let h = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1c2733;max-width:680px">`;
  h += `<h2 style="margin:0 0 4px">Récap paie — ${mois.nom} ${mois.annee}</h2>`;
  h += `<p style="color:#667;margin:0 0 16px">Heures sup, récups, échanges et reports relevés automatiquement dans les plannings des 5 centres. À vérifier avant paie — les grilles restent la référence.</p>`;
  for (const c of centres) {
    h += `<h3 style="margin:18px 0 6px;border-bottom:2px solid #1B6FD8;padding-bottom:3px">${echapHtml(c.label)}</h3>`;
    if (c.erreur) { h += `<p style="color:#b00">⚠️ ${echapHtml(c.erreur)}</p>`; continue; }
    const noms = [...c.parPersonne.keys()].sort();
    if (!noms.length && !c.notes.length) { h += `<p style="color:#3a7d44">Rien à signaler ce mois-ci.</p>`; continue; }
    for (const nom of noms) {
      h += `<p style="margin:7px 0 2px"><b>${echapHtml(nom)}</b></p><ul style="margin:0 0 6px 18px;padding:0">`;
      for (const l of c.parPersonne.get(nom)) h += `<li>${echapHtml(l)}</li>`;
      h += `</ul>`;
    }
    if (c.notes.length) {
      h += `<p style="margin:9px 0 2px;color:#667"><b>Notes du fichier :</b></p><ul style="margin:0 0 6px 18px;padding:0;color:#667">`;
      for (const n of c.notes.slice(0, 25)) h += `<li>${echapHtml(n)}</li>`;
      h += `</ul>`;
    }
  }
  h += `<p style="color:#99a;font-size:12px;margin-top:18px">Généré automatiquement par JARVIS le 25 du mois (plannings Dropbox du mois en cours).</p></div>`;
  return h;
}

export async function envoyerRecap() {
  const store = getStore("cdd");
  const cle = process.env.BREVO_API_KEY || (await store.get("secret/brevo")) || "";
  const cfg = (await store.get("config.json", { type: "json" })) || {};
  const dest = cfg.to || "gestionpro.lk@gmail.com";
  const copie = (Array.isArray(cfg.paieCopie) && cfg.paieCopie.length ? cfg.paieCopie : COPIE_DEFAUT).filter((x) => String(x).includes("@"));
  const expediteur = (cfg.fromByCentre || {}).argenteuil || process.env.BREVO_FROM;
  if (!cle || !expediteur) throw new Error("Brevo ou boîte d'envoi non configurés");
  const recap = await genererRecap();
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": cle, "content-type": "application/json" },
    body: JSON.stringify({
      sender: { name: "JARVIS — Récap paie", email: expediteur },
      replyTo: { email: expediteur },
      to: [{ email: dest }],
      cc: copie.map((email) => ({ email })),
      subject: `🧾 Récap paie ${recap.mois.nom} ${recap.mois.annee} — heures sup, récups, échanges (5 centres)`,
      htmlContent: htmlRecap(recap),
    }),
  });
  if (!r.ok) throw new Error(`Brevo ${r.status} : ${(await r.text()).slice(0, 160)}`);
  return { ok: true, mois: recap.mois, centres: recap.centres.map((c) => ({ id: c.id, personnes: c.parPersonne ? c.parPersonne.size : 0, notes: c.notes ? c.notes.length : 0, erreur: c.erreur || null })) };
}

export default async () => {
  const bilan = await envoyerRecap().catch((e) => ({ ok: false, erreur: String(e.message || e) }));
  console.log("paie-recap :", JSON.stringify(bilan));
  return new Response(JSON.stringify(bilan), { headers: { "content-type": "application/json" } });
};

export const config = { schedule: "41 6 25 * *" };
