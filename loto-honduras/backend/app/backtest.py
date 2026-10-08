"""BACKTESTING + MONTE CARLO + significancia + integridad.

Estructura (generación y evaluación separadas):

  FASE 1 — GENERACIÓN (sellada)
    Para cada fold walk-forward:
      * pesos optimizados SOLO con sorteos anteriores al inicio del fold → congelados
      * para cada sorteo de prueba se genera el portafolio usando SOLO sorteos
        con fecha < fecha del sorteo, y se sella (hash) antes de evaluar.
  FASE 2 — EVALUACIÓN
    Se verifica el hash de cada jugada sellada y recién entonces se compara
    contra el resultado real.
  FASE 3 — CONTROL
    Portafolio aleatorio con las mismas condiciones + Monte Carlo + pruebas.
"""
from __future__ import annotations

from dataclasses import replace
from datetime import date, timedelta
import calendar
import time

import numpy as np
from scipy import stats as sps

from . import stats as st
from .config import COMPONENTS, DEFAULT_WEIGHTS, MODES, PICK, PORTFOLIO_SIZE, STRATEGIES, ModelConfig
from .engine import generate_portfolios, make_rng, portfolio_hash, random_portfolio
from .scoring import index_from_components, normalized_components
from .validation import Draw

N = st.N
EXPECTED_HITS = PICK * PICK / N  # 1.1613 aciertos esperados por jugada al azar
INVALID_MSG = ("Este experimento no puede considerarse estadísticamente válido debido a contaminación "
               "entre los datos de entrenamiento y prueba.")
NO_EDGE_MSG = "El modelo no demuestra una ventaja estadísticamente significativa frente a la selección aleatoria."


# ================================================================ utilidades
def month_end(d: date) -> date:
    return date(d.year, d.month, calendar.monthrange(d.year, d.month)[1])


def add_months(d: date, k: int) -> date:
    y, m = d.year + (d.month - 1 + k) // 12, (d.month - 1 + k) % 12 + 1
    return date(y, m, min(d.day, calendar.monthrange(y, m)[1]))


def make_folds(draws: list[Draw], train_end: date, months: int = 1) -> list[dict]:
    folds, start = [], train_end + timedelta(days=1)
    last = draws[-1].fecha if draws else train_end
    while start <= last:
        end = month_end(add_months(start, months - 1))
        test = [d for d in draws if start <= d.fecha <= end]
        if test:
            folds.append({"inicio": start, "fin": end, "test": test})
        start = end + timedelta(days=1)
    return folds


def hits(combos: np.ndarray, drawn: tuple) -> np.ndarray:
    return np.isin(combos, np.asarray(drawn)).sum(axis=1)


# ================================================================ optimización de pesos
class ComponentCache:
    """comp[t] = componentes normalizados calculados con draws[:t] (solo pasado)."""

    def __init__(self, draws: list[Draw], cfg: ModelConfig):
        self.draws = draws
        self.cfg = cfg
        self.X = st.to_matrix(draws)
        self.C = st.combos_array(draws)
        self._cache: dict[int, np.ndarray] = {}

    def at(self, t: int) -> np.ndarray:
        if t not in self._cache:
            self._cache[t] = normalized_components(self.X[:t], self.C[:t], self.cfg)
        return self._cache[t]


def lift(comps: np.ndarray, drawn_mask: np.ndarray, W: np.ndarray) -> np.ndarray:
    """Lift estandarizado del índice: (índice medio de los números sorteados − media) / desv.
    comps: T×31×7, drawn_mask: T×31, W: P×7 → P valores. 0 ≈ sin capacidad de discriminación."""
    idx = np.einsum("tnc,pc->ptn", comps, W)
    mu = idx.mean(axis=2, keepdims=True)
    sd = idx.std(axis=2, keepdims=True) + 1e-9
    z = (idx - mu) / sd
    return (z * drawn_mask[None]).sum(axis=2).mean(axis=1) / PICK


