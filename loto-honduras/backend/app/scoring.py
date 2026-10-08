"""NUMBER SCORING + scoring de combinaciones.

`HistoryModel` se construye EXCLUSIVAMENTE con el historial recibido. Todo lo
que el generador y el optimizador saben del pasado sale de aquí; por eso en
el backtesting basta con controlar qué historial se le entrega.
"""
from __future__ import annotations

from datetime import date

import numpy as np

from . import stats as st
from .config import COMPONENTS, PICK, ModelConfig
from .validation import Draw

N = st.N
NUMS = st.NUMS
PAIR_IDX = [(i, j) for i in range(PICK) for j in range(i + 1, PICK)]
TRIO_IDX = [(i, j, k) for i in range(PICK) for j in range(i + 1, PICK) for k in range(j + 1, PICK)]

COMPONENT_LABELS = {
    "historica": "Frecuencia histórica",
    "reciente": "Frecuencia reciente",
    "tendencia": "Tendencia",
    "pares": "Pares",
    "trios": "Tríos",
    "recencia": "Recencia",
    "estructura": "Estructura",
}


def minmax(v: np.ndarray) -> np.ndarray:
    v = np.asarray(v, dtype=float)
    lo, hi = v.min(), v.max()
    if hi - lo < 1e-12:
        return np.full_like(v, 0.5)
    return (v - lo) / (hi - lo)


def raw_components(X: np.ndarray, C: np.ndarray, cfg: ModelConfig) -> dict:
    """Componentes crudos (antes de normalizar) para cada número."""
    n = len(X)
    if n == 0:
        z = np.zeros(N)
        return {k: z.copy() for k in COMPONENTS}
    hist = X.mean(axis=0)
    rec = X[-cfg.recent_window:].mean(axis=0)
    trend = st.trend_index(X, cfg.trend_short, cfg.trend_long)
    g = st.gaps(X)
    # Pares: promedio de las 5 asociaciones más fuertes del número.
    P = st.pair_matrix(X).astype(float)
    pares = np.sort(P, axis=1)[:, -5:].mean(axis=1)
    # Tríos: participación ponderada en tríos con frecuencia mínima.
    tc = st.trio_counts(C)
    trios = np.zeros(N)
    for t, v in tc.items():
        if v >= cfg.min_trio_count:
            for x in t:
                trios[x - st.NUM_MIN] += v
    # Estructura: qué tan representados históricamente están los grupos del número
    # (paridad, bajo/alto, década), relativo al tamaño del grupo.
    groups = [
        (NUMS % 2 == 1), (NUMS % 2 == 0),
        (NUMS <= st.LOW_MAX), (NUMS > st.LOW_MAX),
        *[(NUMS >= a) & (NUMS <= b) for a, b in st.DECADES],
    ]
    est = np.zeros(N)
    for gmask in groups:
        rate = X[:, gmask].sum() / (n * gmask.sum())
        est[gmask] += rate
    return {
        "historica": hist,
        "reciente": rec,
        "tendencia": trend,
        "pares": pares,
        "trios": trios,
        "recencia": -g.astype(float),  # aparición más reciente → valor más alto
        "estructura": est,
    }


def normalized_components(X: np.ndarray, C: np.ndarray, cfg: ModelConfig) -> np.ndarray:
    """Matriz N×7 con cada componente normalizado a [0,1] (orden COMPONENTS)."""
    raw = raw_components(X, C, cfg)
    return np.column_stack([minmax(raw[k]) for k in COMPONENTS])


def index_from_components(comp: np.ndarray, weights: dict) -> np.ndarray:
    w = np.array([weights[k] for k in COMPONENTS], dtype=float)
    return comp @ w  # pesos suman 100 → índice 0..100


