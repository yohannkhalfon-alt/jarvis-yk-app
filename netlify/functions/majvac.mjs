// MAJ VAC — détection des jours sans ophtalmologue depuis les plannings Excel Dropbox.
// GET /api/majvac                    → état de la configuration + liste des centres + période analysée
// GET /api/majvac?centre=argenteuil  → analyse d'un centre (mois en cours + mois suivant)
import * as XLSX from "xlsx";
import { getStore } from "@netlify/blobs";

const CENTRES = {
  argenteuil:   { label: "ARGENTEUIL",   match: ["argenteuil", "cdsoa"] },
  annecy:       { label: "ANNECY",       match: ["annecy", "alery"] },
  tremblay:     { label: "TREMBLAY",     match: ["tremblay", "gilbert berger"] },
  sartrouville: { label: "SARTROUVILLE", match: ["sartrouville", "general de gaulle", "cgg"] },
};

const MOIS = ["JANVIER", "FEVRIER", "MARS", "AVRIL", "MAI", "JUIN", "JUILLET", "AOUT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DECEMBRE"];
const EXCLURE_FICHIERS = ["PAIE", "REUNION", "RETRO", "FACTURE", "CAISSE", "COMPTA"];

const stripAccents = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const norm = (s) => stripAccents(String(s)).toUpperCase();

function moisAnalyses(count) {
  // Date "aujourd'hui" en heure de Paris
  const paris = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const out = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(paris.getFullYear(), paris.getMonth() + i, 1);
    out.push({ mois: d.getMonth() + 1, annee: d.getFullYear(), nom: MOIS[d.getMonth()] });
  }
  return out;
}

// ---------- Dropbox ----------
// Identifiants : variables d'environnement Netlify OU stockage Blobs
// (renseigné en 2 clics via /api/majvac-oauth).
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

async function dropboxToken(creds) {
  if (tokenCache.value && Date.now() < tokenCache.exp - 60_000) return tokenCache.value;
  const res = await fetch("https://api.dropbox.com/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: creds.refresh,
      client_id: creds.key,
      client_secret: creds.secret,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Dropbox auth: ${data.error_description || data.error || res.status}`);
  tokenCache = { value: data.access_token, exp: Date.now() + (data.expires_in || 14400) * 1000 };
  return tokenCache.value;
}

async function dropboxSearch(token, query) {
  const res = await fetch("https://api.dropboxapi.com/2/files/search_v2", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      query,
      options: { filename_only: true, file_extensions: ["xlsx"], file_status: "active", max_results: 100 },
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Dropbox search: ${data.error_summary || res.status}`);
  return (data.matches || [])
    .map((m) => m.metadata && m.metadata.metadata)
    .filter((md) => md && md[".tag"] === "file");
}

async function dropboxDownload(token, fileId) {
  const res = await fetch("https://content.dropboxapi.com/2/files/download", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "Dropbox-API-Arg": JSON.stringify({ path: fileId }) },
  });
  if (!res.ok) throw new Error(`Dropbox download: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Trouve le fichier planning d'un centre pour un mois donné
async function trouverPlanning(token, centre, { nom, annee }) {
  const candidats = new Map();
  for (const f of await dropboxSearch(token, `${nom} ${annee}`)) candidats.set(f.id, f);

  const bons = [...candidats.values()].filter((f) => {
    const nomF = norm(f.name);
    const chemin = norm(f.path_display || f.path_lower || "");
    if (nomF.startsWith("~$")) return false;
    if (!centre.match.some((m) => chemin.includes(norm(m)))) return false;
    if (!(nomF.includes(nom) && nomF.includes(String(annee)))) return false;
    if (EXCLURE_FICHIERS.some((x) => nomF.includes(x))) return false;
    return true;
  });

  bons.sort((a, b) => {
    const score = (f) => {
      let s = 0;
      if (norm(f.name).includes("PLANNING")) s += 4;
      if (norm(f.path_display || "").includes("PLANNING")) s += 2;
      return s;
    };
    return score(b) - score(a) || new Date(b.server_modified) - new Date(a.server_modified);
  });
  return bons[0] || null;
}

function xlsxVersTexte(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  return wb.SheetNames.map((n) => {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[n], { FS: "\t", blankrows: true });
    return `--- Feuille: ${n} ---\n${csv}`;
  }).join("\n").slice(0, 60_000);
}

// ---------- Analyse Claude ----------
const SYSTEME = `Tu analyses des plannings mensuels Excel de centres de santé ophtalmologiques français.

Structure typique d'un planning : des lignes d'en-têtes de dates (ex. "LUNDI 06/07", "MARDI 07/07"…) suivies de blocs de lignes (une ligne par personne), les blocs étant séparés par des lignes vides. Le PREMIER bloc sous chaque en-tête correspond aux OPHTALMOLOGUES (médecins), les blocs suivants aux orthoptistes/optométristes puis aux secrétaires. Si le fichier étiquette explicitement les catégories, utilise ces étiquettes en priorité.

Signification des cases : "09H 19H" (ou similaire) = plage travaillée ; "OFF", "ABS", "CP", "SANS SOLDE", "RTT", case vide = absent ; "FERIE"/"Férié" = jour férié (centre fermé).

Ta mission : identifier les JOURS SANS OPHTALMOLOGUE, c'est-à-dire les jours où le centre fonctionne (au moins une personne d'un autre bloc travaille) mais où :
- AUCUN ophtalmologue n'a de plage horaire → status "none"
- OU la couverture ophta est partielle (ex. seulement le matin, ou fin avant 17h) → status "partial" (précise les heures couvertes)

