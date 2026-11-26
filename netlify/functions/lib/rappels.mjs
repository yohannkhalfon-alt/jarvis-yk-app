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

const deCentre = (label) => (/^[AEIOUYH]/i.test(label) ? "d'" : "de ") + label;
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

// Heures "09H-19H" → ["09:00","19:00"] (défaut 9h-19h si illisible).
function bornesHeures(h) {
  const m = String(h).match(/^(\d{1,2})H?(\d{2})?-(\d{1,2})H?(\d{2})?$/i);
  if (!m) return [["09", "00"], ["19", "00"]];
  return [[m[1].padStart(2, "0"), m[2] || "00"], [m[3].padStart(2, "0"), m[4] || "00"]];
}
const icsEchap = (s) => String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

// Invitation agenda : à l'ouverture du mail, la vacation se greffe dans
// l'agenda du médecin (Gmail / iPhone / Outlook reconnaissent le .ics joint).
// METHOD:REQUEST + le médecin en participant → proposition d'ajout directe.
export function fabriquerIcs({ centreId, centreLabel, adresse, dateIso, heures, nomJoli, emailDr, expediteur }) {
  const [[h1, mn1], [h2, mn2]] = bornesHeures(heures);
  const d = dateIso.replace(/-/g, "");
  const horodatage = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";
  const lignes = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Groupe Ophtalmologie Medical//JARVIS//FR",
    "VERSION:2.0",
    emailDr ? "METHOD:REQUEST" : "METHOD:PUBLISH",
    "BEGIN:VTIMEZONE",
    "TZID:Europe/Paris",
    "BEGIN:STANDARD",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "END:STANDARD",
    "BEGIN:DAYLIGHT",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "END:DAYLIGHT",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:vacation-${centreId}-${dateIso}-${norm(nomJoli).replace(/[^A-Z0-9]+/g, "-")}@jarvis-yk-app.netlify.app`,
    `DTSTAMP:${horodatage}`,
    `DTSTART;TZID=Europe/Paris:${d}T${h1}${mn1}00`,
    `DTEND;TZID=Europe/Paris:${d}T${h2}${mn2}00`,
    `SUMMARY:${icsEchap(`Vacation — Centre d'ophtalmologie ${deCentre(centreLabel)}`)}`,
    `LOCATION:${icsEchap(adresse)}`,
    `DESCRIPTION:${icsEchap(`Vacation du Dr ${nomJoli} au centre d'ophtalmologie ${deCentre(centreLabel)}. En cas d'empêchement, répondre au mail de confirmation.`)}`,
    `ORGANIZER;CN=${icsEchap(`Centre d'ophtalmologie ${deCentre(centreLabel)}`)}:mailto:${expediteur}`,
    ...(emailDr ? [`ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE;CN=${icsEchap("Dr " + nomJoli)}:mailto:${emailDr}`] : []),
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lignes.join("\r\n");
}

// Lien « Ajouter à Google Agenda » (fonctionne aussi sans le .ics).
export function lienGoogleAgenda({ centreLabel, adresse, dateIso, heures }) {
  const [[h1, mn1], [h2, mn2]] = bornesHeures(heures);
  const d = dateIso.replace(/-/g, "");
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: `Vacation — Centre d'ophtalmologie ${deCentre(centreLabel)}`,
    dates: `${d}T${h1}${mn1}00/${d}T${h2}${mn2}00`,
    ctz: "Europe/Paris",
    location: adresse,
  });
  return "https://calendar.google.com/calendar/render?" + q.toString();
}

