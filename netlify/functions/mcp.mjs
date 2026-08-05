// JARVIS SIGN — serveur MCP (Model Context Protocol), transport streamable HTTP.
//
// POST /api/mcp : JSON-RPC 2.0 sans état — initialize, tools/list, tools/call.
// Quatre outils : create_document, send_for_signature, get_status, download_signed.
//
// Auth : en-tête "Authorization: Bearer <SIGN_MCP_TOKEN>" (variable
// d'environnement Netlify — aucun secret dans le code). Sans la variable,
// le endpoint répond 503 : il est inutilisable tant qu'elle n'est pas posée.
//
// Aucune logique métier dupliquée : les outils appellent la fonction
// /api/sign existante en interne (import direct du handler, avec le code
// admin lu côté serveur). /api/sign et les pages /sign/* sont inchangées.
import signHandler from "./sign.mjs";

const VERSION = "1.0.0";

// ---------- utilitaires ----------
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "content-type, authorization, mcp-protocol-version, mcp-session-id",
};
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...CORS } });
const rpcOk = (id, result) => ({ jsonrpc: "2.0", id, result });
const rpcErr = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });

// Appel interne de /api/sign, authentifié admin côté serveur.
async function appelSign(origin, { query = "", body = null } = {}) {
  const req = new Request(origin + "/api/sign" + query, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json", "x-sign-code": process.env.SIGN_ADMIN_CODE || "" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return signHandler(req);
}

const lienSignataire = (origin, id, token) => `${origin}/sign/signer.html?id=${id}&token=${token}`;
const lienWhatsApp = (nom, titre, lien) =>
  "https://wa.me/?text=" + encodeURIComponent(`Bonjour ${nom}, merci de signer le document « ${titre} » : ${lien}`);

// ---------- définition des outils ----------
const TOOLS = [
  {
    name: "create_document",
    description:
      "Crée un document à faire signer dans JARVIS SIGN à partir d'un PDF (base64, ≤ ~3,5 Mo) et d'une liste de signataires (8 max). " +
      "Retourne l'identifiant du document et, pour chaque signataire, son lien de signature personnel et un lien WhatsApp prérempli. " +
      "Options : mentions à cocher (ex. « Lu et approuvé », « Bon pour accord »), paraphe de chaque page, boîte email du centre qui recevra le PDF signé.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Titre du document (ex : Contrat de vacation — Dr Martin)" },
        pdf_base64: { type: "string", description: "Contenu du PDF encodé en base64" },
        signers: {
          type: "array",
          maxItems: 8,
          items: {
            type: "object",
            properties: { name: { type: "string" }, email: { type: "string" } },
            required: ["name"],
          },
          description: "Signataires (nom obligatoire, email conseillé pour l'envoi d'invitation)",
        },
        mentions: { type: "array", items: { type: "string" }, description: "Mentions à faire cocher, ex [\"Lu et approuvé\"]" },
        paraphe: { type: "boolean", description: "Initiales apposées en bas de chaque page" },
        from_email: { type: "string", description: "Boîte email du centre qui recevra automatiquement le PDF signé" },
        date_imposee: { type: "string", description: "Date (AAAA-MM-JJ) inscrite sur le document (« Fait le … ») — fixée par l'expéditeur, le signataire ne peut pas la changer" },
      },
      required: ["title", "pdf_base64", "signers"],
    },
  },
  {
    name: "send_for_signature",
    description:
      "Envoie l'invitation à signer aux signataires qui n'ont pas encore signé : email via Brevo quand BREVO_API_KEY est configurée et que le signataire a un email, " +
      "et dans tous les cas retourne le lien de signature et le lien WhatsApp prérempli de chaque signataire pour un envoi manuel.",
    inputSchema: {
      type: "object",
      properties: {
        document_id: { type: "string", description: "Identifiant retourné par create_document" },
        message: { type: "string", description: "Message personnalisé ajouté dans l'email d'invitation" },
      },
      required: ["document_id"],
    },
  },
  {
    name: "get_status",
    description:
      "Statut d'un document : en_attente (personne n'a signé), partiellement_signe, ou signe (tous les signataires ont signé, certificat inclus). " +
      "Détail par signataire avec date de signature. Le refus et l'expiration ne sont pas gérés par l'application à ce jour.",
    inputSchema: {
      type: "object",
      properties: { document_id: { type: "string" } },
      required: ["document_id"],
    },
  },
  {
    name: "download_signed",
    description:
      "Récupère le PDF signé (signatures + certificat d'audit) d'un document au statut « signe ». " +
      "Retourne le PDF en base64 (et toujours un lien de téléchargement direct). Échoue si tous les signataires n'ont pas encore signé.",
    inputSchema: {
      type: "object",
      properties: { document_id: { type: "string" } },
      required: ["document_id"],
    },
  },
];

