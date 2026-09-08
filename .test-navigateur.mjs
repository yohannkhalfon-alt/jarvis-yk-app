// Tests navigateur du tableau de bord : conversion Word → PDF (le vrai code de
// sign/docx2pdf.js + sign/vendor/*, dans Chromium, sur de vrais .docx) et
// options de la demande de signature.
//
//   node .test-navigateur.mjs
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

// --- Option « Je choisis mon texte » : la mention libre doit arriver telle
// quelle dans la demande envoyée au serveur. ---
console.log("\n=== Options de la demande ===");
await page.reload();
ok("le champ de mention libre est verrouillé tant que la case n'est pas cochée",
  await page.evaluate(() => document.querySelector("#texteLibre").disabled));

const envoye = await page.evaluate(async () => {
  const clic = (sel) => { const e = document.querySelector(sel); e.checked = true; e.dispatchEvent(new Event("change")); };
  clic("#optLu"); clic("#optTexte");
  const verrou = document.querySelector("#texteLibre").disabled;
  document.querySelector("#texteLibre").value = "  Reçu un exemplaire du règlement intérieur  ";
  document.querySelector("#titre").value = "Note de service";
  document.querySelector("#signataires .s-nom").value = "Jennifer Dupont";

  // Un PDF minimal suffit : on n'appelle pas vraiment le serveur.
  const pdf = new File([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 52])], "n.pdf", { type: "application/pdf" });
  const dt = new DataTransfer(); dt.items.add(pdf);
  const champ = document.querySelector("#pdf");
  champ.files = dt.files;
  champ.dispatchEvent(new Event("change"));
  await new Promise((r) => setTimeout(r, 50));

  let corps = null;
  const vrai = window.fetch;
  window.fetch = async (url, opt) => {
    if (String(url).includes("/api/sign") && opt && opt.method === "POST") {
      corps = JSON.parse(opt.body);
      return new Response(JSON.stringify({ envelope: { id: "x", title: "t", signers: [{ name: "Jennifer Dupont", token: "tk" }] } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return vrai(url, opt);
  };
  document.querySelector("#creer").click();
  await new Promise((r) => setTimeout(r, 400));
  window.fetch = vrai;
  return { corps, verrou, apres: { coche: document.querySelector("#optTexte").checked, valeur: document.querySelector("#texteLibre").value } };
});

ok("cocher la case déverrouille le champ", envoye.verrou === false);
ok("la mention libre part avec les mentions cochées",
  !!envoye.corps && Array.isArray(envoye.corps.mentions) && envoye.corps.mentions.length === 2);
ok("la mention libre est envoyée sans espaces superflus",
  !!envoye.corps && envoye.corps.mentions[1] === "Reçu un exemplaire du règlement intérieur");
ok("le formulaire est remis à zéro après création",
  envoye.apres.coche === false && envoye.apres.valeur === "");

const refus = await page.evaluate(async () => {
  const c = document.querySelector("#optTexte"); c.checked = true; c.dispatchEvent(new Event("change"));
  document.querySelector("#texteLibre").value = "   ";
  document.querySelector("#titre").value = "Note";
  document.querySelector("#signataires .s-nom").value = "Jennifer";
  const pdf = new File([new Uint8Array([37, 80, 68, 70])], "n.pdf", { type: "application/pdf" });
  const dt = new DataTransfer(); dt.items.add(pdf);
  const champ = document.querySelector("#pdf"); champ.files = dt.files; champ.dispatchEvent(new Event("change"));
  await new Promise((r) => setTimeout(r, 50));
  let appele = false;
  const vrai = window.fetch;
  window.fetch = async (...a) => { if (String(a[0]).includes("/api/sign") && a[1] && a[1].method === "POST") appele = true; return vrai(...a); };
  document.querySelector("#creer").click();
  await new Promise((r) => setTimeout(r, 200));
  window.fetch = vrai;
  return { appele, msg: document.querySelector("#msgCreate").textContent };
});
ok("case cochée mais texte vide : rien n'est envoyé", refus.appele === false);
ok("case cochée mais texte vide : message clair", /mention libre/i.test(refus.msg));

await nav.close();
serveur.close();
console.log(echecs ? `\n${echecs} échec(s).` : "\nTous les tests navigateur passent.");
process.exit(echecs ? 1 : 0);
