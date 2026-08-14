# Veille deal flow santé

Détection quotidienne, sur toute la France, des centres de santé, cabinets
d'ophtalmologie et magasins d'optique en **procédure collective** ou en
**vente de fonds** — dans l'objectif de les racheter (autorisation ARS, bail,
patientèle, équipement).

## Architecture

1. **BODACC** (open data, sans auth) : annonces `familleavis in (collective, vente)`,
   jour par jour pour contourner le plafond `offset=10000`.
2. **Extraction du SIREN** (point critique) :
   1. champ `registre` (array ou string) → 9 premiers chiffres ;
   2. `listepersonnes.personne.numeroImmatriculation.numeroIdentificationRCS` ;
   3. **fallback associations loi 1901** (pas de RCS) : motif de 9 chiffres
      (éventuellement séparés par espaces/points) dans le JSON complet de
      `listepersonnes` et dans `commercant`, avec priorité aux candidats
      valides Luhn. Indispensable : les centres de santé sont souvent portés
      par des associations.
3. **Recherche d'Entreprises** (api.gouv.fr, sans auth, throttle 5 req/s,
   cache mémoire par SIREN) → vrai code NAF, siège, dirigeants, effectif.
4. **Filtre NAF dur** (tout le reste est jeté) + scoring :

   | NAF | Poids | | Procédure (1re regex gagne) | Poids |
   |---|---|---|---|---|
   | 86.90F Centre de santé NCA | 6 | | plan de cession | 6 |
   | 86.22C Autres médecins spécialistes | 6 | | redressement | 5 |
   | 86.21Z Médecine générale | 5 | | sauvegarde | 4 |
   | 47.78A Optique | 4 | | cessation des paiements | 4 |
   | 86.23Z Dentaire | 2 | | liquidation judiciaire | 2 |
   | 86.10Z Hospitalier | 2 | | conversion → liquidation | 2 |
   | 86.22B Spécialistes chirurgicaux | 2 | | clôture insuffisance | 0 |
   | 86.90E Autres para-médicales | 1 | | vente (défaut) | 4 |

   **Bonus** : +3 si département dans 75 77 78 91 92 93 94 95 60 45 28 10 18
   36 58 80 74 73 69 63 · +2 si effectif ≥ 3 salariés.

   Score = NAF + procédure + bonus. **Tout** est stocké dans Airtable ;
   seule la notification est filtrée au **seuil de 10**.
5. **Airtable** : déduplication sur `Cle` (= `publicationavis-parution-numeroannonce`),
   insertion par lots de 10.
6. **Notifications** : automatisation Airtable native (mail) + webhook Slack
   optionnel dans le script (ignoré si `SLACK_WEBHOOK_URL` vide).

## Base Airtable

- Base **Deal Flow Sante** : `appMqWZ902pxjy90Y`
- Table **Deal Flow Sante** : `tblgCkIgZ7wQdJ1DG`
- Automatisation mail : `wflNh5G4hoy79sMjL` (déclencheur : Score ≥ 10 **et**
  Statut = A qualifier — équivalent de l'entrée dans la vue Chauds).
  ⚠️ Créée en brouillon : il faut l'**activer** dans l'app Airtable
  (Automations → « Alerte mail — dossier chaud » → vérifier → ON).

### Vue « Chauds » (à créer une fois, 2 min — l'API ne crée pas de vues)

Dans l'app Airtable (mobile ou web), table Deal Flow Sante :
1. Créer une vue **Grid** nommée `Chauds`.
2. Filtres : `Score` ≥ `10` **ET** `Statut` = `A qualifier`.
3. Tri : `Score` décroissant.

## Secrets GitHub (Settings → Secrets and variables → Actions)

| Secret | Valeur |
|---|---|
| `AIRTABLE_TOKEN` | PAT Airtable, scopes `data.records:read` + `data.records:write` sur la base |
| `AIRTABLE_BASE_ID` | `appMqWZ902pxjy90Y` |
| `AIRTABLE_TABLE` | `Deal Flow Sante` |
| `SLACK_WEBHOOK_URL` | optionnel — laisser vide sinon |

Variable (Settings → Variables) : `JOURS_HISTORIQUE` = `2` en routine.

## Lancement

- **Manuel** : Actions → « Veille deal flow sante » → Run workflow →
  saisir `JOURS_HISTORIQUE` (ex. `30` pour un backfill).
- **Cron quotidien** (04:00 UTC) : volontairement **désactivé** tant que les
  résultats du backfill ne sont pas validés. Pour l'activer, décommenter les
  deux lignes `schedule:` dans
  `.github/workflows/veille-deal-flow-sante.yml`.

En local : `JOURS_HISTORIQUE=30 OUTPUT_JSON=out.json node veille-deal-flow-sante/veille.mjs`
(sans `AIRTABLE_TOKEN`, le script exporte le JSON et saute l'insertion).