// ---------- implémentation des outils ----------
async function chargerEnv(origin, documentId) {
  const res = await appelSign(origin, { query: `?id=${encodeURIComponent(documentId)}` });
  if (!res.ok) throw new Error(`Document introuvable (${res.status})`);
  return res.json();
}

const STATUTS = { attente: "en_attente", partiel: "partiellement_signe", complet: "signe" };

async function outilCreate(origin, args) {
  const { title, pdf_base64, signers, mentions, paraphe, from_email, date_imposee } = args;
  const res = await appelSign(origin, {
    body: {
      action: "create",
      title,
      pdfBase64: pdf_base64,
      signers: (signers || []).map((s) => ({ name: s.name, email: s.email || "" })),
      mentions: mentions || [],
      paraphe: Boolean(paraphe),
      fromEmail: from_email || "",
      dateImposee: date_imposee || null,
    },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Création refusée (${res.status})`);
  const env = data.envelope;
  return {
    document_id: env.id,
    title: env.title,
    status: STATUTS[env.status] || env.status,
    signers: env.signers.map((s) => ({
      name: s.name,
      email: s.email || null,
      link: lienSignataire(origin, env.id, s.token),
      whatsapp: lienWhatsApp(s.name, env.title, lienSignataire(origin, env.id, s.token)),
    })),
  };
}

async function outilSend(origin, args) {
  const env = await chargerEnv(origin, args.document_id);
  const cle = process.env.BREVO_API_KEY;
  const expediteur = process.env.BREVO_FROM || env.fromEmail || "";
  const resultats = [];
  for (const s of env.signers) {
    if (s.status === "signe") {
      resultats.push({ name: s.name, status: "deja_signe" });
      continue;
    }
    const lien = lienSignataire(origin, env.id, s.token);
    const entree = { name: s.name, email: s.email || null, link: lien, whatsapp: lienWhatsApp(s.name, env.title, lien), email_envoye: false };
    if (cle && expediteur && s.email) {
      try {
        const r = await fetch("https://api.brevo.com/v3/smtp/email", {
          method: "POST",
          headers: { "api-key": cle, "content-type": "application/json" },
          body: JSON.stringify({
            sender: { name: "JARVIS SIGN", email: expediteur },
            to: [{ email: s.email, name: s.name }],
            subject: `Signature requise : ${env.title}`,
            htmlContent:
              `<p>Bonjour ${s.name},</p>` +
              (args.message ? `<p>${String(args.message).slice(0, 500)}</p>` : "") +
              `<p>Merci de signer le document <b>${env.title}</b> :</p>` +
              `<p><a href="${lien}">Consulter et signer le document</a></p>` +
              `<p style="color:#888;font-size:12px;">JARVIS SIGN — signature électronique</p>`,
          }),
        });
        if (!r.ok) throw new Error((await r.text()).slice(0, 160));
        entree.email_envoye = true;
      } catch (e) {
        entree.erreur_email = String(e.message || e).slice(0, 160);
      }
    } else if (!cle) {
      entree.erreur_email = "BREVO_API_KEY non configurée : transmettre le lien manuellement";
    } else if (!s.email) {
      entree.erreur_email = "Signataire sans email : transmettre le lien manuellement";
    }
    resultats.push(entree);
  }
  return { document_id: env.id, title: env.title, signers: resultats };
}

async function outilStatus(origin, args) {
  const env = await chargerEnv(origin, args.document_id);
  return {
    document_id: env.id,
    title: env.title,
    status: STATUTS[env.status] || env.status,
    created_at: env.createdAt,
    signers: env.signers.map((s) => ({
      name: s.name,
      status: s.status === "signe" ? "signe" : "en_attente",
      signed_at: s.signedAt || null,
    })),
    note: "Statuts possibles : en_attente, partiellement_signe, signe. Refus et expiration non gérés.",
  };
}

async function outilDownload(origin, args) {
  const env = await chargerEnv(origin, args.document_id);
  if (env.status !== "complet")
    throw new Error(`Document pas encore entièrement signé (statut : ${STATUTS[env.status] || env.status})`);
  const res = await appelSign(origin, { query: `?id=${encodeURIComponent(env.id)}&pdf=1` });
  if (!res.ok) throw new Error(`Téléchargement impossible (${res.status})`);
  const octets = Buffer.from(await res.arrayBuffer());
  const lien = env.dlToken ? `${origin}/api/sign?id=${env.id}&token=${env.dlToken}&pdf=1` : null;
  const resume = { document_id: env.id, title: env.title, taille_octets: octets.length, lien_telechargement: lien };
  const contenu = [{ type: "text", text: JSON.stringify(resume, null, 2) }];
  // ≤ ~4,5 Mo en base64 pour rester sous la limite de réponse ; sinon, le lien suffit
  if (octets.length < 3.2 * 1024 * 1024) {
    contenu.push({
      type: "resource",
      resource: {
        uri: `jarvis-sign://documents/${env.id}.pdf`,
        mimeType: "application/pdf",
        blob: octets.toString("base64"),
      },
    });
  }
  return { contenuBrut: contenu };
}