class HistoryModel:
    """Todo lo que el modelo sabe del pasado hasta (sin incluir) `cutoff`."""

    def __init__(self, draws: list[Draw], cfg: ModelConfig):
        self.cfg = cfg
        self.draws = draws
        self.n = len(draws)
        self.data_max_date: date | None = draws[-1].fecha if draws else None
        self.X = st.to_matrix(draws)
        self.C = st.combos_array(draws)
        self.raw = raw_components(self.X, self.C, cfg)
        self.comp = np.column_stack([minmax(self.raw[k]) for k in COMPONENTS])
        self.index = index_from_components(self.comp, cfg.weights)
        self.gaps = st.gaps(self.X)
        self._prepare_combo_tables()

    # ---- tablas para scoring de combinaciones (todas derivadas del historial) ----
    def _prepare_combo_tables(self):
        n = self.n
        P = st.pair_matrix(self.X).astype(float)
        iu = np.triu_indices(N, 1)
        vals = P[iu]
        lo, hi = (vals.min(), vals.max()) if n else (0.0, 0.0)
        self.pair_strength = (P - lo) / (hi - lo) if hi > lo else np.full_like(P, 0.5)
        self.trio_T = st.trio_tensor(self.C)
        self.trio_max = max(int(self.trio_T.max()), 1)
        alpha = 1.0  # suavizado de Laplace: con pocos datos se acerca a la teoría
        th = st.theoretical()

        def smoothed(values, support, theo):
            cnt = np.bincount(values, minlength=len(support)).astype(float) if n else np.zeros(len(support))
            prior = np.array([theo[k] for k in support]) * len(support)
            p = (cnt + alpha * prior) / (n + alpha * len(support))
            return p / p.max()

        self.odd_p = smoothed(st.odd_count(self.C) if n else np.zeros(0, int), range(PICK + 1), th["impares"])
        self.low_p = smoothed(st.low_count(self.C) if n else np.zeros(0, int), range(PICK + 1), th["bajos"])
        self.cons_p = smoothed(st.consecutive_count(self.C) if n else np.zeros(0, int), range(PICK), th["consecutivos"])
        self.dec_counts: dict[int, float] = {}
        if n:
            u, c = np.unique(st.decade_code(self.C), return_counts=True)
            self.dec_counts = {int(a): float(b) for a, b in zip(u, c)}
        self.dec_theo = {}
        for label, v in th["decadas"].items():
            a, b, c = map(int, label.split("-"))
            self.dec_theo[a * 100 + b * 10 + c] = v
        dec_max = max(((self.dec_counts.get(k, 0) + alpha * v * 28) / (n + alpha * 28)) for k, v in self.dec_theo.items())
        self.dec_norm = dec_max
        # Densidad suavizada de la suma (kernel gaussiano, bandwidth de Silverman).
        grid = np.arange(0, 200)
        if n >= 3:
            sums = st.combo_sum(self.C).astype(float)
            bw = max(1.06 * sums.std() * n ** (-1 / 5), 4.0)
            dens = np.exp(-0.5 * ((grid[:, None] - sums[None, :]) / bw) ** 2).sum(axis=1)
            w = n / (n + 10.0)  # mezcla con la distribución teórica cuando hay pocos datos
            dens = w * dens / dens.sum() + (1 - w) * th["suma_hist"][:200] / th["suma_hist"][:200].sum()
        else:
            dens = th["suma_hist"][:200].copy()
        self.sum_density = dens / dens.max()
        sums_hist = st.combo_sum(self.C) if n else np.array([th["suma_media"]])
        self.sum_iqr = (float(np.percentile(sums_hist, 25)), float(np.percentile(sums_hist, 75))) if n >= 4 \
            else (th["suma_media"] - 0.67 * th["suma_std"], th["suma_media"] + 0.67 * th["suma_std"])
        self.top_odd = list(np.argsort(-self.odd_p)[:2])
        self.top_low = list(np.argsort(-self.low_p)[:2])

    # ---- auditoría de un número (sección 30) ----
    def number_audit(self, num: int) -> dict:
        i = num - st.NUM_MIN
        w = self.cfg.weights
        parts = {k: round(float(self.comp[i, j] * w[k]), 2) for j, k in enumerate(COMPONENTS)}
        return {
            "numero": num,
            "score": round(float(self.index[i]), 1),
            "desglose": [{"componente": k, "etiqueta": COMPONENT_LABELS[k], "puntos": parts[k],
                          "maximo": round(w[k], 2), "normalizado": round(float(self.comp[i, j]), 3),
                          "valor_crudo": round(float(self.raw[k][i]), 4)}
                         for j, k in enumerate(COMPONENTS)],
            "total": round(sum(parts.values()), 1),
            "datos": {
                "apariciones": int(self.X[:, i].sum()),
                "sorteos": self.n,
                "sorteos_desde_ultima": int(self.gaps[i]),
            },
            "nota": "Este índice NO representa la probabilidad matemática real de que el número salga.",
        }

    def number_table(self) -> list[dict]:
        order = np.argsort(-self.index, kind="stable")
        rank = np.empty(N, dtype=int)
        rank[order] = np.arange(1, N + 1)
        return [{**self.number_audit(int(NUMS[i])), "ranking": int(rank[i])} for i in range(N)]

    # ---- score de combinaciones (vectorizado) ----
    def combo_parts(self, C: np.ndarray) -> dict:
        """C: matriz K×6 ordenada. Devuelve cada parte en [0,1]."""
        idx = C.astype(int) - st.NUM_MIN
        individual = self.index[idx].mean(axis=1) / 100.0
        pares = np.mean([self.pair_strength[idx[:, a], idx[:, b]] for a, b in PAIR_IDX], axis=0)
        tri = np.mean([self.trio_T[C[:, a], C[:, b], C[:, c]] for a, b, c in TRIO_IDX], axis=0)
        trios = np.clip(tri / max(self.trio_max * 0.25, 1e-9), 0, 1)
        odd = st.odd_count(C)
        low = st.low_count(C)
        dec = st.decade_code(C)
        n = self.n
        dec_p = np.array([(self.dec_counts.get(int(d), 0) + self.dec_theo.get(int(d), 0) * 28) / (n + 28)
                          for d in dec]) / self.dec_norm
        estructura = (self.odd_p[odd] + self.low_p[low] + np.clip(dec_p, 0, 1)) / 3
        suma = self.sum_density[np.clip(st.combo_sum(C), 0, 199)]
        cons = self.cons_p[np.clip(st.consecutive_count(C), 0, PICK - 1)]
        return {"individual": individual, "pares": pares, "trios": trios,
                "estructura": estructura, "suma": suma, "consecutivos": cons}

    def combo_scores(self, C: np.ndarray) -> tuple[np.ndarray, dict]:
        parts = self.combo_parts(C)
        w = self.cfg.combo_weights
        total = sum(parts[k] * w[k] for k in w)
        return total, parts
