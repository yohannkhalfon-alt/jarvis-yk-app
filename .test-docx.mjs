// Conversion Word → PDF : exécute le vrai code du navigateur (sign/docx2pdf.js
// + sign/vendor/*) dans Chromium, sur de vrais fichiers .docx, et vérifie que
// le PDF produit est lisible, paginé et assez léger pour l'envoi.
//
//   node .test-docx.mjs
//
// Playwright n'est pas une dépendance du projet (il ne doit pas alourdir le
// build Netlify) : si absent, le test le dit et s'arrête sans échouer.
import { readFileSync, existsSync } from "node:fs";
import { extname, join } from "node:path";
import http from "node:http";
import { PDFDocument } from "pdf-lib";

let chromium;
try { ({ chromium } = await import("playwright")); }
catch {
  console.log("⏭  Playwright absent — test ignoré. Pour l'exécuter : npm i -D playwright && npx playwright install chromium");
  process.exit(0);
}

const RACINE = new URL("./", import.meta.url).pathname;
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".docx": "application/octet-stream" };
const serveur = http.createServer((req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]);
  const f = join(RACINE, rel === "/" ? "/sign/index.html" : rel);
  if (!f.startsWith(RACINE) || !existsSync(f)) { res.writeHead(404); res.end(); return; }
  let corps;
  try { corps = readFileSync(f); } catch { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": TYPES[extname(f)] || "application/octet-stream" });
  res.end(corps);
}).listen(8977);

let echecs = 0;
const ok = (l, c) => { console.log(c ? "✔" : "✘ ÉCHEC", l); if (!c) echecs++; };

const exe = process.env.PLAYWRIGHT_CHROMIUM || "/opt/pw-browsers/chromium";
const nav = await chromium.launch(existsSync(exe) ? { executablePath: exe } : {});
const page = await nav.newPage({ viewport: { width: 1280, height: 900 } });
const erreursConsole = [];
page.on("pageerror", (e) => erreursConsole.push(String(e)));

// Page nue : on ne charge que le convertisseur, pas tout le tableau de bord.
await page.goto("http://127.0.0.1:8977/sign/index.html");

async function convertir(chemin) {
  const octets = [...readFileSync(join(RACINE, chemin))];
  return page.evaluate(async ({ octets, nom }) => {
    const f = new File([new Uint8Array(octets)], nom, {
      type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    });
    const etapes = [];
    const t0 = performance.now();
    try {
      const r = await window.JarvisDocx.convertir(f, (e) => etapes.push(e));
      const buf = new Uint8Array(await r.fichier.arrayBuffer());
      let s = "";
      for (let i = 0; i < buf.length; i += 8192) s += String.fromCharCode.apply(null, buf.subarray(i, i + 8192));
      return { pages: r.pages, nom: r.fichier.name, type: r.fichier.type, taille: r.fichier.size, ms: Math.round(performance.now() - t0), etapes, b64: btoa(s) };
    } catch (e) { return { erreur: String((e && e.message) || e) }; }
  }, { octets, nom: chemin.split("/").pop() });
}

ok("le convertisseur est exposé à la page", await page.evaluate(() => !!(window.JarvisDocx && window.JarvisDocx.convertir)));
ok("un .pdf n'est pas pris pour du Word", await page.evaluate(() => !window.JarvisDocx.estWord(new File([1], "a.pdf"))));
ok("un .docx est reconnu comme Word", await page.evaluate(() => window.JarvisDocx.estWord(new File([1], "a.docx"))));
ok("un .doc ancien est reconnu comme non convertible", await page.evaluate(() => window.JarvisDocx.estVieuxWord(new File([1], "a.doc"))));

// --- Document avec saut de page explicite (2 pages, tableau, accents) ---
const court = await convertir(".fixtures-docx/contrat-2pages.docx");
ok("conversion du contrat 2 pages sans erreur", !court.erreur || (console.log("   →", court.erreur), false));
if (!court.erreur) {
  ok("le fichier produit est un PDF nommé .pdf", court.type === "application/pdf" && /\.pdf$/.test(court.nom));
  ok("les 2 pages du document sont conservées", court.pages === 2);
  ok("l'avancement est retourné à l'appelant", court.etapes.length >= 2);
  const doc = await PDFDocument.load(Buffer.from(court.b64, "base64"));
  ok("le PDF est relisible par pdf-lib (comme le fera le serveur)", doc.getPageCount() === 2);
  const { width, height } = doc.getPage(0).getSize();
  ok("format de page conservé (portrait ≈ Letter)", height > width && Math.abs(height / width - 792 / 612) < 0.03);
  ok("poids raisonnable (< 2 Mo)", court.taille < 2 * 1024 * 1024);
  console.log("   contrat 2 pages :", (court.taille / 1024 / 1024).toFixed(2), "Mo en", court.ms, "ms");
}

// --- Document long SANS saut de page explicite : c'est le cas qui produisait
// une seule page interminable si la pagination automatique ne marche pas. ---
const long = await convertir(".fixtures-docx/contrat-long.docx");
ok("conversion du contrat long sans erreur", !long.erreur || (console.log("   →", long.erreur), false));
if (!long.erreur) {
  ok("le document long est bien paginé (> 5 pages, pas une page géante)", long.pages > 5);
  const doc = await PDFDocument.load(Buffer.from(long.b64, "base64"));
  const tailles = doc.getPages().map((p) => p.getSize());
  ok("toutes les pages ont la même taille", tailles.every((t) => Math.abs(t.width - tailles[0].width) < 1 && Math.abs(t.height - tailles[0].height) < 1));
  ok("aucune page démesurée (hauteur < 400 mm)", tailles.every((t) => t.height / 72 * 25.4 < 400));
  ok("poids sous la limite d'envoi de 10 Mo", long.taille < 10 * 1024 * 1024);
  console.log("   contrat long :", long.pages, "pages,", (long.taille / 1024 / 1024).toFixed(2), "Mo en", long.ms, "ms");
}

ok("aucune erreur JavaScript pendant les conversions", erreursConsole.length === 0 || (console.log("   →", erreursConsole), false));
ok("le convertisseur ne laisse rien dans la page", await page.evaluate(() => !document.querySelector(".docx-wrapper, section.jsdocx")));

await nav.close();
serveur.close();
console.log(echecs ? `\n${echecs} échec(s).` : "\nTous les tests de conversion Word passent.");
process.exit(echecs ? 1 : 0);
