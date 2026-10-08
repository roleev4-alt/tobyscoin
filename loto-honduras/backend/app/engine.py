"""Orquestación: HISTORIAL → modelo → candidatos → portafolios.

`generate_portfolios` es la única puerta de entrada para generar jugadas, la
usan tanto el dashboard como el backtesting. Recibe el historial ya recortado;
nunca accede a la base de datos.
"""
from __future__ import annotations

from datetime import date
import hashlib

import numpy as np

from . import portfolio as pf
from . import stats as st
from .candidates import generate
from .config import MODES, PICK, PORTFOLIO_SIZE, STRATEGIES, ModelConfig
from .scoring import HistoryModel
from .validation import Draw


def make_rng(seed: int, context: date | None = None, stream: int = 0) -> np.random.Generator:
    """RNG determinista por (seed, fecha, flujo): independiente del orden de ejecución."""
    ctx = context.toordinal() if context else 0
    return np.random.default_rng([int(seed), ctx, stream])


def random_portfolio(rng: np.random.Generator, k: int = PORTFOLIO_SIZE) -> np.ndarray:
    """Grupo de control: 10 combinaciones uniformes, 6 números distintos 01–31, sin duplicadas."""
    out: list[tuple] = []
    while len(out) < k:
        c = tuple(sorted((rng.choice(st.N, PICK, replace=False) + st.NUM_MIN).tolist()))
        if c not in out:
            out.append(c)
    return np.array(out, dtype=np.int16)


def portfolio_hash(C: np.ndarray) -> str:
    return hashlib.sha256(np.ascontiguousarray(np.sort(C, axis=1)).astype(np.int16).tobytes()).hexdigest()[:16]


def generate_portfolios(history: list[Draw], cfg: ModelConfig, context: date | None = None,
                        modes: tuple = tuple(MODES), with_pareto: bool = False) -> dict:
    m = HistoryModel(history, cfg)
    pool = generate(m, make_rng(cfg.seed, context, 1))
    out = {"model": m, "pool": pool, "portfolios": {}}
    for mode in modes:
        out["portfolios"][mode] = pf.build(pool, m, mode)
    # Mejor jugada individual de cada estrategia (para evaluar estrategias por separado).
    best_by_strategy = {}
    for s_i in range(len(STRATEGIES)):
        sel = np.flatnonzero(pool.strategy == s_i)
        if len(sel):
            best_by_strategy[s_i] = int(sel[np.argmax(pool.score[sel])])
    out["best_by_strategy"] = best_by_strategy
    out["best_overall"] = int(np.argmax(pool.score))
    if with_pareto:
        out["pareto"] = pf.pareto_front(pool, m)
    return out


def fmt_combo(c) -> str:
    return " — ".join(f"{int(x):02d}" for x in c)


def portfolio_report(res: dict, mode: str, seed: int) -> dict:
    """Vista completa y auditable de un portafolio (secciones 31–33, 38–42)."""
    m: HistoryModel = res["model"]
    pool = res["pool"]
    p = res["portfolios"][mode]
    summary = pf.summarize(p["combos"], p["scores"], p["strategies"], m)
    audit = pf.combo_audit(p, pool, m)
    pen = pf.penalty_vector(m.cfg.overlap_penalty)
    log = dict(pool.log)
    log["descartados_redundancia"] = pf.redundancy_discards(pool, p["sel"], pen)
    log["portafolio"] = PORTFOLIO_SIZE
    log["intercambios_busqueda_local"] = p["swaps"]
    return {
        "modo": mode,
        "jugadas": [{"opcion": a["opcion"], "combinacion": a["combinacion"], "texto": fmt_combo(a["combinacion"]),
                     "estrategia": a["estrategia"], "score": a["score_final"]} for a in audit],
        "resumen": summary,
        "auditoria_combinaciones": audit,
        "similitud": pf.overlap_matrix(p["combos"]).tolist(),
        "registro_decisiones": log,
        "parametros": {"lambda_diversidad": p["lambda"], "tope_concentracion": p["cap"],
                       "objetivo": round(p["objective"], 2), "seed": seed},
        "hash": portfolio_hash(p["combos"]),
    }


def random_report(m: HistoryModel, seed: int) -> dict:
    C = random_portfolio(make_rng(seed, None, 99))
    scores, _ = m.combo_scores(C)
    summary = pf.summarize(C, scores, None, m)
    return {"modo": "aleatorio",
            "jugadas": [{"opcion": i + 1, "combinacion": [int(x) for x in c], "texto": fmt_combo(c),
                         "estrategia": "Aleatorio (control)", "score": round(float(s), 1)}
                        for i, (c, s) in enumerate(zip(C, scores))],
            "resumen": summary, "similitud": pf.overlap_matrix(C).tolist(), "hash": portfolio_hash(C)}
