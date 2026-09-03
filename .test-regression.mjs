// Régression : le mode classique (sans dossier de preuve) doit être intact,
// et le serveur MCP doit continuer de fonctionner.
import { BlobsServer } from "@netlify/blobs/server";
import { PDFDocument } from "pdf-lib";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "blobs-"));
const blobs = new BlobsServer({ directory: dir, port: 8981, token: "tok" });
await blobs.start();
process.env.NETLIFY_BLOBS_CONTEXT = Buffer.from(JSON.stringify({
  edgeURL: "http://localhost:8981", uncachedEdgeURL: "http://localhost:8981", token: "tok", siteID: "test",
})).toString("base64");
process.env.SIGN_MCP_TOKEN = "jeton-mcp-test";
delete process.env.BREVO_API_KEY;
delete process.env.SIGN_ADMIN_CODE;
delete process.env.PREUVE_CLE_AES;

const { default: sign } = await import("/home/user/jarvis-yk-app/netlify/functions/sign.mjs");
const { default: mcp } = await import("/home/user/jarvis-yk-app/netlify/functions/mcp.mjs");
let echecs = 0;
const ok = (l, c) => { console.log(c ? "✔" : "✘ ÉCHEC", l); if (!c) echecs++; };
const call = (method, url, body, headers = {}) =>
  sign(new Request("http://localhost" + url, { method, headers: { "content-type": "application/json", "user-agent": "t", ...headers }, body: body ? JSON.stringify(body) : undefined }));

const doc = await PDFDocument.create();
doc.addPage([595, 842]).drawText("CONTRAT", { x: 60, y: 700, size: 18 });
doc.addPage([595, 842]).drawText("Page 2", { x: 60, y: 700, size: 12 });
doc.addPage([595, 842]).drawText("Page 3", { x: 60, y: 700, size: 12 });
const pdfB64 = Buffer.from(await doc.save()).toString("base64");
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

console.log("=== Mode classique (inchangé) ===");
let res = await call("POST", "/api/sign", {
  action: "create", title: "Contrat vacation", pdfBase64: pdfB64, fromEmail: "direction@test.fr",
  mentions: ["Lu et approuvé"], paraphe: true, dateImposee: "2026-09-15",
  signers: [{ name: "Dr Martin", email: "m@test.fr" }, { name: "Yohann Khalfon" }],
});
const env = (await res.json()).envelope;
ok("Création classique (sans preuve)", res.status === 200 && !env.preuve);
ok("Options conservées (mentions, paraphe, date imposée)", env.mentions.length === 1 && env.paraphe && env.dateImposee === "2026-09-15");

res = await call("GET", `/api/sign?id=${env.id}&token=${env.signers[0].token}`);
const vue = await res.json();
ok("Vue signataire : options exposées", vue.mentions.length === 1 && vue.paraphe && vue.dateImposee === "2026-09-15");
ok("Vue signataire : mode preuve désactivé", vue.preuveMode === false);

const sg = (i, extra) => call("POST", "/api/sign", { action: "sign", id: env.id, token: env.signers[i].token, signaturePng: png, consent: true, mentionsAccepted: true, paraphePng: png, ...extra });
ok("Signature classique sans OTP ni clause : acceptée", (await sg(0)).status === 200);
ok("Re-signature refusée (409)", (await sg(0)).status === 409);
ok("Consentement obligatoire (400)", (await call("POST", "/api/sign", { action: "sign", id: env.id, token: env.signers[1].token, signaturePng: png, consent: false, mentionsAccepted: true, paraphePng: png })).status === 400);
ok("Paraphe obligatoire quand demandé (400)", (await call("POST", "/api/sign", { action: "sign", id: env.id, token: env.signers[1].token, signaturePng: png, consent: true, mentionsAccepted: true })).status === 400);
res = await sg(1);
ok("Second signataire : demande complète", (await res.json()).status === "complet");

res = await call("GET", `/api/sign?id=${env.id}&token=${env.signers[0].token}&pdf=1`);
const finalPdf = await PDFDocument.load(await res.arrayBuffer());
ok("PDF final : 4 pages (3 + certificat)", finalPdf.getPageCount() === 4);

res = await call("GET", "/api/sign?list=1");
const liste = (await res.json()).envelopes;
ok("Liste admin (sans code configuré)", res.status === 200 && liste.length === 1);
ok("Date imposée appliquée aux signatures", liste[0].signers.every((s) => s.dateAffichee === "2026-09-15"));

// Téléversement en morceaux
res = await call("POST", "/api/sign", { action: "upload-start" });
const { uploadId, uploadToken } = await res.json();
const gros = Buffer.from(pdfB64, "base64");
res = await call("POST", "/api/sign", { action: "upload-chunk", uploadId, uploadToken, index: 0, dataBase64: gros.toString("base64") });
ok("Téléversement en morceaux : chunk accepté", res.status === 200);
res = await call("POST", "/api/sign", { action: "create", title: "Gros", uploadId, uploadToken, chunks: 1, signers: [{ name: "X" }] });
ok("Téléversement en morceaux : réassemblage", res.status === 200);
ok("Chunk avec mauvais token refusé (403)", (await call("POST", "/api/sign", { action: "upload-chunk", uploadId, uploadToken: "faux", index: 0, dataBase64: "QUJD" })).status === 403);

ok("Suppression classique : effacement réel", (await (await call("POST", "/api/sign", { action: "delete", id: env.id })).json()).deleted === env.id);
ok("Demande supprimée introuvable (404)", (await call("GET", `/api/sign?id=${env.id}&token=${env.signers[0].token}`)).status === 404);

console.log("\n=== Serveur MCP ===");
const rpc = async (method, params) => (await (await mcp(new Request("http://localhost/api/mcp", {
  method: "POST", headers: { "content-type": "application/json", authorization: "Bearer jeton-mcp-test" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
}))).json());
ok("MCP : sans token → 401", (await mcp(new Request("http://localhost/api/mcp", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }))).status === 401);
const liste2 = await rpc("tools/list", {});
ok("MCP : 4 outils exposés", liste2.result.tools.length === 4);
const creeRpc = await rpc("tools/call", { name: "create_document", arguments: { title: "Doc MCP", pdf_base64: pdfB64, signers: [{ name: "Ana" }] } });
const dataMcp = JSON.parse(creeRpc.result.content[0].text);
ok("MCP : create_document fonctionne", !creeRpc.result.isError && dataMcp.document_id);
const statutRpc = await rpc("tools/call", { name: "get_status", arguments: { document_id: dataMcp.document_id } });
ok("MCP : get_status → en_attente", JSON.parse(statutRpc.result.content[0].text).status === "en_attente");

blobs.stop();
console.log(echecs ? `\n✘ ${echecs} test(s) en échec` : "\n✅ Aucune régression");
process.exit(echecs ? 1 : 0);
