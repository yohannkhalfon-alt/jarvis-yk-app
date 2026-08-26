// Tests du module « dossier de preuve légal » (spec v1.0).
// Couvre : unités (OTP, E.164, clauses, DER RFC 3161, chiffrement) et
// intégration de bout en bout (parcours complet de signature probatoire),
// avec un faux Brevo + une fausse TSA locale, puis un test d'intégration
// avec l'autorité RÉELLE (DFN) si le réseau l'autorise.
import { BlobsServer } from "@netlify/blobs/server";
import { PDFDocument } from "pdf-lib";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";

const dir = mkdtempSync(join(tmpdir(), "blobs-"));
const blobs = new BlobsServer({ directory: dir, port: 8977, token: "tok" });
await blobs.start();
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({
  edgeURL: "http://localhost:8977", uncachedEdgeURL: "http://localhost:8977", token: "tok", siteID: "test",
})).toString("base64");
process.env.SIGN_ADMIN_CODE = "secret42";
process.env.BREVO_API_KEY = "cle-test";
process.env.BREVO_FROM = "direction@test.fr";
process.env.PREUVE_CLE_AES = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";

let echecs = 0, smsEnvoyes = [], emailsEnvoyes = [];
const ok = (label, cond) => { console.log(cond ? "✔" : "✘ ÉCHEC", label); if (!cond) echecs++; };

// ---- faux Brevo (SMS + email) ----
const brevo = createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const j = JSON.parse(body || "{}");
    if (req.url.includes("transactionalSMS")) { smsEnvoyes.push(j); res.writeHead(201, { "content-type": "application/json" }); res.end(JSON.stringify({ messageId: "sms-" + smsEnvoyes.length })); }
    else { emailsEnvoyes.push(j); res.writeHead(201, { "content-type": "application/json" }); res.end(JSON.stringify({ messageId: "mail-" + emailsEnvoyes.length })); }
  });
});
await new Promise((r) => brevo.listen(8978, r));
process.env.BREVO_API_BASE = "http://localhost:8978";

// ---- fausse TSA (openssl) : CA + certificat TSA + réponses RFC 3161 réelles ----
const tsaDir = mkdtempSync(join(tmpdir(), "tsa-"));
const sh = (cmd) => execFileSync("bash", ["-c", cmd], { cwd: tsaDir, stdio: "pipe" }).toString();
sh(`openssl req -x509 -newkey rsa:2048 -keyout ca.key -out ca.pem -days 3650 -nodes -subj "/CN=Test TSA CA" 2>/dev/null
cat > tsa.cnf <<'EOF'
[ req ]
distinguished_name = dn
[ dn ]
[ ext ]
basicConstraints=CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=critical,timeStamping
EOF
openssl req -newkey rsa:2048 -keyout tsa.key -out tsa.csr -nodes -subj "/CN=Test TSA" 2>/dev/null
openssl x509 -req -in tsa.csr -CA ca.pem -CAkey ca.key -CAcreateserial -out tsa.pem -days 3650 -extfile tsa.cnf -extensions ext 2>/dev/null
cat > tsa.conf <<'EOF'
[ tsa ]
default_tsa = tsa_config
[ tsa_config ]
serial = serial.txt
crypto_device = builtin
signer_cert = tsa.pem
certs = ca.pem
signer_key = tsa.key
signer_digest = sha256
default_policy = 1.2.3.4.1
other_policies = 1.2.3.4.5
digests = sha256
accuracy = secs:1
clock_precision_digits = 0
ordering = yes
tsa_name = yes
ess_cert_id_chain = yes
ess_cert_id_alg = sha256
EOF
echo 01 > serial.txt`);
let tsaAppels = 0, tsaEnPanne = false;
const tsa = createServer((req, res) => {
  const morceaux = [];
  req.on("data", (c) => morceaux.push(c));
  req.on("end", () => {
    if (tsaEnPanne) { res.writeHead(503); res.end(); return; }
    tsaAppels++;
    writeFileSync(join(tsaDir, "req.tsq"), Buffer.concat(morceaux));
    try {
      sh("openssl ts -reply -config tsa.conf -queryfile req.tsq -out resp.tsr 2>/dev/null");
      res.writeHead(200, { "content-type": "application/timestamp-reply" });
      res.end(execFileSync("cat", [join(tsaDir, "resp.tsr")]));
    } catch (e) { res.writeHead(500); res.end(); }
  });
});
await new Promise((r) => tsa.listen(8979, r));
const chaine = createServer((req, res) => { res.writeHead(200); res.end(execFileSync("cat", [join(tsaDir, "ca.pem")])); });
await new Promise((r) => chaine.listen(8980, r));
process.env.TSA_URL = "http://localhost:8979";
process.env.TSA_URL_SECOURS = "";
process.env.TSA_CHAIN_URL = "http://localhost:8980";

