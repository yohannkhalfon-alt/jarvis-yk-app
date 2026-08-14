#!/usr/bin/env node
/**
 * Veille deal flow sante
 * ----------------------
 * Detecte chaque jour, sur toute la France, les centres de sante, cabinets
 * d'ophtalmologie et magasins d'optique en procedure collective ou en vente
 * de fonds (source BODACC), enrichit via l'API Recherche d'Entreprises pour
 * obtenir le vrai code NAF, score chaque dossier et pousse tout dans Airtable.
 *
 * Node 18+, zero dependance npm (fetch natif).
 *
 * Variables d'environnement :
 *   JOURS_HISTORIQUE   nombre de jours a balayer (defaut 2)
 *   AIRTABLE_TOKEN     PAT Airtable (scopes data.records:read/write) - optionnel
 *   AIRTABLE_BASE_ID   appXXXXXXXXXXXXXX
 *   AIRTABLE_TABLE     nom ou id de la table (defaut "Deal Flow Sante")
 *   SLACK_WEBHOOK_URL  webhook Slack - optionnel, ignore si vide
 *   OUTPUT_JSON        chemin d'un fichier JSON ou ecrire les resultats - optionnel
 */

import { writeFileSync } from "node:fs";

// ---------------------------------------------------------------- config

const JOURS_HISTORIQUE = Math.max(1, parseInt(process.env.JOURS_HISTORIQUE || "2", 10) || 2);
const AIRTABLE_TOKEN = (process.env.AIRTABLE_TOKEN || "").trim();
const AIRTABLE_BASE_ID = (process.env.AIRTABLE_BASE_ID || "").trim();
const AIRTABLE_TABLE = (process.env.AIRTABLE_TABLE || "Deal Flow Sante").trim();
const SLACK_WEBHOOK_URL = (process.env.SLACK_WEBHOOK_URL || "").trim();
const OUTPUT_JSON = (process.env.OUTPUT_JSON || "").trim();

const SEUIL_NOTIFICATION = 10;

// Le NAF est le filtre dur : tout ce qui n'est pas dans cette liste est jete.
const NAF_POIDS = {
  "86.90F": { poids: 6, label: "Centre de sante NCA" },
  "86.22C": { poids: 6, label: "Autres medecins specialistes (ophtalmo)" },
  "86.21Z": { poids: 5, label: "Medecine generale / centre polyvalent" },
  "47.78A": { poids: 4, label: "Commerce de detail d'optique" },
  "86.23Z": { poids: 2, label: "Pratique dentaire" },
  "86.10Z": { poids: 2, label: "Activites hospitalieres" },
  "86.22B": { poids: 2, label: "Medecins specialistes chirurgicaux" },
  "86.90E": { poids: 1, label: "Autres activites para-medicales" },
};

// Premiere correspondance gagne (regex sur texte normalise sans accents).
const PROCEDURE_POIDS = [
  { re: /plan de cession/, poids: 6, label: "Plan de cession" },
  { re: /redressement/, poids: 5, label: "Redressement judiciaire" },
  { re: /sauvegarde/, poids: 4, label: "Sauvegarde" },
  { re: /cessation des paiements/, poids: 4, label: "Cessation des paiements" },
  { re: /liquidation judiciaire/, poids: 2, label: "Liquidation judiciaire" },
  { re: /conversion.*liquidation/, poids: 2, label: "Conversion en liquidation" },
  { re: /cloture.*insuffisance/, poids: 0, label: "Cloture pour insuffisance d'actif" },
];

const DEPARTEMENTS_BONUS = new Set([
  "75", "77", "78", "91", "92", "93", "94", "95", "60", "45",
  "28", "10", "18", "36", "58", "80", "74", "73", "69", "63",
]);

