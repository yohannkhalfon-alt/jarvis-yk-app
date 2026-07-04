#!/usr/bin/env bash
# Télécharge les 8 PNG CloudFront (Higgsfield) en local dans assets/
# et réécrit index.html pour pointer vers les copies locales.
# À exécuter AVANT la mise en prod, depuis une machine avec accès internet normal :
#   cd cleoluz && bash localize_images.sh
set -euo pipefail
cd "$(dirname "$0")"

BASE="https://d8j0ntlcm91z4.cloudfront.net/user_3F7uFKlMKoif7n7wiaaLt70kEHz"

declare -A IMAGES=(
  [gallery_marquita]="hf_20260704_170027_e53f1621-7851-4c16-b510-174036b2fc83.png"
  [gallery_dorada]="hf_20260704_170035_75622f81-d8df-4902-b726-00fe4244c561.png"
  [gallery_editorial]="hf_20260704_224008_1014a0cb-dc48-4ebf-9d45-868f1e2de6a7.png"
  [gallery_piel_oro]="hf_20260704_224038_db0da275-ddbb-4b14-a20c-725ce10a4d6a.png"
  [terraza]="hf_20260704_224020_0083ed54-7259-4a49-9799-f288a3b05f45.png"
  [ritual]="hf_20260704_224029_d3a6ecc8-dce4-4d91-809c-33f991f08044.png"
  [tech_camara]="hf_20260704_165427_06e27786-3a35-422b-9c46-602bab14d36d.png"
  [tech_aerografo]="hf_20260704_165435_87132978-1f5f-43b6-9f50-b01d5997ce3b.png"
)

for name in "${!IMAGES[@]}"; do
  file="${IMAGES[$name]}"
  echo "-> ${name}.png"
  curl -fSL -o "assets/${name}.png" "${BASE}/${file}"
  sed -i.bak "s|${BASE}/${file}|assets/${name}.png|g" index.html
done
rm -f index.html.bak

if grep -q cloudfront.net index.html; then
  echo "ATTENTION : il reste des URLs CloudFront dans index.html" >&2
  exit 1
fi
echo "OK : 8 images localisées, index.html réécrit."
