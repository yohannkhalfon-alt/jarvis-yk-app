// Rappels de vacation automatiques — médecins VACATAIRES uniquement.
//
// À J-2 (avec rattrapage J-1 et jour J pour les ajouts tardifs), un mail de
// confirmation part depuis la boîte DIRECTION du centre concerné vers le
// médecin (adresse de l'annuaire config.medecinsEmails) avec le cabinet de
// recrutement ALPHIKA en copie ; si l'adresse du médecin est inconnue, le
// mail part à ALPHIKA seul en lui demandant de transmettre.
//
// Chaque envoi est journalisé dans le blob cdd "rappels/journal.json"
// (clé "centre|date|NOM") : jamais deux mails pour la même vacation.
import { getStore } from "@netlify/blobs";

const CENTRES_LABELS = {
  argenteuil: "Argenteuil",
  annecy: "Annecy",
  tremblay: "Tremblay-en-France",
  sartrouville: "Sartrouville",
  antony: "Antony",
};
// Adresses des sièges des 5 associations (mêmes que les contrats CDD).
const ADRESSES = {
  argenteuil: "2 rue Antonin Georges Belin, 95100 Argenteuil",
  annecy: "6 avenue d'Aléry, 74000 Annecy",
  tremblay: "149 avenue Gilbert Berger, 93290 Tremblay-en-France",
  sartrouville: "153 avenue du Général de Gaulle, 78500 Sartrouville",
  antony: "22-24 rue Maurice Labrousse, 92160 Antony",
};
const ALPHIKA_DEFAUT = ["felasri@alphika.com", "kkostantakis@alphika.com"];

