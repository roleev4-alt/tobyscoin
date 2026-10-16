# LOTO HONDURAS — ANALIZADOR ESTADÍSTICO

Laboratorio estadístico reproducible para analizar resultados históricos de Loto Honduras
(Super Premio: 6 números entre 01 y 33) y construir un **portafolio de 10 jugadas** de forma estructurada.
Su objetivo es **comprobar** si una estrategia basada en datos históricos se comporta mejor que el
azar fuera de muestra, **sin asumir que sí**.

> Los sorteos de una lotería justa son eventos independientes. Los resultados anteriores no cambian
> la probabilidad matemática de las combinaciones futuras. Esta herramienta no predice resultados.

## Ejecutar

**Forma rápida:** con Python 3.11+ instalado, doble clic en `INICIAR.bat` (Windows) o `./iniciar.sh`
(macOS/Linux). La primera vez crea un entorno e instala dependencias; luego abre http://localhost:8000.
Requiere el frontend compilado en `frontend/dist` (`npm run build`), que ya viene incluido en el paquete descargable.

**Forma manual (desarrollo):**

```bash
# Backend (Python 3.11+)
cd backend
pip install -r requirements.txt
uvicorn app.main:app --port 8000

# Frontend (desarrollo, con proxy /api → :8000)
cd frontend
npm install
npm run dev          # http://localhost:5173

# Producción: compile el frontend y FastAPI lo sirve en http://localhost:8000
npm run build
```

Tests: `cd backend && python -m pytest -q`

La base SQLite se crea en `backend/loto.db` (configurable con `LOTO_DB`). El SQL es estándar,
así que migrar a PostgreSQL solo requiere cambiar `app/db.py`.

## Datos

Juego: **Loto Super Premio** (miércoles y sábados), 6 números del **01 al 33** según los resultados
oficiales publicados (el rango se cambia con la variable de entorno `LOTO_NUM_MAX`, p. ej. `31`).

No se encontró una fuente pública oficial y automatizable de resultados históricos, por lo que la
app **no trae resultados reales precargados y nunca los inventa**. Opciones:

- **Pegar texto** copiado de cualquier página de resultados: reconoce fechas en español o inglés
  («Miércoles, 14 Octubre 2026», «11 de marzo de 2026», «14/10/2026») y toma los 6 números que
  siguen a cada fecha, ignorando horas, montos y multiplicadores. Muestra una vista previa antes de guardar.

- **CSV / Excel**: columnas `fecha, n1…n6` (o `numero1…numero6`), o bien la fecha en la primera
  columna y los seis números en las siguientes. Fechas `DD/MM/YYYY` o `YYYY-MM-DD`.
  Hay una plantilla en `GET /api/template.csv`.
- **Captura manual** de un sorteo.
- **URL** (https) a un CSV o JSON publicado por una fuente que usted considere confiable.
- **Demo sintética**: sorteos simulados con una lotería justa, marcados en la base y en la interfaz
  como «NO son resultados reales». No se pueden mezclar con datos reales. Sirven como control
  negativo: sobre datos justos el laboratorio debe concluir que no hay ventaja (y lo hace).

Validación: rango 01–33, exactamente 6 números, sin repetidos, fecha válida, fechas duplicadas,
filas incompletas y valores no numéricos. Cada fila rechazada se reporta con su motivo; nada se
corrige en silencio.

## Arquitectura

```
DATA (db.py) → VALIDATION (validation.py) → STATISTICAL ANALYSIS (stats.py)
→ NUMBER SCORING (scoring.py) → CANDIDATE GENERATION (candidates.py)
→ PORTFOLIO OPTIMIZATION (portfolio.py) → BACKTESTING + MONTE CARLO (backtest.py)
→ REPORTING (main.py + frontend)
```

`engine.generate_portfolios(historial, config)` es la **única** puerta para generar jugadas y solo
recibe el historial ya recortado: no tiene acceso a la base de datos ni a resultados futuros.

## Metodología

**Índice de selección histórica (0–100)**: 7 componentes (frecuencia histórica 25, reciente 20,
tendencia 15, pares 15, tríos 5, recencia 10, estructura 10; pesos configurables), cada uno
normalizado min–max entre todos los números del rango. *No es una probabilidad.*

**Candidatos**: 10 estrategias generan ~3,000 combinaciones (configurable entre 1,000 y 10,000) por muestreo
ponderado sin reemplazo y filtros estructurales. Se eliminan duplicados y, dentro de cada estrategia,
las de score bajo (cuartil inferior). Score de combinación = individual 35 + pares 20 + tríos 5 +
estructura 20 + suma 10 + consecutivos 10.

**Portafolio**: maximiza `Σ calidad − λ·Σ penalización(compartidos) − λ·concentración + λ·variedad`
con selección greedy y búsqueda local por intercambios. Penalización por números compartidos:
0 / 0.5 / 2 / 6 / 15 / 40 / descartar (configurable). λ define el modo: Concentrado (0.35),
Equilibrado (1.0, por defecto) y Diversificado (3.0). La frontera de Pareto score–diversidad se
obtiene barriendo λ.

**Backtesting walk-forward** (por defecto: entrenamiento hasta 31/12/2025, bloques mensuales):

1. *Generación*: por bloque, los pesos se optimizan **solo** con sorteos anteriores al bloque
   (búsqueda aleatoria Dirichlet + regularización L1 hacia los pesos iniciales, maximizando el
   peor desempeño de dos mitades temporales) y se **congelan**. Cada sorteo de prueba recibe un
   portafolio generado con sorteos de fecha estrictamente anterior, y se sella con un hash SHA-256.
2. *Evaluación*: se verifican los hashes y recién entonces se compara con el resultado real.
3. *Control*: un portafolio aleatorio por sorteo y 1,000 simulaciones Monte Carlo con las mismas
   condiciones; p-valores empíricos unilaterales, corrección de Holm por comparaciones múltiples,
   IC 95 % por bootstrap, p exacto (convolución hipergeométrica) por estrategia, robustez entre
   bloques y comparación del lift dentro vs fuera de muestra (sobreajuste).

**Integridad**: 7 controles (sin información futura, pesos solo con entrenamiento, prueba aislada,
baseline en mismas condiciones, jugadas selladas antes del resultado, sin duplicados,
reproducibilidad). Si alguno falla, el experimento se declara inválido.

**Reproducibilidad**: cada portafolio y backtest guarda dataset (hash), período, configuración,
pesos, parámetros, seed, versión y resultado (hash). «Reproducir análisis» lo recalcula y compara
los hashes. Las versiones del modelo se comparan por desempeño **fuera de muestra**.

## Limitaciones

- La muestra del período inicial es pequeña (≈1–2 sorteos por semana): la potencia estadística es
  baja y solo diferencias grandes serían detectables.
- El rango 01–33 se tomó de los resultados oficiales publicados; si el juego cambia, ajuste
  `LOTO_NUM_MAX`.
- Los portafolios más diversificados pueden lograr más sorteos con «alguna jugada ≥ 3» simplemente
  por cubrir más números. Eso es estructura, no predicción.
