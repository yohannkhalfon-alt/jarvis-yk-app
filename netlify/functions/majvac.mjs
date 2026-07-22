// MAJ VAC — détection des jours sans ophtalmologue depuis les plannings Excel Dropbox.
//
// GET /api/majvac                    → état de la configuration + liste des centres + période analysée
// GET /api/majvac?centre=argenteuil  → analyse d'un centre (mois en cours + mois suivant)
//
// Les DATES et l'ALIGNEMENT DES COLONNES sont calculés par le code (déterministe,
// fiable). L'IA ne sert plus qu'à une chose : identifier quels NOMS sont des
// ophtalmologues — plus aucun calcul de dates ni de colonnes par le modèle.
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
const norm = (s) => stripAccents(String(s)).toUpperCase().replace(/\s+/g, " ").trim();

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

// Lit une réponse HTTP en tolérant les erreurs texte brut de Dropbox
// ("Error in call to API function …") au lieu de planter sur res.json().
async function lireJson(res, contexte) {
  const txt = await res.text();
  if (!res.ok) throw new Error(`${contexte} (${res.status}) : ${txt.slice(0, 180)}`);
  try {
    return JSON.parse(txt);
  } catch (e) {
    throw new Error(`${contexte} : réponse inattendue : ${txt.slice(0, 180)}`);
  }
}

async function dropboxToken(creds) {
  if (tokenCache.value && Date.now() < tokenCache.exp - 60_000) return tokenCache.value;
  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: creds.refresh,
      client_id: creds.key,
      client_secret: creds.secret,
    }),
  });
  const data = await lireJson(res, "Token Dropbox");
  tokenCache = { value: data.access_token, exp: Date.now() + (data.expires_in || 14400) * 1000 };
  return data.access_token;
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
  const data = await lireJson(res, "Recherche Dropbox");
  return (data.matches || [])
    .map((m) => m.metadata && m.metadata.metadata)
    .filter((md) => md && md[".tag"] === "file");
}

