#!/usr/bin/env bash
# =====================================================================
#  Sentinelle — installation en service 24/7 sur un serveur Ubuntu
#  (Oracle Cloud gratuit, ou n'importe quel VPS Ubuntu/Debian)
#
#  A lancer DEPUIS le dossier sentinel/ :   bash install-serveur.sh
#
#  Ce script :
#    1) installe Node.js 20 + git + outils de compilation (si absents)
#    2) installe les dependances du projet
#    3) te pose 3 questions (cle API, numero, mot de passe) -> config.json
#    4) ouvre le port dans le pare-feu du serveur
#    5) cree un service qui demarre au boot ET redemarre tout seul
#  Resultat : Sentinelle tourne en permanence, meme PC eteint.
# =====================================================================
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo ""
echo "============================================"
echo "  Installation de Sentinelle (serveur 24/7)"
echo "============================================"
echo ""

# --- 1) Node.js 20 + git + outils ---------------------------------
NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  MAJ="$(node -v | sed 's/v//' | cut -d. -f1)"
  [ "$MAJ" -ge 20 ] && NEED_NODE=0
fi
if [ "$NEED_NODE" -eq 1 ]; then
  echo "-> Installation de Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi
echo "-> Verification de git et des outils de compilation..."
sudo apt-get install -y git build-essential python3

# --- 2) Dependances du projet -------------------------------------
echo "-> Installation des dependances (npm)... (peut prendre 1-2 min)"
npm install --omit=dev

# --- 3) Configuration (cle API, numero, mot de passe) -------------
if [ ! -f config.json ]; then
  echo ""
  echo "-> Configuration. Tape tes reponses (rien n'est envoye ailleurs,"
  echo "   tout reste dans le fichier config.json sur CE serveur)."
  echo ""
  node src/setup.js
else
  echo "-> config.json existe deja (configuration conservee)."
fi

# --- 4) Pare-feu : ouvrir le port ---------------------------------
PORT="$(node -e "try{console.log(JSON.parse(require('fs').readFileSync('config.json','utf8')).port||8787)}catch(e){console.log(8787)}")"
echo "-> Ouverture du port $PORT dans le pare-feu du serveur..."
# Oracle Ubuntu bloque tout sauf SSH par defaut : on insere une regle AVANT le rejet.
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport "$PORT" -j ACCEPT 2>/dev/null \
  || sudo iptables -I INPUT -p tcp --dport "$PORT" -j ACCEPT 2>/dev/null || true
if ! command -v netfilter-persistent >/dev/null 2>&1; then
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y iptables-persistent 2>/dev/null || true
fi
sudo netfilter-persistent save 2>/dev/null || true

# --- 5) Service systemd : demarrage auto + redemarrage auto -------
echo "-> Creation du service (demarrage au boot + redemarrage auto)..."
NODE_BIN="$(command -v node)"
sudo tee /etc/systemd/system/sentinelle.service >/dev/null <<EOF
[Unit]
Description=Sentinelle - veille WhatsApp
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$DIR
ExecStart=$NODE_BIN src/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable sentinelle >/dev/null 2>&1
sudo systemctl restart sentinelle

# --- Resume -------------------------------------------------------
IP="$(curl -s --max-time 5 https://api.ipify.org || echo '<IP_DU_SERVEUR>')"
echo ""
echo "============================================================"
echo "  ✅  Sentinelle tourne maintenant 24/7 !"
echo "      (meme serveur ferme a distance, meme apres redemarrage)"
echo "============================================================"
echo ""
echo "  Pour relier WhatsApp, ouvre depuis ton telephone :"
echo "      http://$IP:$PORT/connexion"
echo ""
echo "  Pour lire tes conversations et resumes :"
echo "      http://$IP:$PORT/"
echo "      (entre ton mot de passe quand c'est demande)"
echo ""
echo "  Commandes utiles :"
echo "      Voir ce qui se passe en direct : sudo journalctl -u sentinelle -f"
echo "      Redemarrer :                     sudo systemctl restart sentinelle"
echo "      Arreter :                        sudo systemctl stop sentinelle"
echo ""