// Tranche d'effectif INSEE -> effectif minimum + libelle lisible.
const TRANCHES_EFFECTIF = {
  "00": { min: 0, label: "0 salarie" },
  "01": { min: 1, label: "1 ou 2 salaries" },
  "02": { min: 3, label: "3 a 5 salaries" },
  "03": { min: 6, label: "6 a 9 salaries" },
  "11": { min: 10, label: "10 a 19 salaries" },
  "12": { min: 20, label: "20 a 49 salaries" },
  "21": { min: 50, label: "50 a 99 salaries" },
  "22": { min: 100, label: "100 a 199 salaries" },
  "31": { min: 200, label: "200 a 249 salaries" },
  "32": { min: 250, label: "250 a 499 salaries" },
  "41": { min: 500, label: "500 a 999 salaries" },
  "42": { min: 1000, label: "1000 a 1999 salaries" },
  "51": { min: 2000, label: "2000 a 4999 salaries" },
  "52": { min: 5000, label: "5000 a 9999 salaries" },
  "53": { min: 10000, label: "10000 salaries et plus" },
};

// ---------------------------------------------------------------- utils

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function normalize(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Les champs BODACC arrivent parfois en objet, parfois en string JSON. */
function parseMaybeJson(v) {
  if (v == null) return null;
  if (typeof v === "object") return v;
  if (typeof v === "string") {
    const t = v.trim();
    if (t.startsWith("{") || t.startsWith("[")) {
      try { return JSON.parse(t); } catch { return v; }
    }
    return v;
  }
  return v;
}

function asArray(v) {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url, { tries = 4, headers = {} } = {}) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status} on ${url}`);
        await sleep(1000 * 2 ** i);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} on ${url}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await sleep(1000 * 2 ** i);
    }
  }
  throw lastErr;
}

// ---------------------------------------------------------------- SIREN

/** Validation Luhn officielle des SIREN (limite les faux positifs du fallback). */
function luhnValid(siren) {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    let d = Number(siren[i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

function nineDigits(s) {
  const d = String(s || "").replace(/\D/g, "");
  return d.length >= 9 ? d.slice(0, 9) : null;
}

/**
 * Extraction du SIREN, dans l'ordre :
 *  1. champ registre (array ou string)
 *  2. listepersonnes.personne[].numeroImmatriculation.numeroIdentificationRCS
 *  3. fallback associations loi 1901 (pas de RCS) : motif de 9 chiffres,
 *     eventuellement separes par espaces ou points, dans le JSON complet de
 *     listepersonnes et dans commercant.
 */
function extractSiren(rec, listepersonnes) {
  // 1. registre
  for (const r of asArray(parseMaybeJson(rec.registre))) {
    const s = nineDigits(r);
    if (s) return s;
  }

  // 2. numeroIdentificationRCS
  const personnes = [];
  if (listepersonnes && typeof listepersonnes === "object") {
    for (const bloc of asArray(listepersonnes)) {
      if (bloc && typeof bloc === "object") {
        for (const p of asArray(bloc.personne ?? bloc)) {
          if (p && typeof p === "object") personnes.push(p);
        }
      }
    }
  }
  for (const p of personnes) {
    const im = parseMaybeJson(p.numeroImmatriculation);
    const rcs = im && typeof im === "object" ? im.numeroIdentificationRCS : im;
    const s = nineDigits(rcs);
    if (s) return s;
  }

  // 3. fallback : 9 chiffres eventuellement separes (espaces / points) dans le
  // JSON complet. Indispensable pour les associations loi 1901 (centres de sante).
  const haystack = [
    listepersonnes ? JSON.stringify(listepersonnes) : "",
    String(rec.commercant || ""),
  ].join(" ");
  const candidates = [];
  const re = /(?<!\d)(\d(?:[ . ]?\d){8})(?!\d)/g;
  let m;
  while ((m = re.exec(haystack)) !== null) {
    const s = m[1].replace(/\D/g, "");
    if (s.length === 9 && !candidates.includes(s)) candidates.push(s);
  }
  const valid = candidates.find(luhnValid);
  return valid || candidates[0] || null;
}

// ---------------------------------------------------------------- BODACC

const BODACC_URL =
  "https://bodacc-datadila.opendatasoft.com/api/explore/v2.1/catalog/datasets/annonces-commerciales/records";

/** Recupere toutes les annonces d'un jour donne (evite le plafond offset=10000). */
async function fetchBodaccDay(dateISO) {
  const out = [];
  const where = `dateparution = date'${dateISO}' AND familleavis in ("collective","vente")`;
  let offset = 0;
  const limit = 100;
  for (;;) {
    const url = `${BODACC_URL}?where=${encodeURIComponent(where)}&limit=${limit}&offset=${offset}&order_by=${encodeURIComponent("numeroannonce")}`;
    const data = await fetchJson(url);
    const results = data.results || [];
    out.push(...results);
    offset += limit;
    if (results.length < limit || offset >= Math.min(data.total_count || 0, 10000)) break;
  }
  return out;
}

// ------------------------------------------- Recherche d'Entreprises (SIREN -> NAF)

const RECH_URL = "https://recherche-entreprises.api.gouv.fr/search";
const sirenCache = new Map();
let lastRechCall = 0;

/** Throttle a 5 req/s (limite officielle 7 req/s), cache memoire par SIREN. */
async function enrichSiren(siren) {
  if (sirenCache.has(siren)) return sirenCache.get(siren);
  const wait = lastRechCall + 200 - Date.now();
  if (wait > 0) await sleep(wait);
  lastRechCall = Date.now();
  let result = null;
  try {
    // NB : la syntaxe "q=siren:XXX" n'est pas supportee (0 resultat silencieux).
    // On passe le SIREN nu dans q et on verifie la correspondance exacte.
    const data = await fetchJson(`${RECH_URL}?q=${siren}&per_page=1`);
    const hit = (data.results && data.results[0]) || null;
    result = hit && hit.siren === siren ? hit : null;
  } catch (e) {
    log(`  ! enrichissement ${siren} en echec: ${e.message}`);
  }
  sirenCache.set(siren, result);
  return result;
}

// ---------------------------------------------------------------- scoring

function scoreProcedure(rec, jugement) {
  const textes = [];
  if (jugement && typeof jugement === "object") {
    textes.push(jugement.nature, jugement.complementJugement);
  } else if (typeof jugement === "string") {
    textes.push(jugement);
  }
  textes.push(rec.typeavis_lib);
  const corpus = normalize(textes.filter(Boolean).join(" | "));
  for (const p of PROCEDURE_POIDS) {
    if (p.re.test(corpus)) return { poids: p.poids, label: p.label };
  }
  if (normalize(rec.familleavis) === "vente") return { poids: 4, label: "Vente de fonds" };
  return { poids: 0, label: "Autre" };
}

function extractPrixVente(vente) {
  if (!vente) return "";
  if (typeof vente === "string") return vente.slice(0, 200);
  for (const k of ["montantCession", "prixEtablissement", "montant", "prix"]) {
    if (vente[k] != null && vente[k] !== "") return String(vente[k]);
  }
  return "";
}

function extractDateJugement(jugement) {
  if (!jugement || typeof jugement !== "object") return "";
  const d = jugement.date || jugement.dateJugement || "";
  const m = String(d).match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : "";
}

function extractDirigeant(entreprise) {
  const dir = (entreprise?.dirigeants || [])[0];
  if (!dir) return "";
  if (dir.denomination) return `${dir.denomination}${dir.qualite ? ` (${dir.qualite})` : ""}`;
  const nom = [dir.prenoms, dir.nom].filter(Boolean).join(" ");
  return nom ? `${nom}${dir.qualite ? ` (${dir.qualite})` : ""}` : "";
}

// ---------------------------------------------------------------- Airtable (REST)

const AIRTABLE_API = "https://api.airtable.com/v0";

async function airtableExistingKeys() {
  const keys = new Set();
  let offset = "";
  const table = encodeURIComponent(AIRTABLE_TABLE);
  for (;;) {
    const url = `${AIRTABLE_API}/${AIRTABLE_BASE_ID}/${table}?pageSize=100&${encodeURIComponent("fields[]")}=Cle${offset ? `&offset=${encodeURIComponent(offset)}` : ""}`;
    const data = await fetchJson(url, { headers: { Authorization: `Bearer ${AIRTABLE_TOKEN}` } });
    for (const r of data.records || []) {
      if (r.fields?.Cle) keys.add(r.fields.Cle);
    }
    if (!data.offset) break;
    offset = data.offset;
    await sleep(220); // 5 req/s max cote Airtable
  }
  return keys;
}

async function airtableInsert(records) {
  const table = encodeURIComponent(AIRTABLE_TABLE);
  for (let i = 0; i < records.length; i += 10) {
    const batch = records.slice(i, i + 10);
    const res = await fetch(`${AIRTABLE_API}/${AIRTABLE_BASE_ID}/${table}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${AIRTABLE_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ records: batch.map((fields) => ({ fields })), typecast: true }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Airtable ${res.status}: ${body.slice(0, 500)}`);
    }
    log(`  Airtable: ${Math.min(i + 10, records.length)}/${records.length} inseres`);
    await sleep(220);
  }
}

// ---------------------------------------------------------------- Slack

async function notifySlack(dossiers) {
  if (!SLACK_WEBHOOK_URL) return;
  const chauds = dossiers.filter((d) => d.Score >= SEUIL_NOTIFICATION);
  if (chauds.length === 0) return;
  const lines = chauds
    .sort((a, b) => b.Score - a.Score)
    .map(
      (d) =>
        `• *${d.Denomination}* (${d.Departement} ${d.Ville}) — ${d.Procedure} — ${d["NAF Label"]} — score *${d.Score}*\n  <${d["Lien Annuaire"]}|Annuaire> | <${d["Lien BODACC"]}|BODACC>`
    );
  try {
    const res = await fetch(SLACK_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `:rotating_light: Deal flow sante — ${chauds.length} dossier(s) chaud(s) (score >= ${SEUIL_NOTIFICATION})\n${lines.join("\n")}`,
      }),
    });
    if (!res.ok) log(`  ! Slack HTTP ${res.status}`);
    else log(`Slack: recapitulatif envoye (${chauds.length} dossiers)`);
  } catch (e) {
    log(`  ! Slack en echec: ${e.message}`); // optionnel : ne jamais planter
  }
}

// ---------------------------------------------------------------- main

async function main() {
  const today = new Date();
  const days = [];
  for (let i = JOURS_HISTORIQUE; i >= 0; i--) {
    const d = new Date(today.getTime() - i * 86400000);
    days.push(d.toISOString().slice(0, 10));
  }
  log(`Veille deal flow sante — ${days[0]} -> ${days[days.length - 1]} (${days.length} jours)`);

  const stats = {
    annonces: 0,
    sansSiren: 0,
    enrichissementKo: 0,
    horsNaf: 0,
    retenues: 0,
  };

  // 1. BODACC
  const annonces = [];
  for (const day of days) {
    const recs = await fetchBodaccDay(day);
    log(`BODACC ${day}: ${recs.length} annonces`);
    annonces.push(...recs);
  }
  stats.annonces = annonces.length;

  // 2. extraction SIREN + dedup par annonce
  const seenKeys = new Set();
  const candidats = [];
  for (const rec of annonces) {
    const cle = `${rec.publicationavis || ""}-${rec.parution || ""}-${rec.numeroannonce || ""}`;
    if (seenKeys.has(cle)) continue;
    seenKeys.add(cle);
    const listepersonnes = parseMaybeJson(rec.listepersonnes);
    const siren = extractSiren(rec, listepersonnes);
    if (!siren) {
      stats.sansSiren++;
      continue;
    }
    candidats.push({ rec, cle, siren, listepersonnes });
  }
  log(`SIREN extraits: ${candidats.length}/${stats.annonces} (${stats.sansSiren} rejets sans SIREN)`);

  // 3. enrichissement + filtre NAF + scoring
  const dossiers = [];
  let done = 0;
  for (const { rec, cle, siren } of candidats) {
    done++;
    if (done % 500 === 0) log(`  enrichissement ${done}/${candidats.length}...`);
    const ent = await enrichSiren(siren);
    if (!ent) {
      stats.enrichissementKo++;
      continue;
    }
    const naf = String(ent.activite_principale || "");
    const nafInfo = NAF_POIDS[naf];
    if (!nafInfo) {
      stats.horsNaf++;
      continue;
    }

    const jugement = parseMaybeJson(rec.jugement);
    const vente = parseMaybeJson(rec.vente);
    const proc = scoreProcedure(rec, jugement);

    const dept = String(rec.numerodepartement || "").padStart(2, "0");
    const trancheCode = String(ent.tranche_effectif_salarie || "");
    const tranche = TRANCHES_EFFECTIF[trancheCode];

    let bonus = 0;
    if (DEPARTEMENTS_BONUS.has(dept)) bonus += 3;
    if (tranche && tranche.min >= 3) bonus += 2;

    const score = nafInfo.poids + proc.poids + bonus;
    const siege = ent.siege || {};

    dossiers.push({
      Cle: cle,
      SIREN: siren,
      Denomination: ent.nom_complet || rec.commercant || "(inconnu)",
      Score: score,
      Procedure: proc.label,
      NAF: naf,
      "NAF Label": nafInfo.label,
      Departement: dept,
      Ville: rec.ville || siege.libelle_commune || "",
      "Code Postal": String(rec.cp || siege.code_postal || ""),
      Adresse: siege.adresse || "",
      Dirigeant: extractDirigeant(ent),
      Effectif: tranche ? tranche.label : "",
      "Date Creation": ent.date_creation || "",
      "Date Parution": rec.dateparution || "",
      "Date Jugement": extractDateJugement(jugement),
      Tribunal: rec.tribunal || "",
      "Prix Vente": extractPrixVente(vente),
      "Lien BODACC": `https://www.bodacc.fr/annonce/commerciale/${siren}`,
      "Lien Annuaire": `https://annuaire-entreprises.data.gouv.fr/entreprise/${siren}`,
      Statut: "A qualifier",
    });
  }
  stats.retenues = dossiers.length;

  log(`Dossiers retenus (filtre NAF sante/optique): ${stats.retenues}`);
  log(
    `Stats: ${stats.annonces} annonces | ${stats.sansSiren} sans SIREN (${
      stats.annonces ? ((100 * stats.sansSiren) / stats.annonces).toFixed(1) : 0
    }%) | ${stats.enrichissementKo} enrichissements KO | ${stats.horsNaf} hors NAF`
  );

  // 4. export JSON local (backfill / debug)
  if (OUTPUT_JSON) {
    writeFileSync(OUTPUT_JSON, JSON.stringify({ stats, dossiers }, null, 2));
    log(`Resultats ecrits dans ${OUTPUT_JSON}`);
  }

  // 5. Airtable : dedup sur Cle puis insertion par lots de 10
  if (AIRTABLE_TOKEN && AIRTABLE_BASE_ID) {
    const existing = await airtableExistingKeys();
    const nouveaux = dossiers.filter((d) => !existing.has(d.Cle));
    log(`Airtable: ${existing.size} cles existantes, ${nouveaux.length} nouveaux enregistrements`);
    if (nouveaux.length > 0) await airtableInsert(nouveaux);
    // 6. Slack : uniquement les nouveaux dossiers chauds
    await notifySlack(nouveaux);
  } else {
    log("AIRTABLE_TOKEN absent: insertion Airtable sautee (mode export JSON).");
    await notifySlack(dossiers);
  }

  // recap console
  const top = [...dossiers].sort((a, b) => b.Score - a.Score).slice(0, 15);
  if (top.length > 0) {
    log("Top 15 :");
    for (const d of top) {
      log(`  [${String(d.Score).padStart(2)}] ${d.Denomination} — ${d.Ville} (${d.Departement}) — ${d.Procedure} — ${d.NAF}`);
    }
  }
}

main().catch((e) => {
  console.error("ERREUR FATALE:", e);
  process.exit(1);
});