function corpsMail({ nomJoli, dateTxt, heuresTxt, centreLabel, adresse, viaAlphika, lienAgenda }) {
  const intro = viaAlphika
    ? `<p>Bonjour,</p><p>Sauf erreur de notre part, nous n'avons pas l'adresse email directe du <b>Dr ${echapHtml(nomJoli)}</b> — merci de bien vouloir lui transmettre la confirmation ci-dessous.</p>`
    : `<p>Bonjour Docteur ${echapHtml(nomJoli)},</p>`;
  return `${intro}
<p>Nous vous confirmons votre vacation du <b>${echapHtml(dateTxt)}</b>, ${echapHtml(heuresTxt)}, au <b>centre d'ophtalmologie ${echapHtml(deCentre(centreLabel))}</b> (${echapHtml(adresse)}).</p>
<p style="margin:18px 0"><a href="${lienAgenda}" style="background:#1B6FD8;color:#fff;padding:11px 20px;border-radius:8px;text-decoration:none;font-weight:700">📅 Ajouter à mon agenda</a><br>
<span style="color:#889;font-size:12px">L'invitation agenda est aussi jointe à ce mail (fichier .ics) — un appui et la vacation est dans votre calendrier.</span></p>
<p>En cas d'empêchement ou de question, merci de nous prévenir au plus vite en répondant simplement à ce mail.</p>
<p>À très bientôt,<br>La direction — Centre d'ophtalmologie ${echapHtml(deCentre(centreLabel))}<br><span style="color:#889;font-size:12px">Groupe Ophtalmologie Medical</span></p>`;
}

// Envoi d'UN mail de confirmation d'exemple (vacation fictive de demain à
// Argenteuil) vers une adresse donnée — pour voir le rendu + l'invitation
// agenda sans toucher au journal ni aux médecins.
export async function envoyerExemple(destinataire) {
  const store = getStore("cdd");
  const cle = process.env.BREVO_API_KEY || (await store.get("secret/brevo")) || "";
  const cfg = (await store.get("config.json", { type: "json" })) || {};
  const expediteur = (cfg.fromByCentre || {}).argenteuil;
  if (!cle || !expediteur) return { ok: false, erreur: "Brevo ou boîte Argenteuil non configurés" };
  const auj = aujourdhuiParis();
  const demain = new Date(new Date(auj + "T12:00:00Z").getTime() + 86400000).toISOString().slice(0, 10);
  const centreLabel = CENTRES_LABELS.argenteuil, adresse = ADRESSES.argenteuil;
  const nomJoli = "Exemple (Test Jarvis)", heures = "09H-19H";
  const ics = fabriquerIcs({ centreId: "argenteuil", centreLabel, adresse, dateIso: demain, heures, nomJoli, emailDr: destinataire, expediteur });
  const lienAgenda = lienGoogleAgenda({ centreLabel, adresse, dateIso: demain, heures });
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": cle, "content-type": "application/json" },
    body: JSON.stringify({
      sender: { name: `Centre d'ophtalmologie ${deCentre(centreLabel)}`, email: expediteur },
      replyTo: { email: expediteur },
      to: [{ email: destinataire }],
      subject: `[TEST] Confirmation de votre vacation — ${dateLongue(demain)} (${centreLabel})`,
      htmlContent: corpsMail({ nomJoli, dateTxt: dateLongue(demain), heuresTxt: joliHeures(heures), centreLabel, adresse, viaAlphika: false, lienAgenda }),
      attachment: [{ name: "vacation.ics", content: Buffer.from(ics, "utf8").toString("base64") }],
    }),
  });
  return { ok: r.ok, statut: r.status };
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
        const adresse = ADRESSES[centreId] || "";
        const ics = fabriquerIcs({ centreId, centreLabel, adresse, dateIso: v.date, heures: v.heures, nomJoli, emailDr, expediteur });
        const lienAgenda = lienGoogleAgenda({ centreLabel, adresse, dateIso: v.date, heures: v.heures });
        const r = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": cle, "content-type": "application/json" },
          body: JSON.stringify({
            sender: { name: `Centre d'ophtalmologie ${deCentre(centreLabel)}`, email: expediteur },
            replyTo: { email: expediteur },
            to,
            ...(cc ? { cc } : {}),
            subject: `Confirmation de votre vacation — ${dateTxt} (${centreLabel})`,
            htmlContent: corpsMail({ nomJoli, dateTxt, heuresTxt, centreLabel, adresse, viaAlphika: !emailDr, lienAgenda }),
            attachment: [{ name: "vacation.ics", content: Buffer.from(ics, "utf8").toString("base64") }],
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
