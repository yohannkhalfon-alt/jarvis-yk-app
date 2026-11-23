// JARVIS — chatbot de l'admin (propulsé par Claude). Demande Yohann (20/11) :
// un assistant en haut de l'admin, relié à la Dropbox et capable de générer
// des documents tamponnés téléchargeables (ex. attestation d'employeur).
//
// Fonctionnement : le navigateur envoie l'historique {messages}, le serveur
// fait UN tour d'appel Claude (avec outils), exécute les outils demandés et
// renvoie l'historique enrichi + done=false ; le navigateur rappelle aussitôt
// jusqu'à done=true. Chaque tour reste ainsi sous la limite de temps Netlify.
// Les documents générés sont stockés en Blobs (store "chatdocs") et
// téléchargés via GET ?doc=<id> (protégé admin, comme tout le reste).
import { getStore } from "@netlify/blobs";
import { randomBytes } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { ASSOS } from "./cdd-contrat.mjs";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const adminOk = (req) => {
  const code = process.env.CDD_ADMIN_CODE;
  return !code || req.headers.get("x-cdd-code") === code;
};

const CENTRES = { argenteuil: "Argenteuil", annecy: "Annecy", tremblay: "Tremblay-en-France", sartrouville: "Sartrouville", antony: "Antony" };

// ---------- Dropbox (mêmes identifiants que MAJ VAC) ----------
async function getCreds() {
  let key = process.env.DROPBOX_APP_KEY, secret = process.env.DROPBOX_APP_SECRET, refresh = process.env.DROPBOX_REFRESH_TOKEN;
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
async function dropboxToken() {
  if (tokenCache.value && Date.now() < tokenCache.exp - 60_000) return tokenCache.value;
  const creds = await getCreds();
  if (!creds) throw new Error("identifiants Dropbox absents");
  const res = await fetch("https://api.dropboxapi.com/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: creds.refresh, client_id: creds.key, client_secret: creds.secret }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("token Dropbox : " + JSON.stringify(data).slice(0, 150));
  tokenCache = { value: data.access_token, exp: Date.now() + (data.expires_in || 14400) * 1000 };
  return data.access_token;
}

// ---------- Outils du chatbot ----------
const OUTILS = [
  {
    name: "vacations_etat",
    description: "État JARVIS CDD + MAJ VAC : jours sans ophta par centre, dates réservables, réservations en cours, centres suspendus. Toujours à jour.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "dropbox_chercher",
    description: "Recherche de fichiers dans la Dropbox du groupe (plannings, contrats, documents). Renvoie nom, chemin, id et date de modification des meilleurs résultats.",
    input_schema: { type: "object", properties: { requete: { type: "string", description: "Mots du nom de fichier, ex. 'CDD ROSATI' ou 'PLANNING JANVIER 2027'" } }, required: ["requete"] },
  },
  {
    name: "dropbox_lire",
    description: "Lit le contenu texte d'un fichier Dropbox (Excel ou texte) à partir de son id (id:xxxx). Pour les plannings Excel, renvoie la grille en texte.",
    input_schema: { type: "object", properties: { id: { type: "string", description: "Identifiant Dropbox, format id:xxxx" } }, required: ["id"] },
  },
  {
    name: "attestation_employeur",
    description: "Génère une attestation d'employeur en PDF, sur papier de l'association du centre, tamponnée, prête à télécharger. À utiliser quand on te demande une attestation (d'emploi, de travail, d'employeur).",
    input_schema: {
      type: "object",
      properties: {
        centre: { type: "string", enum: ["argenteuil", "sartrouville", "tremblay", "antony", "annecy"] },
        civilite: { type: "string", enum: ["M", "Mme"] },
        nom: { type: "string" }, prenom: { type: "string" },
        poste: { type: "string", description: "Ex. Ophtalmologue, Orthoptiste, Secrétaire médicale" },
        typeContrat: { type: "string", description: "Ex. CDI à temps plein, CDD, CDI à temps partiel (27h/semaine)" },
        dateDebut: { type: "string", description: "Date d'embauche AAAA-MM-JJ" },
        dateFin: { type: "string", description: "Date de fin si CDD terminé, AAAA-MM-JJ, sinon omettre" },
        adresse: { type: "string", description: "Adresse du salarié si connue, sinon omettre" },
      },
      required: ["centre", "civilite", "nom", "prenom", "poste", "typeContrat", "dateDebut"],
    },
  },
  {
    name: "admin_cdd",
    description: "Exécute une action d'administration JARVIS CDD : add-slots (dates: [{date, centre, type}]), remove-slot (slotId), suspendre-centre / reactiver-centre (centre), marquer-cdi (slotId, medecin), liberer-cdi (slotId), confirm / reject (resaId). Mêmes effets que les boutons de l'admin.",
    input_schema: {
      type: "object",
      properties: {
        action: { type: "string", enum: ["add-slots", "remove-slot", "suspendre-centre", "reactiver-centre", "marquer-cdi", "liberer-cdi", "confirm", "reject"] },
        params: { type: "object", description: "Paramètres de l'action (dates, slotId, centre, medecin, resaId…)" },
      },
      required: ["action"],
    },
  },
];

// ---------- Exécution des outils ----------
const dateFr = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || "")) return iso || "";
  const [a, m, j] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, j)).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};