const stripAccents = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "");
const norm = (s) => stripAccents(s).toUpperCase().replace(/\s+/g, " ").trim();
const tokensNom = (nom) => norm(nom).replace(/^DR\.?\s+/, "").split(/[\s,'-]+/).filter(Boolean);
const echapHtml = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const JOURS_FR = ["dimanche", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi"];
function dateLongue(iso) {
  const d = new Date(iso + "T12:00:00Z");
  return `${JOURS_FR[d.getUTCDay()]} ${d.getUTCDate()} ${MOIS_FR[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
function joliNom(brut) {
  const n = String(brut).replace(/^dr\.?\s+/i, "").trim().toLowerCase();
  return n.replace(/(^|[\s-])([a-zà-ÿ])/g, (m, sep, c) => sep + c.toUpperCase());
}
function joliHeures(h) {
  const m = String(h).match(/^(\d{1,2})H?(\d{2})?-(\d{1,2})H?(\d{2})?$/i);
  if (!m) return h;
  const f = (hh, mn) => parseInt(hh, 10) + "h" + (mn && mn !== "00" ? mn : "");
  return `de ${f(m[1], m[2])} à ${f(m[3], m[4])}`;
}
function aujourdhuiParis() {
  const p = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  return new Date(Date.UTC(p.getFullYear(), p.getMonth(), p.getDate(), 12)).toISOString().slice(0, 10);
}
const ecartJours = (iso, auj) =>
  Math.round((new Date(iso + "T12:00:00Z") - new Date(auj + "T12:00:00Z")) / 86400000);

// Adresse du médecin dans l'annuaire { "KOKKINOS": "zak...@gmail.com", ... } :
// un jeton du nom planning doit correspondre à un jeton d'une clé de l'annuaire.
function emailDuMedecin(nom, annuaire) {
  const jetons = new Set(tokensNom(nom));
  for (const [cle, email] of Object.entries(annuaire || {})) {
    if (!email || !String(email).includes("@")) continue;
    if (tokensNom(cle).some((t) => jetons.has(t))) return String(email).trim();
  }
  return null;
}

function corpsMail({ nomJoli, dateTxt, heuresTxt, centreLabel, adresse, viaAlphika }) {
  const intro = viaAlphika
    ? `<p>Bonjour,</p><p>Sauf erreur de notre part, nous n'avons pas l'adresse email directe du <b>Dr ${echapHtml(nomJoli)}</b> — merci de bien vouloir lui transmettre la confirmation ci-dessous.</p>`
    : `<p>Bonjour Docteur ${echapHtml(nomJoli)},</p>`;
  return `${intro}
<p>Nous vous confirmons votre vacation du <b>${echapHtml(dateTxt)}</b>, ${echapHtml(heuresTxt)}, au <b>centre d'ophtalmologie de ${echapHtml(centreLabel)}</b> (${echapHtml(adresse)}).</p>
<p>En cas d'empêchement ou de question, merci de nous prévenir au plus vite en répondant simplement à ce mail.</p>
<p>À très bientôt,<br>La direction — Centre d'ophtalmologie de ${echapHtml(centreLabel)}<br><span style="color:#889;font-size:12px">Groupe Ophtalmologie Medical</span></p>`;
}

// Lance une passe de rappels. `site` = origine https du site (pour appeler
// /api/majvac). Retourne un bilan détaillé ; n'envoie JAMAIS deux fois le
// même rappel (journal), et ne touche pas aux médecins en CDI (filtrés en
// amont par la vue cdd de majvac).
export async function envoyerRappels(site) {
  const store = getStore("cdd");
  const cle = process.env.BREVO_API_KEY || (await store.get("secret/brevo")) || "";
  const cfg = (await store.get("config.json", { type: "json" })) || {};
  const fromByCentre = cfg.fromByCentre || {};
  const annuaire = cfg.medecinsEmails || {};
  const copie = (Array.isArray(cfg.rappelsCopie) && cfg.rappelsCopie.length ? cfg.rappelsCopie : ALPHIKA_DEFAUT)
    .filter((x) => String(x).includes("@"));
  const journal = (await store.get("rappels/journal.json", { type: "json" })) || {};
  const auj = aujourdhuiParis();
  const bilan = { envoyes: [], ignores: 0, erreurs: [] };
  if (!cle) { bilan.erreurs.push("Clé Brevo absente"); return bilan; }

  let changement = false;
  for (const centreId of Object.keys(CENTRES_LABELS)) {
    let data;
    try {
      const r = await fetch(`${site}/api/majvac?centre=${centreId}&vue=cdd`);
      data = await r.json();
      if (data.error) throw new Error(data.error);
    } catch (e) {
      bilan.erreurs.push(`${centreId} : ${String(e.message || e).slice(0, 120)}`);
      continue;
    }
    for (const v of data.vacations || []) {
      const e = ecartJours(v.date, auj);
      if (e < 0 || e > 2) continue; // envoi à J-2, rattrapage J-1 / jour J
      const cleJ = `${centreId}|${v.date}|${norm(v.nom)}`;
      if (journal[cleJ]) { bilan.ignores++; continue; }
      const expediteur = fromByCentre[centreId];
      if (!expediteur) { bilan.erreurs.push(`${centreId} : boîte direction non configurée`); continue; }

      const emailDr = emailDuMedecin(v.nom, annuaire);
      const nomJoli = joliNom(v.nom);
      const dateTxt = dateLongue(v.date);
      const heuresTxt = joliHeures(v.heures);
      const centreLabel = CENTRES_LABELS[centreId];
      const to = emailDr
        ? [{ email: emailDr, name: `Dr ${nomJoli}` }]
        : copie.map((email) => ({ email }));
      const cc = emailDr && copie.length ? copie.map((email) => ({ email })) : undefined;

      try {
        const r = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": cle, "content-type": "application/json" },
          body: JSON.stringify({
            sender: { name: `Centre d'ophtalmologie de ${centreLabel}`, email: expediteur },
            replyTo: { email: expediteur },
            to,
            ...(cc ? { cc } : {}),
            subject: `Confirmation de votre vacation — ${dateTxt} (${centreLabel})`,
            htmlContent: corpsMail({ nomJoli, dateTxt, heuresTxt, centreLabel, adresse: ADRESSES[centreId] || "", viaAlphika: !emailDr }),
          }),
        });
        if (!r.ok) throw new Error(`Brevo ${r.status} : ${(await r.text()).slice(0, 120)}`);
        journal[cleJ] = {
          quand: new Date().toISOString(),
          mode: emailDr ? "medecin+copie" : "copie-seule",
          centre: centreId, date: v.date, nom: v.nom, heures: v.heures,
        };
        changement = true;
        bilan.envoyes.push({ centre: centreId, date: v.date, nom: v.nom, mode: journal[cleJ].mode });
      } catch (err) {
        bilan.erreurs.push(`${centreId} ${v.date} ${v.nom} : ${String(err.message || err).slice(0, 160)}`);
      }
    }
  }
  if (changement) await store.setJSON("rappels/journal.json", journal);
  return bilan;
}
