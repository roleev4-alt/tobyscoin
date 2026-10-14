@echo off
chcp 65001 >nul
title Loto Honduras - Analizador Estadistico
cd /d "%~dp0"
rem Se prefieren versiones con paquetes ya compilados para Windows (3.13, 3.12, 3.11).
set PY=
for %%V in (3.13 3.12 3.11) do (
  if not defined PY (
    py -%%V --version >nul 2>nul && set "PY=py -%%V"
  )
)
if not defined PY set PY=python
%PY% --version >nul 2>nul || (
  echo No se encontro Python. Instale Python 3.13 (Windows installer 64-bit) desde https://www.python.org/downloads/windows/
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