async function outilVacationsEtat(origin, codeAdmin) {
  const r = await fetch(`${origin}/api/cdd?list=1`, { headers: { "x-cdd-code": codeAdmin } });
  const d = await r.json();
  let dataVac = null;
  try { dataVac = await (await fetch(`${origin}/vac/data.json`)).json(); } catch (e) {}
  const joursSansOphta = {};
  if (dataVac?.centres) for (const [c, v] of Object.entries(dataVac.centres)) joursSansOphta[c] = (v.days || []).map((x) => x.date);
  return {
    joursSansOphta,
    slots: (d.slots || []).map((s) => ({ id: s.id, date: s.date, centre: s.centre, status: s.status, medecin: s.medecin })),
    reservations: (d.resas || []).map((r2) => ({ id: r2.id, nom: r2.nom, prenom: r2.prenom, centre: r2.centre, date: r2.date, jours: r2.jours, status: r2.status })),
    centresSuspendus: d.suspendus || {},
    medecinsCdi: d.config?.medecinsCdi || {},
  };
}

async function outilDropboxChercher(requete) {
  const token = await dropboxToken();
  const res = await fetch("https://api.dropboxapi.com/2/files/search_v2", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({ query: String(requete).slice(0, 120), options: { filename_only: true, file_status: "active", max_results: 12 } }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("recherche Dropbox : " + JSON.stringify(data).slice(0, 150));
  return (data.matches || []).map((m) => {
    const f = m.metadata?.metadata || {};
    return { nom: f.name, id: f.id, chemin: f.path_display, modifie: f.server_modified };
  });
}

async function outilDropboxLire(id) {
  const token = await dropboxToken();
  const res = await fetch("https://content.dropboxapi.com/2/files/download", {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "Dropbox-API-Arg": JSON.stringify({ path: String(id) }) },
  });
  if (!res.ok) throw new Error(`téléchargement Dropbox (${res.status})`);
  const meta = JSON.parse(res.headers.get("dropbox-api-result") || "{}");
  const buf = Buffer.from(await res.arrayBuffer());
  if (/\.(xlsx|xlsm)$/i.test(meta.name || "")) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(buf, { type: "buffer" });
    let texte = "";
    for (const nomFeuille of wb.SheetNames.slice(0, 3)) {
      texte += `=== ${nomFeuille} ===\n` + XLSX.utils.sheet_to_csv(wb.Sheets[nomFeuille], { blankrows: false }) + "\n";
    }
    return { nom: meta.name, contenu: texte.slice(0, 18000) };
  }
  return { nom: meta.name, contenu: buf.toString("utf-8").slice(0, 18000) };
}