À EXCLURE : les dimanches, les jours fériés, et les jours où personne ne travaille (centre fermé).

Réponds UNIQUEMENT avec un JSON valide, sans aucun texte autour, au format :
{"days":[{"date":"YYYY-MM-DD","weekday":"lundi","status":"none","hours":null,"ophtas_presents":[],"note":""}]}
- "hours" : plage couverte si status "partial" (ex. "09H-13H"), sinon null.
- "note" : très courte (ex. "Dr X en CP").
Si aucun jour problématique : {"days":[]}`;

async function analyserAvecClaude(fichiers, label) {
  const contenu = fichiers
    .map((f) => `=== FICHIER : ${f.name} — ${f.moisNom} ${f.annee} (mois ${String(f.mois).padStart(2, "0")}/${f.annee}) ===\n${f.texte}`)
    .join("\n\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.MAJVAC_MODEL || "claude-sonnet-5",
      max_tokens: 2000,
      temperature: 0,
      system: SYSTEME,
      messages: [{ role: "user", content: `Centre : ${label}. Analyse ces plannings et liste les jours sans ophtalmologue.\n\n${contenu}` }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Claude: ${(data.error && data.error.message) || res.status}`);
  const texte = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const json = texte.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  const parsed = JSON.parse(json);
  return Array.isArray(parsed.days) ? parsed.days : [];
}

// ---------- Handler ----------
export default async (req) => {
  const reponse = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

  const creds = await getCreds();
  const manquantes = [];
  if (!creds) manquantes.push("ACCES_DROPBOX (à configurer via /api/majvac-oauth)");
  if (!process.env.ANTHROPIC_API_KEY) manquantes.push("ANTHROPIC_API_KEY");

  const url = new URL(req.url);
  const centreId = url.searchParams.get("centre");
  const nbMois = Math.min(Math.max(parseInt(url.searchParams.get("months") || "3", 10) || 3, 1), 3);
  const periode = moisAnalyses(nbMois);

  if (!centreId) {
    return reponse({
      ok: manquantes.length === 0,
      manquantes,
      centres: Object.entries(CENTRES).map(([id, c]) => ({ id, label: c.label })),
      periode,
    });
  }

  const centre = CENTRES[centreId];
  if (!centre) return reponse({ error: `Centre inconnu : ${centreId}` }, 400);
  if (manquantes.length) return reponse({ error: "Configuration incomplète", manquantes }, 503);

  try {
    const token = await dropboxToken(creds);
    const fichiers = [];
    const erreurs = [];

    for (const m of periode) {
      const f = await trouverPlanning(token, centre, m);
      if (!f) {
        erreurs.push(`Planning ${m.nom} ${m.annee} introuvable`);
        continue;
      }
      const buffer = await dropboxDownload(token, f.id);
      fichiers.push({ name: f.name, path: f.path_display, mois: m.mois, annee: m.annee, moisNom: m.nom, texte: xlsxVersTexte(buffer) });
    }

    const days = fichiers.length ? await analyserAvecClaude(fichiers, centre.label) : [];

    return reponse({
      centre: centreId,
      label: centre.label,
      periode,
      fichiers: fichiers.map(({ name, path, mois, annee }) => ({ name, path, mois, annee })),
      days,
      erreurs,
    });
  } catch (e) {
    return reponse({ centre: centreId, label: centre.label, error: String(e.message || e) }, 502);
  }
};

export const config = { path: "/api/majvac" };

// Exports internes pour les tests
export { moisAnalyses, trouverPlanning, xlsxVersTexte };