async function dropboxDownload(token, fileId) {
  const res = await fetch("https://content.dropboxapi.com/2/files/download", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "Dropbox-API-Arg": JSON.stringify({ path: fileId }) },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Téléchargement Dropbox (${res.status}) : ${txt.slice(0, 180)}`);
  }
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

// ---------- Lecture du classeur ----------
function xlsxVersLignes(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const lignes = [];
  for (const n of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: false, defval: "" });
    for (const r of rows) lignes.push(r.map((c) => String(c == null ? "" : c).trim()));
  }
  return lignes;
}

// Conservé pour compatibilité (diagnostic) : dump texte du classeur.
function xlsxVersTexte(buffer) {
  const wb = XLSX.read(buffer, { type: "buffer" });
  return wb.SheetNames.map((n) => {
    const csv = XLSX.utils.sheet_to_csv(wb.Sheets[n], { FS: "\t", blankrows: true });
    return `--- Feuille: ${n} ---\n${csv}`;
  }).join("\n").slice(0, 60_000);
}

// ---------- Analyse déterministe de la grille ----------
// Structure attendue : lignes d'en-têtes "LUNDI 06/07  MARDI 07/07 …" (JJ/MM),
// puis des blocs de lignes-personnes séparés par des lignes vides.
const RE_ENTETE = /^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\.?\s+(\d{1,2})[\/.](\d{1,2})(?!\d)/i;
// Mots (sans accents) qui signifient "absent / ne travaille pas", même si la cellule contient des heures.
const RE_ABSENT = /(^|[^a-z])(off|abs|absente?|cp|rtt|ssolde|sans\s+solde|arret|conge|formation|ferme|feries?|ferie|preavis|malade|maladie)($|[^a-z])/;
const RE_FERME = /(^|[^a-z])(ferme|feries?|ferie)($|[^a-z])/;
const JOURS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];

function anneePourMois(mm, moisFichier, anneeFichier) {
  if (moisFichier === 1 && mm === 12) return anneeFichier - 1;
  if (moisFichier === 12 && mm === 1) return anneeFichier + 1;
  return anneeFichier;
}

// Une cellule → { travail, debut, fin } (heures décimales). "09H 19H" → 9→19.
function lireCellule(texte) {
  const brut = String(texte || "").trim();
  if (!brut) return { travail: false };
  const t = stripAccents(brut).toLowerCase();
  if (RE_ABSENT.test(t)) return { travail: false };
  const heures = [];
  // Espaces retirés pour fiabiliser ("09H 19H", "9h13h30", "12H40"…). Les minutes
  // ne sont acceptées que collées au h et non suivies d'un autre h ("12h40" oui,
  // "9h13h30" → 9h puis 13h30).
  const compact = t.replace(/\s+/g, "");
  const re = /(\d{1,2})h(\d{2}(?!h))?/g;
  let m;
  while ((m = re.exec(compact))) {
    const h = parseInt(m[1], 10) + (m[2] ? parseInt(m[2], 10) / 60 : 0);
    if (h >= 7 && h <= 22) heures.push(h); // ignore "+1h", "+6H", "-3H30" (récups/décomptes)
  }
  if (!heures.length) return { travail: false };
  return { travail: true, debut: Math.min(...heures), fin: Math.max(...heures) };
}

const fmtH = (v) => {
  const h = Math.floor(v);
  const mn = Math.round((v - h) * 60);
  return String(h).padStart(2, "0") + "H" + (mn ? String(mn).padStart(2, "0") : "");
};

// Parcourt les lignes et reconstruit : personnes (nom, bloc, cellules par date ISO)
// + dates rencontrées. Le bloc retenu est le bloc MAJORITAIRE sur le mois
// (robuste aux lignes de commentaire qui cassent parfois la séparation).
function parseGrille(lignes, moisFichier, anneeFichier) {
  const personnes = new Map(); // clé norm(nom) → { nom, blocs: {n: occurrences}, cellules: Map(iso → texte) }
  const dates = new Map(); // iso → { enTete }
  let colonnes = null; // Map colIdx → iso
  let blocCourant = 1;
  let enBlanc = false;

  for (const cells of lignes) {
    const vide = cells.every((c) => !c);
    const headerCols = [];
    cells.forEach((c, i) => {
      const m = String(c).match(RE_ENTETE);
      if (m) headerCols.push([i, m]);
    });

    // Ligne d'en-tête : ≥2 dates, ou 1 date accompagnée de la cellule "NOMS"
    // (semaines à un seul jour, ex. "SAMEDI 01/08" ou "LUNDI 31/08").
    const estEnTete =
      headerCols.length >= 2 ||
      (headerCols.length === 1 && cells.some((c) => norm(c) === "NOMS"));
    if (estEnTete) {
      colonnes = new Map();
      for (const [i, m] of headerCols) {
        const jj = parseInt(m[2], 10);
        const mm = parseInt(m[3], 10);
        if (jj < 1 || jj > 31 || mm < 1 || mm > 12) continue;
        const an = anneePourMois(mm, moisFichier, anneeFichier);
        const iso = `${an}-${String(mm).padStart(2, "0")}-${String(jj).padStart(2, "0")}`;
        colonnes.set(i, iso);
        if (!dates.has(iso)) dates.set(iso, { enTete: m[1].toLowerCase() });
      }
      blocCourant = 1; // premier bloc sous chaque en-tête = ophtalmologues (convention)
      enBlanc = false;
      continue;
    }

    if (!colonnes) continue;
    if (vide) {
      enBlanc = true;
      continue;
    }
    if (enBlanc) {
      blocCourant += 1;
      enBlanc = false;
    }

    const idxNom = cells.findIndex((c) => c);
    const nomBrut = cells[idxNom];
    if (!nomBrut || RE_ENTETE.test(nomBrut) || norm(nomBrut) === "NOMS") continue;

    const cle = norm(nomBrut);
    if (!personnes.has(cle)) personnes.set(cle, { nom: nomBrut.trim(), blocs: {}, cellules: new Map() });
    const p = personnes.get(cle);
    p.blocs[blocCourant] = (p.blocs[blocCourant] || 0) + 1;
    for (const [i, iso] of colonnes) {
      const v = cells[i];
      if (v) p.cellules.set(iso, v);
    }
  }

  // Bloc majoritaire par personne
  for (const p of personnes.values()) {
    let meilleur = 1;
    let n = -1;
    for (const [b, c] of Object.entries(p.blocs)) {
      if (c > n || (c === n && +b < meilleur)) {
        meilleur = +b;
        n = c;
      }
    }
    p.bloc = meilleur;
  }
  return { personnes, dates };
}

// Jours sans ophta (status "none") ou couverture partielle (status "partial"),
// calculés déterministement. Exclut dimanches, jours fériés/fermés, et jours
// où personne ne travaille (centre fermé ou semaine non renseignée).
function calculerJours(grille, ophtasSet) {
  const jours = [];
  for (const [iso, meta] of grille.dates) {
    const dt = new Date(iso + "T12:00:00Z");
    if (isNaN(dt)) continue;
    const wd = dt.getUTCDay();
    if (wd === 0) continue; // dimanche

    const intervalles = [];
    const ophtasPresents = [];
    let autresTravaillent = false;
    let cellules = 0;
    let fermees = 0;

    for (const p of grille.personnes.values()) {
      const cell = p.cellules.get(iso);
      if (!cell) continue;
      cellules += 1;
      if (RE_FERME.test(stripAccents(cell).toLowerCase())) fermees += 1;
      const c = lireCellule(cell);
      if (!c.travail) continue;
      if (ophtasSet.has(norm(p.nom))) {
        intervalles.push([c.debut, c.fin]);
        ophtasPresents.push(p.nom);
      } else {
        autresTravaillent = true;
      }
    }

    if (cellules === 0) continue; // colonne vide (semaine non renseignée)
    if (fermees >= cellules) continue; // tout le monde "Fermé"/"Férié" → centre fermé
    if (!autresTravaillent && intervalles.length === 0) continue; // personne ne travaille

    const weekday = JOURS_FR[wd];
    const alerte =
      meta.enTete && stripAccents(meta.enTete).toLowerCase() !== stripAccents(weekday)
        ? ` (⚠️ en-tête planning : ${meta.enTete})`
        : "";

    if (intervalles.length === 0) {
      jours.push({ date: iso, weekday, status: "none", hours: null, ophtas_presents: [], note: "aucun ophtalmologue planifié" + alerte });
    } else {
      const debut = Math.min(...intervalles.map((i) => i[0]));
      const fin = Math.max(...intervalles.map((i) => i[1]));
      if (fin < 17 || debut > 12) {
        jours.push({
          date: iso,
          weekday,
          status: "partial",
          hours: `${fmtH(debut)}-${fmtH(fin)}`,
          ophtas_presents: ophtasPresents,
          note: "couverture partielle" + alerte,
        });
      }
    }
  }
  jours.sort((a, b) => a.date.localeCompare(b.date));
  return jours;
}

// ---------- Vue « Équipe » (qui travaille, par rôle) ----------
const ROLE_LABEL = { ophta: "Ophtalmologue", ortho: "Orthoptistes", secretaire: "Secrétaires" };

// Rôle d'une personne : ophta si classée comme telle, sinon d'après le bloc
// (bloc 2 = orthoptistes, bloc 3+ = secrétaires ; bloc 1 par défaut = ophta).
function roleDe(nom, bloc, ophtasSet) {
  if (ophtasSet.has(norm(nom))) return "ophta";
  if (bloc === 2) return "ortho";
  if (bloc >= 3) return "secretaire";
  return "ophta";
}

// Semaine ISO (lundi → samedi) contenant la date d'ancrage (YYYY-MM-DD).
// Sans ancre : semaine en cours, heure de Paris.
function semaineDe(ancreIso) {
  let y, mo, day;
  if (ancreIso && /^\d{4}-\d{2}-\d{2}$/.test(ancreIso)) {
    [y, mo, day] = ancreIso.split("-").map(Number);
  } else {
    const p = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
    y = p.getFullYear(); mo = p.getMonth() + 1; day = p.getDate();
  }
  const dt = new Date(Date.UTC(y, mo - 1, day, 12));
  const wd = dt.getUTCDay(); // 0 = dimanche … 6 = samedi
  dt.setUTCDate(dt.getUTCDate() + (wd === 0 ? -6 : 1 - wd)); // recule au lundi
  const jours = [];
  for (let i = 0; i < 6; i++) {
    const x = new Date(dt);
    x.setUTCDate(dt.getUTCDate() + i);
    jours.push(x.toISOString().slice(0, 10)); // lundi → samedi
  }
  return jours;
}

// À partir des grilles déjà lues, construit le roster par rôle pour les jours donnés.
// Chaque personne : { nom, jours: { iso: "09H-19H" | null } }.
function construireEquipe(grilles, joursSemaine, ophtasSet) {
  const gens = new Map();
  for (const g of grilles) {
    for (const p of g.personnes.values()) {
      const cle = norm(p.nom);
      if (!gens.has(cle)) gens.set(cle, { nom: p.nom, bloc: p.bloc, cellules: new Map() });
      const gg = gens.get(cle);
      gg.bloc = Math.min(gg.bloc, p.bloc);
      for (const [iso, v] of p.cellules) gg.cellules.set(iso, v);
    }
  }
  const roles = { ophta: [], ortho: [], secretaire: [] };
  for (const p of gens.values()) {
    // On ignore les personnes qui n'apparaissent aucun jour de la semaine visée.
    if (![...p.cellules.keys()].some((k) => joursSemaine.includes(k))) continue;
    const jours = {};
    for (const iso of joursSemaine) {
      const cell = p.cellules.get(iso);
      const c = cell ? lireCellule(cell) : { travail: false };
      jours[iso] = c.travail ? `${fmtH(c.debut)}-${fmtH(c.fin)}` : null;
    }
    roles[roleDe(p.nom, p.bloc, ophtasSet)].push({ nom: p.nom, jours });
  }
  return [
    { role: "ophta", label: ROLE_LABEL.ophta, personnes: roles.ophta },
    { role: "ortho", label: ROLE_LABEL.ortho, personnes: roles.ortho },
    { role: "secretaire", label: ROLE_LABEL.secretaire, personnes: roles.secretaire },
  ];
}

// ---------- Identification des ophtalmologues ----------
// 1) Variable d'environnement MAJVAC_OPHTAS_<CENTRE> ("SLIMANE,PAPAPOSTOLOU,…") si définie.
// 2) Sinon, classification par Claude (noms + bloc + exemples de cellules — pas de dates).
// 3) En dernier recours : bloc 1 + tout nom commençant par "Dr".
function heuristiqueOphtas(fiches) {
  return new Set(
    fiches.filter((p) => p.bloc === 1 || /^dr\b/i.test(stripAccents(p.nom))).map((p) => norm(p.nom))
  );
}

async function classifierOphtas(grilles, centreId, label) {
  const surcharge = process.env["MAJVAC_OPHTAS_" + centreId.toUpperCase()];
  if (surcharge) {
    return new Set(surcharge.split(",").map((s) => norm(s)).filter(Boolean));
  }

  const parNom = new Map();
  for (const g of grilles) {
    for (const p of g.personnes.values()) {
      const cle = norm(p.nom);
      if (!parNom.has(cle)) parNom.set(cle, { nom: p.nom, bloc: p.bloc, exemples: [] });
      const f = parNom.get(cle);
      f.bloc = Math.min(f.bloc, p.bloc);
      for (const v of p.cellules.values()) {
        if (f.exemples.length < 3 && !f.exemples.includes(v)) f.exemples.push(v);
      }
    }
  }
  const fiches = [...parNom.values()];
  if (!fiches.length) return new Set();
  if (!process.env.ANTHROPIC_API_KEY) return heuristiqueOphtas(fiches);

  const desc = fiches
    .map((p) => `- ${p.nom} [bloc ${p.bloc}] ex: ${p.exemples.join(" | ").slice(0, 90)}`)
    .join("\n");
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.MAJVAC_MODEL || "claude-haiku-4-5-20251001",
        max_tokens: 500,
        temperature: 0,
        system: `Tu identifies les OPHTALMOLOGUES (médecins) dans la liste du personnel d'un planning de centre de santé ophtalmologique français.
Indices : "bloc" = position du groupe de lignes dans le planning — le bloc 1 regroupe normalement les ophtalmologues, puis viennent orthoptistes/optométristes puis secrétaires (certains fichiers mélangent les blocs, utilise alors les autres indices). Un nom commençant par "Dr" est toujours un médecin. Les lignes qui ressemblent à des commentaires ("X : 2ème samedi du mois"…) ne sont personne.
Réponds UNIQUEMENT avec un JSON valide : {"ophtalmologues":["NOM", …]} — les noms EXACTEMENT comme fournis, rien d'autre.`,
        messages: [{ role: "user", content: `Centre : ${label}. Personnel du planning :\n${desc}` }],
      }),
    });
    const data = await lireJson(res, "Classification Claude");
    const texte = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
    const json = texte.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
    const parsed = JSON.parse(json);
    const noms = Array.isArray(parsed.ophtalmologues) ? parsed.ophtalmologues.map(norm).filter(Boolean) : [];
    return noms.length ? new Set(noms) : heuristiqueOphtas(fiches);
  } catch (e) {
    return heuristiqueOphtas(fiches);
  }
}