async function outilAttestation(args, store) {
  const A = ASSOS[args.centre];
  if (!A) throw new Error("centre inconnu");
  const cddStore = getStore("cdd");
  const tampon = await cddStore.get(`asset/tampon-${args.centre}`, { type: "json" });

  const doc = await PDFDocument.create();
  const police = await doc.embedFont(StandardFonts.TimesRoman);
  const gras = await doc.embedFont(StandardFonts.TimesRomanBold);
  const page = doc.addPage([595.28, 841.89]);
  const MARGE = 70;
  let y = 841.89 - MARGE;
  const largeur = 595.28 - 2 * MARGE;

  const couper = (texte, f, taille, max) => {
    const mots = String(texte).split(/\s+/); const lignes = []; let l = "";
    for (const mot of mots) {
      const essai = l ? l + " " + mot : mot;
      if (f.widthOfTextAtSize(essai, taille) > max && l) { lignes.push(l); l = mot; } else l = essai;
    }
    if (l) lignes.push(l);
    return lignes;
  };
  const ecrire = (texte, { f = police, taille = 11.5, interligne = 17, apres = 10, centre = false } = {}) => {
    for (const l of couper(texte, f, taille, largeur)) {
      const x = centre ? (595.28 - f.widthOfTextAtSize(l, taille)) / 2 : MARGE;
      page.drawText(l, { x, y: y - taille, size: taille, font: f, color: rgb(0.05, 0.05, 0.1) });
      y -= interligne;
    }
    y -= apres;
  };

  // En-tête association
  for (const ligne of A.entete.split("\n")) ecrire(ligne, { taille: 10, interligne: 13, apres: 0 });
  y -= 30;
  ecrire("ATTESTATION D'EMPLOYEUR", { f: gras, taille: 16, centre: true, apres: 30 });

  const P = args.civilite === "Mme" ? { civ: "Madame", ee: "e" } : { civ: "Monsieur", ee: "" };
  const representant = (A.entete.match(/intermédiaire de (Madame|Monsieur) ([^,]+),?/) || [])[2] || "";
  const nomComplet = `${P.civ} ${String(args.prenom || "")} ${String(args.nom || "").toUpperCase()}`.trim();
  const depuis = args.dateFin
    ? `a été employé${P.ee} au sein de notre établissement du ${dateFr(args.dateDebut)} au ${dateFr(args.dateFin)}`
    : `est employé${P.ee} au sein de notre établissement depuis le ${dateFr(args.dateDebut)}`;
  ecrire(`Je soussigné(e), ${representant ? (A.entete.includes("Madame " + representant) ? "Madame " : "Monsieur ") + representant : "le représentant légal"}, agissant en qualité de représentant légal de l'${A.entete.split("\n")[0].replace(/^L['’]/, "")}, certifie que :`);
  ecrire(`${nomComplet}${args.adresse ? ", demeurant " + args.adresse : ""},`, { f: gras });
  ecrire(`${depuis}, en qualité de ${args.poste}, dans le cadre d'un ${args.typeContrat}.`);
  ecrire("La présente attestation est délivrée à la demande de l'intéressé(e) pour servir et valoir ce que de droit.", { apres: 30 });
  ecrire(`Fait à ${A.ville}, le ${new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" })}.`, { apres: 16 });
  ecrire("Pour l'employeur (tampon et signature) :", { taille: 10 });

  if (tampon?.b64) {
    try {
      const octets = Buffer.from(tampon.b64, "base64");
      const img = (tampon.mime || "").includes("png") ? await doc.embedPng(octets) : await doc.embedJpg(octets);
      const dims = img.scale(Math.min(170 / img.width, 110 / img.height));
      page.drawImage(img, { x: MARGE, y: y - dims.height - 6, width: dims.width, height: dims.height });
    } catch (e) {}
  }

  const octetsPdf = await doc.save();
  const id = randomBytes(10).toString("hex");
  const nomFichier = `Attestation employeur ${String(args.nom || "").toUpperCase()} ${args.prenom || ""}.pdf`.trim();
  await store.set(`doc/${id}`, Buffer.from(octetsPdf).toString("base64"), { metadata: { nom: nomFichier } });
  return { docId: id, nom: nomFichier, info: "PDF généré, tamponné, prêt à télécharger." };
}

