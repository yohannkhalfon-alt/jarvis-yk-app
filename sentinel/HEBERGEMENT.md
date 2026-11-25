# Héberger Sentinelle 24/7 (gratuit — Oracle Cloud)

Objectif : faire tourner Sentinelle **en permanence**, même quand ton PC est éteint.
On utilise un petit serveur **gratuit à vie** chez Oracle Cloud.

> Tu n'as presque rien à taper : une fois le serveur créé, **une seule commande**
> installe tout (`bash install-serveur.sh`).

---

## Étape 1 — Créer le compte Oracle Cloud (gratuit)

1. Va sur **https://www.oracle.com/cloud/free/**
2. Clique **Start for free**.
3. Remplis : e-mail, pays = **France**, puis vérifie ton e-mail.
4. Oracle demande une **carte bancaire** → c'est **uniquement pour vérifier que tu es
   une vraie personne**. Tu restes sur **"Always Free"** : **0 € débité**.
   (Tu peux même mettre un plafond de dépense à 0.)
5. Choisis une région proche (ex. **Paris** ou **Marseille**) — ça compte, on ne peut
   plus la changer après.

👉 Quand le compte est créé, reviens me voir. **C'est l'étape la plus pénible, le reste est rapide.**

---

## Étape 2 — Créer le serveur (la "machine")

1. Dans la console Oracle, menu ☰ → **Compute** → **Instances** → **Create instance**.
2. **Image** : laisse **Ubuntu** (Canonical Ubuntu 22.04).
3. **Shape** (taille) : clique **Change shape** → onglet **Ampere** →
   **VM.Standard.A1.Flex** → mets **1 OCPU** et **6 Go RAM**. ✅ C'est gratuit à vie.
   - Si Oracle dit *"Out of capacity"*, essaie **VM.Standard.E2.1.Micro** (aussi gratuit),
     ou réessaie plus tard / une autre région.
4. **Clé SSH** : choisis **Save private key** (et **Save public key**) →
   télécharge les 2 fichiers, garde-les précieusement. C'est ta "clé d'entrée".
5. Clique **Create**. Attends que l'état passe à **RUNNING**, puis note l'**adresse IP publique**.

### Ouvrir le port (important !)
1. Sur la page de l'instance → section **Primary VNIC** → clique sur le **Subnet**.
2. Clique sur la **Security List** par défaut → **Add Ingress Rules**.
3. Mets :
   - **Source CIDR** : `0.0.0.0/0`
   - **IP Protocol** : TCP
   - **Destination Port Range** : `8787`
4. **Add Ingress Rules**.

---

## Étape 3 — Se connecter au serveur

Depuis ton PC Windows (PowerShell) ou le terminal Mac :

```
ssh -i chemin/vers/ta-cle-privee ubuntu@IP_DU_SERVEUR
```

(remplace `chemin/vers/ta-cle-privee` et `IP_DU_SERVEUR`). Tape **yes** la 1ʳᵉ fois.

---

## Étape 4 — Installer Sentinelle (une commande)

Une fois connecté au serveur, copie-colle **bloc par bloc** :

```bash
# 1) Récupérer le code
sudo apt-get update && sudo apt-get install -y git
git clone https://github.com/yohannkhalfon-alt/jarvis-yk-app.git
cd jarvis-yk-app/sentinel

# 2) Tout installer + démarrer en 24/7
bash install-serveur.sh
```

> Le `git clone` d'un dépôt privé demandera un identifiant. Deux options :
> - rendre le dépôt **public** (le code ne contient **aucun secret** — clés et données
>   sont exclues), le plus simple ; **ou**
> - créer un **jeton d'accès** GitHub (je te guide) et le coller comme mot de passe.

Le script `install-serveur.sh` va :
- installer Node.js, git, les dépendances,
- te poser **3 questions** (clé API Anthropic, ton numéro, un mot de passe) —
  tu les tapes **directement sur le serveur**, elles ne passent nulle part ailleurs,
- ouvrir le pare-feu,
- créer un service qui **démarre tout seul et redémarre si ça plante**.

---

## Étape 5 — Relier WhatsApp

À la fin, le script affiche une adresse. Depuis **ton téléphone** :

- Ouvre `http://IP_DU_SERVEUR:8787/connexion`
- Scanne le **QR code** avec WhatsApp (Réglages → Appareils connectés → Connecter).
- Pour lire tes conversations et résumés : `http://IP_DU_SERVEUR:8787/` + ton mot de passe.

🎉 C'est fini : Sentinelle tourne **jour et nuit**, PC éteint.

---

## Commandes utiles (sur le serveur)

```bash
sudo journalctl -u sentinelle -f      # voir ce qui se passe en direct
sudo systemctl restart sentinelle     # redémarrer
sudo systemctl stop sentinelle        # arrêter
cd ~/jarvis-yk-app && git pull && sudo systemctl restart sentinelle   # mettre à jour
```

---

## ⚠️ Deux points d'honnêteté

- **Vie privée / RGPD** : tes conversations (dont des données de patients possibles)
  seront lisibles via une adresse web protégée par mot de passe, mais **en HTTP simple**.
  Pour un usage sérieux et durable, on ajoutera ensuite un **accès chiffré (HTTPS)**.
- **Risque WhatsApp** : Sentinelle utilise une connexion non officielle (Baileys).
  Tourner depuis un serveur (adresse "datacenter") augmente un peu le risque que
  WhatsApp bloque le numéro. À surveiller, surtout pour le numéro de Juliana.
