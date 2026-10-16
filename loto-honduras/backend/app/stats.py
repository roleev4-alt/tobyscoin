"""STATISTICAL ANALYSIS.

Funciones puras sobre una lista ordenada de sorteos. Ninguna función de este
módulo conoce fechas futuras: siempre reciben exactamente el historial que
se les permite ver.
"""
from __future__ import annotations

from functools import lru_cache
from itertools import chain, combinations
from math import comb

import numpy as np
from scipy import stats as sps

from .config import NUM_MAX, NUM_MIN, PICK, RECENT_WINDOWS
from .validation import Draw

N = NUM_MAX - NUM_MIN + 1
NUMS = np.arange(NUM_MIN, NUM_MAX + 1)
LOW_MAX = NUM_MAX // 2  # 01–33: bajos 01–16, altos 17–33
DECADES = [(1, 10), (11, 20), (21, NUM_MAX)]
P_LINE = PICK / N  # probabilidad teórica de que un número salga en un sorteo


def to_matrix(draws: list[Draw]) -> np.ndarray:
    X = np.zeros((len(draws), N), dtype=np.int8)
    for i, d in enumerate(draws):
        X[i, np.asarray(d.numeros) - NUM_MIN] = 1
    return X


def combos_array(draws: list[Draw]) -> np.ndarray:
    if not draws:
        return np.zeros((0, PICK), dtype=np.int16)
    return np.array([d.numeros for d in draws], dtype=np.int16)


# ---------------------------------------------------------------- estructura
def odd_count(C: np.ndarray) -> np.ndarray:
    return (C % 2 == 1).sum(axis=1)


def low_count(C: np.ndarray) -> np.ndarray:
    return (C <= LOW_MAX).sum(axis=1)


def decade_code(C: np.ndarray) -> np.ndarray:
    """Código entero a*100+b*10+c con a,b,c = números en cada década."""
    a = ((C >= 1) & (C <= 10)).sum(axis=1)
    b = ((C >= 11) & (C <= 20)).sum(axis=1)
    c = (C >= 21).sum(axis=1)
    return a * 100 + b * 10 + c


def consecutive_count(C: np.ndarray) -> np.ndarray:
    S = np.sort(C, axis=1)
    return (np.diff(S, axis=1) == 1).sum(axis=1)


def combo_sum(C: np.ndarray) -> np.ndarray:
    return C.sum(axis=1)


@lru_cache(maxsize=1)
def all_combinations() -> np.ndarray:
    """Todas las combinaciones posibles, C(N,6) (para distribuciones teóricas exactas)."""
    k = comb(N, PICK)
    flat = np.fromiter(chain.from_iterable(combinations(range(NUM_MIN, NUM_MAX + 1), PICK)), dtype=np.int8, count=k * PICK)
    return flat.reshape(k, PICK)


@lru_cache(maxsize=1)
def theoretical() -> dict:
    A = all_combinations().astype(np.int16)
    total = len(A)

    def dist(values, support):
        cnt = np.bincount(values, minlength=max(support) + 1)
        return {int(k): float(cnt[k] / total) for k in support}

    sums = combo_sum(A)
    dec = decade_code(A)
    dec_u, dec_c = np.unique(dec, return_counts=True)
    return {
        "total_combinaciones": int(total),
        "impares": dist(odd_count(A), range(PICK + 1)),
        "bajos": dist(low_count(A), range(PICK + 1)),
        "consecutivos": dist(consecutive_count(A), range(PICK)),
        "decadas": {_dec_label(int(k)): float(v / total) for k, v in zip(dec_u, dec_c)},
        "suma_media": float(sums.mean()),
        "suma_std": float(sums.std()),
        "suma_hist": np.bincount(sums, minlength=200).astype(float) / total,
    }


def _dec_label(code: int) -> str:
    return f"{code // 100}-{(code // 10) % 10}-{code % 10}"


def hits_pmf() -> dict:
    """Aciertos de una jugada al azar contra un sorteo: hipergeométrica(N, 6, 6)."""
    rv = sps.hypergeom(N, PICK, PICK)
    return {k: float(rv.pmf(k)) for k in range(PICK + 1)}


