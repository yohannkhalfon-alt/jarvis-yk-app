# JARVIS SIGN — Configuration

Signature électronique maison (aucun abonnement). App : `/sign/` — API : `/api/sign`.

## Variables d'environnement Netlify

À déclarer dans **Site settings → Environment variables** :

| Variable | Rôle | Obligatoire |
|---|---|---|
| `SIGN_ADMIN_CODE` | Code d'accès du tableau de bord (création, liste, suppression). Sans lui, le tableau de bord est **ouvert à tous**. À partager uniquement avec les associés. | Fortement conseillé |
| `BREVO_API_KEY` | Clé API [Brevo](https://www.brevo.com/fr/) (gratuit ≤ 300 emails/jour) pour renvoyer automatiquement le PDF signé sur la boîte du centre. | Pour l'email auto |
| `BREVO_FROM` | Adresse expéditrice validée dans Brevo. | Pour l'email auto |
| `SIGN_MCP_TOKEN` | Token porteur du serveur MCP `/api/mcp` (voir section MCP). Sans lui, le endpoint répond 503. | Pour le pilotage via Claude |

Toute modification de variable nécessite un redéploiement pour être prise en compte.

## Fonctionnement

1. Un associé crée une demande : titre, PDF (≤ 10 Mo, envoyé en morceaux au-delà
   de 2 Mo pour contourner la limite de 6 Mo/requête de Netlify), boîte d'envoi du centre,
   options (mentions « Lu et approuvé » / « Bon pour accord », paraphe chaque page),
   signataires (≤ 8).
2. L'app génère un lien nominatif sécurisé par signataire — à envoyer soi-même
   (boutons Copier / WhatsApp / Email). L'app n'envoie rien aux signataires.
3. Le signataire ouvre le lien, consulte le PDF, coche les mentions, dessine
   paraphe et signature, consent explicitement.
4. Quand tous ont signé : cartouches + paraphes scellés dans le PDF, page de
   certificat d'audit ajoutée (horodatage, IP, navigateur, SHA-256 de l'original),
   et envoi automatique du PDF signé sur la boîte du centre (si Brevo configuré).

Les signataires n'ont jamais besoin du code admin : leurs liens à token unique suffisent.

## Serveur MCP (pilotage depuis Claude)

`netlify/functions/mcp.mjs` expose l'app en serveur MCP (JSON-RPC 2.0, transport
streamable HTTP, sans état) sur **`POST /api/mcp`**. Quatre outils :

- `create_document` — crée un document (PDF base64 ≤ ~3,5 Mo, ≤ 8 signataires,
  mentions, paraphe, boîte du centre) et retourne les liens de signature
- `send_for_signature` — invitation email via Brevo quand configuré, et dans
  tous les cas les liens (direct + WhatsApp) pour envoi manuel
- `get_status` — `en_attente` / `partiellement_signe` / `signe` (refus et
  expiration non gérés à ce jour)
- `download_signed` — PDF signé en base64 + lien de téléchargement direct

Auth : `Authorization: Bearer <SIGN_MCP_TOKEN>`. Les outils appellent la
fonction `/api/sign` existante en interne (aucune logique dupliquée, aucune
nouvelle surface d'écriture). Exemple de branchement dans Claude Code :

```
claude mcp add --transport http jarvis-sign https://jarvis-yk-app.netlify.app/api/mcp \
  --header "Authorization: Bearer <SIGN_MCP_TOKEN>"
```

## Valeur juridique

Signature électronique **simple** au sens eIDAS (articles 1366 et 1367 du Code civil) —
adaptée aux contrats courants (vacations, RH, devis). Pour les actes à fort enjeu
(caution, cession de parts), utiliser une signature qualifiée via un prestataire
certifié. Les demandes et documents sont stockés dans Netlify Blobs (store `sign`).
