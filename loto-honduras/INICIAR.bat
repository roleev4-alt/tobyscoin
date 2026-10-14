@echo off
chcp 65001 >nul
title Loto Honduras - Analizador Estadistico
cd /d "%~dp0"
where py >nul 2>nul && (set PY=py -3) || (set PY=python)
%PY% --version >nul 2>nul || (
  echo No se encontro Python. Instale Python 3.11 o superior desde https://www.python.org/downloads/
  echo Marque la opcion "Add Python to PATH" durante la instalacion.
  pause
  exit /b 1
)
if not exist ".venv\Scripts\python.exe" (
  echo Primera ejecucion: preparando el entorno, puede tardar unos minutos...
  %PY% -m venv .venv || (pause & exit /b 1)
  ".venv\Scripts\python.exe" -m pip install --upgrade pip >nul
  ".venv\Scripts\python.exe" -m pip install -r backend\requirements-app.txt || (pause & exit /b 1)
)
echo.
echo  LOTO HONDURAS - ANALIZADOR ESTADISTICO
echo  Abriendo http://localhost:8000  (cierre esta ventana para detener la app)
echo.
start "" http://localhost:8000
cd backend
"..\.venv\Scripts\python.exe" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
pause
