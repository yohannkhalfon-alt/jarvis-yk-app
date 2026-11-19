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
  ok(`page ${i + 1} : le fond est un blanc franc, pas un gris`, s.blanc > 0.95);
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

// Rendus : Document (noir et blanc), Gris, Couleur.
console.log("\n=== Rendus ===");
const rendus = await page.evaluate(async () => {
  // Feuille sur fond bois, texte noir, tampon rouge, signature bleue,
  // eclairage inegal, et quelques poussieres isolees.
  const c = document.createElement("canvas");
  c.width = 900; c.height = 1200;
  const x = c.getContext("2d");
  x.fillStyle = "#6b4a2f"; x.fillRect(0, 0, 900, 1200);
  x.fillStyle = "#f4f2ee"; x.fillRect(48, 40, 804, 1120);
  x.fillStyle = "#000"; x.font = "24px sans-serif";
  for (let i = 0; i < 10; i++) x.fillText("Ligne de texte noire numero " + i, 110, 200 + i * 45);
  x.strokeStyle = "#c2102a"; x.lineWidth = 7; x.strokeRect(520, 700, 230, 130);
  x.fillStyle = "#c2102a"; x.font = "bold 26px sans-serif"; x.fillText("TAMPON", 565, 775);
  x.strokeStyle = "#15389c"; x.lineWidth = 6;
  x.beginPath(); x.moveTo(150, 900); x.bezierCurveTo(250, 830, 300, 980, 420, 890); x.stroke();
  x.fillStyle = "#1a1a1a";
  for (let i = 0; i < 40; i++) x.fillRect(120 + Math.random() * 700, 980 + Math.random() * 150, 2, 2);
  const g = x.createLinearGradient(0, 0, 900, 1200);
  g.addColorStop(0, "rgba(0,0,0,0.22)"); g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g; x.fillRect(0, 0, 900, 1200);

  const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.95));
  const src = await JarvisScan.chargerFichier(new File([blob], "a.jpg", { type: "image/jpeg" }));
  const out = {};
  for (const mode of ["nb", "gris", "couleur"]) {
    const p2 = await JarvisScan.traiter(src, { rotation: 0, auto: true, mode });
    const d = p2.getContext("2d").getImageData(0, 0, p2.width, p2.height).data;
    let blanc = 0, encre = 0, rouge = 0, bleu = 0;
    const tot = d.length / 4;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], v = d[i + 1], b = d[i + 2];
      if (r >= 250 && v >= 250 && b >= 250) blanc++;
      if (r < 110 && v < 110 && b < 110) encre++;
      if (r - Math.max(v, b) > 45) rouge++;
      if (b - Math.max(r, v) > 45) bleu++;
    }
    out[mode] = { blanc: blanc / tot, encre: encre / tot, rouge: rouge / tot, bleu: bleu / tot };
  }
  return out;
});
for (const [m, v] of Object.entries(rendus))
  console.log(`   ${m.padEnd(8)} blanc ${(100 * v.blanc).toFixed(1)} %, encre ${(100 * v.encre).toFixed(2)} %, rouge ${(100 * v.rouge).toFixed(3)} %, bleu ${(100 * v.bleu).toFixed(3)} %`);

ok("Document : fond blanc franc", rendus.nb.blanc > 0.95);
ok("Document : le texte est conservé", rendus.nb.encre > 0.004);
ok("Document : les couleurs sont ramenées au noir et blanc",
  rendus.nb.rouge < 0.0002 && rendus.nb.bleu < 0.0002);
ok("Couleur : fond blanc franc aussi", rendus.couleur.blanc > 0.9);
ok("Couleur : le tampon rouge est conservé", rendus.couleur.rouge > 0.001);
ok("Couleur : la signature bleue est conservée", rendus.couleur.bleu > 0.0005);
ok("Gris : nuances conservées, donc moins de blanc pur", rendus.gris.blanc < rendus.nb.blanc);
ok("Gris : le texte est conservé", rendus.gris.encre > 0.004);

// Les boutons de rendu basculent et retraitent les pages deja prises.
await page.click('#modes .mode[data-mode="couleur"]');
ok("le rendu choisi devient le rendu actif",
  await page.$eval('#modes .mode[data-mode="couleur"]', (b) => b.classList.contains("actif")));
ok("un seul rendu est actif à la fois",
  (await page.$$eval("#modes .mode.actif", (n) => n.length)) === 1);
await page.click('#modes .mode[data-mode="nb"]');

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
