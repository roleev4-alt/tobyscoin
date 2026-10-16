"""PORTFOLIO OPTIMIZATION.

Las 10 jugadas se optimizan como UN portafolio. Objetivo (a maximizar):

  F(S) = Σ calidad_i
         − λ · Σ_{i<j} penalización(compartidos_ij)
         − λ · Σ_n concentración(usos_n)
         + λ · bono_variedad_estructural

λ (lambda_div) define el modo: concentrado < equilibrado < diversificado.
Se resuelve con selección greedy + búsqueda local por intercambios, y la
frontera de Pareto (score vs diversidad) se obtiene barriendo λ.
"""
from __future__ import annotations

import numpy as np

from . import stats as st
from .candidates import CandidatePool
from .config import MODES, PICK, PORTFOLIO_SIZE, STRATEGIES
from .scoring import HistoryModel

N = st.N
BIG = 1e6


def penalty_vector(overlap_penalty: list) -> np.ndarray:
    return np.array([BIG if v is None else float(v) for v in overlap_penalty])


def membership(C: np.ndarray) -> np.ndarray:
    B = np.zeros((len(C), N), dtype=np.int8)
    B[np.arange(len(C))[:, None], C.astype(int) - st.NUM_MIN] = 1
    return B


def _concentration(usage: np.ndarray, cap: int) -> float:
    excess = np.clip(usage - cap, 0, None)
    return float((excess ** 2).sum() * 3.0)


def _struct_key(C: np.ndarray) -> np.ndarray:
    return st.odd_count(C) * 10 + st.low_count(C)


def objective(sel: list[int], pool: CandidatePool, B: np.ndarray, pen: np.ndarray, lam: float, cap: int) -> float:
    q = pool.score[sel].sum()
    Bs = B[sel].astype(int)
    shared = Bs @ Bs.T
    iu = np.triu_indices(len(sel), 1)
    red = pen[shared[iu]].sum()
    conc = _concentration(Bs.sum(axis=0), cap)
    keys = _struct_key(pool.combos[sel])
    variety = len(np.unique(keys)) * 2.0 + len(np.unique(pool.strategy[sel])) * 1.0
    return float(q - lam * red - lam * conc + lam * variety)


def optimize(pool: CandidatePool, pen: np.ndarray, lam: float, cap: int, k: int = PORTFOLIO_SIZE,
             rng: np.random.Generator | None = None, max_passes: int = 6) -> dict:
    B = membership(pool.combos)
    Bi = B.astype(np.int32)
    K = len(pool)
    if K < k:
        raise ValueError(f"Solo hay {K} candidatos; se necesitan al menos {k}")
    sel: list[int] = []
    gains: list[float] = []
    for _ in range(k):
        if sel:
            shared = Bi @ Bi[sel].T  # K×|S|
            red = pen[shared].sum(axis=1)
            usage = Bi[sel].sum(axis=0)
            excess_after = np.clip(usage[None, :] + Bi - cap, 0, None)
            conc = ((excess_after ** 2).sum(axis=1) - (np.clip(usage - cap, 0, None) ** 2).sum()) * 3.0
            keys_sel = set(_struct_key(pool.combos[sel]).tolist())
            strat_sel = set(pool.strategy[sel].tolist())
            new_key = ~np.isin(_struct_key(pool.combos), list(keys_sel))
            new_strat = ~np.isin(pool.strategy, list(strat_sel))
            gain = pool.score - lam * red - lam * conc + lam * (2.0 * new_key + 1.0 * new_strat)
        else:
            gain = pool.score + lam * 3.0
        gain = gain.astype(float)
        gain[sel] = -np.inf
        j = int(np.argmax(gain))
        sel.append(j)
        gains.append(float(gain[j]))
    entry_gain = dict(zip(sel, gains))
    best = objective(sel, pool, B, pen, lam, cap)
    swaps = 0
    # Búsqueda local: reemplazar cada jugada por el mejor candidato dado el resto.
    top = np.argsort(-pool.score)[: min(K, 600)]
    for _ in range(max_passes):
        improved = False
        for pos in range(k):
            others = sel[:pos] + sel[pos + 1:]
            shared = Bi[top] @ Bi[others].T
            red = pen[shared].sum(axis=1)
            approx = pool.score[top] - lam * red
            for cand in top[np.argsort(-approx)[:15]]:
                if cand in sel:
                    continue
                trial = others[:pos] + [int(cand)] + others[pos:]
                val = objective(trial, pool, B, pen, lam, cap)
                if val > best + 1e-9:
                    sel, best, improved = trial, val, True
                    swaps += 1
                    entry_gain[int(cand)] = float(approx[np.where(top == cand)[0][0]])
                    break
        if not improved:
            break
    return {"sel": sel, "objective": best, "swaps": swaps, "entry_gain": entry_gain}


# ---------------------------------------------------------------- métricas
def overlap_matrix(C: np.ndarray) -> np.ndarray:
    Bi = membership(C).astype(int)
    M = Bi @ Bi.T
    return M


