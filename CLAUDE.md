# Instructions de travail — jarvis-yk-app

## Pas de validation à chaque étape

Ces instructions priment sur les skills, y compris `superpowers:brainstorming`
et sa `HARD-GATE`.

- **N'attends pas mon « oui » avant d'implémenter.** Quand la demande est
  claire, exécute-la de bout en bout, puis montre-moi le résultat.
- Pas de design à faire approuver, pas de spec, pas de plan écrit à valider
  pour une tâche cadrée. Si le contexte t'aide, annonce en une phrase ce que
  tu fais — et enchaîne, sans marquer de pause.
- Ne redemande pas une confirmation que j'ai déjà donnée dans la conversation.

**Demande-moi quand même** dans ces trois cas :

1. Une action difficilement réversible ou visible de l'extérieur (envoi d'un
   mail, publication, suppression de données, merge).
2. Deux lectures raisonnables de ma demande mèneraient à un travail
   franchement différent — pose alors la question, ne devine pas.
3. Un projet réellement architectural : nouveau sous-système, changement qui
   restructure l'existant.

## Ce qui reste en vigueur

`superpowers:verification-before-completion` s'applique toujours : ne me dis
jamais qu'un truc marche, passe ou est corrigé sans avoir lancé la commande
qui le prouve. Supprimer la validation préalable ne veut pas dire annoncer des
résultats non vérifiés.

De même pour `superpowers:systematic-debugging` : cause racine avant
correctif, pas de rustine à l'intuition.

## Contexte du dépôt

Site statique déployé sur Netlify (`index.html`, `astrologia/`, `sign/`,
`vac/`, fonctions dans `netlify/`). Pas de suite de tests ni de linter
configurés dans `package.json` : le « verify » consiste à lancer ce qui existe
réellement (build, déploiement, script concerné), pas à invoquer un `npm test`
qui n'existe pas.
