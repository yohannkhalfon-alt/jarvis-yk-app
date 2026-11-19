// Verifie l'etancheite des espaces de JARVIS SIGN : une demande rangee dans
// un espace personnel ne doit etre lisible ni par le groupe, ni par le
// titulaire d'un autre espace — tout en laissant passer les signataires.
//
//   node .test-espaces.mjs
//
// Le magasin Netlify Blobs est remplace par un magasin en memoire : le test
// tourne sans reseau ni compte.
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";

// --- magasin en memoire, a la place de @netlify/blobs ---
// La copie de travail reste dans netlify/functions : ailleurs, elle ne
// resoudrait pas pdf-lib ni les autres dependances du projet.
const tmp = new URL("./netlify/functions/", import.meta.url).pathname;
writeFileSync(join(tmp, "blobs.mjs"), `
const donnees = new Map();
export const getStore = () => ({
  async get(k, o) {
    if (!donnees.has(k)) return null;
    const v = donnees.get(k);
    if (o?.type === "json") return JSON.parse(v);
    if (o?.type === "arrayBuffer") return v;
    return v;
  },
  async set(k, v) { donnees.set(k, v); },
  async setJSON(k, v) { donnees.set(k, JSON.stringify(v)); },
  async delete(k) { donnees.delete(k); },
  async list({ prefix }) { return { blobs: [...donnees.keys()].filter((k) => k.startsWith(prefix)).map((key) => ({ key })) }; },
});
`);

const SRC = new URL("./netlify/functions/sign.mjs", import.meta.url).pathname;
const copie = join(tmp, "sign-test.mjs");
writeFileSync(copie, readFileSync(SRC, "utf-8")
  .replace(/from "@netlify\/blobs"/, 'from "./blobs.mjs"'));
const menage = () => { for (const f of ["blobs.mjs", "sign-test.mjs"]) rmSync(join(tmp, f), { force: true }); };
process.on("exit", menage);

process.env.SIGN_ADMIN_CODE = "code-groupe";
const { default: handler } = await import("file://" + copie);

let echecs = 0;
const ok = (nom, cond) => { console.log((cond ? "✔ " : "✘ ") + nom); if (!cond) echecs++; };

const appel = async (corps, entetes = {}) => {
  const res = await handler(new Request("https://x/api/sign", {
    method: "POST", headers: { "content-type": "application/json", ...entetes },
    body: JSON.stringify(corps),
  }), {});
  return { statut: res.status, data: await res.json().catch(() => ({})) };
};
const lister = async (entetes = {}) => {
  const res = await handler(new Request("https://x/api/sign?list=1", { headers: entetes }), {});
  return { statut: res.status, data: await res.json().catch(() => ({})) };
};
const lire = async (id, entetes = {}) => {
  const res = await handler(new Request("https://x/api/sign?id=" + id, { headers: entetes }), {});
  return { statut: res.status, data: await res.json().catch(() => ({})) };
};

const GROUPE = { "x-sign-code": "code-groupe" };
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>").toString("base64");
const creer = (titre, entetes) => appel({
  action: "create", title: titre, pdfBase64: PDF,
  signers: [{ name: "Signataire test" }], dateImposee: "2026-11-19",
}, entetes);

console.log("\n=== Ouverture des espaces ===");
const a = await appel({ action: "espace-ouvrir", nom: "Yohann", motDePasse: "motdepasse-a" }, GROUPE);
ok("le premier a ouvrir un nom le crée", a.statut === 200 && a.data.creation === true);
const b = await appel({ action: "espace-ouvrir", nom: "Elie", motDePasse: "motdepasse-b" }, GROUPE);
ok("un second espace se crée à part", b.statut === 200 && b.data.creation === true);

const reouvert = await appel({ action: "espace-ouvrir", nom: "Elie", motDePasse: "motdepasse-b" }, GROUPE);
ok("le bon mot de passe rouvre l'espace", reouvert.statut === 200 && reouvert.data.creation === false);
const mauvais = await appel({ action: "espace-ouvrir", nom: "Elie", motDePasse: "pas-le-bon" }, GROUPE);
ok("un mot de passe faux est refusé", mauvais.statut === 403);
const court = await appel({ action: "espace-ouvrir", nom: "Court", motDePasse: "123" }, GROUPE);
ok("un mot de passe trop court est refusé", court.statut === 400);
const sansCode = await appel({ action: "espace-ouvrir", nom: "Pirate", motDePasse: "motdepasse" }, {});
ok("sans le code de groupe, aucun espace ne s'ouvre", sansCode.statut === 403);

const A = { ...GROUPE, "x-sign-espace": a.data.jeton };
const B = { ...GROUPE, "x-sign-espace": b.data.jeton };

console.log("\n=== Étanchéité ===");
const dGroupe = await creer("Document du groupe", GROUPE);
const dA = await creer("Document de Yohann", A);
const dB = await creer("Document d'Elie", B);
ok("les trois demandes sont créées", [dGroupe, dA, dB].every((d) => d.statut === 200));

const vueGroupe = await lister(GROUPE);
const titres = (r) => (r.data.envelopes || []).map((e) => e.title).sort();
ok("le groupe ne voit que le document du groupe",
  JSON.stringify(titres(vueGroupe)) === JSON.stringify(["Document du groupe"]));
ok("Yohann ne voit que le sien",
  JSON.stringify(titres(await lister(A))) === JSON.stringify(["Document de Yohann"]));
ok("Elie ne voit que le sien",
  JSON.stringify(titres(await lister(B))) === JSON.stringify(["Document d'Elie"]));

const idB = dB.data.envelope.id;
ok("le code de groupe seul n'ouvre pas un document personnel",
  (await lire(idB, GROUPE)).statut === 403);
ok("l'espace d'un autre ne l'ouvre pas non plus",
  (await lire(idB, A)).statut === 403);
ok("son titulaire l'ouvre", (await lire(idB, B)).statut === 200);

console.log("\n=== Ce qui doit continuer de passer ===");
const jetonSignataire = dB.data.envelope.signers[0].token;
const vueSignataire = await lire(idB, {});
ok("un document du groupe reste lisible avec le code de groupe",
  (await lire(dGroupe.data.envelope.id, GROUPE)).statut === 200);
ok("sans rien, un document personnel reste fermé", vueSignataire.statut === 403);
const res = await handler(new Request("https://x/api/sign?id=" + idB + "&token=" + jetonSignataire), {});
ok("le signataire ouvre son lien, espace personnel ou non", res.status === 200);
const parDl = await handler(new Request("https://x/api/sign?id=" + idB + "&token=" + dB.data.envelope.dlToken), {});
ok("le lien de téléchargement direct de l'expéditeur fonctionne aussi", parDl.status === 200);

console.log("\n=== Suppression ===");
ok("on ne supprime pas la demande d'un autre espace",
  (await appel({ action: "delete", id: idB }, A)).statut === 403);
ok("ni avec le seul code de groupe",
  (await appel({ action: "delete", id: idB }, GROUPE)).statut === 403);
ok("son titulaire la supprime", (await appel({ action: "delete", id: idB }, B)).statut === 200);

console.log(echecs ? `\n${echecs} échec(s).` : "\nEspaces : tout passe.");
process.exit(echecs ? 1 : 0);