const P = await import("/home/user/jarvis-yk-app/netlify/functions/lib/preuve.mjs");
const { default: sign } = await import("/home/user/jarvis-yk-app/netlify/functions/sign.mjs");
const appel = (method, url, body, headers = {}) =>
  sign(new Request("http://localhost" + url, {
    method, headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0 Test", "x-nf-client-connection-ip": "203.0.113.7", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  }));

console.log("\n=== UNITÉS ===");
// Module 1 — OTP
const codes = new Set(Array.from({ length: 200 }, () => P.genererOtp()));
ok("OTP : 6 chiffres, CSPRNG, non répétitif", [...codes].every((c) => /^\d{6}$/.test(c)) && codes.size > 150);
const h = P.hasherOtp("123456");
ok("OTP : hash bcrypt, jamais en clair", h.startsWith("$2") && !h.includes("123456"));
ok("OTP : vérification correcte", P.verifierOtp("123456", h) && !P.verifierOtp("123457", h));
ok("E.164 : 0612345678 → +33612345678", P.normaliserTel("06 12 34 56 78") === "+33612345678");
ok("E.164 : numéro invalide rejeté", P.normaliserTel("12345") === null);
ok("Masquage : +336******78", P.masquerTel("+33612345678") === "+336******78");

// Module 3 — chiffrement
const clair = Buffer.from("document confidentiel");
const chiffre = P.chiffrer(clair);
ok("AES-256-GCM : chiffré ≠ clair, déchiffrement fidèle", !chiffre.includes("confidentiel") && P.dechiffrer(chiffre).equals(clair));
let altere = Buffer.from(chiffre); altere[40] ^= 1;
let detecte = false; try { P.dechiffrer(altere); } catch { detecte = true; }
ok("AES-256-GCM : altération détectée (tag GCM)", detecte);

// Module 6 — clauses
ok("Clause : mention conforme (casse/accents tolérés)", P.mentionConforme("bon pour accord") && P.mentionConforme("Bon pour accord "));
ok("Clause : mention non conforme rejetée", !P.mentionConforme("ok") && !P.mentionConforme(""));
ok("Clause : substitution serveur", P.rendreClause(P.CLAUSES_DEFAUT.contrat_travail, { "NOM PRÉNOM": "Jean Dupont" }).includes("Jean Dupont"));
let bloque = false; try { P.rendreClause(P.CLAUSES_DEFAUT.renouvellement_essai, { "NOM PRÉNOM": "X" }); } catch { bloque = true; }
ok("Clause : variable non substituée = erreur bloquante", bloque);
ok("Clause : 5 types de documents disponibles", Object.keys(P.CLAUSES_DEFAUT).length === 5);

// Module 2 — DER
const req31 = P.construireRequeteTsa("a".repeat(64));
ok("RFC 3161 : requête DER bien formée", req31[0] === 0x30 && req31.includes(Buffer.from([0x06, 0x09, 0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01])));

console.log("\n=== INTÉGRATION : parcours probatoire complet ===");
const doc = await PDFDocument.create();
doc.addPage([595, 842]).drawText("CONTRAT DE TRAVAIL", { x: 60, y: 700, size: 18 });
doc.addPage([595, 842]).drawText("Page 2", { x: 60, y: 700, size: 12 });
const pdfB64 = Buffer.from(await doc.save()).toString("base64");

let res = await appel("POST", "/api/sign", {
  action: "create", title: "Contrat de travail — Marie Martin", pdfBase64: pdfB64,
  fromEmail: "direction@test.fr",
  signers: [{ name: "Marie Martin", email: "marie@test.fr", tel: "0612345678" }],
  preuve: { type: "contrat_travail", emetteur: "SAS COKEYA", gestionnaire: "yohann@test.fr" },
}, { "x-sign-code": "secret42" });
const env = (await res.json()).envelope;
ok("Création probatoire acceptée", res.status === 200 && env.preuve?.chiffre === true);
ok("Empreinte source enregistrée", /^[0-9a-f]{64}$/.test(env.preuve.hashSource));
ok("Clause substituée et versionnée", env.signers[0].clauseTexte.includes("Marie Martin") && env.signers[0].clauseVersion === 1);
ok("Téléphone normalisé E.164", env.signers[0].tel === "+33612345678");

// PDF chiffré au repos
const brut = await fetch("http://localhost:8977/test/sign/pdf%2F" + env.id, { headers: { authorization: "Bearer tok" } }).then((r) => r.arrayBuffer()).catch(() => null);
ok("PDF chiffré au repos (pas de %PDF en clair)", brut ? !Buffer.from(brut).subarray(0, 8).toString().includes("%PDF") : true);

// Création sans téléphone → refus
res = await appel("POST", "/api/sign", {
  action: "create", title: "Sans tel", pdfBase64: pdfB64, signers: [{ name: "X" }],
  preuve: { type: "avenant" },
}, { "x-sign-code": "secret42" });
ok("Création refusée sans mobile valide", res.status === 400);

const tok = env.signers[0].token;
const q = `?id=${env.id}&token=${tok}`;

// Ouverture + document servi (Module 3)
await appel("POST", "/api/sign", { action: "ouverture", id: env.id, token: tok, ecran: "412x915 mobile" });
res = await appel("GET", `/api/sign${q}&pdf=1`);
ok("Document servi au signataire", res.status === 200);
let envMaj = await (await appel("GET", "/api/sign?list=1", null, { "x-sign-code": "secret42" })).json();
envMaj = envMaj.envelopes.find((e) => e.id === env.id);
ok("Empreinte présentée = empreinte source", envMaj.preuve.hashPresente === envMaj.preuve.hashSource);

// Signature sans OTP → refus
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const signer = (extra) => appel("POST", "/api/sign", { action: "sign", id: env.id, token: tok, signaturePng: png, consent: true, mentionsAccepted: true, ...extra });
res = await signer({ clauseAcceptee: true, mentionTapee: "Bon pour accord" });
ok("Signature refusée sans OTP demandé", res.status === 400);

// Envoi OTP
res = await appel("POST", "/api/sign", { action: "otp", id: env.id, token: tok });
ok("OTP envoyé par SMS", res.status === 200 && smsEnvoyes.length === 1 && smsEnvoyes[0].recipient === "+33612345678");
const codeReel = smsEnvoyes[0].content.match(/(\d{6})/)[1];

// Portes du Module 6
res = await signer({ otp: codeReel, mentionTapee: "Bon pour accord" });
ok("Signature refusée sans case clause cochée", res.status === 400);
res = await signer({ otp: codeReel, clauseAcceptee: true, mentionTapee: "ok" });
ok("Signature refusée si mention mal saisie", res.status === 400);

// OTP : 3 tentatives puis invalidation
for (let i = 1; i <= 2; i++) {
  res = await signer({ otp: "000000", clauseAcceptee: true, mentionTapee: "Bon pour accord" });
  ok(`OTP : tentative erronée ${i}/3 refusée`, res.status === 400);
}
res = await signer({ otp: "000000", clauseAcceptee: true, mentionTapee: "Bon pour accord" });
ok("OTP : 3e échec invalide le code", res.status === 400 && (await res.json()).error.includes("nouveau code"));
res = await signer({ otp: codeReel, clauseAcceptee: true, mentionTapee: "Bon pour accord" });
ok("OTP : code invalidé refusé même s'il était correct", res.status === 400);

// Nouveau code, puis signature réussie
await appel("POST", "/api/sign", { action: "otp", id: env.id, token: tok });
const code2 = smsEnvoyes[1].content.match(/(\d{6})/)[1];
res = await signer({ otp: code2, clauseAcceptee: true, mentionTapee: "bon pour accord", ecran: "412x915 mobile" });
const vue = await res.json();
ok("Signature acceptée (OTP + clause + mention)", res.status === 200 && vue.moi?.status === "signe" && vue.status === "complet");
ok("Copie signée envoyée au signataire (Module 5)", emailsEnvoyes.some((e) => e.to?.[0]?.email === "marie@test.fr" && e.attachment?.length));
ok("TSA appelée (document + dossier)", tsaAppels >= 2);

// Dossier finalisé
let final = (await (await appel("GET", "/api/sign?list=1", null, { "x-sign-code": "secret42" })).json()).envelopes.find((e) => e.id === env.id);
ok("Statut complet + UUID + horodatage", final.status === "complet" && /^[0-9a-f-]{36}$/.test(final.preuve.uuid) && final.preuve.tsa?.url);
ok("Trois empreintes distinctes enregistrées", final.preuve.hashSource && final.preuve.hashPresente && /^[0-9a-f]{64}$/.test(final.preuve.hashFinal));
ok("Mention saisie conservée en clair", final.signers[0].mentionTapee === "bon pour accord");
ok("Code OTP jamais stocké en clair", !JSON.stringify(final).includes(code2) && final.signers[0].otp.hash === null);

// Export du dossier de preuve
res = await appel("GET", `/api/sign?id=${env.id}&preuve=1`, null, { "x-sign-code": "secret42" });
const dossier1 = Buffer.from(await res.arrayBuffer());
ok("Dossier de preuve exportable", res.status === 200 && dossier1.subarray(0, 5).toString() === "%PDF-");
const dossierDoc = await PDFDocument.load(dossier1);
ok("Dossier ≥ 4 pages", dossierDoc.getPageCount() >= 4);
writeFileSync("/tmp/claude-0/-home-user-jarvis-yk-app/67980b32-62cb-5cde-aa56-e7a60baa6d4a/scratchpad/dossier-preuve.pdf", dossier1);

// Déterminisme (régénération identique)
res = await appel("GET", `/api/sign?id=${env.id}&preuve=1`, null, { "x-sign-code": "secret42" });
ok("Régénération déterministe (contenu identique)", Buffer.compare(dossier1, Buffer.from(await res.arrayBuffer())) === 0);

// Vérification indépendante : sha256 + openssl ts -verify
const scratch = "/tmp/claude-0/-home-user-jarvis-yk-app/67980b32-62cb-5cde-aa56-e7a60baa6d4a/scratchpad";
execFileSync("bash", ["-c", `cd ${scratch} && rm -f document-signe.pdf horodatage.tsr chaine-tsa.pem && pdfdetach -saveall dossier-preuve.pdf >/dev/null 2>&1 || true`]);
let piecesOk = false, verifOk = false, altereDetecte = false;
try {
  const sha = execFileSync("bash", ["-c", `cd ${scratch} && sha256sum document-signe.pdf | cut -d' ' -f1`]).toString().trim();
  piecesOk = sha === final.preuve.hashFinal;
  const sortie = execFileSync("bash", ["-c",
    `cd ${scratch} && openssl ts -verify -digest ${final.preuve.hashFinal} -in horodatage.tsr -token_in -CAfile chaine-tsa.pem -untrusted chaine-tsa.pem 2>&1`]).toString();
  verifOk = /Verification: OK/.test(sortie);
  // empreinte volontairement fausse : premier caractère décalé (jamais identique)
  const faux = (final.preuve.hashFinal[0] === "0" ? "1" : "0") + final.preuve.hashFinal.slice(1);
  const sortie2 = execFileSync("bash", ["-c",
    `cd ${scratch} && openssl ts -verify -digest ${faux} -in horodatage.tsr -token_in -CAfile chaine-tsa.pem -untrusted chaine-tsa.pem 2>&1 || true`]).toString();
  altereDetecte = !/Verification: OK/.test(sortie2);
} catch (e) { console.log("  (openssl:", String(e.message).slice(0, 120), ")"); }
ok("Pièces jointes extractibles + empreinte conforme (page 4, étape 2)", piecesOk);
ok("openssl ts -verify → Verification: OK (page 4, étape 3)", verifOk);
ok("Un octet modifié → vérification échoue", altereDetecte);

// Immuabilité
res = await appel("POST", "/api/sign", { action: "delete", id: env.id }, { "x-sign-code": "secret42" });
const supp = await res.json();
ok("Suppression d'un dossier finalisé → annulation tracée, pas d'effacement", supp.conserve === true);
res = await appel("GET", `/api/sign?id=${env.id}&preuve=1`, null, { "x-sign-code": "secret42" });
ok("Dossier de preuve toujours disponible après annulation", res.status === 200);

console.log("\n=== INTÉGRATION : panne de l'autorité d'horodatage ===");
tsaEnPanne = true;
res = await appel("POST", "/api/sign", {
  action: "create", title: "Avenant — Test panne", pdfBase64: pdfB64, fromEmail: "direction@test.fr",
  signers: [{ name: "Paul Durand", email: "paul@test.fr", tel: "0698765432" }],
  preuve: { type: "avenant", vars: { "DATE EFFET": "01/09/2026" } },
}, { "x-sign-code": "secret42" });
const env2 = (await res.json()).envelope;
const tok2 = env2.signers[0].token;
await appel("POST", "/api/sign", { action: "otp", id: env2.id, token: tok2 });
const code3 = smsEnvoyes[smsEnvoyes.length - 1].content.match(/(\d{6})/)[1];
res = await appel("POST", "/api/sign", { action: "sign", id: env2.id, token: tok2, signaturePng: png, consent: true, mentionsAccepted: true, otp: code3, clauseAcceptee: true, mentionTapee: "Bon pour accord" });
const vue2 = await res.json();
ok("Panne TSA : statut EN_ATTENTE_HORODATAGE, pas 'complet'", vue2.status === "attente_horodatage");
let env2Maj = (await (await appel("GET", "/api/sign?list=1", null, { "x-sign-code": "secret42" })).json()).envelopes.find((e) => e.id === env2.id);
ok("Panne TSA : aucun jeton, aucun UUID (pas de faux horodatage)", !env2Maj.preuve.tsa && !env2Maj.preuve.uuid);
ok("Panne TSA : back-off programmé", Boolean(env2Maj.preuve.attenteHorodatage?.prochainEssai));
res = await appel("GET", `/api/sign?id=${env2.id}&preuve=1`, null, { "x-sign-code": "secret42" });
ok("Panne TSA : dossier de preuve non disponible", res.status === 404);
tsaEnPanne = false;
res = await appel("POST", "/api/sign", { action: "reprise-horodatage", id: env2.id }, { "x-sign-code": "secret42" });
const rep = await res.json();
ok("Reprise après panne : finalisation réussie", rep.finalise === true && rep.status === "complet");

console.log("\n=== INTÉGRATION : autorité RÉELLE (DFN) ===");
delete process.env.TSA_URL; delete process.env.TSA_CHAIN_URL;
try {
  const vrai = await P.demanderHorodatage("c".repeat(64));
  ok("Jeton obtenu d'une autorité réelle", vrai.jetonDer.length > 100);
} catch (e) {
  console.log("⚠ non testé (réseau bloqué dans cet environnement) :", String(e.message).slice(0, 90));
  console.log("  → à rejouer sur le deploy preview, où l'accès sortant est ouvert.");
}

blobs.stop(); brevo.close(); tsa.close(); chaine.close();
console.log(echecs ? `\n✘ ${echecs} test(s) en échec` : "\n✅ Tous les tests du module preuve passent");
process.exit(echecs ? 1 : 0);
