# JARVIS CDD — réservation de vacations ophtalmologue

Mini-appli de réservation de dates de vacation (CDD) pour les ophtalmologues,
avec validation par la direction et demande de contrat automatique au gestionnaire de paie.

## Les deux pages

| Page | Qui | Quoi |
|---|---|---|
| `/cdd/` | Le praticien (lien à envoyer par WhatsApp/mail) | Choisit une date, saisit nom / prénom / RPPS / n° sécu / adresse / contact, photographie ou importe ses documents (pièce d'identité, diplôme, Ordre, RPPS, RIB, attestation sécu) |
| `/cdd/admin.html` | La direction | Ajoute les dates par centre, voit les réservations et les documents, **valide** (→ mail au gestionnaire) ou refuse (la date redevient libre), configure les boîtes d'envoi |

Conditions affichées au praticien : 1 300 € la journée,
9h00–19h00 avec fermeture 13h–14h.

## Circuit

1. Le praticien réserve une date → statut « en attente », la date est verrouillée.
2. La direction valide dans l'admin.
3. Un mail part automatiquement au gestionnaire de paie (par défaut `gestionpro.lk@gmail.com`) :
   **« Merci de créer le CDD pour Docteur X — [date] — [centre] »**, avec toutes les
   informations et les documents en pièces jointes (ou en liens si trop volumineux).
4. L'expéditeur du mail est **la boîte direction du centre concerné** (ex. date à
   Sartrouville → boîte direction Sartrouville), saisie dans l'admin, avec repli
   automatique sur `BREVO_FROM` si Brevo refuse l'adresse.

## Variables Netlify

| Variable | Rôle |
|---|---|
| `BREVO_API_KEY` | Déjà en place (JARVIS SIGN) — envoi des mails |
| `BREVO_FROM` | Expéditeur de secours validé chez Brevo |
| `CDD_ADMIN_CODE` | Code d'accès de `/cdd/admin.html` (⚠️ accès libre tant qu'elle n'est pas définie) |

Pour que les mails partent réellement « depuis » chaque boîte direction, l'adresse de
chaque centre doit être validée comme expéditeur dans Brevo (Senders & IP → Add sender,
clic sur le lien de confirmation reçu dans la boîte du centre). Sinon le repli
`BREVO_FROM` prend le relais et le mail indique la boîte du centre en répondre-à.

## Stockage

Netlify Blobs, store `cdd` : `slots.json` (dates), `config.json` (boîtes d'envoi,
destinataire), `resa/{id}.json` (réservations), `doc/{id}/{clé}` (documents, JPEG
compressé côté client à ≤ 4 Mo ou PDF).