def diversity_index(C: np.ndarray, strategies: np.ndarray | None = None, hist_sum_std: float | None = None) -> dict:
    k = len(C)
    M = overlap_matrix(C)
    iu = np.triu_indices(k, 1)
    shared = M[iu]
    usage = np.bincount((C.astype(int) - st.NUM_MIN).ravel(), minlength=N)
    unique = int((usage > 0).sum())
    max_unique = min(N, k * PICK)
    p = usage[usage > 0] / usage.sum()
    entropy = float(-(p * np.log(p)).sum() / np.log(max_unique))
    sums = st.combo_sum(C)
    ref_std = hist_sum_std or st.theoretical()["suma_std"]

    def variety(values, possible):
        return min(len(np.unique(values)) / min(possible, k), 1.0)

    comps = {
        "numeros_unicos": unique / max_unique,
        "repeticion": entropy,
        "distancia": float(1 - shared.mean() / PICK) if len(shared) else 1.0,
        "par_impar": variety(st.odd_count(C), 5),
        "bajo_alto": variety(st.low_count(C), 5),
        "decadas": variety(st.decade_code(C), 8),
        "sumas": float(min(sums.std() / ref_std, 1.0)),
        "consecutivos": variety(st.consecutive_count(C), 3),
        "estrategias": variety(strategies, 10) if strategies is not None else 0.5,
    }
    weights = {"numeros_unicos": 20, "repeticion": 10, "distancia": 25, "par_impar": 7, "bajo_alto": 7,
               "decadas": 8, "sumas": 8, "consecutivos": 5, "estrategias": 10}
    value = sum(comps[c] * w for c, w in weights.items())
    return {"indice": round(value, 1), "interpretacion": interpret_diversity(value),
            "componentes": {c: round(v, 3) for c, v in comps.items()}, "pesos": weights}


def interpret_diversity(v: float) -> str:
    if v >= 90:
        return "Muy alta"
    if v >= 75:
        return "Alta"
    if v >= 60:
        return "Moderada"
    if v >= 40:
        return "Baja"
    return "Muy baja"


def redundancy_index(C: np.ndarray) -> float:
    """0 = ningún número compartido; 100 = en promedio 3+ números compartidos por pareja."""
    M = overlap_matrix(C)
    iu = np.triu_indices(len(C), 1)
    return round(float(min(M[iu].mean() / 3.0, 1.0) * 100), 1)


def coverage(C: np.ndarray) -> dict:
    usage = np.bincount((C.astype(int) - st.NUM_MIN).ravel(), minlength=N)
    total = int(usage.sum())
    return {
        "posiciones": total,
        "numeros_unicos": int((usage > 0).sum()),
        "indice": round(100 * (usage > 0).sum() / N, 1),
        "filas": [{"numero": int(st.NUMS[i]), "veces": int(usage[i]), "pct": round(100 * usage[i] / total, 2)}
                  for i in range(N)],
        "max_uso": int(usage.max()),
    }


def balance_index(C: np.ndarray, m: HistoryModel) -> float:
    """Cercanía entre la proporción agregada de impares/bajos del portafolio y la histórica."""
    total = C.size
    odd_share = float((C % 2 == 1).sum() / total)
    low_share = float((C <= st.LOW_MAX).sum() / total)
    if m.n:
        h_odd = float((m.C % 2 == 1).sum() / m.C.size)
        h_low = float((m.C <= st.LOW_MAX).sum() / m.C.size)
    else:
        h_odd, h_low = float((st.NUMS % 2 == 1).mean()), float((st.NUMS <= st.LOW_MAX).mean())
    dev = abs(odd_share - h_odd) + abs(low_share - h_low)
    return round(max(0.0, 1 - 2.5 * dev) * 100, 1)


def summarize(C: np.ndarray, scores: np.ndarray, strategies: np.ndarray, m: HistoryModel) -> dict:
    sum_std = float(st.combo_sum(m.C).std()) if m.n >= 5 else None
    div = diversity_index(C, strategies, sum_std)
    cov = coverage(C)
    red = redundancy_index(C)
    bal = balance_index(C, m)
    stat = round(float(scores.mean()), 1)
    total = round(0.5 * stat + 0.25 * div["indice"] + 0.15 * cov["indice"] + 0.10 * bal, 1)
    return {"score_total": total, "score_estadistico": stat, "diversidad": div, "cobertura": cov,
            "redundancia": red, "balance": bal, "numeros_unicos": cov["numeros_unicos"],
            "formula_total": "0.50·estadístico + 0.25·diversidad + 0.15·cobertura + 0.10·balance"}


def build(pool: CandidatePool, m: HistoryModel, mode: str, rng: np.random.Generator | None = None) -> dict:
    cfg = m.cfg
    pen = penalty_vector(cfg.overlap_penalty)
    lam, cap = MODES[mode]["lambda_div"], MODES[mode]["concentration_cap"]
    res = optimize(pool, pen, lam, cap, rng=rng)
    sel = res["sel"]
    # Orden de presentación: por score individual descendente.
    sel = sorted(sel, key=lambda i: -pool.score[i])
    C = pool.combos[sel]
    return {"mode": mode, "sel": sel, "combos": C, "scores": pool.score[sel], "strategies": pool.strategy[sel],
            "objective": res["objective"], "swaps": res["swaps"], "entry_gain": res["entry_gain"],
            "lambda": lam, "cap": cap}


