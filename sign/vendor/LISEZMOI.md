# Librairies embarquées — conversion Word → PDF

Ces fichiers sont des copies non modifiées de librairies publiques, servies
depuis notre propre site (pas de CDN) pour que la conversion fonctionne aussi
en mode appli hors ligne et sans dépendance à un tiers.

| Fichier | Version | Rôle | Licence |
|---|---|---|---|
| `jszip.min.js` | 3.10.1 | Ouvre le `.docx` (qui est un ZIP) | MIT |
| `docx-preview.min.js` | 0.4.0 | Reconstitue la mise en page Word en HTML | Apache-2.0 |
| `html2canvas.min.js` | 1.4.1 | Photographie chaque page rendue | MIT |
| `jspdf.umd.min.js` | 2.5.2 | Assemble les pages en PDF | MIT |

Ces fichiers ne sont chargés qu'au moment où l'utilisateur choisit un fichier
Word — ils ne pèsent pas sur le chargement normal de l'application.

Pour mettre à jour : `npm pack <paquet>@<version>`, puis recopier le fichier
`dist/*.min.js` correspondant et mettre à jour le tableau ci-dessus.