# ---------------------------------------------------------------- análisis
def classify_by_rank(rank: int) -> str:
    q = (rank - 1) / N
    if q < 0.2:
        return "Muy frecuente"
    if q < 0.4:
        return "Frecuencia alta"
    if q < 0.6:
        return "Frecuencia media"
    if q < 0.8:
        return "Frecuencia baja"
    return "Muy poco frecuente"


def frequency(X: np.ndarray) -> dict:
    n = len(X)
    counts = X.sum(axis=0).astype(int)
    order = np.argsort(-counts, kind="stable")
    rank = np.empty(N, dtype=int)
    rank[order] = np.arange(1, N + 1)
    expected = n * P_LINE
    sd = np.sqrt(n * P_LINE * (1 - P_LINE)) if n else 1.0
    rows = []
    for i in range(N):
        rows.append({
            "numero": int(NUMS[i]),
            "apariciones": int(counts[i]),
            "pct_sorteos": round(100 * counts[i] / n, 2) if n else 0.0,
            "ranking": int(rank[i]),
            "esperado_azar": round(expected, 2),
            "z": round(float((counts[i] - expected) / sd), 2) if n else 0.0,
            "clase": classify_by_rank(int(rank[i])),
        })
    # Prueba chi-cuadrado de uniformidad (¿las frecuencias difieren del azar?).
    if n >= 5:
        chi2 = float(((counts - expected) ** 2 / expected).sum())
        p = float(sps.chi2.sf(chi2, N - 1))
    else:
        chi2, p = None, None
    return {"filas": rows, "sorteos": n, "esperado_por_numero": round(expected, 2),
            "chi2": chi2, "chi2_p": p, "chi2_gl": N - 1}


def recent_frequency(X: np.ndarray, trend_short: int = 10, trend_long: int = 50) -> dict:
    n = len(X)
    windows = [w for w in RECENT_WINDOWS] + [n]
    labels = [f"ult_{w}" for w in RECENT_WINDOWS] + ["historico"]
    out = []
    rates = {}
    for w, lab in zip(windows, labels):
        sub = X[-w:] if w and n else X[:0]
        m = len(sub)
        rates[lab] = sub.sum(axis=0) / m if m else np.zeros(N)
        rates[lab + "_n"] = m
    trend = trend_index(X, trend_short, trend_long)
    for i in range(N):
        row = {"numero": int(NUMS[i])}
        for lab in labels:
            row[lab] = round(100 * float(rates[lab][i]), 1)
        row["tendencia"] = round(float(trend[i]), 3)
        out.append(row)
    return {"filas": out, "ventanas": {lab: int(rates[lab + "_n"]) for lab in labels},
            "nota": "Una tendencia reciente describe el pasado; no implica que continuará."}


def trend_index(X: np.ndarray, short: int, long: int) -> np.ndarray:
    """(tasa corta − tasa larga) / error estándar binomial de la tasa corta."""
    n = len(X)
    if n == 0:
        return np.zeros(N)
    s = X[-short:]
    l = X[-long:]
    rs = s.mean(axis=0)
    rl = l.mean(axis=0)
    se = np.sqrt(P_LINE * (1 - P_LINE) / max(len(s), 1))
    return (rs - rl) / se


def gaps(X: np.ndarray) -> np.ndarray:
    """Sorteos transcurridos desde la última aparición (n si nunca apareció)."""
    n = len(X)
    g = np.full(N, n, dtype=int)
    for i in range(N):
        idx = np.flatnonzero(X[:, i])
        if len(idx):
            g[i] = n - 1 - idx[-1]
    return g


def classify_gap(g: int) -> str:
    if g <= 1:
        return "Muy reciente"
    if g <= 4:
        return "Reciente"
    if g <= 9:
        return "Intermedio"
    return "Ausencia prolongada"


def recency(draws: list[Draw], X: np.ndarray, window: int = 20) -> dict:
    g = gaps(X)
    rec = X[-window:].sum(axis=0) if len(X) else np.zeros(N)
    rows = []
    for i in range(N):
        idx = np.flatnonzero(X[:, i])
        rows.append({
            "numero": int(NUMS[i]),
            "ultima_aparicion": draws[idx[-1]].fecha.isoformat() if len(idx) else None,
            "sorteos_desde": int(g[i]),
            "frecuencia_reciente": int(rec[i]),
            "clase": classify_gap(int(g[i])),
        })
    return {"filas": rows, "ventana_reciente": window,
            "nota": ("La ausencia es solo una característica histórica. Un número 'atrasado' NO tiene "
                     "mayor probabilidad matemática de salir en el próximo sorteo.")}