const ACTIONS_ADMIN = new Set(["add-slots", "remove-slot", "suspendre-centre", "reactiver-centre", "marquer-cdi", "liberer-cdi", "confirm", "reject"]);
async function outilAdminCdd(args, origin, codeAdmin) {
  if (!ACTIONS_ADMIN.has(args.action)) throw new Error("action non autorisée");
  const r = await fetch(`${origin}/api/cdd`, {
    method: "POST",
    headers: { "x-cdd-code": codeAdmin, "content-type": "application/json" },
    body: JSON.stringify({ action: args.action, ...(args.params || {}) }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || `échec ${args.action}`);
  return { ok: true, action: args.action, resultat: d };
}

// ---------- Appel Claude ----------
const SYSTEME = `Tu es JARVIS, l'assistant du Groupe Ophtalmologie Medical (5 centres de santé d'ophtalmologie : Argenteuil, Sartrouville, Tremblay-en-France, Antony, Annecy), intégré au tableau de bord d'administration. Tu parles français, tu tutoies, tu es direct et concis.
Tes capacités (via tes outils) : consulter l'état des vacations et réservations, chercher et lire des fichiers Dropbox (plannings Excel, contrats), générer des attestations d'employeur en PDF tamponnées, et exécuter les actions d'administration JARVIS CDD.
Lecture des plannings Excel (très important) : chaque fichier est une grille par semaines (ligne NOMS + jours en colonnes), avec les salariés en BLOCS de haut en bas : 1er bloc = OPHTALMOLOGUES, 2e bloc = ORTHOPTISTES, ensuite apprentis et secrétaires. Ne mélange JAMAIS les blocs : un ophtalmologue n'est pas un orthoptiste. Repères fiables — ophtalmologues (jamais orthos) : MESKINI, SCONAMIGLIO, DI CLEMENTE, PAPAPOSTOLOU, CHARAKIDAS, HADJ SLIMANE, ADDALA/ADALLA, SAADE, CHAHINE, SPINEAN, LAHMAR, KOKKINOS, NTOVAS, ROSATI, IONITA, FDILI. Orthoptistes connus (2e bloc) : à Antony BRETON, FABRE, RABUT, ABDELATIF, STEINEUR, DUFLO, AGOUNI, MAMACHE, BEDEZ ; à Argenteuil YALINGUI, AESHLIMAN, VIGNAND, BENYOUCEF, PARIENTI ; à Tremblay DECOSTE, KAMBOUA, SAMAK, ECHI. BEN MIMOUN LENA est apprentie (pas titulaire). Une cellule avec plage horaire (ex 9H-19H) = travaille ; OFF, ABS, CP, ARRET, Fermé, FERIE ou vide = ne travaille pas. En cas de doute sur le bloc d'un nom, dis-le au lieu de deviner.
Style de réponse : COURT et direct. Donne la réponse tout de suite, sans raisonnement à voix haute, sans « laisse-moi reprendre », sans répéter la question, sans avertissements inutiles. Une liste simple plutôt qu'un gros tableau. 10 lignes maximum sauf si on te demande le détail.
Captures d'écran (WhatsApp, mails…) : quand on te colle une capture d'un message d'un employé, identifie qui écrit (vérifie son contexte réel avec tes outils : plannings, absences, arrêts, réservations), résume ce qu'il demande, puis propose une réponse WhatsApp prête à copier-coller : tutoiement, chaleureuse mais pro, sans donnée sensible (jamais de salaire, de diagnostic ou d'info sur un autre salarié), sans numéro ni adresse. Si tu n'es pas sûr de l'identité ou du contexte, dis-le et pose la question plutôt que d'inventer.
Règles : pour une attestation, demande les informations manquantes avant de générer (centre, civilité, nom, prénom, poste, type de contrat, date d'embauche). Pour une action d'administration qui modifie des données (suppression, suspension, validation), reformule d'abord ce que tu vas faire et attends un « oui » avant d'appeler l'outil. Un médecin déjà en CDI dans la structure ne signe jamais de CDD pour une vacation. Ne donne jamais d'information que tes outils ne confirment pas.`;

async function appelClaude(messages) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.JARVIS_CHAT_MODEL || "claude-opus-4-8",
      max_tokens: 2000,
      system: SYSTEME,
      tools: OUTILS,
      messages,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error("Claude : " + JSON.stringify(data?.error || data).slice(0, 200));
  return data;
}

// ---------- Point d'entrée ----------
export default async (req) => {
  if (!adminOk(req)) return json({ error: "code admin invalide" }, 401);
  const url = new URL(req.url);
  const store = getStore("chatdocs");

  // Téléchargement d'un document généré
  const docId = url.searchParams.get("doc");
  if (req.method === "GET" && docId) {
    const b64 = await store.get(`doc/${docId.replace(/[^a-f0-9]/g, "")}`);
    if (!b64) return json({ error: "document introuvable ou expiré" }, 404);
    const meta = await store.getMetadata(`doc/${docId.replace(/[^a-f0-9]/g, "")}`);
    const nom = meta?.metadata?.nom || "document.pdf";
    return new Response(Buffer.from(b64, "base64"), {
      headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${nom.replace(/"/g, "")}"` },
    });
  }

  if (req.method !== "POST") return json({ error: "méthode non autorisée" }, 405);
  if (!process.env.ANTHROPIC_API_KEY) return json({ error: "ANTHROPIC_API_KEY absente sur Netlify" }, 500);
  let body;
  try { body = await req.json(); } catch { return json({ error: "JSON invalide" }, 400); }
  const messages = Array.isArray(body.messages) ? body.messages.slice(-40) : null;
  if (!messages?.length) return json({ error: "messages manquants" }, 400);

  const codeAdmin = req.headers.get("x-cdd-code") || "";
  const reponse = await appelClaude(messages);
  const contenus = reponse.content || [];
  const demandes = contenus.filter((c) => c.type === "tool_use");

  // Pas d'outil demandé : réponse finale
  if (reponse.stop_reason !== "tool_use" || !demandes.length) {
    const texte = contenus.filter((c) => c.type === "text").map((c) => c.text).join("\n");
    return json({ done: true, texte, messages: [...messages, { role: "assistant", content: contenus }] });
  }

  // Exécuter les outils demandés, renvoyer l'historique — le client rappelle.
  const resultats = [];
  const docs = [];
  for (const d of demandes) {
    let resultat;
    try {
      if (d.name === "vacations_etat") resultat = await outilVacationsEtat(url.origin, codeAdmin);
      else if (d.name === "dropbox_chercher") resultat = await outilDropboxChercher(d.input.requete);
      else if (d.name === "dropbox_lire") resultat = await outilDropboxLire(d.input.id);
      else if (d.name === "attestation_employeur") { resultat = await outilAttestation(d.input, store); docs.push({ id: resultat.docId, nom: resultat.nom }); }
      else if (d.name === "admin_cdd") resultat = await outilAdminCdd(d.input, url.origin, codeAdmin);
      else resultat = { erreur: "outil inconnu" };
    } catch (e) {
      resultat = { erreur: String(e.message || e).slice(0, 300) };
    }
    resultats.push({ type: "tool_result", tool_use_id: d.id, content: JSON.stringify(resultat).slice(0, 25000) });
  }

  return json({
    done: false,
    docs,
    messages: [...messages, { role: "assistant", content: contenus }, { role: "user", content: resultats }],
  });
};

export const config = { path: "/api/chat" };
