// JARVIS SIGN — tâches planifiées du module probatoire (toutes les 15 min) :
//   1. reprise d'horodatage des dossiers EN_ATTENTE_HORODATAGE (back-off),
//      avec alerte au gestionnaire au-delà de 15 minutes d'échec
//   2. relance d'envoi de la copie signée sans preuve de remise sous 48 h
//   3. purge RGPD des dossiers arrivés au terme de leur durée de conservation
import { getStore } from "@netlify/blobs";
import * as preuve from "./lib/preuve.mjs";

export default async () => {
  const store = getStore({ name: "sign", consistency: "strong" });
  const base = process.env.URL || "https://jarvis-yk-app.netlify.app";
  const { blobs } = await store.list({ prefix: "env/" });
  const bilan = { horodatages: 0, relances: 0, purges: 0, alertes: 0 };

  for (const b of blobs) {
    const env = await store.get(b.key, { type: "json" });
    if (!env?.preuve) continue;
    let modifie = false;

    // 1. reprise d'horodatage
    const att = env.preuve.attenteHorodatage;
    if (!env.preuve.finaliseLe && att && new Date(att.prochainEssai) <= new Date()) {
      const res = await fetch(base + "/api/sign", {
        method: "POST",
        headers: { "content-type": "application/json", "x-sign-code": process.env.SIGN_ADMIN_CODE || "" },
        body: JSON.stringify({ action: "reprise-horodatage", id: env.id }),
      }).then((r) => r.json()).catch(() => ({}));
      if (res.finalise) bilan.horodatages++;
      else if (!att.alerte && Date.now() - new Date(att.depuis).getTime() > 15 * 60000) {
        await preuve.alerter(env.fromEmail, "Horodatage en échec depuis 15 minutes — " + env.title,
          `<p>La signature de <b>${env.title}</b> attend son jeton d'horodatage qualifié depuis ${Math.round((Date.now() - new Date(att.depuis)) / 60000)} minutes.</p>` +
          `<p>Le document <b>n'est pas finalisé</b> et aucune copie n'a été envoyée. Les reprises automatiques continuent.</p>`);
        const frais = await store.get(b.key, { type: "json" });
        if (frais?.preuve?.attenteHorodatage) { frais.preuve.attenteHorodatage.alerte = true; await store.setJSON(b.key, frais); }
        bilan.alertes++;
      }
      continue; // état rafraîchi côté /api/sign
    }

    // 2. relance de la copie signée (Module 5) sous 48 h sans preuve de remise
    if (env.preuve.finaliseLe && env.status === "complet") {
      const age = Date.now() - new Date(env.preuve.finaliseLe).getTime();
      const copies = env.preuve.copies || {};
      const enSouffrance = env.signers.filter((s) => s.email && copies[s.name]?.statut !== "envoye");
      if (age > 48 * 3600000 && enSouffrance.length && !env.preuve.relanceFaite) {
        for (const s of enSouffrance) {
          await preuve.journaliser(store, env.id, "copie_relance", { signataire: s.name });
          await preuve.alerter(env.fromEmail, "Copie signée non remise après 48 h — " + env.title,
            `<p>La copie signée de <b>${env.title}</b> n'a pas pu être remise à <b>${s.name}</b>.</p>` +
            `<p>La remise d'un exemplaire étant une condition de validité pour certains actes, organisez une <b>remise en main propre contre décharge</b>.</p>`);
        }
        env.preuve.relanceFaite = new Date().toISOString();
        modifie = true;
        bilan.relances++;
      }
    }

    // 3. purge RGPD à l'échéance de conservation
    const debut = env.preuve.finaliseLe || env.createdAt;
    const echeance = new Date(debut).getTime() + (env.preuve.retentionJours || 1825) * 86400000;
    if (Date.now() > echeance) {
      for (let i = 0; i < env.signers.length; i++) { await store.delete(`sig/${env.id}/${i}`); await store.delete(`par/${env.id}/${i}`); }
      for (const c of [`pdf/${env.id}`, `signed/${env.id}`, `final/${env.id}`, `preuve/${env.id}`, `tsa/${env.id}`, `tsa-dossier/${env.id}`, `evt/${env.id}`, b.key])
        await store.delete(c);
      bilan.purges++;
      continue;
    }

    if (modifie) await store.setJSON(b.key, env);
  }
  return new Response(JSON.stringify(bilan), { headers: { "content-type": "application/json" } });
};

// Fonction planifiée : Netlify interdit d'y associer un chemin HTTP public.
// Déclenchement manuel possible via /.netlify/functions/preuve-cron (Netlify UI),
// et la reprise d'un dossier précis reste accessible par
// POST /api/sign {action:"reprise-horodatage", id} (réservé à l'admin).
export const config = { schedule: "*/15 * * * *" };
