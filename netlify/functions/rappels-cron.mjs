// Cron des rappels de vacation : deux passes par jour (matin + fin d'après-midi,
// pour attraper les vacations ajoutées tardivement au planning). La logique
// vit dans lib/rappels.mjs ; le journal garantit qu'aucune vacation ne reçoit
// deux mails.
import { envoyerRappels } from "./lib/rappels.mjs";

export default async () => {
  const site = process.env.URL || "https://jarvis-yk-app.netlify.app";
  const bilan = await envoyerRappels(site);
  console.log("rappels-cron :", JSON.stringify(bilan));
  return new Response(JSON.stringify(bilan), { headers: { "content-type": "application/json" } });
};

export const config = { schedule: "19 7,16 * * *" };
