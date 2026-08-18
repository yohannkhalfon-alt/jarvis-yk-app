#!/bin/bash
# Installe la librairie de skills "superpowers" (obra) au demarrage de chaque
# session Claude Code sur le web. Le conteneur distant est ephemere : sans ce
# hook, l'installation doit etre refaite a la main a chaque session.
set -euo pipefail

# Uniquement en environnement distant (Claude Code on the web).
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

MARKETPLACE="superpowers-marketplace"
PLUGINS=("superpowers")

# Idempotent : `marketplace add` echoue si le marketplace est deja declare.
if ! claude plugin marketplace list 2>/dev/null | grep -qx "  > $MARKETPLACE"; then
  claude plugin marketplace add "obra/$MARKETPLACE"
fi

installed="$(claude plugin list 2>/dev/null || true)"
for plugin in "${PLUGINS[@]}"; do
  if ! printf '%s\n' "$installed" | grep -qx "  > $plugin@$MARKETPLACE"; then
    claude plugin install "$plugin@$MARKETPLACE"
  fi
done