// ---------- dispatch JSON-RPC ----------
async function traiter(origin, msg) {
  const { id, method, params } = msg || {};
  if (!method) return rpcErr(id, -32600, "Requête invalide");
  if (method === "initialize")
    return rpcOk(id, {
      protocolVersion: (params && params.protocolVersion) || "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "jarvis-sign", version: VERSION },
    });
  if (method === "notifications/initialized" || method === "notifications/cancelled") return null; // notification : pas de réponse
  if (method === "ping") return rpcOk(id, {});
  if (method === "tools/list") return rpcOk(id, { tools: TOOLS });
  if (method === "tools/call") {
    const nom = params && params.name;
    const args = (params && params.arguments) || {};
    try {
      let resultat;
      if (nom === "create_document") resultat = await outilCreate(origin, args);
      else if (nom === "send_for_signature") resultat = await outilSend(origin, args);
      else if (nom === "get_status") resultat = await outilStatus(origin, args);
      else if (nom === "download_signed") resultat = await outilDownload(origin, args);
      else return rpcErr(id, -32602, `Outil inconnu : ${nom}`);
      const contenu = resultat.contenuBrut || [{ type: "text", text: JSON.stringify(resultat, null, 2) }];
      return rpcOk(id, { content: contenu, isError: false });
    } catch (e) {
      return rpcOk(id, { content: [{ type: "text", text: String(e.message || e) }], isError: true });
    }
  }
  return rpcErr(id, -32601, `Méthode inconnue : ${method}`);
}

export default async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST")
    return json({ error: "Transport streamable HTTP : utiliser POST" }, 405);

  const attendu = process.env.SIGN_MCP_TOKEN;
  if (!attendu) return json({ error: "SIGN_MCP_TOKEN non configurée sur Netlify" }, 503);
  const fourni = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (fourni !== attendu) return json({ error: "Token invalide" }, 401);

  let corps;
  try {
    corps = await req.json();
  } catch {
    return json(rpcErr(null, -32700, "JSON invalide"), 400);
  }

  const origin = new URL(req.url).origin;
  if (Array.isArray(corps)) {
    const reponses = (await Promise.all(corps.map((m) => traiter(origin, m)))).filter(Boolean);
    return reponses.length ? json(reponses) : new Response(null, { status: 202, headers: CORS });
  }
  const reponse = await traiter(origin, corps);
  return reponse ? json(reponse) : new Response(null, { status: 202, headers: CORS });
};

export const config = { path: "/api/mcp" };