def pareto_front(pool: CandidatePool, m: HistoryModel, lambdas=(0, 0.15, 0.35, 0.6, 1.0, 1.6, 2.4, 3.0, 4.5, 7.0)) -> list[dict]:
    pen = penalty_vector(m.cfg.overlap_penalty)
    pts = []
    for lam in lambdas:
        cap = 6 if lam < 0.3 else 5 if lam < 0.8 else 4 if lam < 2 else 3
        r = optimize(pool, pen, lam, cap, max_passes=2)
        C = pool.combos[r["sel"]]
        pts.append({"lambda": lam, "score": round(float(pool.score[r["sel"]].mean()), 2),
                    "diversidad": diversity_index(C, pool.strategy[r["sel"]])["indice"]})
    for p in pts:
        p["pareto"] = not any((q["score"] >= p["score"] and q["diversidad"] >= p["diversidad"]) and
                              (q["score"] > p["score"] or q["diversidad"] > p["diversidad"]) for q in pts)
    return pts


# ---------------------------------------------------------------- auditoría
def combo_audit(pf: dict, pool: CandidatePool, m: HistoryModel) -> list[dict]:
    pen = penalty_vector(m.cfg.overlap_penalty)
    C = pf["combos"]
    M = overlap_matrix(C)
    lam = pf["lambda"]
    base_div = diversity_index(C, pf["strategies"])["indice"]
    rank_all = np.empty(len(pool), dtype=int)
    rank_all[np.argsort(-pool.score)] = np.arange(1, len(pool) + 1)
    w = m.cfg.combo_weights
    out = []
    for pos, i in enumerate(pf["sel"]):
        others = [x for x in range(len(C)) if x != pos]
        shared = M[pos, others]
        red = float(sum(pen[s] for s in shared))
        div_without = diversity_index(C[others], pf["strategies"][others])["indice"]
        parts = {k: float(pool.parts[k][i]) for k in pool.parts}
        new_nums = int((np.bincount((C[others].astype(int) - st.NUM_MIN).ravel(), minlength=N)[C[pos] - st.NUM_MIN] == 0).sum())
        reasons = []
        r = int(rank_all[i])
        if r <= 10:
            reasons.append(f"Está entre las 10 combinaciones de mayor score individual (puesto {r} de {len(pool)}).")
        else:
            reasons.append(f"Su score individual ocupa el puesto {r} de {len(pool)}, pero mejora el portafolio completo.")
        if shared.max() <= 1:
            reasons.append("Comparte como máximo 1 número con cada una de las otras jugadas.")
        else:
            reasons.append(f"Comparte como máximo {int(shared.max())} números con otra jugada; la penalización fue compensada por su calidad.")
        if new_nums:
            reasons.append(f"Aporta {new_nums} número(s) que ninguna otra jugada del portafolio cubre.")
        if base_div - div_without > 0:
            reasons.append(f"Aumenta el índice de diversidad en {base_div - div_without:+.1f} puntos.")
        out.append({
            "opcion": pos + 1,
            "combinacion": [int(x) for x in C[pos]],
            "estrategia": STRATEGIES[int(pool.strategy[i])][1],
            "score_individual": round(parts["individual"] * 100, 1),
            "score_pares": round(parts["pares"] * 100, 1),
            "score_trios": round(parts["trios"] * 100, 1),
            "score_estructural": round(parts["estructura"] * 100, 1),
            "score_distribucion": round((parts["suma"] + parts["consecutivos"]) / 2 * 100, 1),
            "desglose_puntos": {k: round(parts[k] * w[k], 2) for k in w},
            "score_final": round(float(pool.score[i]), 1),
            "penalizacion_redundancia": round(lam * red, 2),
            "compartidos_con_otras": [int(s) for s in shared],
            "aporte_diversidad": round(base_div - div_without, 1),
            "ranking_en_candidatos": r,
            "por_que": reasons,
            "estructura": {"impares": int(st.odd_count(C[pos:pos + 1])[0]), "bajos": int(st.low_count(C[pos:pos + 1])[0]),
                           "suma": int(st.combo_sum(C[pos:pos + 1])[0]),
                           "consecutivos": int(st.consecutive_count(C[pos:pos + 1])[0])},
        })
    return out


def redundancy_discards(pool: CandidatePool, sel: list[int], pen: np.ndarray, threshold: float = 15.0) -> int:
    """Candidatos que quedaron fuera por compartir demasiados números con alguna jugada elegida."""
    Bi = membership(pool.combos).astype(np.int32)
    shared = Bi @ Bi[sel].T
    bad = (pen[shared] >= threshold).any(axis=1)
    bad[sel] = False
    return int(bad.sum())