def optimize_weights(cache: ComponentCache, train_n: int, cfg: ModelConfig, rng: np.random.Generator,
                     trials: int = 150, reg: float = 0.25, min_history: int = 20) -> dict:
    """Búsqueda aleatoria (Dirichlet) SOLO sobre sorteos de entrenamiento, con regularización L1
    hacia los pesos iniciales. Validación temporal interna: cada sorteo se evalúa con componentes
    calculados exclusivamente con sorteos anteriores a él."""
    t0 = max(min_history, train_n // 3)
    ts = list(range(t0, train_n))
    base = np.array([cfg.weights[k] for k in COMPONENTS])
    if len(ts) < 10:
        return {"pesos": dict(cfg.weights), "optimizado": False, "motivo": "Muy pocos sorteos de entrenamiento",
                "lift_in_sample": None, "lift_default": None, "pruebas": 0, "sorteos_internos": len(ts)}
    comps = np.stack([cache.at(t) for t in ts])
    mask = cache.X[ts].astype(float)
    W = np.vstack([base, rng.dirichlet(np.ones(len(COMPONENTS)) * 2.0, size=trials) * 100])
    l_all = lift(comps, mask, W)
    half = len(ts) // 2
    l_early = lift(comps[:half], mask[:half], W)
    l_late = lift(comps[half:], mask[half:], W)
    penalty = reg * np.abs(W - base).sum(axis=1) / 200.0  # 0..reg
    # Robustez: se exige buen desempeño en AMBAS mitades (mínimo), no solo en promedio.
    objective = np.minimum(l_early, l_late) - penalty
    best = int(np.argmax(objective))
    return {
        "pesos": {k: round(float(W[best, i]), 3) for i, k in enumerate(COMPONENTS)},
        "optimizado": True,
        "lift_in_sample": round(float(l_all[best]), 4),
        "lift_default": round(float(l_all[0]), 4),
        "lift_mitad_temprana": round(float(l_early[best]), 4),
        "lift_mitad_tardia": round(float(l_late[best]), 4),
        "pruebas": trials + 1,
        "sorteos_internos": len(ts),
        "regularizacion": reg,
        "eligio_default": best == 0,
    }


# ================================================================ Monte Carlo
def monte_carlo(test_draws: list[Draw], sims: int, rng: np.random.Generator) -> dict:
    """`sims` portafolios aleatorios de 10 jugadas evaluados sobre los MISMOS sorteos."""
    T = len(test_draws)
    hits_all = np.zeros((sims, T, PORTFOLIO_SIZE), dtype=np.int8)
    w = 1 << np.arange(N, dtype=np.int64)
    for t, d in enumerate(test_draws):
        mask = np.zeros(N, bool)
        mask[np.asarray(d.numeros) - st.NUM_MIN] = True
        keys = rng.random((sims * PORTFOLIO_SIZE, N))
        pick = np.argpartition(keys, PICK, axis=1)[:, :PICK]
        # Sin jugadas duplicadas dentro de un mismo portafolio aleatorio.
        while True:
            code = np.zeros((sims * PORTFOLIO_SIZE, N), bool)
            code[np.arange(len(pick))[:, None], pick] = True
            codes = (code * w).sum(axis=1).reshape(sims, PORTFOLIO_SIZE)
            s = np.sort(codes, axis=1)
            dup_sims = np.flatnonzero((np.diff(s, axis=1) == 0).any(axis=1))
            if not len(dup_sims):
                break
            rows = (dup_sims[:, None] * PORTFOLIO_SIZE + np.arange(PORTFOLIO_SIZE)).ravel()
            pick[rows] = np.argpartition(rng.random((len(rows), N)), PICK, axis=1)[:, :PICK]
        hits_all[:, t, :] = mask[pick].sum(axis=1).reshape(sims, PORTFOLIO_SIZE)
    return {"hits": hits_all}


# ================================================================ métricas
def line_metrics(h: np.ndarray) -> dict:
    """h: aciertos de jugadas individuales (cualquier forma)."""
    h = np.asarray(h).ravel()
    n = len(h)
    dist = np.bincount(h, minlength=PICK + 1)[: PICK + 1]
    return {
        "jugadas": int(n),
        "distribucion": {str(k): int(dist[k]) for k in range(PICK + 1)},
        "promedio": round(float(h.mean()), 4) if n else None,
        "mediana": float(np.median(h)) if n else None,
        "maximo": int(h.max()) if n else None,
        **{f"pct_ge{k}": round(100 * float((h >= k).mean()), 2) if n else None for k in (2, 3, 4, 5)},
        "seis": int((h == 6).sum()),
    }


def portfolio_metrics(H: np.ndarray) -> dict:
    """H: T×10 aciertos del portafolio por sorteo."""
    best = H.max(axis=1)
    return {
        **line_metrics(H),
        "mejor_resultado": int(best.max()) if len(best) else None,
        "promedio_mejor_jugada": round(float(best.mean()), 4) if len(best) else None,
        **{f"jugadas_ge{k}": int((H >= k).sum()) for k in (2, 3, 4, 5)},
        "jugadas_6": int((H == 6).sum()),
        "sorteos_alguna_ge3": int((best >= 3).sum()),
        "sorteos_alguna_ge4": int((best >= 4).sum()),
    }


KEY_METRICS = {
    "promedio_aciertos": lambda H: H.mean(axis=(-1, -2)),
    "promedio_mejor_jugada": lambda H: H.max(axis=-1).mean(axis=-1),
    "sorteos_alguna_ge3": lambda H: (H.max(axis=-1) >= 3).sum(axis=-1),
}


def holm(pvals: dict) -> dict:
    items = sorted(pvals.items(), key=lambda kv: kv[1])
    m = len(items)
    out, running = {}, 0.0
    for i, (k, p) in enumerate(items):
        running = max(running, min(1.0, (m - i) * p))
        out[k] = running
    return out


def sum_hypergeom_sf(total_hits: int, T: int) -> float:
    """P(S ≥ total_hits) con S = suma de T aciertos hipergeométricos independientes (una jugada por sorteo)."""
    pmf = np.array([sps.hypergeom(N, PICK, PICK).pmf(k) for k in range(PICK + 1)])
    dist = np.array([1.0])
    for _ in range(T):
        dist = np.convolve(dist, pmf)
    return float(dist[total_hits:].sum())


def bootstrap_ci(values: np.ndarray, rng: np.random.Generator, B: int = 2000, alpha: float = 0.05) -> tuple:
    if len(values) < 2:
        return (None, None)
    idx = rng.integers(0, len(values), size=(B, len(values)))
    means = values[idx].mean(axis=1)
    return (float(np.quantile(means, alpha / 2)), float(np.quantile(means, 1 - alpha / 2)))


# ================================================================ walk-forward
def run_backtest(draws: list[Draw], cfg: ModelConfig, train_end: date, test_months: int = 1,
                 optimize: bool = True, update_within_fold: bool = True, mc_sims: int = 1000,
                 weight_trials: int = 150, regularization: float = 0.25, progress=None) -> dict:
    t_start = time.time()
    draws = sorted(draws, key=lambda d: d.fecha)
    folds = make_folds(draws, train_end, test_months)
    if not folds:
        raise ValueError("No hay sorteos de prueba posteriores al fin del entrenamiento.")
    train0 = [d for d in draws if d.fecha <= train_end]
    if len(train0) < 20:
        raise ValueError(f"El entrenamiento inicial tiene {len(train0)} sorteos; se requieren al menos 20.")
    cache = ComponentCache(draws, cfg)
    pos = {d.fecha: i for i, d in enumerate(draws)}

    # ----------------------------------------------------------- FASE 1: GENERACIÓN
    sealed, fold_info, seq = [], [], 0
    for f_i, fold in enumerate(folds):
        train_n = sum(1 for d in draws if d.fecha < fold["inicio"])
        if optimize:
            wres = optimize_weights(cache, train_n, cfg, make_rng(cfg.seed, fold["inicio"], 3),
                                    trials=weight_trials, reg=regularization)
        else:
            wres = {"pesos": dict(cfg.weights), "optimizado": False, "motivo": "Pesos fijos (configuración)",
                    "lift_in_sample": None, "lift_default": None, "pruebas": 0, "sorteos_internos": 0}
        weights_data_max = draws[train_n - 1].fecha if train_n else None
        fold_cfg = replace(cfg, weights=wres["pesos"])  # MODELO CONGELADO para todo el fold
        fold_info.append({"fold": f_i + 1, "entrenamiento": [draws[0].fecha.isoformat(), weights_data_max.isoformat()],
                          "prueba": [fold["inicio"].isoformat(), fold["fin"].isoformat()],
                          "sorteos_entrenamiento": train_n, "sorteos_prueba": len(fold["test"]),
                          "pesos": wres["pesos"], "optimizacion": wres,
                          "pesos_datos_hasta": weights_data_max.isoformat(),
                          "_test_idx": [pos[d.fecha] for d in fold["test"]]})
        for d in fold["test"]:
            cutoff_idx = pos[d.fecha] if update_within_fold else train_n
            history = draws[:cutoff_idx]  # SOLO sorteos con fecha < fecha evaluada
            res = generate_portfolios(history, fold_cfg, context=d.fecha)
            pool = res["pool"]
            entry = {
                "fecha": d.fecha,
                "fold": f_i + 1,
                "historial_n": len(history),
                "historial_hasta": history[-1].fecha if history else None,
                "pesos_hasta": weights_data_max,
                "portafolios": {m: res["portfolios"][m]["combos"].copy() for m in MODES},
                "estrategias": {s: pool.combos[i].copy() for s, i in res["best_by_strategy"].items()},
                "mejor_individual": pool.combos[res["best_overall"]].copy(),
                "aleatorio": random_portfolio(make_rng(cfg.seed, d.fecha, 7)),
                "seq": seq,
            }
            entry["hashes"] = {m: portfolio_hash(c) for m, c in entry["portafolios"].items()}
            entry["hashes"]["aleatorio"] = portfolio_hash(entry["aleatorio"])
            sealed.append(entry)
            seq += 1
        if progress:
            progress(f_i + 1, len(folds))
    generation_done_seq = seq

    # ----------------------------------------------------------- FASE 2: EVALUACIÓN
    actual = {d.fecha: d.numeros for d in draws}
    test_draws = [actual_d for actual_d in draws if actual_d.fecha in {e["fecha"] for e in sealed}]
    hash_ok = True
    H = {m: [] for m in [*MODES, "aleatorio"]}
    Hs = {s: [] for s in range(len(STRATEGIES))}
    Hbest = []
    timeline = []
    for e in sealed:
        for m in MODES:
            hash_ok &= portfolio_hash(e["portafolios"][m]) == e["hashes"][m]
        hash_ok &= portfolio_hash(e["aleatorio"]) == e["hashes"].get("aleatorio")
        drawn = actual[e["fecha"]]
        row = {"fecha": e["fecha"].isoformat(), "fold": e["fold"], "resultado": list(drawn)}
        for m in MODES:
            h = hits(e["portafolios"][m], drawn)
            H[m].append(h)
            row[m] = {"max": int(h.max()), "prom": round(float(h.mean()), 3)}
        h = hits(e["aleatorio"], drawn)
        H["aleatorio"].append(h)
        row["aleatorio"] = {"max": int(h.max()), "prom": round(float(h.mean()), 3)}
        for s, c in e["estrategias"].items():
            Hs[s].append(int(hits(c[None], drawn)[0]))
        Hbest.append(int(hits(e["mejor_individual"][None], drawn)[0]))
        timeline.append(row)
    H = {m: np.array(v) for m, v in H.items()}
    T = len(sealed)

    # Lift fuera de muestra de los pesos congelados (solo lectura, después de sellar).
    for fi in fold_info:
        test_idx = fi.pop("_test_idx")
        if fi["optimizacion"].get("optimizado"):
            comps = np.stack([cache.at(t) for t in test_idx])
            mask = cache.X[test_idx].astype(float)
            W = np.array([[fi["pesos"][k] for k in COMPONENTS]])
            fi["lift_fuera_muestra"] = round(float(lift(comps, mask, W)[0]), 4)
        else:
            fi["lift_fuera_muestra"] = None

    # ----------------------------------------------------------- FASE 3: CONTROL
    mc = monte_carlo(test_draws, mc_sims, make_rng(cfg.seed, None, 1234))
    MC = mc["hits"]  # sims×T×10
    stat_rng = make_rng(cfg.seed, None, 4321)
    results = {}
    pvals = {}
    for m in [*MODES, "aleatorio"]:
        pm = portfolio_metrics(H[m])
        comp = {}
        for name, fn in KEY_METRICS.items():
            model_val = float(fn(H[m][None])[0])
            mc_vals = fn(MC).astype(float)
            p = float((1 + (mc_vals >= model_val - 1e-12).sum()) / (1 + len(mc_vals)))
            pct = float((mc_vals < model_val).mean() * 100)
            comp[name] = {"modelo": round(model_val, 4), "mc_media": round(float(mc_vals.mean()), 4),
                          "diferencia": round(model_val - float(mc_vals.mean()), 4),
                          "percentil_vs_azar": round(pct, 1), "p_valor": round(p, 4)}
            if m != "aleatorio":
                pvals[f"{m}:{name}"] = p
        per_draw = H[m].mean(axis=1)
        lo, hi = bootstrap_ci(per_draw - EXPECTED_HITS, stat_rng)
        results[m] = {"metricas": pm, "vs_monte_carlo": comp,
                      "ic95_diferencia_vs_esperado": [None if lo is None else round(lo, 4),
                                                      None if hi is None else round(hi, 4)]}
    adj = holm(pvals)
    for k, p in adj.items():
        m, name = k.split(":")
        results[m]["vs_monte_carlo"][name]["p_ajustado_holm"] = round(p, 4)

    strat_rows, sp = [], {}
    for s in range(len(STRATEGIES)):
        hs = np.array(Hs[s])
        if not len(hs):
            continue
        p = sum_hypergeom_sf(int(hs.sum()), len(hs))
        sp[s] = p
        strat_rows.append({"codigo": STRATEGIES[s][0], "estrategia": STRATEGIES[s][1], **line_metrics(hs),
                           "esperado_azar": round(EXPECTED_HITS, 4),
                           "diferencia": round(float(hs.mean()) - EXPECTED_HITS, 4), "p_valor": round(p, 4)})
    sadj = holm({str(k): v for k, v in sp.items()})
    for r, s in zip(strat_rows, sp):
        r["p_ajustado_holm"] = round(sadj[str(s)], 4)
    strat_rows.sort(key=lambda r: -r["promedio"])
    hb = np.array(Hbest)
    best_single = {**line_metrics(hb), "p_valor": round(sum_hypergeom_sf(int(hb.sum()), len(hb)), 4)}

    mc_line_means = MC.mean(axis=(1, 2))
    mc_summary = {
        "simulaciones": mc_sims,
        "promedio_aciertos": _dist_summary(mc_line_means),
        "promedio_mejor_jugada": _dist_summary(MC.max(axis=2).mean(axis=1)),
        "sorteos_alguna_ge3": _dist_summary((MC.max(axis=2) >= 3).sum(axis=1).astype(float)),
        "histograma_promedio": _histogram(mc_line_means, [results[m]["vs_monte_carlo"]["promedio_aciertos"]["modelo"] for m in MODES]),
        "metricas_agregadas": line_metrics(MC),
    }

    # Robustez entre folds (modo equilibrado).
    fold_diff = []
    for fi in fold_info:
        sel = [i for i, e in enumerate(sealed) if e["fold"] == fi["fold"]]
        d = float(H["equilibrado"][sel].mean() - EXPECTED_HITS)
        fi["dif_vs_esperado"] = round(d, 4)
        fi["promedio_equilibrado"] = round(float(H["equilibrado"][sel].mean()), 4)
        fold_diff.append(d)
    fold_diff = np.array(fold_diff)
    robustness = {"folds": len(fold_diff), "folds_positivos": int((fold_diff > 0).sum()),
                  "pct_folds_positivos": round(100 * float((fold_diff > 0).mean()), 1),
                  "desv_entre_folds": round(float(fold_diff.std()), 4)}

    overfit = overfitting_report(fold_info, optimize, weight_trials, regularization, T)

    # ----------------------------------------------------------- INTEGRIDAD
    integrity = integrity_checks(sealed, fold_info, test_draws, generation_done_seq,
                                 hash_ok, draws, cfg, update_within_fold)
    valid = all(c["ok"] for c in integrity)
    conclusion = conclude(results, strat_rows, valid, T, overfit, robustness)

    return {
        "valido": valid,
        "integridad": integrity,
        "conclusion": conclusion,
        "datos": {"sorteos_total": len(draws), "entrenamiento_inicial": [draws[0].fecha.isoformat(), train_end.isoformat()],
                  "sorteos_entrenamiento_inicial": len(train0),
                  "prueba": [sealed[0]["fecha"].isoformat(), sealed[-1]["fecha"].isoformat()],
                  "sorteos_prueba": T, "folds": len(folds)},
        "parametros": {"meses_por_fold": test_months, "optimizar_pesos": optimize,
                       "actualizar_dentro_del_fold": update_within_fold, "simulaciones_mc": mc_sims,
                       "pruebas_pesos": weight_trials, "regularizacion": regularization},
        "folds": fold_info,
        "portafolios": results,
        "estrategias": strat_rows,
        "mejor_individual": best_single,
        "monte_carlo": mc_summary,
        "robustez": robustness,
        "sobreajuste": overfit,
        "evolucion": timeline,
        "referencia_teorica": {"aciertos_esperados_por_jugada": round(EXPECTED_HITS, 4),
                               "pmf": {str(k): round(v, 6) for k, v in st.hits_pmf().items()}},
        "duracion_seg": round(time.time() - t_start, 1),
    }


def _dist_summary(v: np.ndarray) -> dict:
    return {"media": round(float(v.mean()), 4), "mediana": round(float(np.median(v)), 4),
            "p5": round(float(np.percentile(v, 5)), 4), "p25": round(float(np.percentile(v, 25)), 4),
            "p75": round(float(np.percentile(v, 75)), 4), "p95": round(float(np.percentile(v, 95)), 4),
            "minimo": round(float(v.min()), 4), "maximo": round(float(v.max()), 4)}


def _histogram(v: np.ndarray, marks: list[float], bins: int = 30) -> dict:
    lo = min(v.min(), *marks)
    hi = max(v.max(), *marks)
    h, edges = np.histogram(v, bins=bins, range=(lo, hi + 1e-9))
    return {"bins": [{"x": round(float((edges[i] + edges[i + 1]) / 2), 4), "n": int(h[i])} for i in range(bins)]}


def overfitting_report(fold_info, optimize, trials, reg, T) -> dict:
    n_params = (len(COMPONENTS) - 1) if optimize else 0
    if not optimize:
        return {"parametros_libres": 0, "complejidad": "Baja (pesos fijos configurados manualmente)",
                "pruebas_de_pesos": 0, "lift_in_sample_prom": None, "lift_fuera_muestra_prom": None,
                "brecha": None, "riesgo": "Bajo",
                "explicacion": "Los pesos no se ajustaron a los datos, por lo que no hay sobreajuste de pesos. "
                               "Las decisiones de diseño del modelo siguen siendo una fuente de sesgo (grados de libertad del investigador)."}
    ins = [f["optimizacion"]["lift_in_sample"] for f in fold_info if f["optimizacion"].get("lift_in_sample") is not None]
    oos = [f["lift_fuera_muestra"] for f in fold_info if f.get("lift_fuera_muestra") is not None]
    inner = [f["optimizacion"].get("sorteos_internos", 0) for f in fold_info]
    ins_m = float(np.mean(ins)) if ins else 0.0
    oos_m = float(np.mean(oos)) if oos else 0.0
    gap = ins_m - oos_m
    ratio = (float(np.mean(inner)) / n_params) if n_params else float("inf")
    kept_default = all(f["optimizacion"].get("eligio_default") for f in fold_info if f["optimizacion"].get("optimizado"))
    if kept_default:
        risk = "Bajo"  # la regularización conservó los pesos iniciales en todos los bloques
    elif gap > 0.08 or ratio < 8:
        risk = "Alto"
    elif gap > 0.03 or ratio < 15:
        risk = "Medio"
    else:
        risk = "Bajo"
    return {
        "parametros_libres": n_params,
        "complejidad": f"{n_params} pesos libres + {trials + 1} configuraciones evaluadas por fold; regularización L1 = {reg}",
        "pruebas_de_pesos": trials + 1,
        "sorteos_internos_por_parametro": round(ratio, 1),
        "lift_in_sample_prom": round(ins_m, 4),
        "lift_fuera_muestra_prom": round(oos_m, 4),
        "brecha": round(gap, 4),
        "riesgo": risk,
        "pesos_iniciales_conservados": kept_default,
        "explicacion": (("En todos los bloques la optimización regularizada conservó los pesos iniciales: ninguna "
                         "alternativa mejoró de forma robusta en ambas mitades del entrenamiento. " if kept_default else "") +
                        "Lift = capacidad del índice para ordenar más alto a los números que luego salieron "
                        "(0 = ninguna). Si el lift dentro de muestra supera claramente al lift fuera de muestra, "
                        "los pesos se ajustaron al ruido del entrenamiento."),
    }


def integrity_checks(sealed, fold_info, test_draws, gen_seq, hash_ok, draws, cfg,
                     update_within_fold) -> list[dict]:
    checks = []
    future = [e["fecha"].isoformat() for e in sealed if e["historial_hasta"] and e["historial_hasta"] >= e["fecha"]]
    checks.append({"control": "No se utilizó información futura", "ok": not future,
                   "detalle": "Todo portafolio usó solo sorteos con fecha anterior al sorteo evaluado." if not future
                   else f"Sorteos contaminados: {future[:5]}"})
    bad_w = [e["fecha"].isoformat() for e in sealed if e["pesos_hasta"] and e["pesos_hasta"] >= e["fecha"]]
    fold_ok = all(f["pesos_datos_hasta"] < f["prueba"][0] for f in fold_info)
    checks.append({"control": "Los pesos fueron determinados únicamente con entrenamiento", "ok": not bad_w and fold_ok,
                   "detalle": "En cada fold los pesos se calcularon con datos anteriores al inicio de la prueba y se congelaron."})
    test_dates = {e["fecha"] for e in sealed}
    leaked = []
    for f in fold_info:
        f_start = date.fromisoformat(f["prueba"][0])
        f_end = date.fromisoformat(f["prueba"][1])
        if any(f_start <= d.fecha <= f_end and d.fecha <= date.fromisoformat(f["pesos_datos_hasta"]) for d in draws):
            leaked.append(f["fold"])
    checks.append({"control": "El período de prueba permaneció aislado", "ok": not leaked,
                   "detalle": "Ningún sorteo de un período de prueba se usó para optimizar los pesos de ese período."
                   if not leaked else f"Folds con fuga: {leaked}"})
    base_ok = all(e["aleatorio"].shape == (PORTFOLIO_SIZE, PICK) and len({tuple(r) for r in e["aleatorio"]}) == PORTFOLIO_SIZE
                  and e["aleatorio"].min() >= st.NUM_MIN and e["aleatorio"].max() <= st.NUM_MAX
                  and all(len(set(r)) == PICK for r in e["aleatorio"].tolist()) for e in sealed)
    checks.append({"control": "El baseline aleatorio utilizó las mismas condiciones", "ok": base_ok and len(test_draws) == len(sealed),
                   "detalle": f"10 jugadas × 6 números 01–31, sin repetición, sobre los mismos {len(sealed)} sorteos de prueba."})
    seq_ok = all(e["seq"] < gen_seq for e in sealed) and hash_ok
    checks.append({"control": "Las 10 jugadas fueron generadas antes de conocer el resultado real", "ok": seq_ok,
                   "detalle": "Todas las jugadas se sellaron (hash SHA-256) en la fase de generación y los hashes "
                              "se verificaron sin cambios al evaluar." if seq_ok else "Hash alterado tras el sellado."})
    dup = len(test_dates) != len(sealed) or any(
        len({tuple(r) for r in c.tolist()}) != PORTFOLIO_SIZE for e in sealed for c in e["portafolios"].values())
    checks.append({"control": "No existen duplicados", "ok": not dup,
                   "detalle": "Sin sorteos de prueba repetidos ni jugadas repetidas dentro de un portafolio."})
    # Reproducibilidad: se regenera el primer sorteo sellado con la misma configuración.
    e = sealed[0]
    pos = next(i for i, d in enumerate(draws) if d.fecha == e["fecha"])
    hist = draws[:pos] if update_within_fold else draws[:e["historial_n"]]
    f = fold_info[e["fold"] - 1]
    again = generate_portfolios(hist, replace(cfg, weights=f["pesos"]), context=e["fecha"])
    rep_ok = all(portfolio_hash(again["portfolios"][m]["combos"]) == e["hashes"].get(m) for m in MODES)
    rep_ok &= portfolio_hash(random_portfolio(make_rng(cfg.seed, e["fecha"], 7))) == e["hashes"].get("aleatorio")
    checks.append({"control": "El experimento es reproducible", "ok": rep_ok,
                   "detalle": f"Se regeneró el portafolio del {e['fecha'].isoformat()} con el mismo seed ({cfg.seed}) "
                              "y se obtuvo exactamente el mismo hash." if rep_ok else "La regeneración produjo otro resultado."})
    return checks


def conclude(results, strat_rows, valid, T, overfit, robustness) -> dict:
    if not valid:
        return {"veredicto": "invalido", "texto": INVALID_MSG, "detalles": []}
    main = results["equilibrado"]["vs_monte_carlo"]["promedio_aciertos"]
    any_sig = [(m, k, v) for m in MODES for k, v in results[m]["vs_monte_carlo"].items()
               if v.get("p_ajustado_holm", 1) < 0.05 and v["diferencia"] > 0]
    nominal = [(m, k, v) for m in MODES for k, v in results[m]["vs_monte_carlo"].items()
               if v["p_valor"] < 0.05 and v["diferencia"] > 0]
    strat_sig = [r for r in strat_rows if r["p_ajustado_holm"] < 0.05 and r["diferencia"] > 0]
    details = [
        f"Sorteos de prueba fuera de muestra: {T}.",
        f"Portafolio equilibrado: {main['modelo']:.3f} aciertos promedio por jugada vs {main['mc_media']:.3f} "
        f"del azar (Monte Carlo); percentil {main['percentil_vs_azar']:.0f}; p = {main['p_valor']:.3f}.",
        f"Folds con diferencia positiva: {robustness['folds_positivos']} de {robustness['folds']}.",
        f"Riesgo de sobreajuste estimado: {overfit['riesgo']}.",
        "Se aplicó corrección de Holm por comparaciones múltiples (3 portafolios × 3 métricas; 10 estrategias aparte).",
    ]
    if T < 100:
        details.append(f"Con {T} sorteos de prueba, solo diferencias grandes podrían detectarse; "
                       "la potencia estadística es baja.")
    if any_sig or strat_sig:
        verdict = "diferencia_significativa"
        text = ("Durante el período analizado se observó una diferencia frente al azar que se mantiene después de "
                "corregir por comparaciones múltiples. Antes de aceptarla debe repetirse con otro seed, otro período "
                "y datos nuevos: en una lotería justa una diferencia así es esperable ocasionalmente por azar o por sobreajuste.")
        if overfit["riesgo"] != "Bajo":
            text += f" El riesgo de sobreajuste estimado es {overfit['riesgo'].lower()}."
    elif nominal:
        verdict = "diferencia_nominal"
        text = ("Algunas métricas mostraron una diferencia nominal (p < 0.05) que desaparece al corregir por "
                "comparaciones múltiples. " + NO_EDGE_MSG)
    elif main["diferencia"] > 0:
        verdict = "sin_ventaja"
        text = ("Durante el período analizado, el modelo obtuvo un desempeño ligeramente superior al baseline "
                "aleatorio, pero la diferencia no fue estadísticamente significativa. " + NO_EDGE_MSG)
    else:
        verdict = "sin_ventaja"
        text = ("Durante el período analizado, el modelo obtuvo un desempeño igual o inferior al baseline aleatorio. "
                + NO_EDGE_MSG)
    return {"veredicto": verdict, "texto": text, "detalles": details}
