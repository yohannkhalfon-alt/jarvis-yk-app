// Verifie que les applications n'en forment qu'une : un seul manifeste, une
// portee couvrant tout le site, et la barre d'onglets presente sur les pages
// internes mais absente de la page publique des medecins.
//
//   node .test-pwa.mjs
//
// Playwright n'est pas une dependance du projet : si absent, le test le dit
// et s'arrete sans echouer.
import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import http from "node:http";

let chromium;
try { ({ chromium } = await import("playwright")); }
catch {
  console.log("⏭  Playwright absent — test ignoré. Pour l'exécuter : npm i -D playwright && npx playwright install chromium");
  process.exit(0);
}

const RACINE = new URL("./", import.meta.url).pathname;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png",
};
const serveur = http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel.endsWith("/")) rel += "index.html";
  const f = join(RACINE, rel);
  if (!existsSync(f)) { res.writeHead(404); res.end("introuvable"); return; }
  res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((r) => serveur.listen(0, r));
const base = `http://127.0.0.1:${serveur.address().port}`;

const nav = await chromium.launch();
const page = await nav.newPage({ viewport: { width: 390, height: 844 } });
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(String(e)));

let echecs = 0;
const ok = (nom, cond) => { console.log((cond ? "✔ " : "✘ ") + nom); if (!cond) echecs++; };

// --- Une seule application ---
console.log("\n=== Une seule application ===");
const INTERNES = ["/", "/vac/", "/vac/equipe.html", "/sign/", "/sign/scan.html", "/cdd/admin.html"];
const manifestes = new Set();
for (const url of INTERNES) {
  await page.goto(base + url);
  const href = await page.$eval('link[rel="manifest"]', (l) => l.getAttribute("href")).catch(() => null);
  ok(`${url.padEnd(20)} déclare un manifeste`, Boolean(href));
  if (href) manifestes.add(href);
}
ok("toutes les pages pointent vers le même manifeste", manifestes.size === 1);

const manifeste = JSON.parse(readFileSync(join(RACINE, "vac/manifest.webmanifest"), "utf-8"));
ok("sa portée couvre tout le site, pas seulement /vac/", manifeste.scope === "/");
ok("il s'ouvre sur MAJ VAC, comme avant", manifeste.start_url === "/vac/");
ok("l'étiquette de l'icône reste « MAJ VAC »", manifeste.short_name === "MAJ VAC");

// L'ancienne icone de Signature doit, elle aussi, couvrir tout le site :
// personne n'a a reinstaller quoi que ce soit.
const ancien = JSON.parse(readFileSync(join(RACINE, "sign/manifest.webmanifest"), "utf-8"));
ok("une icône JARVIS SIGN déjà installée couvre aussi tout le site", ancien.scope === "/");

// --- Barre d'onglets ---
console.log("\n=== Barre d'onglets ===");
for (const [url, attendu] of [["/vac/", "MAJ VAC"], ["/sign/", "Signature"],
                              ["/sign/scan.html", "Photo → PDF"], ["/cdd/admin.html", "CDD"]]) {
  await page.goto(base + url);
  await page.waitForSelector(".jarvis-nav a", { timeout: 5000 }).catch(() => {});
  const libelles = await page.$$eval(".jarvis-nav a", (n) => n.map((a) => a.textContent.trim()));
  const actifs = await page.$$eval(".jarvis-nav a.actif", (n) => n.map((a) => a.textContent.trim()));
  ok(`${url.padEnd(20)} les quatre onglets sont là`, libelles.length === 4);
  ok(`${url.padEnd(20)} l'onglet actif est « ${attendu} »`, actifs.length === 1 && actifs[0] === attendu);
}

// La barre ne doit jamais apparaitre sur la page ou les medecins reservent :
// elle leur montrerait les outils internes.
await page.goto(base + "/cdd/");
ok("la page publique des médecins n'a pas la barre interne", (await page.$$(".jarvis-nav")).length === 0);
ok("et ne déclare pas le manifeste de l'application interne",
  (await page.$$('link[rel="manifest"]')).length === 0);

ok("aucune erreur JS sur l'ensemble des pages", erreurs.length === 0);
if (erreurs.length) console.log(erreurs.join("\n"));

await nav.close();
serveur.close();
console.log(echecs ? `\n${echecs} échec(s).` : "\nApplication unifiée : tout passe.");
process.exit(echecs ? 1 : 0);
