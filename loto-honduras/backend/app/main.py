"""API FastAPI — REPORTING.

Ejecutar:  uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

from datetime import date
import csv
import io
import json
import os
import threading
import urllib.request
import uuid

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import stats as st
from .backtest import run_backtest
from .config import (COMPONENTS, DEFAULT_COMBO_WEIGHTS, DEFAULT_OVERLAP_PENALTY, DEFAULT_PERIOD_END,
                     DEFAULT_PERIOD_START, DEFAULT_WEIGHTS, DISCLAIMER, MODEL_VERSION, MODES, NUM_MAX,
                     NUM_MIN, PICK, STRATEGIES, ModelConfig)
from .db import Store, dataset_hash, result_hash
from .engine import generate_portfolios, portfolio_report, random_report
from .scoring import COMPONENT_LABELS
from .synthetic import SOURCE_LABEL, synthetic_draws
from .validation import Draw, parse_date, parse_text, read_upload, validate_rows

app = FastAPI(title="Loto Honduras — Analizador Estadístico", version=MODEL_VERSION)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
store = Store()
JOBS: dict[str, dict] = {}

BEST_COMBO_NOTE = ("Esta es la combinación mejor posicionada por el modelo histórico. "
                   "No representa una probabilidad matemática superior garantizada.")


# ------------------------------------------------------------------ modelos
class Periodo(BaseModel):
    inicio: date = DEFAULT_PERIOD_START
    fin: date = DEFAULT_PERIOD_END


class AnalysisRequest(BaseModel):
    periodo: Periodo = Field(default_factory=Periodo)
    config: dict = Field(default_factory=dict)


class PortfolioRequest(AnalysisRequest):
    nombre: str = "Portafolio"


class BacktestRequest(AnalysisRequest):
    nombre: str = "Modelo v1.0"
    fin_entrenamiento: date = date(2025, 12, 31)
    meses_por_fold: int = 1
    optimizar_pesos: bool = True
    actualizar_dentro_del_fold: bool = True
    simulaciones_mc: int = 1000
    pruebas_pesos: int = 150
    regularizacion: float = 0.25


class ManualDraw(BaseModel):
    fecha: str
    numeros: list


class TextImport(BaseModel):
    texto: str
    fuente: str | None = None
    confirmar: bool = False


class UrlImport(BaseModel):
    url: str
    fuente: str | None = None


# ------------------------------------------------------------------ helpers
def period_draws(p: Periodo) -> list[Draw]:
    if p.inicio > p.fin:
        raise HTTPException(400, "La fecha de inicio es posterior a la fecha de fin.")
    return store.draws(p.inicio, p.fin)


def require_draws(draws: list[Draw], minimum: int = 10):
    if len(draws) < minimum:
        raise HTTPException(400, f"Se requieren al menos {minimum} sorteos en el período (hay {len(draws)}). "
                                 "Importe resultados reales (CSV/Excel/manual).")


def build_config(d: dict) -> ModelConfig:
    try:
        return ModelConfig.from_dict(d)
    except (ValueError, TypeError) as e:
        raise HTTPException(400, str(e))


def period_meta(draws: list[Draw], p: Periodo) -> dict:
    info = store.data_info()
    return {"inicio": p.inicio.isoformat(), "fin": p.fin.isoformat(), "sorteos": len(draws),
            "primer_sorteo": draws[0].fecha.isoformat() if draws else None,
            "ultimo_sorteo": draws[-1].fecha.isoformat() if draws else None,
            "dataset_hash": dataset_hash(draws), "fuentes": info["fuentes"],
            "ultima_importacion": info["ultima_importacion"], "sinteticos": info["sinteticos"]}


def do_import(rows, fuente: str, replace: bool, sintetico: bool = False) -> dict:
    rep = validate_rows(rows, fuente)
    ins = store.insert_draws(rep.valid, fuente, sintetico=sintetico, replace=replace)
    summary = rep.summary()
    summary.update({"insertados": ins["insertados"], "omitidos_bd": ins["omitidos"][:200], "fuente": fuente})
    store.log_import(fuente, rep.total_rows, ins["insertados"], len(rep.errors), summary)
    return summary


# ------------------------------------------------------------------ info / datos
@app.get("/api/info")
def info():
    return {
        "app": "LOTO HONDURAS — ANALIZADOR ESTADÍSTICO",
        "version_modelo": MODEL_VERSION,
        "rango": [NUM_MIN, NUM_MAX], "numeros_por_sorteo": PICK, "bajo_max": st.LOW_MAX,
        "juego": "Loto Super Premio (miércoles y sábados)",
        "periodo_por_defecto": {"inicio": DEFAULT_PERIOD_START.isoformat(), "fin": DEFAULT_PERIOD_END.isoformat()},
        "datos": store.data_info(),
        "importaciones": store.imports()[:10],
        "pesos_por_defecto": DEFAULT_WEIGHTS, "componentes": [{"clave": k, "etiqueta": COMPONENT_LABELS[k]} for k in COMPONENTS],
        "pesos_combinacion": DEFAULT_COMBO_WEIGHTS, "penalizacion_compartidos": DEFAULT_OVERLAP_PENALTY,
        "modos": MODES, "estrategias": [{"codigo": c, "nombre": n} for c, n in STRATEGIES],
        "config_por_defecto": ModelConfig().to_dict(),
        "advertencia": DISCLAIMER,
        "fuente_automatica": ("No se identificó una fuente pública oficial y automatizable de resultados de Loto "
                              "Honduras. Puede importar CSV/Excel, capturar manualmente o indicar una URL a un "
                              "CSV/JSON publicado por una fuente que usted considere confiable."),
    }


@app.get("/api/draws")
def list_draws():
    return {"sorteos": store.draw_rows(), "info": store.data_info()}


@app.post("/api/draws")
def add_draw(d: ManualDraw):
    rep = validate_rows([{"fecha": d.fecha, "numeros": d.numeros}], "Captura manual")
    if rep.errors:
        raise HTTPException(400, rep.errors[0]["motivo"])
    ins = store.insert_draws(rep.valid, "Captura manual")
    if not ins["insertados"]:
        raise HTTPException(409, ins["omitidos"][0]["motivo"])
    store.log_import("Captura manual", 1, 1, 0, {"fecha": d.fecha})
    return {"ok": True, "sorteo": {"fecha": rep.valid[0].key(), "numeros": rep.valid[0].numeros}}


@app.delete("/api/draws/{fecha}")
def delete_draw(fecha: str):
    if not store.delete_draw(fecha):
        raise HTTPException(404, "Sorteo no encontrado")
    return {"ok": True}


@app.delete("/api/draws")
def clear_draws(solo_sinteticos: bool = True):
    store.clear_draws(only_synthetic=solo_sinteticos)
    return {"ok": True, "info": store.data_info()}


@app.post("/api/import")
async def import_file(file: UploadFile = File(...), fuente: str = Form(""), reemplazar: bool = Form(False)):
    content = await file.read()
    try:
        rows = read_upload(file.filename or "datos.csv", content)
    except Exception as e:  # archivo ilegible
        raise HTTPException(400, f"No se pudo leer el archivo: {e}")
    return do_import(rows, fuente.strip() or f"Archivo: {file.filename}", reemplazar)


@app.post("/api/import/url")
def import_url(req: UrlImport):
    if not req.url.lower().startswith("https://"):
        raise HTTPException(400, "Solo se aceptan URLs https://")
    try:
        with urllib.request.urlopen(req.url, timeout=20) as r:
            content = r.read(5_000_000)
    except Exception as e:
        raise HTTPException(502, f"No se pudo descargar la fuente: {e}")
    if req.url.lower().endswith(".json") or content[:1] in (b"[", b"{"):
        data = json.loads(content)
        data = data.get("sorteos", data) if isinstance(data, dict) else data
        rows = [{"fecha": x.get("fecha"), "numeros": x.get("numeros")} for x in data]
    else:
        rows = read_upload("remote.csv", content)
    return do_import(rows, req.fuente or f"URL: {req.url}", False)


@app.post("/api/import/text")
def import_text(req: TextImport):
    """Texto pegado desde una página de resultados. Sin `confirmar` solo muestra la vista previa."""
    if len(req.texto) > 2_000_000:
        raise HTTPException(400, "El texto es demasiado largo (máx. 2 MB).")
    rows = parse_text(req.texto)
    if not rows:
        raise HTTPException(400, "No se encontraron fechas en el texto. Copie la lista de resultados incluyendo las fechas.")
    fuente = (req.fuente or "").strip() or "Texto pegado"
    if req.confirmar:
        return do_import(rows, fuente, False)
    rep = validate_rows(rows, fuente)
    existing = {r["fecha"] for r in store.draw_rows()}
    return {**rep.summary(), "fuente": fuente, "vista_previa": True,
            "sorteos": [{"fecha": d.key(), "numeros": list(d.numeros), "ya_existe": d.key() in existing}
                        for d in rep.valid]}


@app.get("/api/template.csv")
def template():
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["fecha", "n1", "n2", "n3", "n4", "n5", "n6"])
    w.writerow(["DD/MM/YYYY", "", "", "", "", "", ""])
    path = os.path.join(os.path.dirname(__file__), "..", "plantilla_sorteos.csv")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(buf.getvalue())
    return FileResponse(path, filename="plantilla_sorteos.csv", media_type="text/csv")


@app.post("/api/demo")
def load_demo():
    if store.data_info()["total"] - store.data_info()["sinteticos"] > 0:
        raise HTTPException(409, "Ya hay datos reales cargados; los datos de demostración no se mezclan con ellos.")
    draws = synthetic_draws()
    store.clear_draws(only_synthetic=True)
    ins = store.insert_draws(draws, SOURCE_LABEL, sintetico=True)
    store.log_import(SOURCE_LABEL, len(draws), ins["insertados"], 0, {"nota": "datos simulados"})
    return {"insertados": ins["insertados"], "fuente": SOURCE_LABEL}


# ------------------------------------------------------------------ análisis
@app.post("/api/analysis")
def analysis(req: AnalysisRequest):
    draws = period_draws(req.periodo)
    cfg = build_config(req.config)
    out = st.full_analysis(draws, cfg.min_trio_count, cfg.recent_window, cfg.trend_short, cfg.trend_long)
    out["meta"] = period_meta(draws, req.periodo)
    return clean(out)


@app.post("/api/numbers")
def numbers(req: AnalysisRequest):
    from .scoring import HistoryModel
    draws = period_draws(req.periodo)
    require_draws(draws)
    cfg = build_config(req.config)
    m = HistoryModel(draws, cfg)
    return clean({"numeros": m.number_table(), "pesos": cfg.weights, "meta": period_meta(draws, req.periodo),
                  "nota": "El índice (0–100) resume características históricas. NO es la probabilidad de que el número salga."})


def _portfolio_payload(draws: list[Draw], cfg: ModelConfig, p: Periodo) -> dict:
    res = generate_portfolios(draws, cfg, context=None, with_pareto=True)
    m, pool = res["model"], res["pool"]
    reports = {mode: portfolio_report(res, mode, cfg.seed) for mode in MODES}
    rnd = random_report(m, cfg.seed)
    best = res["best_overall"]
    best_parts = {k: round(float(v[best]) * 100, 1) for k, v in pool.parts.items()}
    comparison = [{"portafolio": name, "modo": key, "score": r["resumen"]["score_estadistico"],
                   "score_total": r["resumen"]["score_total"], "diversidad": r["resumen"]["diversidad"]["indice"],
                   "cobertura": r["resumen"]["cobertura"]["indice"], "redundancia": r["resumen"]["redundancia"],
                   "numeros_unicos": r["resumen"]["numeros_unicos"]}
                  for name, key, r in (("A — Concentrado", "concentrado", reports["concentrado"]),
                                       ("B — Equilibrado", "equilibrado", reports["equilibrado"]),
                                       ("C — Diversificado", "diversificado", reports["diversificado"]),
                                       ("Aleatorio (control)", "aleatorio", rnd))]
    return {
        "meta": period_meta(draws, p),
        "auditoria": {"modelo": {"version": cfg.model_version, "random_seed": cfg.seed, "config_hash": cfg.fingerprint()},
                      "datos": {"periodo": [p.inicio.isoformat(), p.fin.isoformat()], "sorteos": len(draws),
                                "nota": "El portafolio actual usa todo el período (no hay período de prueba: las jugadas son para un sorteo futuro)."},
                      "configuracion": cfg.to_dict()},
        "portafolios": reports,
        "aleatorio": rnd,
        "comparacion": comparison,
        "pareto": res["pareto"],
        "mejor_combinacion": {"combinacion": [int(x) for x in pool.combos[best]],
                              "texto": " — ".join(f"{int(x):02d}" for x in pool.combos[best]),
                              "score": round(float(pool.score[best]), 1), "partes": best_parts,
                              "estrategia": STRATEGIES[int(pool.strategy[best])][1], "nota": BEST_COMBO_NOTE},
        "numeros": m.number_table(),
        "advertencia": DISCLAIMER,
    }


@app.post("/api/portfolio")
def portfolio(req: PortfolioRequest):
    draws = period_draws(req.periodo)
    require_draws(draws, 20)
    cfg = build_config(req.config)
    out = clean(_portfolio_payload(draws, cfg, req.periodo))
    exp_id = store.save_experiment("portafolio", req.nombre, cfg.model_version, cfg.seed, dataset_hash(draws),
                                   (req.periodo.inicio.isoformat(), req.periodo.fin.isoformat()), cfg.to_dict(),
                                   {}, _deterministic(out))
    out["experimento_id"] = exp_id
    out["resultado_hash"] = result_hash(_deterministic(out))
    return out


def clean(obj):
    """Convierte tipos NumPy/fechas a JSON nativo (para responder, hashear y guardar igual)."""
    def conv(o):
        if hasattr(o, "item"):
            return o.item()
        if hasattr(o, "tolist"):
            return o.tolist()
        return str(o)
    return json.loads(json.dumps(obj, default=conv))


def _deterministic(out: dict) -> dict:
    """Parte del resultado que debe ser idéntica al reproducir (sin tiempos ni metadatos de importación)."""
    skip = {"meta", "experimento_id", "resultado_hash", "duracion_seg"}
    d = {k: v for k, v in out.items() if k not in skip}
    if "meta" in out:
        d["dataset_hash"] = out["meta"]["dataset_hash"]
    return clean(d)


# ------------------------------------------------------------------ backtesting (en segundo plano)
def _run_job(job_id: str, req: BacktestRequest, draws: list[Draw], cfg: ModelConfig):
    job = JOBS[job_id]
    try:
        res = run_backtest(draws, cfg, req.fin_entrenamiento, req.meses_por_fold, req.optimizar_pesos,
                           req.actualizar_dentro_del_fold, req.simulaciones_mc, req.pruebas_pesos,
                           req.regularizacion, progress=lambda a, b: job.update(progreso=[a, b]))
        res = clean(res)
        res["meta"] = period_meta(draws, req.periodo)
        res["auditoria"] = {"modelo": {"version": cfg.model_version, "nombre": req.nombre, "random_seed": cfg.seed,
                                       "config_hash": cfg.fingerprint()}, "configuracion": cfg.to_dict()}
        params = req.model_dump(mode="json", exclude={"config", "periodo", "nombre"})
        det = _deterministic(res)
        exp_id = store.save_experiment("backtest", req.nombre, cfg.model_version, cfg.seed, dataset_hash(draws),
                                       (req.periodo.inicio.isoformat(), req.periodo.fin.isoformat()),
                                       cfg.to_dict(), params, det)
        res["experimento_id"] = exp_id
        res["resultado_hash"] = result_hash(det)
        job.update(estado="completado", resultado=res)
    except Exception as e:  # el error se muestra al usuario tal cual
        job.update(estado="error", error=str(e))


@app.post("/api/backtest")
def backtest(req: BacktestRequest):
    draws = period_draws(req.periodo)
    require_draws(draws, 30)
    cfg = build_config(req.config)
    req.simulaciones_mc = int(min(max(req.simulaciones_mc, 100), 5000))
    job_id = uuid.uuid4().hex[:12]
    JOBS[job_id] = {"estado": "ejecutando", "progreso": [0, 0]}
    threading.Thread(target=_run_job, args=(job_id, req, draws, cfg), daemon=True).start()
    return {"job": job_id}


@app.get("/api/jobs/{job_id}")
def job_status(job_id: str):
    if job_id not in JOBS:
        raise HTTPException(404, "Trabajo no encontrado")
    return JOBS[job_id]


# ------------------------------------------------------------------ experimentos / reproducibilidad
@app.get("/api/experiments")
def experiments(tipo: str | None = None):
    return {"experimentos": store.experiments(tipo)}


@app.get("/api/experiments/{exp_id}")
def experiment(exp_id: int):
    e = store.experiment(exp_id)
    if not e:
        raise HTTPException(404, "Experimento no encontrado")
    return e


@app.post("/api/experiments/{exp_id}/reproduce")
def reproduce(exp_id: int):
    e = store.experiment(exp_id)
    if not e:
        raise HTTPException(404, "Experimento no encontrado")
    p = Periodo(inicio=date.fromisoformat(e["periodo_inicio"]), fin=date.fromisoformat(e["periodo_fin"]))
    draws = period_draws(p)
    current_hash = dataset_hash(draws)
    cfg = build_config(e["config"])
    if e["tipo"] == "portafolio":
        out = _deterministic(_portfolio_payload(draws, cfg, p))
    else:
        pr = e["params"]
        res = run_backtest(draws, cfg, date.fromisoformat(pr["fin_entrenamiento"]), pr["meses_por_fold"],
                           pr["optimizar_pesos"], pr["actualizar_dentro_del_fold"], pr["simulaciones_mc"],
                           pr["pruebas_pesos"], pr["regularizacion"])
        res = clean(res)
        res["meta"] = period_meta(draws, p)
        res["auditoria"] = e["resultado"].get("auditoria")
        out = _deterministic(res)
    new_hash = result_hash(out)
    same_data = current_hash == e["dataset_hash"]
    return {"experimento_id": exp_id, "dataset_hash_original": e["dataset_hash"], "dataset_hash_actual": current_hash,
            "mismo_dataset": same_data, "resultado_hash_original": e["resultado_hash"], "resultado_hash_nuevo": new_hash,
            "reproducido": same_data and new_hash == e["resultado_hash"],
            "mensaje": ("Resultado reproducido exactamente (mismo dataset, configuración y seed)."
                        if same_data and new_hash == e["resultado_hash"] else
                        "El dataset del período cambió desde que se guardó el experimento; el resultado no es comparable."
                        if not same_data else "El resultado difiere: revise la versión del modelo.")}


@app.get("/api/versions")
def versions():
    rows = []
    for e in store.experiments("backtest"):
        full = store.experiment(e["id"])
        r = full["resultado"]
        eq = r["portafolios"]["equilibrado"]
        rows.append({
            "id": e["id"], "nombre": e["nombre"], "creado": e["creado"], "version": e["model_version"],
            "seed": e["seed"], "dataset_hash": e["dataset_hash"], "valido": r["valido"],
            "sorteos_prueba": r["datos"]["sorteos_prueba"],
            "aciertos_promedio_oos": eq["metricas"]["promedio"],
            "diferencia_vs_azar": eq["vs_monte_carlo"]["promedio_aciertos"]["diferencia"],
            "p_valor": eq["vs_monte_carlo"]["promedio_aciertos"]["p_valor"],
            "percentil_vs_azar": eq["vs_monte_carlo"]["promedio_aciertos"]["percentil_vs_azar"],
            "folds_positivos_pct": r["robustez"]["pct_folds_positivos"],
            "riesgo_sobreajuste": r["sobreajuste"]["riesgo"],
            "lift_in_sample": r["sobreajuste"]["lift_in_sample_prom"],
            "lift_fuera_muestra": r["sobreajuste"]["lift_fuera_muestra_prom"],
            "veredicto": r["conclusion"]["veredicto"],
            "optimizar_pesos": full["params"].get("optimizar_pesos"),
        })
    rows.sort(key=lambda x: (not x["valido"], -(x["diferencia_vs_azar"] or 0)))
    return {"versiones": rows,
            "criterio": "Ordenado por desempeño FUERA DE MUESTRA (diferencia vs azar). El desempeño dentro de muestra no se usa para ordenar."}


# ------------------------------------------------------------------ frontend compilado
DIST = os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
if os.path.isdir(DIST):
    app.mount("/assets", StaticFiles(directory=os.path.join(DIST, "assets")), name="assets")

    @app.get("/{path:path}")
    def spa(path: str):
        f = os.path.join(DIST, path)
        if path and os.path.isfile(f):
            return FileResponse(f)
        return FileResponse(os.path.join(DIST, "index.html"))
