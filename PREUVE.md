# JARVIS SIGN — Architecture probatoire

*Document destiné au conseil juridique. Il explique, sans prérequis technique,
ce que l'application prouve, comment elle le prouve, et ce qu'elle ne prouve pas.*

---

## 1. Ce que produit l'application

Pour chaque signature effectuée en **mode RH**, JARVIS SIGN génère un
**dossier de preuve** : un PDF unique, autoportant, qui permet à un tiers
(avocat, juge, expert) de vérifier par lui-même **qui** a signé, **quoi**
exactement, et **quand** — sans aucun accès à l'application ni à ses bases.

Le dossier se télécharge en un clic depuis le tableau de bord, sur toute
demande finalisée (bouton « ⚖ Dossier de preuve »).

## 2. Le niveau de signature et ses conséquences

L'application produit une **signature électronique simple** au sens du
règlement eIDAS, renforcée par une vérification d'identité par code à usage
unique envoyé sur la boîte email du signataire.

- Les [articles 1366](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032042461)
  et [1367](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032042456) du Code civil
  donnent à l'écrit électronique la même force probante que le papier, sous réserve
  d'identifier le signataire et de garantir l'intégrité de l'acte.
- La **présomption de fiabilité** de l'article 1367 alinéa 2 est réservée à la
  signature **qualifiée**. JARVIS SIGN ne l'atteint pas.
- **Conséquence pratique :** en cas de contestation, la charge de la preuve
  pèse sur l'employeur. Tout l'objet de ce module est de rendre cette charge
  facile à assumer : le dossier de preuve fournit, de manière vérifiable, les
  trois éléments qu'un juge examine — identité, intégrité, date.

## 3. Les six garanties, expliquées simplement

| Garantie | Ce qu'elle démontre | Comment |
|---|---|---|
| **Identité** | Que c'est bien la personne attendue qui a signé | Code à 6 chiffres envoyé sur sa boîte email personnelle, à saisir pour valider. Sans ce code, aucune signature n'est possible. |
| **Date** | Que la signature date bien du jour indiqué | Jeton d'horodatage délivré par une **autorité tierce indépendante** (RFC 3161). L'heure de nos serveurs, modifiable par nous, n'aurait aucune valeur ; celle de l'autorité est opposable. |
| **Intégrité** | Que le document produit est exactement celui signé | Trois empreintes numériques (SHA-256) : à la création, à l'affichage au signataire, après signature. La moindre modification d'un octet change l'empreinte et fait échouer la vérification. |
| **Consentement** | Que le signataire a accepté en connaissance de cause | Clause d'acceptation expresse propre au type d'acte, à cocher **et** mention « Bon pour accord » à recopier au clavier. Deux gestes délibérés, distincts d'un simple clic. |
| **Remise d'exemplaire** | Que le salarié a bien reçu sa copie | Envoi automatique du document signé par email dès finalisation, avec traçabilité de la remise et relance sous 48 h en cas d'échec. |
| **Traçabilité** | Le déroulé complet, minute par minute | Journal horodaté à la seconde : création, ouverture, durée de consultation, envois et saisies du code, signature, horodatage, envoi de la copie. |

## 4. Le dossier de preuve, page par page

1. **Synthèse** — identifiant unique, nature de l'acte, entité émettrice,
   signataires, date de signature en heure de Paris **et** en UTC, statut,
   empreinte finale, autorité d'horodatage.
2. **Chronologie** — tous les événements horodatés à la seconde, y compris les
   tentatives de code erronées et les incidents éventuels.
3. **Éléments techniques** — adresse IP, navigateur, appareil, boîte de
   réception du code (partiellement masquée), identifiants de livraison des
   emails, les trois empreintes, la clause exactement telle qu'affichée et la
   mention saisie.
4. **Vérification indépendante** — le mode d'emploi, commandes comprises,
   pour qu'un expert refasse lui-même les vérifications.

**En annexe, embarqués dans le PDF** : le document signé, le jeton
d'horodatage et la chaîne de certificats de l'autorité — de quoi vérifier
hors ligne, y compris dans plusieurs années si l'autorité a cessé son activité.

## 5. Comment un tiers vérifie, concrètement

Depuis le dossier de preuve, sans accès à l'application :

```bash
pdfdetach -saveall DossierPreuve.pdf        # extrait les 3 annexes

sha256sum document-signe.pdf                # doit égaler l'empreinte page 1

openssl ts -verify -digest <EMPREINTE> -in horodatage.tsr -token_in \
  -CAfile chaine-tsa.pem -untrusted chaine-tsa.pem     # → Verification: OK

openssl ts -reply -in horodatage.tsr -token_in -text   # → date certifiée
```