// ---------- Handler ----------
export default async (req) => {
  const reponse = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json" } });

  try {
    const creds = await getCreds();
    const manquantes = [];
    if (!creds) manquantes.push("ACCES_DROPBOX (à configurer via /api/majvac-oauth)");
    if (!process.env.ANTHROPIC_API_KEY) manquantes.push("ANTHROPIC_API_KEY");

    const url = new URL(req.url);
    const centreId = url.searchParams.get("centre");
    const vue = url.searchParams.get("vue"); // "equipe" → roster par rôle ; sinon jours sans ophta
    const semaineParam = url.searchParams.get("semaine"); // YYYY-MM-DD (jour dans la semaine voulue)
    const nbMois = Math.min(Math.max(parseInt(url.searchParams.get("months") || "3", 10) || 3, 1), 3);
    // Un mois précis peut être demandé (scan découpé pour rester sous la limite de temps Netlify)
    const moisParam = parseInt(url.searchParams.get("mois") || "0", 10);
    const anneeParam = parseInt(url.searchParams.get("annee") || "0", 10);
    const periode =
      moisParam >= 1 && moisParam <= 12 && anneeParam >= 2024
        ? [{ mois: moisParam, annee: anneeParam, nom: MOIS[moisParam - 1] }]
        : moisAnalyses(nbMois);

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
    if (!creds) return reponse({ error: "Configuration incomplète", manquantes }, 503);

    try {
      const token = await dropboxToken(creds);

      // ----- Vue « Équipe » : qui travaille par rôle sur une semaine -----
      if (vue === "equipe") {
        const joursSemaine = semaineDe(semaineParam); // lundi → samedi
        // Mois à charger = mois distincts couverts par la semaine (déborde parfois).
        const moisNeeded = [...new Set(joursSemaine.map((iso) => iso.slice(0, 7)))].map((ym) => {
          const [a, mm] = ym.split("-").map(Number);
          return { mois: mm, annee: a, nom: MOIS[mm - 1] };
        });
        const grillesE = [];
        const fichiersE = [];
        const erreursE = [];
        for (const m of moisNeeded) {
          const f = await trouverPlanning(token, centre, m);
          if (!f) {
            erreursE.push(`Planning ${m.nom} ${m.annee} introuvable`);
            continue;
          }
          const buffer = await dropboxDownload(token, f.id);
          grillesE.push(parseGrille(xlsxVersLignes(buffer), m.mois, m.annee));
          fichiersE.push({ name: f.name, mois: m.mois, annee: m.annee });
        }
        const ophtasSetE = grillesE.length ? await classifierOphtas(grillesE, centreId, centre.label) : new Set();
        const roles = construireEquipe(grillesE, joursSemaine, ophtasSetE);
        return reponse({
          centre: centreId,
          label: centre.label,
          vue: "equipe",
          semaine: { debut: joursSemaine[0], fin: joursSemaine[5], jours: joursSemaine },
          roles,
          ophtalmologues: [...ophtasSetE],
          fichiers: fichiersE,
          erreurs: erreursE,
        });
      }

      const fichiers = [];
      const grilles = [];
      const erreurs = [];

      for (const m of periode) {
        const f = await trouverPlanning(token, centre, m);
        if (!f) {
          erreurs.push(`Planning ${m.nom} ${m.annee} introuvable`);
          continue;
        }
        const buffer = await dropboxDownload(token, f.id);
        const grille = parseGrille(xlsxVersLignes(buffer), m.mois, m.annee);
        if (!grille.dates.size) erreurs.push(`${f.name} : aucune ligne d'en-tête de dates reconnue`);
        fichiers.push({ name: f.name, path: f.path_display, mois: m.mois, annee: m.annee });
        grilles.push(grille);
      }

      // Seules les dates des mois demandés sont retournées (évite les doublons
      // quand une semaine déborde sur le mois voisin dans le fichier).
      const moisDemandes = new Set(periode.map((m) => `${m.annee}-${String(m.mois).padStart(2, "0")}`));
      const ophtasSet = grilles.length ? await classifierOphtas(grilles, centreId, centre.label) : new Set();

      const parDate = new Map();
      for (const grille of grilles) {
        for (const d of calculerJours(grille, ophtasSet)) {
          if (!moisDemandes.has(d.date.slice(0, 7))) continue;
          if (!parDate.has(d.date)) parDate.set(d.date, d);
        }
      }
      const days = [...parDate.values()].sort((a, b) => a.date.localeCompare(b.date));

      return reponse({
        centre: centreId,
        label: centre.label,
        periode,
        fichiers,
        ophtalmologues: [...ophtasSet],
        days,
        erreurs,
      });
    } catch (e) {
      return reponse({ centre: centreId, label: centre.label, error: String(e.message || e) }, 502);
    }
  } catch (e) {
    return reponse({ error: String((e && e.message) || e) }, 500);
  }
};

export const config = { path: "/api/majvac" };

// Exports internes pour les tests
export { moisAnalyses, trouverPlanning, xlsxVersTexte, xlsxVersLignes, parseGrille, lireCellule, calculerJours, classifierOphtas, semaineDe, roleDe, construireEquipe };