def pair_matrix(X: np.ndarray) -> np.ndarray:
    Xi = X.astype(np.int32)
    C = Xi.T @ Xi
    np.fill_diagonal(C, 0)
    return C


def pairs(X: np.ndarray, top: int = 10) -> dict:
    n = len(X)
    C = pair_matrix(X)
    cnt = X.sum(axis=0).astype(float)
    exp_pair = n * (PICK * (PICK - 1)) / (N * (N - 1))
    rows = []
    for i in range(N):
        for j in range(i + 1, N):
            c = int(C[i, j])
            lift = (c * n / (cnt[i] * cnt[j])) if cnt[i] and cnt[j] else 0.0
            rows.append({"a": int(NUMS[i]), "b": int(NUMS[j]), "veces": c,
                         "pct_sorteos": round(100 * c / n, 2) if n else 0.0,
                         "lift": round(lift, 3)})
    rows.sort(key=lambda r: (-r["veces"], -r["lift"], r["a"], r["b"]))
    return {"top": rows[:top], "matriz": C.tolist(), "esperado_por_par": round(exp_pair, 2),
            "nota": ("Lift = veces juntos / esperado si fueran independientes dado su frecuencia. "
                     "Con pocas muestras, lifts altos suelen deberse al azar.")}


def trio_counts(C: np.ndarray) -> dict:
    out: dict[tuple, int] = {}
    for row in C:
        for t in combinations(sorted(int(x) for x in row), 3):
            out[t] = out.get(t, 0) + 1
    return out


def trio_tensor(C: np.ndarray) -> np.ndarray:
    T = np.zeros((N + 1, N + 1, N + 1), dtype=np.int16)
    for row in C:
        r = sorted(int(x) for x in row)
        for a, b, c in combinations(r, 3):
            T[a, b, c] += 1
    return T


def trios(C: np.ndarray, min_count: int = 2, top: int = 25) -> dict:
    n = len(C)
    tc = trio_counts(C)
    exp_trio = n * 20 / (N * (N - 1) * (N - 2) / 6)
    rows = [{"trio": list(k), "veces": v, "pct_sorteos": round(100 * v / n, 2) if n else 0.0}
            for k, v in tc.items() if v >= min_count]
    rows.sort(key=lambda r: (-r["veces"], r["trio"]))
    return {"top": rows[:top], "total_con_frecuencia_minima": len(rows), "minimo": min_count,
            "esperado_por_trio": round(exp_trio, 3),
            "advertencia": (f"Existen {comb(N, 3):,} tríos posibles; con {n} sorteos cada trío se espera "
                            f"~{exp_trio:.2f} veces. El tamaño de muestra es muy pequeño: "
                            "repeticiones de tríos son compatibles con el azar.")}


def _dist(values: np.ndarray, support) -> dict:
    n = len(values)
    cnt = np.bincount(values.astype(int), minlength=max(support) + 1) if n else np.zeros(max(support) + 1)
    return {int(k): {"veces": int(cnt[k]), "pct": round(100 * cnt[k] / n, 2) if n else 0.0} for k in support}


