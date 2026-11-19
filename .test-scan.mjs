// Tests navigateur de JARVIS SCAN (onglet Photo → PDF) : detection de la
// feuille, recadrage, fond ramene au blanc, nom de fichier, PDF produit.
//
//   node .test-scan.mjs
//
// Les photos sont fabriquees dans le navigateur (feuille claire sur fond
// bois, eclairage inegal, legere marge) : aucun document reel n'est stocke
// dans le depot. Playwright n'est pas une dependance du projet : si absent,
// le test le dit et s'arrete sans echouer.
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
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8" };
const serveur = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]);
  const f = join(RACINE, rel === "/" ? "/sign/scan.html" : rel);
  if (!existsSync(f)) { res.writeHead(404); res.end("introuvable"); return; }
  res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
  res.end(readFileSync(f));
});
await new Promise((r) => serveur.listen(0, r));
const base = `http://127.0.0.1:${serveur.address().port}`;

const nav = await chromium.launch();
const page = await nav.newPage();
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(String(e)));
await page.goto(base + "/sign/scan.html");

let echecs = 0;
const ok = (nom, cond) => { console.log((cond ? "✔ " : "✘ ") + nom); if (!cond) echecs++; };

console.log("\n=== Onglet Photo → PDF ===");
ok("la page se charge sans erreur JS", erreurs.length === 0);
ok("l'onglet actif est Photo → PDF", await page.$eval("nav a.actif", (a) => a.textContent.includes("Photo")));
ok("le téléchargement est fermé tant qu'il n'y a pas de page", await page.$eval("#telecharger", (b) => b.disabled));

// Fabrique deux « photos » : feuille blanche texte noir, sur fond bois,
// avec un dégradé d'éclairage et une bande sombre en bas (bord de table).
await page.evaluate(async () => {
  const photo = (titre, lignes) => {
    const c = document.createElement("canvas");
    c.width = 900; c.height = 1200;
    const x = c.getContext("2d");
    x.fillStyle = "#6b4a2f"; x.fillRect(0, 0, c.width, c.height);          // bois
    for (let i = 0; i < 4000; i++) {                                        // grain du bois
      x.fillStyle = `rgba(0,0,0,${Math.random() * 0.25})`;
      x.fillRect(Math.random() * c.width, Math.random() * c.height, 3, 1);
    }
    x.fillStyle = "#111"; x.fillRect(0, c.height - 70, c.width, 70);        // bord de table
    const mx = 48, my = 40, pw = c.width - 2 * mx, ph = c.height - 2 * my;
    x.fillStyle = "#f4f2ee"; x.fillRect(mx, my, pw, ph);                    // la feuille
    x.fillStyle = "#000";
    x.font = "bold 34px sans-serif"; x.textAlign = "center";
    x.fillText(titre, c.width / 2, my + 110);
    x.font = "22px sans-serif"; x.textAlign = "left";
    lignes.forEach((l, i) => x.fillText(l, mx + 60, my + 190 + i * 40));
    const g = x.createLinearGradient(0, 0, c.width, c.height);              // eclairage inegal
    g.addColorStop(0, "rgba(0,0,0,0.26)"); g.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = g; x.fillRect(0, 0, c.width, c.height);
    return c;
  };
  const corps = ["Première ligne du document de test.", "Deuxième ligne, un peu plus longue.", "Troisième ligne."];
  const blobs = await Promise.all([
    new Promise((r) => photo("PROCES-VERBAL DE TEST", corps).toBlob(r, "image/jpeg", 0.92)),
    new Promise((r) => photo("DEUXIEME PAGE", corps).toBlob(r, "image/jpeg", 0.92)),
  ]);
  const dt = new DataTransfer();
  blobs.forEach((b, i) => dt.items.add(new File([b], `page${i + 1}.jpg`, { type: "image/jpeg" })));
  const champ = document.querySelector("#galerie");
  champ.files = dt.files;
  champ.dispatchEvent(new Event("change"));
});
await page.waitForFunction(() => document.querySelectorAll(".pg").length === 2, null, { timeout: 60000 });
ok("les deux photos deviennent deux pages", (await page.$$(".pg")).length === 2);

const stats = await page.evaluate(() => {
  const res = [];
  document.querySelectorAll(".pg img").forEach((img) => {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext("2d").drawImage(img, 0, 0);
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    const bande = Math.max(2, Math.round(c.width * 0.02));
    let bordSombre = 0, bordTotal = 0, encre = 0, blanc = 0, total = 0;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const v = d[(y * c.width + x) * 4];
        total++;
        if (v < 110) encre++;
        if (v > 245) blanc++;
        if (x < bande || x >= c.width - bande || y < bande || y >= c.height - bande) {
          bordTotal++; if (v < 110) bordSombre++;
        }
      }
    }
    res.push({ larg: c.width, haut: c.height, bord: bordSombre / bordTotal, encre: encre / total, blanc: blanc / total });
  });
  return res;
});

stats.forEach((s, i) => {
  console.log(`   page ${i + 1} : ${s.larg}×${s.haut}, bord sombre ${(s.bord * 100).toFixed(1)} %, encre ${(s.encre * 100).toFixed(1)} %, blanc ${(s.blanc * 100).toFixed(1)} %`);
  ok(`page ${i + 1} : la page est au format A4`, Math.abs(s.haut / s.larg - 2339 / 1654) < 0.02);
  ok(`page ${i + 1} : le fond (bois, bord de table) est écarté`, s.bord < 0.02);
  ok(`page ${i + 1} : le texte est conservé`, s.encre > 0.002);
  ok(`page ${i + 1} : l'éclairage inégal est ramené au blanc`, s.blanc > 0.8);
});

// Le nom du fichier est libre et sert au téléchargement.
await page.fill("#nom", "Mon document 2026");
const dl = page.waitForEvent("download", { timeout: 60000 });
await page.click("#telecharger");
const fichier = await dl;
ok("le PDF est téléchargé sous le nom saisi", fichier.suggestedFilename() === "Mon document 2026.pdf");

// Les caractères interdits dans un nom de fichier sont retirés.
await page.fill("#nom", 'PV 21/10 : "JEAY" ?');
const dl2 = page.waitForEvent("download", { timeout: 60000 });
await page.click("#telecharger");
ok("les caractères interdits sont retirés du nom",
  (await dl2).suggestedFilename() === "PV 21 10 JEAY.pdf");

// Suppression d'une page.
await page.click('.pg button[data-a="suppr"][data-i="0"]');
ok("une page peut être supprimée", (await page.$$(".pg")).length === 1);

await page.click("#vider");
ok("« Tout effacer » vide la liste", (await page.$$(".pg")).length === 0);
ok("et referme le téléchargement", await page.$eval("#telecharger", (b) => b.disabled));

// Choix du titre a partir d'un texte OCR (fonction pure, sans reseau).
const titres = await page.evaluate(() => ({
  simple: JarvisScan._meilleureLigne("JEAY\nPROCES-VERBAL DES DECISIONS\nLe 21 octobre 2026,"),
  court: JarvisScan._meilleureLigne("a\nbb\n12"),
}));
ok("le titre retenu est la ligne la plus « titre »", titres.simple === "PROCES-VERBAL DES DECISIONS");
ok("aucun titre n'est inventé si le texte est vide", titres.court === "");

ok("aucune erreur JS pendant toute la session", erreurs.length === 0);
if (erreurs.length) console.log(erreurs.join("\n"));

await nav.close();
serveur.close();
console.log(echecs ? `\n${echecs} échec(s).` : "\nTous les tests de JARVIS SCAN passent.");
process.exit(echecs ? 1 : 0);
