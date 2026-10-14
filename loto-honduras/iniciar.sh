#!/usr/bin/env bash
# Loto Honduras — Analizador Estadístico (macOS / Linux)
set -e
cd "$(dirname "$0")"
PY=$(command -v python3 || command -v python || true)
if [ -z "$PY" ]; then
  echo "No se encontró Python. Instale Python 3.11 o superior: https://www.python.org/downloads/"
  exit 1
fi
if [ ! -x ".venv/bin/python" ]; then
  echo "Primera ejecución: preparando el entorno, puede tardar unos minutos..."
  "$PY" -m venv .venv
  .venv/bin/python -m pip install --upgrade pip >/dev/null
  .venv/bin/python -m pip install -r backend/requirements-app.txt
fi
URL="http://localhost:8000"
echo
echo "  LOTO HONDURAS — ANALIZADOR ESTADÍSTICO"
echo "  Abriendo $URL  (Ctrl+C para detener la app)"
echo
( sleep 2; (command -v open >/dev/null && open "$URL") || (command -v xdg-open >/dev/null && xdg-open "$URL") || true ) &
cd backend
exec ../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