def structure(C: np.ndarray) -> dict:
    th = theoretical()
    n = len(C)
    odd = odd_count(C) if n else np.zeros(0, int)
    low = low_count(C) if n else np.zeros(0, int)
    cons = consecutive_count(C) if n else np.zeros(0, int)
    sums = combo_sum(C) if n else np.zeros(0, int)
    dec = decade_code(C) if n else np.zeros(0, int)

    def pattern_rows(values, label_fn, theo):
        d = _dist(values, range(PICK + 1))
        return [{"patron": label_fn(k), "veces": d[k]["veces"], "pct": d[k]["pct"],
                 "teorico_pct": round(100 * theo[k], 2)} for k in range(PICK, -1, -1)]

    dec_u, dec_c = np.unique(dec, return_counts=True) if n else (np.array([]), np.array([]))
    dec_rows = sorted(
        [{"patron": _dec_label(int(k)), "veces": int(v), "pct": round(100 * v / n, 2),
          "teorico_pct": round(100 * th["decadas"].get(_dec_label(int(k)), 0), 2)} for k, v in zip(dec_u, dec_c)],
        key=lambda r: -r["veces"])
    hist_bins = list(range(20, 200, 10))
    h, edges = np.histogram(sums, bins=hist_bins) if n else (np.zeros(len(hist_bins) - 1), hist_bins)
    theo_hist = th["suma_hist"]
    sum_hist = [{"rango": f"{int(edges[i])}–{int(edges[i + 1]) - 1}", "veces": int(h[i]),
                 "pct": round(100 * h[i] / n, 2) if n else 0.0,
                 "teorico_pct": round(100 * float(theo_hist[int(edges[i]):int(edges[i + 1])].sum()), 2)}
                for i in range(len(h))]
    cons_d = _dist(cons, range(PICK))
    chi = {}
    for key, vals, theo in (("impares", odd, th["impares"]), ("bajos", low, th["bajos"])):
        chi[key] = _chi_vs_theory(vals, theo)
    return {
        "par_impar": pattern_rows(odd, lambda k: f"{k}/{PICK - k}", th["impares"]),
        "bajo_alto": pattern_rows(low, lambda k: f"{k}/{PICK - k}", th["bajos"]),
        "decadas": dec_rows,
        "suma": {
            "media": round(float(sums.mean()), 2) if n else None,
            "mediana": float(np.median(sums)) if n else None,
            "minimo": int(sums.min()) if n else None,
            "maximo": int(sums.max()) if n else None,
            "desv": round(float(sums.std()), 2) if n else None,
            "p25": float(np.percentile(sums, 25)) if n else None,
            "p75": float(np.percentile(sums, 75)) if n else None,
            "teorico_media": round(th["suma_media"], 2),
            "teorico_desv": round(th["suma_std"], 2),
            "histograma": sum_hist,
        },
        "consecutivos": [{"pares_consecutivos": k, "veces": cons_d[k]["veces"], "pct": cons_d[k]["pct"],
                          "teorico_pct": round(100 * th["consecutivos"][k], 2)} for k in range(PICK)],
        "pruebas": chi,
        "leyenda": (f"par_impar = impares/pares; bajo_alto = bajos(01–{LOW_MAX:02d})/altos({LOW_MAX + 1:02d}–{NUM_MAX:02d}); "
                    f"décadas = 01–10 / 11–20 / 21–{NUM_MAX:02d}"),
    }


def _chi_vs_theory(values: np.ndarray, theo: dict) -> dict:
    n = len(values)
    if n < 10:
        return {"chi2": None, "p": None}
    obs = np.bincount(values.astype(int), minlength=PICK + 1).astype(float)
    exp = np.array([theo[k] for k in range(PICK + 1)]) * n
    # Agrupar categorías con esperado < 5 (regla de Cochran).
    o, e, acc_o, acc_e = [], [], 0.0, 0.0
    for oi, ei in zip(obs, exp):
        acc_o += oi
        acc_e += ei
        if acc_e >= 5:
            o.append(acc_o)
            e.append(acc_e)
            acc_o = acc_e = 0.0
    if acc_e > 0 and e:
        o[-1] += acc_o
        e[-1] += acc_e
    if len(e) < 2:
        return {"chi2": None, "p": None}
    chi2 = float(((np.array(o) - np.array(e)) ** 2 / np.array(e)).sum())
    return {"chi2": round(chi2, 3), "p": round(float(sps.chi2.sf(chi2, len(e) - 1)), 4), "gl": len(e) - 1}


def full_analysis(draws: list[Draw], min_trio: int = 2, recent_window: int = 20,
                  trend_short: int = 10, trend_long: int = 50) -> dict:
    X = to_matrix(draws)
    C = combos_array(draws)
    return {
        "sorteos": len(draws),
        "desde": draws[0].fecha.isoformat() if draws else None,
        "hasta": draws[-1].fecha.isoformat() if draws else None,
        "frecuencia": frequency(X),
        "reciente": recent_frequency(X, trend_short, trend_long),
        "recencia": recency(draws, X, recent_window),
        "pares": pairs(X),
        "trios": trios(C, min_trio),
        "estructura": structure(C),
        "aciertos_teoricos_por_jugada": hits_pmf(),
    }
