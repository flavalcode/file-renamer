#!/bin/bash
# Doppio clic su macOS: avvia l'interfaccia web di File Renamer.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js non trovato. Installa la versione LTS da https://nodejs.org e riprova."
  read -r -p "Premi Invio per chiudere"
  exit 1
fi

if [ ! -f dist/cli/main.js ]; then
  echo "Prima esecuzione: installo e compilo (serve una connessione a Internet)..."
  npm install && npm run build || { echo "Errore durante la preparazione."; read -r -p "Premi Invio per chiudere"; exit 1; }
fi

node dist/cli/main.js ui
