# JARVIS SIGN — Configuration

Signature électronique maison (aucun abonnement). App : `/sign/` — API : `/api/sign`.

## Variables d'environnement Netlify

À déclarer dans **Site settings → Environment variables** :

| Variable | Rôle | Obligatoire |
|---|---|---|
| `SIGN_ADMIN_CODE` | Code d'accès du tableau de bord (création, liste, suppression). Sans lui, le tableau de bord est **ouvert à tous**. À partager uniquement avec les associés. | Fortement conseillé |
| `BREVO_API_KEY` | Clé API [Brevo](https://www.brevo.com/fr/) (gratuit ≤ 300 emails/jour) pour renvoyer automatiquement le PDF signé sur la boîte du centre. | Pour l'email auto |
| `BREVO_FROM` | Adresse expéditrice validée dans Brevo. | Pour l'email auto |

Toute modification de variable nécessite un redéploiement pour être prise en compte.

## Fonctionnement

1. Un associé crée une demande : titre, PDF (≤ 3,5 Mo), boîte d'envoi du centre,
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

## Valeur juridique

Signature électronique **simple** au sens eIDAS (articles 1366 et 1367 du Code civil) —
adaptée aux contrats courants (vacations, RH, devis). Pour les actes à fort enjeu
(caution, cession de parts), utiliser une signature qualifiée via un prestataire
certifié. Les demandes et documents sont stockés dans Netlify Blobs (store `sign`).
