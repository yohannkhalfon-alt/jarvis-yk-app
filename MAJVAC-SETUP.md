# MAJ VAC — Configuration (5 minutes, à faire une seule fois)

La page **/vac/** scanne les plannings Excel dans Dropbox et liste les jours sans
ophtalmologue (jour + date, par centre), prêts à envoyer sur WhatsApp.

Pour fonctionner, Netlify a besoin de 4 variables d'environnement.
`ANTHROPIC_API_KEY` existe déjà (utilisée par le chat JARVIS). Il reste à créer
l'accès Dropbox :

## 1. Créer une app Dropbox

1. Va sur https://www.dropbox.com/developers/apps → **Create app**
2. Choisis **Scoped access** → **Full Dropbox** → nomme-la (ex. `jarvis-majvac`) → Create
3. Onglet **Permissions** : coche `files.metadata.read` et `files.content.read` → **Submit**
4. Onglet **Settings** : note **App key** et **App secret**

## 2. Générer le refresh token

1. Ouvre dans le navigateur (remplace `TA_APP_KEY`) :

   ```
   https://www.dropbox.com/oauth2/authorize?client_id=TA_APP_KEY&response_type=code&token_access_type=offline
   ```

2. Autorise → copie le **code** affiché.
3. Dans un terminal (remplace les 3 valeurs) :

   ```bash
   curl https://api.dropbox.com/oauth2/token \
     -d code=LE_CODE \
     -d grant_type=authorization_code \
     -u TA_APP_KEY:TON_APP_SECRET
   ```

4. La réponse contient `"refresh_token": "..."` → c'est la valeur à garder.
   (Le code de l'étape 2 n'est utilisable qu'une fois ; si erreur, régénère-le.)

## 3. Déclarer les variables sur Netlify

Site → **Site configuration → Environment variables** → ajouter :

| Variable | Valeur |
|---|---|
| `DROPBOX_APP_KEY` | App key (étape 1.4) |
| `DROPBOX_APP_SECRET` | App secret (étape 1.4) |
| `DROPBOX_REFRESH_TOKEN` | refresh token (étape 2.4) |
| `MAJVAC_MODEL` | *(optionnel)* modèle d'analyse, défaut `claude-sonnet-5` |

Puis **Deploys → Trigger deploy** pour relancer un déploiement.

## Comment ça marche

- `vac/index.html` : la page avec le bouton **MAJ VAC** (un appui = scan des 4 centres en parallèle).
- `netlify/functions/majvac.mjs` (`/api/majvac`) : cherche dans Dropbox le fichier
  planning de chaque centre pour le mois en cours + le mois suivant
  (recherche par nom de fichier « MOIS ANNÉE », classée par centre via le chemin),
  télécharge les `.xlsx`, en extrait le texte, puis fait analyser les blocs
  ophtalmologues par Claude pour détecter les jours sans couverture
  (`none` = aucun ophta, `partial` = couverture partielle, ex. 9h-13h).
- Le bouton **WhatsApp** ouvre WhatsApp avec le message pré-rempli (lien `wa.me`) —
  tu choisis le destinataire et tu confirmes l'envoi.

Centres couverts : Argenteuil, Annecy, Tremblay, Sartrouville
(configurables en tête de `netlify/functions/majvac.mjs`).