Ces commandes sont testées automatiquement à chaque modification du code.

## 6. Ce qui bloque une signature

Il n'existe **aucun mode dégradé silencieux**. La signature est refusée si :
le code de vérification est absent, faux, expiré ou épuisé (3 essais, 5 envois) ; la clause
n'est pas cochée ou la mention mal recopiée ; le document affiché diverge du
document source ; l'autorité d'horodatage est injoignable — le dossier reste
alors « en attente d'horodatage », **jamais présenté comme finalisé**, avec
reprises automatiques (1 min, 5, 15, 1 h, 6 h) et alerte au gestionnaire au bout
de 15 minutes.

## 7. Immuabilité et conservation

Un dossier finalisé n'est plus modifiable : toute tentative de réécriture est
rejetée et journalisée comme incident. Une demande finalisée ne se supprime pas,
elle **s'annule** en conservant sa trace ; une correction passe par une nouvelle
signature. Les PDF sont chiffrés au repos (AES-256-GCM, clé conservée séparément
des données) et purgés automatiquement à l'échéance de conservation
(5 ans par défaut pour les actes RH, paramétrable). Chaque consultation d'un
dossier de preuve est elle-même journalisée.

## 8. Limites à connaître

- **Pas de présomption légale** (voir §2) : le dossier facilite la preuve, il ne
  la renverse pas d'office comme le ferait une signature qualifiée.
- **Le code par email prouve l'accès à la boîte de réception**, pas l'identité
  civile. L'adresse doit donc être celle figurant au dossier du salarié, saisie
  par le gestionnaire. Deux conséquences pratiques : transmettez le **lien de
  signature par un autre canal** que cet email (WhatsApp, SMS, en main propre)
  pour que la vérification porte bien sur deux canaux distincts ; et sachez
  qu'une boîte email est réputée plus facile à compromettre qu'un téléphone —
  le canal SMS (environ 0,045 € par envoi) reste disponible en changeant une
  ligne de configuration si le conseil juridique l'exige pour les actes à
  fort enjeu.
- **Autorité d'horodatage** : DFN (Allemagne, UE) par défaut — conforme RFC 3161
  et vérifiable, mais non « qualifiée » au sens de la liste de confiance
  européenne. Le passage à une autorité qualifiée (Certigna, Universign) se fait
  par simple changement de variable d'environnement, sans redéploiement du code.
- **Hébergement** : Netlify (États-Unis). Les documents sont chiffrés au repos
  par nos soins avec une clé qui nous est propre. Une migration vers un
  hébergeur de l'Union européenne reste à arbitrer selon le niveau d'exigence retenu.
- Aucune donnée de santé patient n'est traitée : l'hébergement HDS n'est pas requis.

## 9. Avant utilisation sur des contrats de travail

Conformément à la spécification, ce module ne doit être employé sur de vrais
contrats qu'après : recette technique complète (faite : 50 tests automatisés),
**test de bout en bout sur un document réel avec lecture du dossier produit**,
et **validation du parcours par le conseil juridique du groupe**.

D'ici là, réserver l'usage aux documents à faible enjeu (attestations, notes de
service, accusés de réception).

---

## Annexe technique — configuration

Variables d'environnement Netlify :

| Variable | Rôle |
|---|---|
| `PREUVE_CLE_AES` | Clé de chiffrement des PDF (64 caractères hexadécimaux). **Sans elle, le mode RH est indisponible.** |
| `BREVO_API_KEY` | Envoi des emails : codes de vérification, copies signées, alertes. Plan gratuit : 300 envois/jour. |
| `BREVO_FROM` | Adresse expéditrice validée chez Brevo. |
| `TSA_URL` | Autorité d'horodatage (défaut : `http://zeitstempel.dfn.de`). |
| `TSA_URL_SECOURS` | Autorité de secours (défaut : `https://freetsa.org/tsr`). |
| `TSA_CHAIN_URL` | Chaîne de certificats de l'autorité, jointe au dossier. |
| `SIGN_ADMIN_CODE` | Code d'accès du tableau de bord. |

Fichiers : `netlify/functions/lib/preuve.mjs` (briques probatoires),
`netlify/functions/sign.mjs` (parcours), `netlify/functions/preuve-cron.mjs`
(reprises, relances, purges), `.test-preuve.mjs` (50 tests).
