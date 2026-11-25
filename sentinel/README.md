# JARVIS·YK — Sentinel

Veille WhatsApp multi-comptes : archive complète des conversations, interface de
lecture, résumés par IA (Claude) et réponses assistées.

> ⚠️ **À lire avant tout.** Ce module se connecte à WhatsApp via une bibliothèque
> non officielle (Baileys), en liant le compte comme un « appareil connecté ».
> C'est contraire aux CGU de WhatsApp : risque de suspension du numéro. À
> n'utiliser qu'avec l'**accord écrit et explicite** du titulaire de chaque
> compte surveillé, d'autant que les messages de tiers (contacts, clients)
> transitent par le serveur et par l'API Claude.
>
> **Chats verrouillés (Chat Lock)** : WhatsApp ne les synchronise pas sur les
> appareils liés. Ils resteront invisibles pour l'outil tant que le titulaire ne
> les déverrouille pas depuis son téléphone. Les chats **archivés**, eux, sont
> lus normalement.

## Ce que ça fait

- **Archive complète et persistante** de toutes les conversations (1-à-1 et
  groupes), y compris un import de l'historique fourni par WhatsApp à la liaison.
- **Interface de lecture** façon WhatsApp (liste des conversations, ouverture,
  recherche plein texte), protégée par un jeton d'accès.
- **Digests IA** : résumé + tâches + dates + décisions, envoyés sur le WhatsApp
  du pilote toutes les N heures (ou `!digest` à la demande).
- **Réponses assistées** (optionnel) : le bot rédige un brouillon (mode
  `suggest`, validé par `!ok`) ou répond seul (mode `auto`).

## Installation

```bash
cd sentinel
npm install
cp config.example.json config.json   # puis édite-le
export ANTHROPIC_API_KEY=sk-ant-...
npm start
```

Au premier lancement, un **QR code** s'affiche dans le terminal : le titulaire du
compte le scanne depuis son téléphone (**WhatsApp → Appareils connectés →
Connecter un appareil**). La session est ensuite mémorisée dans `data/<compte>/auth`.

Ouvre ensuite **http://localhost:8787/** et saisis le jeton `accessToken`.

## Configuration (`config.json`)

| Champ | Rôle |
|-------|------|
| `accessToken` | Jeton pour ouvrir l'interface de lecture (mets une valeur longue). |
| `port` | Port du serveur web (défaut 8787). |
| `accounts[].id` | Identifiant court du compte (ex. `juliana`). |
| `accounts[].notify` | Numéro (format international sans `+`) qui pilote le compte et reçoit digests/brouillons. |
| `accounts[].digest.everyHours` | Fréquence des résumés. `enabled:false` pour couper. |
| `accounts[].digest.scope` | `all` (tout) ou `groups` (groupes uniquement). |
| `accounts[].autoReply.mode` | `off`, `suggest` (brouillon validé) ou `auto` (envoi direct). |
| `accounts[].autoReply.allowFrom` | Numéros autorisés à recevoir une réponse assistée, ou `["*"]`. |
| `accounts[].autoReply.persona` | Consignes de ton/style pour les réponses. |

## Commandes de pilotage (à envoyer depuis le numéro `notify`, en message à soi-même)

`!digest` · `!ok <id> [texte]` · `!no <id>` · `!pause` · `!go` · `!aide`

## Hébergement

Le serveur doit tourner **en continu** (connexion WebSocket permanente) — Netlify
ne convient pas. Un petit VPS ou Railway/Fly.io suffit. Un `Dockerfile` est fourni :

```bash
docker build -t sentinel .
docker run -d --restart=always \
  -e ANTHROPIC_API_KEY=sk-ant-... \
  -e SENTINEL_TOKEN=ton-jeton \
  -p 8787:8787 \
  -v $PWD/config.json:/app/config.json:ro \
  -v $PWD/data:/app/data \
  sentinel
```

Les dossiers `data/` (sessions + archives) et `config.json` ne sont pas versionnés.
